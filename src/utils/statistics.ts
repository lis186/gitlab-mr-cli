/**
 * 統計工具函數
 *
 * 提供統計計算功能（平均值、中位數、百分位數等）
 *
 * @module utils/statistics
 */

import type {
  HealthStatistics,
  BranchLifecycle,
} from '../types/branch-health.js'

/**
 * 計算平均值
 *
 * @param numbers - 數字陣列
 * @returns 平均值，若陣列為空則返回 0
 *
 * @example
 * ```typescript
 * const avg = mean([1, 2, 3, 4, 5])
 * // avg = 3
 * ```
 */
export function mean(numbers: number[]): number {
  if (numbers.length === 0) return 0

  const sum = numbers.reduce((acc, n) => acc + n, 0)
  return sum / numbers.length
}

/**
 * 計算中位數
 *
 * @param numbers - 數字陣列
 * @returns 中位數，若陣列為空則返回 0
 *
 * @example
 * ```typescript
 * const median = median([1, 2, 3, 4, 5])
 * // median = 3
 * ```
 */
export function median(numbers: number[]): number {
  if (numbers.length === 0) return 0

  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    // 偶數個元素，取中間兩個的平均
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  } else {
    // 奇數個元素，取中間值
    return sorted[mid]!
  }
}

/**
 * 計算最大值
 *
 * @param numbers - 數字陣列
 * @returns 最大值，若陣列為空則返回 0
 */
export function max(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return Math.max(...numbers)
}

/**
 * 計算最小值
 *
 * @param numbers - 數字陣列
 * @returns 最小值，若陣列為空則返回 0
 */
export function min(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return Math.min(...numbers)
}

/**
 * 計算標準差
 *
 * @param numbers - 數字陣列
 * @returns 標準差，若陣列為空則返回 0
 */
export function standardDeviation(numbers: number[]): number {
  if (numbers.length === 0) return 0

  const avg = mean(numbers)
  const squaredDiffs = numbers.map((n) => Math.pow(n - avg, 2))
  const variance = mean(squaredDiffs)

  return Math.sqrt(variance)
}

/**
 * 計算分支健康度統計
 *
 * 聚合多個 BranchLifecycle 的統計指標
 *
 * @param branches - 分支生命週期陣列
 * @returns 健康度統計
 *
 * @example
 * ```typescript
 * const stats = calculateStatistics(branches)
 * console.log(stats.avgLifecycleDays) // 45.2
 * ```
 */
export function calculateStatistics(
  branches: BranchLifecycle[]
): HealthStatistics {
  if (branches.length === 0) {
    return {
      totalBranches: 0,
      avgLifecycleDays: 0,
      medianLifecycleDays: 0,
      maxLifecycleDays: 0,
      avgMrProcessingDays: 0,
      medianMrProcessingDays: 0,
      maxMrProcessingDays: 0,
      staleBranchCount: 0,
    }
  }

  // 提取生命週期天數
  const lifecycleDays = branches.map((b) => b.totalLifecycleDays)

  // 提取 MR 處理天數（過濾 null）
  const mrProcessingDays = branches
    .map((b) => b.mrProcessingDays)
    .filter((d): d is number => d !== null)

  // 計算過時分支數
  const staleBranchCount = branches.filter((b) => b.isStale).length

  return {
    totalBranches: branches.length,
    avgLifecycleDays: parseFloat(mean(lifecycleDays).toFixed(1)),
    medianLifecycleDays: median(lifecycleDays),
    maxLifecycleDays: max(lifecycleDays),
    avgMrProcessingDays:
      mrProcessingDays.length > 0
        ? parseFloat(mean(mrProcessingDays).toFixed(1))
        : 0,
    medianMrProcessingDays:
      mrProcessingDays.length > 0 ? median(mrProcessingDays) : 0,
    maxMrProcessingDays: mrProcessingDays.length > 0 ? max(mrProcessingDays) : 0,
    staleBranchCount,
  }
}

/**
 * 計算百分位數（使用線性插值法）
 *
 * @param numbers - 數字陣列
 * @param percentile - 百分位數（0-100）
 * @returns 百分位數值，若陣列為空則返回 0
 *
 * @example
 * ```typescript
 * const p75 = calculatePercentile([1, 2, 3, 4, 5, 6, 7, 8], 75)
 * // p75 = 6.25
 * ```
 */
export function calculatePercentile(numbers: number[], percentile: number): number {
  if (numbers.length === 0) return 0
  if (percentile < 0 || percentile > 100) {
    throw new Error('百分位數必須在 0-100 之間')
  }

  const sorted = [...numbers].sort((a, b) => a - b)
  const index = (percentile / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower

  // 線性插值
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight
}

/**
 * 四捨五入到指定小數位數
 *
 * @param num - 數字
 * @param decimals - 小數位數（預設 1）
 * @returns 四捨五入後的數字
 */
export function roundTo(num: number, decimals: number = 1): number {
  const factor = Math.pow(10, decimals)
  return Math.round(num * factor) / factor
}
