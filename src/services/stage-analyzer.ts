/**
 * 階段分析器服務
 *
 * 負責計算各階段的統計指標、識別瓶頸、分類 DORA 層級
 *
 * @module services/stage-analyzer
 */

import type { CycleTimeMetrics, StageStatistics } from '../types/cycle-time.js'
import { mean, median, min, max, calculatePercentile } from '../utils/statistics.js'
import { createStageStatistics, calculatePercentage } from '../models/stage-statistics.js'

/**
 * 階段分析器
 */
export class StageAnalyzer {
  /**
   * 計算單一階段的統計指標
   *
   * @param metrics - MR 週期時間指標陣列
   * @param stageName - 階段名稱
   * @returns StageStatistics 實例
   */
  static calculateStageStatistics(
    metrics: CycleTimeMetrics[],
    stageName: 'coding' | 'pickup' | 'review' | 'merge'
  ): StageStatistics {
    // 提取該階段的時間值（排除 null）
    const stageKey = `${stageName}Time` as keyof CycleTimeMetrics['stages']
    const values = metrics
      .map((m) => m.stages[stageKey])
      .filter((v): v is number => v !== null)

    if (values.length === 0) {
      throw new Error(`階段 ${stageName} 無有效資料`)
    }

    // 計算統計指標
    return createStageStatistics({
      stageName,
      mean: mean(values),
      median: median(values),
      p75: calculatePercentile(values, 75),
      p90: calculatePercentile(values, 90),
      min: min(values),
      max: max(values),
      sampleCount: values.length,
      percentage: 0, // 稍後計算
      isBottleneck: false, // 稍後判定
    })
  }

  /**
   * 計算所有階段的統計指標並設定百分比
   *
   * @param metrics - MR 週期時間指標陣列
   * @returns 四階段統計
   */
  static calculateAllStageStatistics(metrics: CycleTimeMetrics[]): {
    coding: StageStatistics
    pickup: StageStatistics
    review: StageStatistics
    merge: StageStatistics
  } {
    if (metrics.length === 0) {
      throw new Error('無有效的 MR 資料')
    }

    // 計算各階段統計
    const coding = this.calculateStageStatistics(metrics, 'coding')
    const pickup = this.calculateStageStatistics(metrics, 'pickup')
    const review = this.calculateStageStatistics(metrics, 'review')
    const merge = this.calculateStageStatistics(metrics, 'merge')

    // 計算百分比
    const means = [coding.mean, pickup.mean, review.mean, merge.mean]
    coding.percentage = calculatePercentage(coding.mean, means)
    pickup.percentage = calculatePercentage(pickup.mean, means)
    review.percentage = calculatePercentage(review.mean, means)
    merge.percentage = calculatePercentage(merge.mean, means)

    // 識別瓶頸階段
    const bottleneckStage = this.identifyBottleneck({
      coding,
      pickup,
      review,
      merge,
    })

    coding.isBottleneck = bottleneckStage === 'coding'
    pickup.isBottleneck = bottleneckStage === 'pickup'
    review.isBottleneck = bottleneckStage === 'review'
    merge.isBottleneck = bottleneckStage === 'merge'

    return { coding, pickup, review, merge }
  }

  /**
   * 識別瓶頸階段（百分比最高的階段）
   *
   * @param stages - 四階段統計
   * @returns 瓶頸階段名稱
   */
  static identifyBottleneck(stages: {
    coding: StageStatistics
    pickup: StageStatistics
    review: StageStatistics
    merge: StageStatistics
  }): 'coding' | 'pickup' | 'review' | 'merge' {
    const stageArray = Object.values(stages)
    const bottleneck = stageArray.reduce((max, stage) =>
      stage.percentage > max.percentage ? stage : max
    )

    return bottleneck.stageName
  }

  /**
   * 分類 DORA 層級
   *
   * 根據平均總週期時間分類團隊表現
   *
   * @param meanCycleTime - 平均總週期時間（小時）
   * @returns DORA 層級
   */
  static classifyDoraTier(
    meanCycleTime: number
  ): 'Elite' | 'High' | 'Medium' | 'Low' {
    const HOUR = 1
    const DAY = 24 * HOUR
    const WEEK = 7 * DAY
    const MONTH = 30 * DAY

    if (meanCycleTime < 26 * HOUR) {
      return 'Elite' // < 26 小時
    } else if (meanCycleTime < 1 * WEEK) {
      return 'High' // < 1 週
    } else if (meanCycleTime < 1 * MONTH) {
      return 'Medium' // < 1 個月
    } else {
      return 'Low' // >= 1 個月
    }
  }

  /**
   * 計算總體週期時間統計
   *
   * @param metrics - MR 週期時間指標陣列
   * @returns 總體統計
   */
  static calculateTotalStatistics(metrics: CycleTimeMetrics[]): {
    mean: number
    median: number
    p75: number
    p90: number
  } {
    const totalCycleTimes = metrics.map((m) => m.totalCycleTime)

    return {
      mean: Math.round(mean(totalCycleTimes) * 10) / 10,
      median: Math.round(median(totalCycleTimes) * 10) / 10,
      p75: Math.round(calculatePercentile(totalCycleTimes, 75) * 10) / 10,
      p90: Math.round(calculatePercentile(totalCycleTimes, 90) * 10) / 10,
    }
  }
}
