/**
 * 統計資料模型
 *
 * 定義趨勢摘要、小批量評估等統計相關模型
 */

/**
 * 趨勢摘要 - 整體統計資訊
 */
export interface TrendSummary {
  /** 總合併次數 */
  totalMerges: number

  /** 總活躍開發者數（去重後） */
  totalActiveDevelopers: number

  /** 整體人均合併數 */
  overallAvgMergesPerDeveloper: number

  /** 週平均合併數 */
  weeklyAverageMerges: number

  /** 週人均合併數 */
  weeklyAvgMergesPerDeveloper: number

  /** 整體小批量評估 */
  overallBatchAssessment: BatchSizeAssessment
}

/**
 * 小批量工作模式評估
 */
export interface BatchSizeAssessment {
  /** 是否符合小批量標準 */
  isHealthy: boolean

  /** 判定閾值 */
  threshold: number

  /** 實際值（週人均合併數） */
  actualValue: number

  /** 狀態訊息（正體中文） */
  statusMessage: string

  /** 建議（若未達標） */
  suggestion?: string
}

/**
 * 小批量評估函式
 * @param weeklyAvgMergesPerDeveloper 週人均合併數
 * @param threshold 閾值（預設 3）
 * @returns BatchSizeAssessment
 */
export function assessBatchSize(
  weeklyAvgMergesPerDeveloper: number,
  threshold: number = 3
): BatchSizeAssessment {
  const isHealthy = weeklyAvgMergesPerDeveloper >= threshold

  return {
    isHealthy,
    threshold,
    actualValue: weeklyAvgMergesPerDeveloper,
    statusMessage: isHealthy
      ? `✓ 符合小批量工作模式（週人均 >= ${threshold}）`
      : `✗ 未達小批量標準（週人均 < ${threshold}）`,
    suggestion: isHealthy
      ? undefined
      : '建議：增加合併頻率，減少每次變更的規模，採用小步快跑的開發模式'
  }
}

/**
 * 開發者統計資訊（用於詳細分析，P2/P3 功能）
 */
export interface DeveloperStatistics {
  /** 開發者 ID */
  developerId: number

  /** 開發者名稱 */
  developerName: string

  /** 合併次數 */
  mergeCount: number

  /** 週平均合併數 */
  weeklyAverageMerges: number

  /** 首次合併日期 */
  firstMergeDate: Date

  /** 最後合併日期 */
  lastMergeDate: Date

  /** 活躍天數 */
  activeDays: number
}
