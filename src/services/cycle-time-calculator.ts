/**
 * MR 週期時間計算器服務
 *
 * 負責計算 MR 的四階段時間分解（Coding, Pickup, Review, Merge Time）
 *
 * @module services/cycle-time-calculator
 */

import type { CycleTimeMetrics } from '../types/cycle-time.js'
import { calculateHours } from '../utils/time-utils.js'
import { createCycleTimeMetrics } from '../models/cycle-time-metrics.js'

/**
 * 常數定義
 */
const NOTEABLE_TYPE_MERGE_REQUEST = 'MergeRequest'

/**
 * 時間寬容機制常數（秒）
 *
 * 處理時鐘同步問題：允許評論時間戳略晚於合併時間戳（最多 5 秒）
 * 這種情況可能發生在：
 * - GitLab 伺服器時鐘不同步
 * - 網路延遲導致時間戳記錄順序異常
 * - CI/CD 觸發的自動評論與合併操作幾乎同時發生
 */
const TOLERANCE_SECONDS = 5

/**
 * Ready 標記字串模式 - 用於檢測 "Marked as Ready" 事件
 *
 * GitLab API 返回的系統訊息可能包含 markdown 格式（如 **ready**），
 * 因此在匹配前需先移除 markdown 符號。
 *
 * @see getReviewTimes() - markdown 符號處理邏輯
 */
const READY_MARKERS = ['marked as ready', 'marked this merge request as ready'] as const

/**
 * 預編譯的 Ready 標記正則表達式（效能優化，避免在迴圈中重複建立）
 *
 * 使用 word boundary (\b) 確保精確匹配，避免誤判（如 "remarked as ready"）
 */
const READY_PATTERNS = READY_MARKERS.map((marker) => new RegExp(`\\b${marker}\\b`, 'i'))

/**
 * GitLab MR 資料（來自 API）
 *
 * @requires GitLab API v4
 * @note draft field available since GitLab 13.2+
 * @note work_in_progress is legacy field (GitLab < 13.2)
 */
export interface GitLabMR {
  iid: number
  title: string
  author: {
    name: string
  }
  web_url: string
  created_at: string
  merged_at: string | null
  draft?: boolean              // Draft 狀態（GitLab 13.2+）
  work_in_progress?: boolean   // 舊版 Draft 狀態（GitLab < 13.2, 向後相容）
}

/**
 * GitLab Commit 資料
 */
export interface GitLabCommit {
  created_at: string
}

/**
 * GitLab Note（評論）資料
 */
export interface GitLabNote {
  created_at: string
  system: boolean
  body: string
  noteable_type: string
}

/**
 * 警告回呼函式型別
 */
export type WarningCallback = (message: string) => void

/**
 * MR 週期時間計算器
 */
export class CycleTimeCalculator {
  /**
   * 計算單一 MR 的週期時間指標
   *
   * @param mr - GitLab MR 資料
   * @param commits - MR 的 commit 列表
   * @param notes - MR 的評論列表
   * @param options - 選項（包含 onWarning 回呼）
   * @returns CycleTimeMetrics 實例
   * @throws Error 當 MR 未合併或資料不完整時
   */
  static calculate(
    mr: GitLabMR,
    commits: GitLabCommit[],
    notes: GitLabNote[],
    options?: { onWarning?: WarningCallback }
  ): CycleTimeMetrics {
    // 驗證 MR 已合併
    if (!mr.merged_at) {
      throw new Error(`MR !${mr.iid} 尚未合併`)
    }

    // 驗證至少有一個 commit
    if (commits.length === 0) {
      throw new Error(`MR !${mr.iid} 沒有 commits`)
    }

    // 取得首個 commit 時間
    const firstCommitAt = this.getFirstCommitTime(commits)

    // 取得審查時間（僅計算合併前的評論）
    // 如果是 Draft MR，需考慮 "Marked as Ready" 時間
    // 支援新舊 GitLab API：draft (13.2+) 或 work_in_progress (< 13.2)
    const isDraft = mr.draft === true || mr.work_in_progress === true
    const { firstReviewAt, lastReviewAt, markedAsReadyAt } = this.getReviewTimes(
      notes,
      mr.merged_at,
      mr.created_at,
      isDraft
    )

    // 計算四階段時間
    const codingTime = this.calculateCodingTime(
      firstCommitAt,
      mr.created_at,
      mr.iid,
      options?.onWarning
    )
    const pickupTime = firstReviewAt
      ? this.calculatePickupTime(
          mr.created_at,
          firstReviewAt,
          markedAsReadyAt,
          mr.iid,
          options?.onWarning
        )
      : null
    const reviewTime =
      firstReviewAt && lastReviewAt
        ? this.calculateReviewTime(firstReviewAt, lastReviewAt, mr.iid, options?.onWarning)
        : null
    const mergeTime = this.calculateMergeTime(
      lastReviewAt || mr.created_at,
      mr.merged_at,
      mr.iid,
      options?.onWarning
    )

    // 建立 CycleTimeMetrics 實例
    return createCycleTimeMetrics({
      mr: {
        iid: mr.iid,
        title: mr.title,
        author: mr.author.name,
        webUrl: mr.web_url,
      },
      timestamps: {
        firstCommitAt,
        createdAt: mr.created_at,
        firstReviewAt,
        lastReviewAt,
        mergedAt: mr.merged_at,
      },
      stages: {
        codingTime,
        pickupTime,
        reviewTime,
        mergeTime,
      },
    })
  }

  /**
   * 取得首個 commit 時間
   *
   * @param commits - Commit 列表
   * @returns 首個 commit 的時間戳
   */
  private static getFirstCommitTime(commits: GitLabCommit[]): string {
    // Commits 通常按時間倒序排列，取最後一個即為首個
    const sortedCommits = [...commits].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    return sortedCommits[0]!.created_at
  }

  /**
   * 取得審查時間（首次與最後）
   *
   * 注意：只計算合併前的評論作為審查時間，排除合併後的自動化評論
   * 對於 Draft MR，只計算 "Marked as Ready" 之後的評論
   *
   * @param notes - 評論列表
   * @param mergedAt - MR 合併時間
   * @param createdAt - MR 建立時間
   * @param isDraft - MR 是否以 Draft 狀態建立
   * @returns 首次審查時間、最後審查時間、Marked as Ready 時間
   */
  private static getReviewTimes(
    notes: GitLabNote[],
    mergedAt: string,
    createdAt: string,
    isDraft: boolean
  ): {
    firstReviewAt: string | null
    lastReviewAt: string | null
    markedAsReadyAt: string | null
  } {
    // 1. 先依時間排序 notes，確保找到「第一次」Marked as Ready 事件
    // 避免 API 返回順序不一致導致誤判
    const sortedNotes = [...notes].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // 2. 找到「第一次」"Marked as Ready" 事件（如果存在）
    // 移除 markdown 符號（如 **ready**）以確保正確匹配 GitLab API 返回的格式
    // 使用預編譯的 word boundary 正則表達式確保精確匹配
    // 避免誤判（例如 "remarked as ready" 不應匹配）
    const markedAsReadyNote = sortedNotes.find((note) => {
      if (!note.system) return false
      const cleanedBody = note.body.replace(/\*\*/g, '')
      return READY_PATTERNS.some((pattern) => pattern.test(cleanedBody))
    })

    // 3. 處理 Draft MR 從未標記為 Ready 的邊界情況
    // 如果 MR 以 Draft 建立但從未標記為 Ready，則不計入任何審查時間
    // 原因：Draft 狀態表示「尚未準備好接受審查」，即使有人留言也不算正式審查
    if (isDraft && !markedAsReadyNote) {
      return {
        firstReviewAt: null,
        lastReviewAt: null,
        markedAsReadyAt: null,
      }
    }

    // 4. 確定審查起始時間
    // Draft MR：從 "Marked as Ready" 時間開始算
    // 一般 MR：從建立時間開始算
    const reviewStartTime =
      isDraft && markedAsReadyNote ? markedAsReadyNote.created_at : createdAt

    // 5. 篩選人工審查評論（排除系統備註與合併後評論）
    // 使用時間寬容機制處理時鐘同步問題（允許 5 秒誤差）
    const TOLERANCE_MS = TOLERANCE_SECONDS * 1000
    const mergedTimeMs = new Date(mergedAt).getTime()
    const reviewStartTimeMs = new Date(reviewStartTime).getTime()

    const reviewNotes = sortedNotes.filter(
      (note) =>
        !note.system &&
        note.body.length > 0 &&
        note.noteable_type === NOTEABLE_TYPE_MERGE_REQUEST &&
        new Date(note.created_at).getTime() >= reviewStartTimeMs && // 必須在審查起始時間之後
        new Date(note.created_at).getTime() <= mergedTimeMs + TOLERANCE_MS // 排除合併後留言（含 5 秒寬容）
    )

    if (reviewNotes.length === 0) {
      return {
        firstReviewAt: null,
        lastReviewAt: null,
        markedAsReadyAt: markedAsReadyNote?.created_at || null,
      }
    }

    return {
      firstReviewAt: reviewNotes[0]!.created_at,
      lastReviewAt: reviewNotes[reviewNotes.length - 1]!.created_at,
      markedAsReadyAt: markedAsReadyNote?.created_at || null,
    }
  }

  /**
   * 計算 Coding Time（開發時間）
   *
   * 從首個 commit 到 MR 建立的時間
   *
   * 注意：如果 firstCommitAt > createdAt（rebase/amend 情況），則返回 0
   *
   * @param firstCommitAt - 首個 commit 時間
   * @param createdAt - MR 建立時間
   * @param mrIid - MR IID（用於警告訊息）
   * @param onWarning - 警告回呼函式
   * @returns Coding Time（小時）
   */
  static calculateCodingTime(
    firstCommitAt: string,
    createdAt: string,
    mrIid: number,
    onWarning?: WarningCallback
  ): number {
    const start = new Date(firstCommitAt)
    const end = new Date(createdAt)

    // 如果 commit 時間晚於 MR 建立時間（rebase/amend 情況），返回 0
    if (start > end) {
      onWarning?.(
        `MR !${mrIid}: 時間倒序 - 首個 commit 時間 (${firstCommitAt}) 晚於 MR 建立時間 (${createdAt})，Coding Time 設為 0`
      )
      return 0
    }

    return calculateHours(firstCommitAt, createdAt)
  }

  /**
   * 計算 Pickup Time（等待審查時間）
   *
   * 從 MR 建立（或 Marked as Ready）到首次審查的時間
   *
   * 注意：
   * - Draft MR：從 "Marked as Ready" 時間開始計算
   * - 一般 MR：從建立時間開始計算
   * - 如果 firstReviewAt < pickupStartTime（資料異常），則返回 0
   *
   * @param createdAt - MR 建立時間
   * @param firstReviewAt - 首次審查時間
   * @param markedAsReadyAt - Marked as Ready 時間（null 表示不是 Draft 或未標記為 Ready）
   * @param mrIid - MR IID（用於警告訊息）
   * @param onWarning - 警告回呼函式
   * @returns Pickup Time（小時）
   */
  static calculatePickupTime(
    createdAt: string,
    firstReviewAt: string,
    markedAsReadyAt: string | null,
    mrIid: number,
    onWarning?: WarningCallback
  ): number {
    // Draft MR：從 "Marked as Ready" 時間開始算
    // 一般 MR：從建立時間開始算
    const pickupStartTime = markedAsReadyAt || createdAt
    const isDraftMR = markedAsReadyAt !== null

    const start = new Date(pickupStartTime)
    const end = new Date(firstReviewAt)

    // 如果審查時間早於起始時間（資料異常），返回 0
    if (start > end) {
      const startLabel = isDraftMR
        ? 'Marked as Ready 時間'
        : 'MR 建立時間'
      const context = isDraftMR ? '（Draft MR）' : ''
      onWarning?.(
        `MR !${mrIid}: 時間倒序${context} - 首次審查時間 (${firstReviewAt}) 早於${startLabel} (${pickupStartTime})，Pickup Time 設為 0`
      )
      return 0
    }

    return calculateHours(pickupStartTime, firstReviewAt)
  }

  /**
   * 計算 Review Time（審查時間）
   *
   * 從首次審查到最後審查的時間
   *
   * 注意：如果 lastReviewAt < firstReviewAt（資料異常），則返回 0
   *
   * @param firstReviewAt - 首次審查時間
   * @param lastReviewAt - 最後審查時間
   * @param mrIid - MR IID（用於警告訊息）
   * @param onWarning - 警告回呼函式
   * @returns Review Time（小時）
   */
  static calculateReviewTime(
    firstReviewAt: string,
    lastReviewAt: string,
    mrIid: number,
    onWarning?: WarningCallback
  ): number {
    const start = new Date(firstReviewAt)
    const end = new Date(lastReviewAt)

    // 如果最後審查早於首次審查（資料異常），返回 0
    if (start > end) {
      onWarning?.(
        `MR !${mrIid}: 時間倒序 - 最後審查時間 (${lastReviewAt}) 早於首次審查時間 (${firstReviewAt})，Review Time 設為 0`
      )
      return 0
    }

    return calculateHours(firstReviewAt, lastReviewAt)
  }

  /**
   * 計算 Merge Time（合併等待時間）
   *
   * 從最後審查（或 MR 建立）到合併的時間
   *
   * 注意：如果 mergedAt < lastEventAt（資料異常），則返回 0
   *
   * @param lastEventAt - 最後審查時間或 MR 建立時間
   * @param mergedAt - 合併時間
   * @param mrIid - MR IID（用於警告訊息）
   * @param onWarning - 警告回呼函式
   * @returns Merge Time（小時）
   */
  static calculateMergeTime(
    lastEventAt: string,
    mergedAt: string,
    mrIid: number,
    onWarning?: WarningCallback
  ): number {
    const start = new Date(lastEventAt)
    const end = new Date(mergedAt)

    // 如果合併時間早於最後事件時間（資料異常），返回 0
    if (start > end) {
      onWarning?.(
        `MR !${mrIid}: 時間倒序 - 合併時間 (${mergedAt}) 早於最後事件時間 (${lastEventAt})，Merge Time 設為 0`
      )
      return 0
    }

    return calculateHours(lastEventAt, mergedAt)
  }
}
