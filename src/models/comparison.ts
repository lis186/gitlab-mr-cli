/**
 * 時間段比較資料模型
 */

import { FrequencyTrend } from './trend.js'

/**
 * 期間比較結果
 */
export interface PeriodComparison {
  /** 先前期間趨勢 */
  previousPeriod: FrequencyTrend

  /** 當前期間趨勢 */
  currentPeriod: FrequencyTrend

  /** 合併總數變化百分比 */
  totalMergesChangePercent: number

  /** 週平均變化百分比 */
  weeklyAverageChangePercent: number

  /** 人均變化百分比（如果有人均統計） */
  perDeveloperChangePercent?: number

  /** 是否為改善（增加視為改善） */
  isImprovement: boolean
}

/**
 * 多專案比較結果（為未來的 User Story 5 預留）
 */
export interface ProjectComparisonResult {
  /** 專案 ID */
  projectId: string

  /** 頻率趨勢 */
  trend: FrequencyTrend

  /** 排名（1 表示最高） */
  rank: number
}

/**
 * 多專案比較摘要（為未來的 User Story 5 預留）
 */
export interface ComparisonSummary {
  /** 專案比較結果列表 */
  projects: ProjectComparisonResult[]

  /** 最佳專案 ID */
  bestProjectId: string

  /** 最差專案 ID */
  worstProjectId: string
}
