/**
 * MR 規模分析 - JSON 格式化器
 * Feature: 007-mr-size-analysis
 */

import { SizeDistribution, OversizedMR } from '../types/mr-size.js'

/**
 * 格式化規模分佈為 JSON
 *
 * @param distribution - 規模分佈資料
 * @param projectPath - 專案路徑
 * @param dateRange - 日期範圍
 * @returns JSON 字串
 */
export function formatSizeDistributionJson(
  distribution: SizeDistribution,
  projectPath: string,
  dateRange?: { since: Date; until: Date }
): string {
  const output = {
    project: projectPath,
    dateRange: dateRange
      ? {
          since: dateRange.since.toISOString(),
          until: dateRange.until.toISOString(),
        }
      : undefined,
    distribution,
  }

  return JSON.stringify(output, null, 2)
}

/**
 * 格式化過大 MR 列表為 JSON
 *
 * @param oversizedMRs - 過大 MR 列表
 * @param projectPath - 專案路徑
 * @param dateRange - 日期範圍
 * @returns JSON 字串
 */
export function formatOversizedMRsJson(
  oversizedMRs: OversizedMR[],
  projectPath: string,
  dateRange?: { since: Date; until: Date }
): string {
  const output = {
    project: projectPath,
    dateRange: dateRange
      ? {
          since: dateRange.since.toISOString(),
          until: dateRange.until.toISOString(),
        }
      : undefined,
    oversizedMRs,
    total: oversizedMRs.length,
  }

  return JSON.stringify(output, null, 2)
}
