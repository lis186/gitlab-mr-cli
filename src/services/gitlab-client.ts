import { Gitlab } from '@gitbeaker/rest'
import { ProjectConfig, ProjectIdentifier } from '../models/project.js'
import { MergeRequest, fromGitLabAPI } from '../models/merge-request.js'
import { AppError, ErrorType } from '../models/error.js'

/**
 * GitLab API 客戶端服務
 *
 * 負責與 GitLab API 通訊，查詢專案的 Merge Requests
 */
export class GitLabClient {
  private client: InstanceType<typeof Gitlab>
  private projectIdentifier: ProjectIdentifier

  /**
   * 建立 GitLabClient 實例
   *
   * @param config - 專案配置（包含 token、host 等）
   */
  constructor(config: ProjectConfig) {
    // 建立 GitLab API 客戶端
    this.client = new Gitlab({
      token: config.token,
      host: config.host || 'https://gitlab.com'
    })

    this.projectIdentifier = config.identifier
  }

  /**
   * 取得專案識別符
   * Issue #4: 提供型別安全的 projectIdentifier 存取
   *
   * @returns 專案識別符
   */
  getProjectIdentifier(): ProjectIdentifier {
    return this.projectIdentifier;
  }

  /**
   * 取得專案的 Merge Requests
   *
   * @param limit - 取得的 MR 數量上限（預設 20）
   * @returns MR 列表
   * @throws AppError 當 API 呼叫失敗時
   */
  async getMergeRequests(limit: number = 20): Promise<MergeRequest[]> {
    // T059: 使用重試邏輯包裝 API 調用
    return this.executeWithRetry(async () => {
      // 呼叫 GitLab API 取得 MR 列表
      const response = await this.client.MergeRequests.all({
        projectId: this.projectIdentifier,
        orderBy: 'created_at',
        sort: 'desc',
        perPage: limit,
        maxPages: 1
      })

      // 轉換 API 回應為應用程式模型
      return response.map((mr: any) => fromGitLabAPI(mr))
    })
  }

  /**
   * 取得指定時間範圍內已合併的 Merge Requests
   *
   * ⚠️ 重要：GitLab REST API 不支援 merged_after/merged_before 參數
   * （詳見 GitLab Issue #383512）。此方法查詢所有已合併的 MR，
   * 然後在客戶端根據 merged_at 時間過濾。
   *
   * 為了提高效能，建議使用 options.maxPages 參數限制查詢頁數。
   *
   * @param startDate - 開始日期（包含）
   * @param endDate - 結束日期（包含）
   * @param options - 可選參數（perPage, maxPages, onWarning）
   * @returns 已合併的 MR 列表
   * @throws AppError 當 API 呼叫失敗時
   */
  async getMergedMRsByTimeRange(
    startDate: Date,
    endDate: Date,
    options?: {
      perPage?: number
      maxPages?: number
      onWarning?: (message: string) => void
    }
  ): Promise<MergeRequest[]> {
    // T059: 使用重試邏輯包裝 API 調用
    return this.executeWithRetry(async () => {
      // GitLab REST API 不支援 merged_after/merged_before 參數
      // 查詢所有已合併的 MR，按更新時間降序排列
      const response = await this.client.MergeRequests.all({
        projectId: this.projectIdentifier,
        state: 'merged',
        orderBy: 'updated_at',
        sort: 'desc',
        perPage: options?.perPage || 100,
        maxPages: options?.maxPages || 10 // 預設最多查詢 10 頁（1000 筆）
      })

      // 轉換 API 回應為應用程式模型
      const mergeRequests = response.map((mr: any) => fromGitLabAPI(mr))

      // 統計缺少 mergedAt 的 MR 數量（資料品質警告）
      let missingMergedAtCount = 0

      // 客戶端過濾：只保留在指定時間範圍內合併的 MR
      const filtered = mergeRequests.filter(mr => {
        if (!mr.mergedAt) {
          missingMergedAtCount++
          return false
        }
        const mergedTime = mr.mergedAt.getTime()
        return mergedTime >= startDate.getTime() && mergedTime <= endDate.getTime()
      })

      // T061: 發出資料缺失警告
      if (missingMergedAtCount > 0 && options?.onWarning) {
        options.onWarning(
          `⚠️  警告：發現 ${missingMergedAtCount} 筆 MR 缺少合併時間（merged_at），已自動排除`
        )
      }

      return filtered
    }, options)
  }

  /**
   * 取得專案的 Commits
   * Issue #4: 提供型別安全的 Commits API 存取
   *
   * @param options - 查詢選項
   * @returns Commit 列表
   */
  async getCommits(options?: {
    refName?: string;
    since?: string;
    until?: string;
    perPage?: number;
    maxPages?: number;
    onWarning?: (message: string) => void;
  }): Promise<any[]> {
    return await this.executeWithRetry(async () => {
      return await this.client.Commits.all(this.projectIdentifier, {
        refName: options?.refName,
        since: options?.since,
        until: options?.until,
        perPage: options?.perPage || 100,
        maxPages: options?.maxPages,
      });
    }, { onWarning: options?.onWarning });
  }

  /**
   * 取得專案詳細資訊
   * Issue #4: 提供型別安全的 Projects API 存取
   *
   * @param options - 選項
   * @returns 專案資訊
   */
  async getProject(options?: { onWarning?: (message: string) => void }): Promise<any> {
    return await this.executeWithRetry(async () => {
      return await this.client.Projects.show(this.projectIdentifier);
    }, { onWarning: options?.onWarning });
  }

  /**
   * 取得 Commit 的 Diff
   * Issue #4: 提供型別安全的 Commits.showDiff API 存取
   *
   * @param commitSha - Commit SHA
   * @param options - 選項
   * @returns Commit diff 陣列
   */
  async getCommitDiff(commitSha: string, options?: { onWarning?: (message: string) => void }): Promise<any[]> {
    return await this.executeWithRetry(async () => {
      return await this.client.Commits.showDiff(this.projectIdentifier, commitSha);
    }, { onWarning: options?.onWarning });
  }

  /**
   * 處理 GitLab API 錯誤
   *
   * @param error - 原始錯誤
   * @returns AppError 實例
   */
  private handleAPIError(error: unknown): AppError {
    const originalError = error instanceof Error ? error : new Error(String(error))

    // 檢查是否為 HTTP 回應錯誤
    if (this.isHTTPError(error)) {
      const status = this.getHTTPStatus(error)

      // T043: AUTH_ERROR - 401 Unauthorized
      if (status === 401) {
        return new AppError(
          ErrorType.AUTH_ERROR,
          'GitLab 認證失敗',
          originalError
        )
      }

      // T044: PROJECT_NOT_FOUND - 404 Not Found
      if (status === 404) {
        return new AppError(
          ErrorType.PROJECT_NOT_FOUND,
          '找不到指定的專案',
          originalError
        )
      }

      // T044: PROJECT_NOT_FOUND - 403 Forbidden (無權限)
      if (status === 403) {
        return new AppError(
          ErrorType.PROJECT_NOT_FOUND,
          '沒有存取此專案的權限',
          originalError
        )
      }

      // T059: RATE_LIMIT_ERROR - 429 Too Many Requests
      if (status === 429) {
        return new AppError(
          ErrorType.RATE_LIMIT_ERROR,
          'GitLab API 速率限制',
          originalError
        )
      }
    }

    // T045: NETWORK_ERROR - 網路連線錯誤
    if (this.isNetworkError(error)) {
      return new AppError(
        ErrorType.NETWORK_ERROR,
        '無法連接到 GitLab 伺服器',
        originalError
      )
    }

    // 其他 API 錯誤
    return new AppError(
      ErrorType.API_ERROR,
      'GitLab API 發生錯誤',
      originalError
    )
  }

  /**
   * 檢查是否為 HTTP 錯誤
   */
  private isHTTPError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false

    // 檢查多種可能的錯誤格式
    const err = error as any

    // 格式 1: error.cause.response.status (gitbeaker wrapped error)
    if (err.cause?.response?.status) return true

    // 格式 2: error.response.status (direct HTTP error)
    if (err.response?.status) return true

    // 格式 3: error.status (simple error)
    if (typeof err.status === 'number') return true

    // 格式 4: error.description contains "404" (gitbeaker description)
    if (typeof err.description === 'string' && /\b(404|401|403|429)\b/.test(err.description)) return true

    return false
  }

  /**
   * 取得 HTTP 狀態碼
   */
  private getHTTPStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined

    const err = (error as any)

    // 嘗試多種格式
    const status = err.cause?.response?.status ||
                   err.response?.status ||
                   err.status

    if (status) return status

    // 嘗試從 description 中提取狀態碼
    if (typeof err.description === 'string') {
      const match = err.description.match(/\b(404|401|403|429|500|502|503)\b/)
      if (match) {
        return parseInt(match[1], 10)
      }
    }

    return undefined
  }

  /**
   * 檢查是否為網路錯誤
   */
  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false

    const message = error.message.toLowerCase()
    return message.includes('network') ||
           message.includes('enotfound') ||
           message.includes('econnrefused') ||
           message.includes('timeout') ||
           message.includes('fetch failed')
  }

  /**
   * T059: 從錯誤中提取 Retry-After 秒數
   * @param error - API 錯誤
   * @returns 重試等待秒數，如果無法提取則返回預設值
   */
  private getRetryAfterSeconds(error: unknown): number {
    // 預設重試時間（秒）
    const DEFAULT_RETRY_SECONDS = 60

    if (!this.isHTTPError(error)) return DEFAULT_RETRY_SECONDS

    try {
      const cause = (error as any).cause
      const retryAfter = cause?.response?.headers?.['retry-after']

      if (retryAfter) {
        // Retry-After 可能是秒數或日期字串
        const parsed = parseInt(retryAfter, 10)
        if (!isNaN(parsed)) {
          return parsed
        }
      }
    } catch {
      // 忽略解析錯誤，使用預設值
    }

    return DEFAULT_RETRY_SECONDS
  }

  /**
   * T059: 使用指數退避策略執行 API 調用，並在遇到 429 錯誤時自動重試
   * @param fn - 要執行的 API 調用函數
   * @param options - 選項（onWarning 回呼）
   * @returns API 調用結果
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options?: { onWarning?: (message: string) => void }
  ): Promise<T> {
    const MAX_RETRIES = 3
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn()
      } catch (error) {
        const appError = this.handleAPIError(error)

        // 只有速率限制錯誤才重試
        if (appError.type === ErrorType.RATE_LIMIT_ERROR && attempt < MAX_RETRIES) {
          const retryAfter = this.getRetryAfterSeconds(error)

          // 顯示重試訊息
          if (options?.onWarning) {
            options.onWarning(
              `⚠️  觸發 GitLab API 速率限制，將在 ${retryAfter} 秒後自動重試（第 ${attempt}/${MAX_RETRIES} 次）...`
            )
          }

          // 等待後重試
          await this.sleep(retryAfter * 1000)
          lastError = appError
          continue
        }

        // 非速率限制錯誤，或已達最大重試次數，直接拋出
        throw appError
      }
    }

    // 如果所有重試都失敗，拋出最後一個錯誤
    throw lastError || new AppError(ErrorType.API_ERROR, '達到最大重試次數')
  }

  /**
   * 睡眠指定毫秒數
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 取得專案的所有未合併分支
   *
   * **預設限制**：為保護 GitLab server 效能，預設最多查詢 150 個分支
   * - 小型專案（1-50 分支）：無影響
   * - 中型專案（51-150 分支）：完整查詢
   * - 大型專案（151+ 分支）：需明確指定 --limit 或使用 --local-repo
   *
   * @param options - 查詢選項
   * @returns 未合併分支清單
   */
  async getUnmergedBranches(options?: {
    search?: string
    limit?: number
  }): Promise<any[]> {
    return this.executeWithRetry(async () => {
      // 預設限制 150 個分支（保護 server）
      const limit = options?.limit ?? 150

      const response = await this.client.Branches.all(this.projectIdentifier, {
        search: options?.search,
        perPage: Math.min(limit, 100), // GitLab API 單頁最多 100
        maxPages: Math.ceil(limit / 100), // 計算需要的頁數
      })

      // 過濾未合併的分支（merged = false）
      const unmergedBranches = Array.isArray(response)
        ? response.filter((b: any) => !b.merged)
        : []

      // 確保不超過限制
      return unmergedBranches.slice(0, limit)
    })
  }

  /**
   * 取得分支與關聯 MR 的資料（優化版）
   *
   * 效能優化策略：
   * 1. 一次查詢所有 opened MRs（1-2 次 API 呼叫）
   * 2. 在客戶端建立 source_branch → MR 的索引
   * 3. O(1) 時間複雜度匹配分支與 MR
   *
   * 效能提升：從 N 次 API 呼叫降至 1-2 次（N = 分支數量）
   *
   * @param options - 批次查詢選項
   * @returns 分支與 MR 關聯資料
   */
  async getBranchesWithMRs(options?: {
    batchSize?: number
    limit?: number
    onProgress?: (processed: number, total: number) => void
    onWarning?: (message: string) => void
  }): Promise<any[]> {
    return this.executeWithRetry(async () => {
      // 步驟 1: 取得所有未合併分支（支援 limit 參數）
      const branches = await this.getUnmergedBranches({
        limit: options?.limit,
      })

      if (options?.onProgress) {
        options.onProgress(0, branches.length)
      }

      // 步驟 2: 一次查詢所有 opened MRs（極大效能提升！）
      const allMRs = await this.client.MergeRequests.all({
        projectId: this.projectIdentifier,
        state: 'opened',
        perPage: 100,
        maxPages: 10, // 最多 1000 個 opened MRs
      })

      // 步驟 3: 建立 source_branch → MR 的索引（O(1) 查詢）
      const mrBySourceBranch = new Map<string, any>()
      if (Array.isArray(allMRs)) {
        for (const mr of allMRs) {
          if (mr.source_branch && typeof mr.source_branch === 'string') {
            // 如果同一個分支有多個 MR，取最新的（第一個，因為已按 created_at desc 排序）
            if (!mrBySourceBranch.has(mr.source_branch)) {
              mrBySourceBranch.set(mr.source_branch, mr)
            }
          }
        }
      }

      // 步驟 4: 快速匹配分支與 MR
      const results = branches.map((branch: any) => ({
        branch,
        mergeRequest: mrBySourceBranch.get(branch.name) || null,
      }))

      if (options?.onProgress) {
        options.onProgress(branches.length, branches.length)
      }

      return results
    }, {
      onWarning: options?.onWarning,
    })
  }

  /**
   * 使用 API 比較單個分支差異
   *
   * @param branch - 目標分支
   * @param baseBranch - 基準分支（預設 "main"）
   * @param options - 選項（包含 onWarning 回調）
   * @returns 比較結果
   */
  async compareBranchAPI(
    branch: string,
    baseBranch: string = 'main',
    options?: { onWarning?: (message: string) => void }
  ): Promise<any> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.Repositories.compare(
          this.projectIdentifier,
          baseBranch,
          branch
        )

        return {
          branch,
          baseBranch,
          commitsBehind: response.commits?.length || 0,
          commitsAhead: response.commits?.length || 0,
          source: 'api',
        }
      } catch (err) {
        // Issue #3: Use onWarning callback instead of console.warn
        const errorMsg = err instanceof Error ? err.message : String(err)
        options?.onWarning?.(`比較分支 ${branch} 失敗: ${errorMsg}`)
        return null
      }
    }, {
      onWarning: options?.onWarning,
    })
  }

  /**
   * 批次比較多個分支（API 模式）
   *
   * @param branches - 目標分支清單
   * @param baseBranch - 基準分支（預設 "main"）
   * @param options - 批次查詢選項
   * @returns Map<分支名稱, 比較結果 | null>
   */
  async compareBranchesAPI(
    branches: string[],
    baseBranch: string = 'main',
    options?: {
      batchSize?: number
      onProgress?: (processed: number, total: number) => void
      onWarning?: (message: string) => void
    }
  ): Promise<Map<string, any | null>> {
    const results = new Map<string, any | null>()
    const batchSize = options?.batchSize || 10

    for (let i = 0; i < branches.length; i += batchSize) {
      const batch = branches.slice(i, i + batchSize)

      const batchPromises = batch.map((branch) =>
        this.compareBranchAPI(branch, baseBranch, { onWarning: options?.onWarning })
      )

      const batchResults = await Promise.allSettled(batchPromises)

      batchResults.forEach((result, idx) => {
        const branchName = batch[idx]
        if (!branchName) return
        if (result.status === 'fulfilled') {
          results.set(branchName, result.value)
        } else {
          results.set(branchName, null)
        }
      })

      // 更新進度
      if (options?.onProgress) {
        options.onProgress(Math.min(i + batchSize, branches.length), branches.length)
      }
    }

    return results
  }

  /**
   * 取得 MR 的所有 commits（帶 rate limit 保護）
   *
   * @param projectId - 專案 ID
   * @param mrIid - MR IID
   * @param options - 選項（onWarning 回呼）
   * @returns Commit 列表
   */
  async getMergeRequestCommits(
    projectId: string | number,
    mrIid: number,
    options?: { onWarning?: (message: string) => void }
  ): Promise<any[]> {
    return this.executeWithRetry(async () => {
      return await this.client.MergeRequests.allCommits(projectId, mrIid)
    }, options)
  }

  /**
   * 取得 MR 的所有 notes/評論（帶 rate limit 保護）
   *
   * @param projectId - 專案 ID
   * @param mrIid - MR IID
   * @param options - 選項（onWarning 回呼）
   * @returns Note 列表（按 created_at 升序排列）
   */
  async getMergeRequestNotes(
    projectId: string | number,
    mrIid: number,
    options?: { onWarning?: (message: string) => void }
  ): Promise<any[]> {
    return this.executeWithRetry(async () => {
      // Request notes in ascending order (oldest first) to avoid client-side sorting
      // GitLab API defaults to descending order, but we need chronological processing
      return await this.client.MergeRequestNotes.all(projectId, mrIid, {
        sort: 'asc',
        orderBy: 'created_at',
      } as any)
    }, options)
  }

  /**
   * 取得 GitLab API 客戶端實例（供測試使用）
   */
  getClient(): InstanceType<typeof Gitlab> {
    return this.client
  }

  /**
   * 取得專案的所有標籤
   *
   * @param options - 查詢選項
   * @returns 標籤列表
   */
  async getTags(options?: {
    perPage?: number;
    maxPages?: number;
    onWarning?: (message: string) => void;
  }): Promise<any[]> {
    return this.executeWithRetry(async () => {
      return await this.client.Tags.all(this.projectIdentifier, {
        perPage: options?.perPage || 100,
        maxPages: options?.maxPages || 10,
      });
    }, { onWarning: options?.onWarning });
  }

  /**
   * 取得兩個 commit 之間的比較資訊
   *
   * @param options - 比較選項
   * @returns 比較結果
   */
  async getCompare(options: {
    from: string;
    to: string;
    onWarning?: (message: string) => void;
  }): Promise<any> {
    return this.executeWithRetry(async () => {
      return await this.client.Repositories.compare(
        this.projectIdentifier,
        options.from,
        options.to
      );
    }, { onWarning: options?.onWarning });
  }

  /**
   * 取得兩個 commit 之間的 MR 列表
   *
   * 注意：GitLab API 沒有直接取得兩個 commit 間 MR 的方法，
   * 此方法透過比較 commits 並查詢相關 MR 實作
   *
   * @param options - 查詢選項
   * @returns MR 列表
   */
  async getMergeRequestsBetweenCommits(options: {
    fromSha: string;
    toSha: string;
    targetBranch: string;
    onWarning?: (message: string) => void;
  }): Promise<any[]> {
    return this.executeWithRetry(async () => {
      // 取得兩個 commit 之間的所有 commit
      const comparison = await this.client.Repositories.compare(
        this.projectIdentifier,
        options.fromSha,
        options.toSha
      );

      // 取得所有已合併的 MR（目標分支）
      const allMRs = await this.client.MergeRequests.all({
        projectId: this.projectIdentifier,
        state: 'merged',
        targetBranch: options.targetBranch,
        orderBy: 'updated_at',
        sort: 'desc',
        perPage: 100,
        maxPages: 10,
      });

      // 建立 commit SHA 集合用於快速查找
      const commitShas = new Set(
        Array.isArray(comparison.commits) ? comparison.commits.map((c: any) => c.id) : []
      );

      // 過濾出包含在此範圍內的 MR
      const filteredMRs = (allMRs as any[]).filter((mr) => {
        // 檢查 MR 的 merge_commit_sha 是否在範圍內
        if (mr.merge_commit_sha && commitShas.has(mr.merge_commit_sha)) {
          return true;
        }
        return false;
      });

      return filteredMRs;
    }, { onWarning: options?.onWarning });
  }

  /**
   * 取得 MR 的 diffs
   * Feature: 007-mr-size-analysis
   *
   * @param mrIid - MR IID
   * @param options - 選項
   * @returns Diffs 陣列
   */
  async getMergeRequestDiffs(mrIid: number, options?: {
    onWarning?: (message: string) => void;
  }): Promise<any[]> {
    return this.executeWithRetry(async () => {
      return await this.client.MergeRequests.allDiffs(
        this.projectIdentifier,
        mrIid
      );
    }, { onWarning: options?.onWarning });
  }

  /**
   * 取得 MR 的變更統計
   *
   * @param mrIid - MR IID
   * @param options - 選項
   * @returns 變更統計
   */
  async getMergeRequestChanges(mrIid: number, options?: {
    onWarning?: (message: string) => void;
  }): Promise<{ additions: number; deletions: number }> {
    return this.executeWithRetry(async () => {
      const mr = await this.client.MergeRequests.show(
        this.projectIdentifier,
        mrIid
      );

      // 解析 changes_count（格式："+50 -20" 或數字字串）
      let additions = 0;
      let deletions = 0;

      if (mr.changes_count) {
        const changesStr = String(mr.changes_count);
        const match = changesStr.match(/\+(\d+)\s*-(\d+)/);

        if (match && match[1] && match[2]) {
          additions = parseInt(match[1], 10);
          deletions = parseInt(match[2], 10);
        } else {
          // 如果只有總數，假設為新增
          const total = parseInt(changesStr, 10);
          if (!isNaN(total)) {
            additions = total;
          }
        }
      }

      // 如果沒有 changes_count，嘗試從 changes 中計算
      if (additions === 0 && deletions === 0 && Array.isArray(mr.changes)) {
        for (const change of mr.changes) {
          if (change.diff && typeof change.diff === 'string') {
            const lines = change.diff.split('\n');
            for (const line of lines) {
              if (line.startsWith('+') && !line.startsWith('+++')) {
                additions++;
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                deletions++;
              }
            }
          }
        }
      }

      return { additions, deletions };
    }, { onWarning: options?.onWarning });
  }
}
