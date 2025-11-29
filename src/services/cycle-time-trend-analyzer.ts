/**
 * MR 週期時間趨勢分析器
 *
 * 負責將 MR 按時段分組並計算趨勢統計
 *
 * @module services/cycle-time-trend-analyzer
 */

import type {
  CycleTimeMetrics,
  TrendPeriod,
  StageStatistics,
} from '../types/cycle-time.js'
import { StageAnalyzer } from './stage-analyzer.js'
import { TrendSplitter, type PeriodInfo } from './trend-splitter.js'
import type { TrendGranularity } from '../models/trend-period.js'

/**
 * MR 週期時間趨勢分析器
 */
export class CycleTimeTrendAnalyzer {
  private trendSplitter: TrendSplitter

  constructor() {
    this.trendSplitter = new TrendSplitter()
  }

  /**
   * 分析 MR 週期時間趨勢
   *
   * @param metrics - MR 週期時間指標陣列
   * @param startDate - 開始日期
   * @param endDate - 結束日期
   * @param granularity - 粒度（weekly 或 monthly）
   * @returns 趨勢時段陣列
   */
  analyzeTrend(
    metrics: CycleTimeMetrics[],
    startDate: Date,
    endDate: Date,
    granularity: TrendGranularity = 'weekly'
  ): TrendPeriod[] {
    // 分割時間段
    const periods = this.trendSplitter.splitTimeRange(
      startDate,
      endDate,
      granularity
    )

    // 為每個時段計算統計
    const trendPeriods = periods.map((period, index) =>
      this.calculatePeriodStatistics(metrics, period, index, periods.length)
    )

    // 計算時段間變化
    return trendPeriods.map((period, index) => {
      if (index === 0) {
        return period
      }

      const previousPeriod = trendPeriods[index - 1]
      return {
        ...period,
        changeFromPrevious: this.calculateChangeFromPrevious(
          previousPeriod!.totalCycleTime.mean,
          period.totalCycleTime.mean
        ),
      }
    })
  }

  /**
   * 計算單一時段的統計資料
   *
   * @param allMetrics - 所有 MR 指標
   * @param period - 時段資訊
   * @param periodIndex - 時段索引
   * @param totalPeriods - 總時段數
   * @returns 趨勢時段
   */
  private calculatePeriodStatistics(
    allMetrics: CycleTimeMetrics[],
    period: PeriodInfo,
    periodIndex: number,
    totalPeriods: number
  ): TrendPeriod {
    // 篩選該時段的 MR
    const periodMetrics = this.filterMetricsByPeriod(allMetrics, period)

    // 計算四階段統計（捕獲錯誤，如果某階段全為 null）
    let stages: TrendPeriod['stages']
    let totalCycleTime: { mean: number; median: number }
    let doraTier: 'Elite' | 'High' | 'Medium' | 'Low'

    if (periodMetrics.length === 0) {
      stages = this.getEmptyStageStatistics()
      totalCycleTime = { mean: 0, median: 0 }
      doraTier = 'Low'
    } else {
      try {
        stages = StageAnalyzer.calculateAllStageStatistics(periodMetrics)
        totalCycleTime = StageAnalyzer.calculateTotalStatistics(periodMetrics)
        doraTier = StageAnalyzer.classifyDoraTier(totalCycleTime.mean)
      } catch (error) {
        // 如果某個階段全為 null，使用空統計
        stages = this.getEmptyStageStatistics()
        totalCycleTime = { mean: 0, median: 0 }
        doraTier = 'Low'
      }
    }

    // 產生時段標籤
    const label = this.generatePeriodLabel(period, periodIndex, totalPeriods)

    return {
      periodStart: period.startDate.toISOString().split('T')[0]!,
      periodEnd: period.endDate.toISOString().split('T')[0]!,
      label,
      mrCount: periodMetrics.length,
      stages,
      totalCycleTime,
      doraTier,
    }
  }

  /**
   * 篩選屬於特定時段的 MR
   *
   * @param metrics - 所有 MR 指標
   * @param period - 時段資訊
   * @returns 該時段的 MR 指標
   */
  private filterMetricsByPeriod(
    metrics: CycleTimeMetrics[],
    period: PeriodInfo
  ): CycleTimeMetrics[] {
    return metrics.filter((metric) => {
      const mergedDate = new Date(metric.timestamps.mergedAt)
      return mergedDate >= period.startDate && mergedDate <= period.endDate
    })
  }

  /**
   * 計算時段間變化
   *
   * @param previousMean - 前一時段的平均值
   * @param currentMean - 當前時段的平均值
   * @returns 變化資訊
   */
  private calculateChangeFromPrevious(
    previousMean: number,
    currentMean: number
  ): TrendPeriod['changeFromPrevious'] {
    const cycleTime = currentMean - previousMean
    const percentage = previousMean > 0
      ? (cycleTime / previousMean) * 100
      : 0

    return {
      cycleTime,
      percentage,
    }
  }

  /**
   * 產生時段標籤
   *
   * @param period - 時段資訊
   * @param periodIndex - 時段索引
   * @param totalPeriods - 總時段數
   * @returns 時段標籤
   */
  private generatePeriodLabel(
    period: PeriodInfo,
    periodIndex: number,
    totalPeriods: number
  ): string {
    const start = period.startDate.toISOString().split('T')[0]!.slice(5) // MM-DD
    const end = period.endDate.toISOString().split('T')[0]!.slice(5) // MM-DD
    const periodNum = periodIndex + 1

    return `P${periodNum}/${totalPeriods}: ${start}~${end}`
  }

  /**
   * 取得空的階段統計（當時段無 MR 時使用）
   *
   * @returns 空的階段統計
   */
  private getEmptyStageStatistics(): TrendPeriod['stages'] {
    const emptyStage: StageStatistics = {
      stageName: 'coding',
      mean: 0,
      median: 0,
      p75: 0,
      p90: 0,
      min: 0,
      max: 0,
      sampleCount: 0,
      percentage: 0,
      isBottleneck: false,
    }

    return {
      coding: { ...emptyStage, stageName: 'coding' },
      pickup: { ...emptyStage, stageName: 'pickup' },
      review: { ...emptyStage, stageName: 'review' },
      merge: { ...emptyStage, stageName: 'merge' },
    }
  }
}
