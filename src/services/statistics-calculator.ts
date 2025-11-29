/**
 * 統計計算服務
 *
 * 提供各種統計計算功能（人均、百分比、小批量評估等）
 */

import { TrendDataPoint, TimePeriod, FrequencyTrend } from '../models/trend.js'
import { TrendSummary, assessBatchSize } from '../models/statistics.js'
import { MergeRequest } from '../models/merge-request.js'
import { PeriodComparison } from '../models/comparison.js'

/**
 * 計算趨勢摘要
 * @param mergeRequests 所有 MR
 * @param dataPoints 趨勢資料點
 * @param timePeriod 時間範圍
 * @param threshold 小批量閾值（預設 3）
 * @returns TrendSummary
 */
export function calculateTrendSummary(
  mergeRequests: MergeRequest[],
  _dataPoints: TrendDataPoint[],
  timePeriod: TimePeriod,
  threshold: number = 3
): TrendSummary {
  // 總合併次數
  const totalMerges = mergeRequests.length

  // 總活躍開發者數（去重）
  const allDevelopers = new Set<number>()
  for (const mr of mergeRequests) {
    allDevelopers.add(mr.author.id)
  }
  const totalActiveDevelopers = allDevelopers.size

  // 整體人均合併數
  const overallAvgMergesPerDeveloper = totalActiveDevelopers > 0
    ? totalMerges / totalActiveDevelopers
    : 0

  // 週平均合併數
  const weeklyAverageMerges = timePeriod.weeksCount > 0
    ? totalMerges / timePeriod.weeksCount
    : 0

  // 週人均合併數
  const weeklyAvgMergesPerDeveloper = totalActiveDevelopers > 0 && timePeriod.weeksCount > 0
    ? totalMerges / totalActiveDevelopers / timePeriod.weeksCount
    : 0

  // 整體小批量評估
  const overallBatchAssessment = assessBatchSize(weeklyAvgMergesPerDeveloper, threshold)

  return {
    totalMerges,
    totalActiveDevelopers,
    overallAvgMergesPerDeveloper,
    weeklyAverageMerges,
    weeklyAvgMergesPerDeveloper,
    overallBatchAssessment
  }
}

/**
 * 生成完整的頻率趨勢分析結果
 * @param projectId 專案 ID
 * @param timePeriod 時間範圍
 * @param mergeRequests MR 列表
 * @param dataPoints 趨勢資料點
 * @param threshold 小批量閾值
 * @returns FrequencyTrend
 */
export function generateFrequencyTrend(
  projectId: string,
  timePeriod: TimePeriod,
  _mergeRequests: MergeRequest[],
  dataPoints: TrendDataPoint[],
  _threshold: number = 3
): FrequencyTrend {
  return {
    projectId,
    timePeriod,
    dataPoints,
    queriedAt: new Date()
  }
}

/**
 * 計算變化百分比
 * @param previousValue 先前值
 * @param currentValue 當前值
 * @returns 變化百分比
 */
export function calculateChangePercentage(
  previousValue: number,
  currentValue: number
): number {
  if (previousValue === 0) {
    return currentValue > 0 ? 100 : 0 // 從零增加視為 100% 增長
  }
  return ((currentValue - previousValue) / previousValue) * 100
}

/**
 * 標準化為週平均（用於比較不同長度時間段）
 * @param totalMerges 總合併數
 * @param timeRangeDays 時間範圍天數
 * @returns 週平均合併數
 */
export function normalizeToWeeklyAverage(
  totalMerges: number,
  timeRangeDays: number
): number {
  if (timeRangeDays === 0) return 0
  const weeks = timeRangeDays / 7
  return weeks > 0 ? totalMerges / weeks : 0
}

/**
 * 比較兩個時間段的趨勢
 * @param previousPeriod 先前期間趨勢
 * @param currentPeriod 當前期間趨勢
 * @param previousSummary 先前期間摘要（可選，用於人均比較）
 * @param currentSummary 當前期間摘要（可選，用於人均比較）
 * @returns 期間比較結果
 */
export function comparePeriods(
  previousPeriod: FrequencyTrend,
  currentPeriod: FrequencyTrend,
  previousSummary?: TrendSummary,
  currentSummary?: TrendSummary
): PeriodComparison {
  // 計算總合併數（從 dataPoints 累計）
  const previousTotal = previousPeriod.dataPoints.reduce((sum, dp) => sum + dp.mergeCount, 0)
  const currentTotal = currentPeriod.dataPoints.reduce((sum, dp) => sum + dp.mergeCount, 0)

  // 計算總合併數變化百分比
  const totalMergesChangePercent = calculateChangePercentage(previousTotal, currentTotal)

  // 標準化為週平均並計算變化
  const previousWeekly = normalizeToWeeklyAverage(previousTotal, previousPeriod.timePeriod.daysCount)
  const currentWeekly = normalizeToWeeklyAverage(currentTotal, currentPeriod.timePeriod.daysCount)
  const weeklyAverageChangePercent = calculateChangePercentage(previousWeekly, currentWeekly)

  // 如果有 summary，計算人均變化
  let perDeveloperChangePercent: number | undefined
  if (previousSummary && currentSummary) {
    perDeveloperChangePercent = calculateChangePercentage(
      previousSummary.weeklyAvgMergesPerDeveloper,
      currentSummary.weeklyAvgMergesPerDeveloper
    )
  }

  // 判斷是否改善（增加視為改善）
  const isImprovement = weeklyAverageChangePercent > 0

  return {
    previousPeriod,
    currentPeriod,
    totalMergesChangePercent,
    weeklyAverageChangePercent,
    perDeveloperChangePercent,
    isImprovement
  }
}
