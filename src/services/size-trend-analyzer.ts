/**
 * MR 規模趨勢分析服務
 * Feature: 007-mr-size-analysis - Phase 5 (US3)
 */

import { format, startOfMonth } from 'date-fns'
import { MRSizeMetrics, MonthlyTrendData, TrendAnalysisResult } from '../types/mr-size.js'
import { SizeAnalyzer } from './size-analyzer.js'

/**
 * 規模趨勢分析器
 * 負責按月份分組 MR 並計算趨勢資料
 */
export class SizeTrendAnalyzer {
  constructor(private sizeAnalyzer: SizeAnalyzer) {}

  /**
   * 分析 MR 規模趨勢
   * 按月份分組並計算每月的規模分佈
   *
   * @param mrs - MR 規模指標列表
   * @param dateRange - 分析的日期範圍
   * @returns 趨勢分析結果
   */
  analyzeTrend(
    mrs: MRSizeMetrics[],
    dateRange: { since: Date; until: Date }
  ): TrendAnalysisResult {
    // 按月份分組
    const monthlyGroups = this.groupByMonth(mrs)

    // 計算每月的趨勢資料
    const monthlyData = Array.from(monthlyGroups.entries())
      .map(([month, monthMRs]) => this.calculateMonthlyData(month, monthMRs))
      .sort((a, b) => a.month.localeCompare(b.month)) // 按月份排序

    // 計算整體分佈
    const overall = this.sizeAnalyzer.calculateDistribution(mrs)

    return {
      dateRange,
      monthlyData,
      overall,
    }
  }

  /**
   * 按月份分組 MR
   * 使用 mergedAt 的月份作為分組鍵
   *
   * @param mrs - MR 規模指標列表
   * @returns 按月份分組的 Map
   */
  private groupByMonth(mrs: MRSizeMetrics[]): Map<string, MRSizeMetrics[]> {
    const groups = new Map<string, MRSizeMetrics[]>()

    for (const mr of mrs) {
      // 取得月份開始日期
      const monthStart = startOfMonth(mr.mergedAt)
      // 格式化為 YYYY-MM
      const monthKey = format(monthStart, 'yyyy-MM')

      // 分組
      if (!groups.has(monthKey)) {
        groups.set(monthKey, [])
      }
      groups.get(monthKey)!.push(mr)
    }

    return groups
  }

  /**
   * 計算單月的趨勢資料
   *
   * @param month - 月份標識（YYYY-MM）
   * @param mrs - 該月的 MR 列表
   * @returns 月度趨勢資料
   */
  private calculateMonthlyData(month: string, mrs: MRSizeMetrics[]): MonthlyTrendData {
    const distribution = this.sizeAnalyzer.calculateDistribution(mrs)
    const hasLowSample = this.sizeAnalyzer.hasLowSample(mrs.length)

    return {
      month,
      total: mrs.length,
      distribution,
      hasLowSample,
    }
  }
}
