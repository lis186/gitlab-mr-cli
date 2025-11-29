/**
 * MR 週期時間分析型別定義
 *
 * 定義四階段時間分解、統計指標、分析結果等核心資料結構
 *
 * @module types/cycle-time
 */

/**
 * MR 週期時間指標
 *
 * 代表單一 MR 的四階段時間分解與元資料
 */
export interface CycleTimeMetrics {
  /** MR 識別資訊 */
  mr: {
    /** MR 內部 ID（例如 123 代表 !123） */
    iid: number
    /** MR 標題 */
    title: string
    /** 作者名稱 */
    author: string
    /** GitLab MR URL */
    webUrl: string
  }

  /** 時間戳（ISO 8601 格式） */
  timestamps: {
    /** 首個 commit 時間（計算 Coding Time 起點） */
    firstCommitAt: string
    /** MR 建立時間 */
    createdAt: string
    /** 首次審查時間（null 表示無審查） */
    firstReviewAt: string | null
    /** 最後審查時間（null 表示無審查） */
    lastReviewAt: string | null
    /** 合併時間 */
    mergedAt: string
  }

  /** 四階段時間（單位：小時） */
  stages: {
    /** Coding Time: firstCommitAt → createdAt */
    codingTime: number
    /** Pickup Time: createdAt → firstReviewAt（null 表示無審查） */
    pickupTime: number | null
    /** Review Time: firstReviewAt → lastReviewAt（null 表示無審查） */
    reviewTime: number | null
    /** Merge Time: lastReviewAt（或 createdAt）→ mergedAt */
    mergeTime: number
  }

  /** 總週期時間（所有階段總和，null 視為 0） */
  totalCycleTime: number
  /** 是否有審查流程 */
  hasReview: boolean
}

/**
 * 階段統計
 *
 * 儲存單一階段（Coding/Pickup/Review/Merge）的聚合統計指標
 */
export interface StageStatistics {
  /** 階段名稱 */
  stageName: 'coding' | 'pickup' | 'review' | 'merge'

  /** 平均值（小時） */
  mean: number
  /** 中位數 P50（小時） */
  median: number
  /** 第 75 百分位數（小時） */
  p75: number
  /** 第 90 百分位數（小時） */
  p90: number
  /** 最小值（小時） */
  min: number
  /** 最大值（小時） */
  max: number

  /** 樣本數（有效資料筆數，排除 null） */
  sampleCount: number
  /** 佔總週期時間的百分比（0-100） */
  percentage: number
  /** 是否為瓶頸階段（百分比最高） */
  isBottleneck: boolean
}

/**
 * 分析結果
 *
 * 彙整完整的週期時間分析輸出，包含四階段統計、DORA 層級與元資料
 */
export interface AnalysisResult {
  /** 專案資訊 */
  project: {
    /** 專案路徑（例如 example/mobile-app） */
    path: string
    /** 專案名稱 */
    name: string
  }

  /** 分析執行時間（ISO 8601） */
  analysisDate: string

  /** 分析時間範圍 */
  timeRange: {
    /** 開始日期（YYYY-MM-DD） */
    since: string
    /** 結束日期（YYYY-MM-DD） */
    until: string
  }

  /** 分析的 MR 數量 */
  mrCount: number

  /** 四階段統計 */
  stages: {
    coding: StageStatistics
    pickup: StageStatistics
    review: StageStatistics
    merge: StageStatistics
  }

  /** 總體指標 */
  totalCycleTime: {
    /** 平均總週期時間（小時） */
    mean: number
    /** 中位數（小時） */
    median: number
    /** P75（小時） */
    p75: number
    /** P90（小時） */
    p90: number
  }

  /** DORA 基準對比 */
  doraTier: 'Elite' | 'High' | 'Medium' | 'Low'

  /** 瓶頸階段 */
  bottleneckStage: 'coding' | 'pickup' | 'review' | 'merge'

  /** 資料品質資訊（選填） */
  dataQuality?: {
    /** Coding Time = 0 的 MR 數量（可能因 rebase/amend） */
    zeroCodingTimeCount: number
    /** Merge Time = 0 的 MR 數量（快速/自動合併） */
    zeroMergeTimeCount: number
    /** 無審查記錄的 MR 數量 */
    noReviewCount: number
    /** 總 MR 數量 */
    totalCount: number
  }

  /** 警告/建議（選填） */
  warnings?: string[]

  /** 分析失敗的 MR（選填，僅在有失敗時出現） */
  failedMRs?: Array<{
    /** MR IID */
    iid: number
    /** MR 標題 */
    title: string
    /** 失敗原因 */
    error: string
  }>
}

/**
 * 趨勢時段
 *
 * 儲存特定時間區間的週期時間統計（用於 --trend 旗標）
 */
export interface TrendPeriod {
  /** 時段開始日期（YYYY-MM-DD） */
  periodStart: string
  /** 時段結束日期（YYYY-MM-DD） */
  periodEnd: string
  /** 時段標籤（例如「W1: 9/26-10/02」） */
  label: string

  /** 該時段的 MR 數量 */
  mrCount: number

  /** 四階段統計 */
  stages: {
    coding: StageStatistics
    pickup: StageStatistics
    review: StageStatistics
    merge: StageStatistics
  }

  /** 總體指標 */
  totalCycleTime: {
    /** 平均值（小時） */
    mean: number
    /** 中位數（小時） */
    median: number
  }

  /** DORA 層級 */
  doraTier: 'Elite' | 'High' | 'Medium' | 'Low'

  /** 與前一時段的變化（第一時段為 undefined） */
  changeFromPrevious?: {
    /** 變化量（小時），正值表示變慢 */
    cycleTime: number
    /** 變化百分比 */
    percentage: number
  }
}

/**
 * 趨勢分析結果
 */
export interface TrendResult {
  /** 專案資訊 */
  project: {
    path: string
    name: string
  }

  /** 分析執行時間（ISO 8601） */
  analysisDate: string

  /** 時段類型 */
  periodType: 'weekly' | 'biweekly'

  /** 趨勢時段陣列 */
  periods: TrendPeriod[]
}
