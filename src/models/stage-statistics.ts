/**
 * 階段統計模型
 *
 * 提供 StageStatistics 的驗證與工廠方法
 *
 * @module models/stage-statistics
 */

import type { StageStatistics } from '../types/cycle-time.js'

/**
 * 驗證 StageStatistics 資料的完整性
 *
 * @param stats - 階段統計
 * @throws Error 當驗證失敗時
 */
export function validateStageStatistics(stats: StageStatistics): void {
  // 驗證統計值非負
  const { mean, median, p75, p90, min, max } = stats

  if (mean < 0) throw new Error(`${stats.stageName}: 平均值不可為負`)
  if (median < 0) throw new Error(`${stats.stageName}: 中位數不可為負`)
  if (p75 < 0) throw new Error(`${stats.stageName}: P75 不可為負`)
  if (p90 < 0) throw new Error(`${stats.stageName}: P90 不可為負`)
  if (min < 0) throw new Error(`${stats.stageName}: 最小值不可為負`)
  if (max < 0) throw new Error(`${stats.stageName}: 最大值不可為負`)

  // 驗證百分比範圍
  if (stats.percentage < 0 || stats.percentage > 100) {
    throw new Error(`${stats.stageName}: 百分比必須在 0-100 之間`)
  }

  // 驗證樣本數
  if (stats.sampleCount < 1) {
    throw new Error(`${stats.stageName}: 樣本數至少為 1`)
  }

  // 驗證統計值順序
  if (min > median || median > max) {
    throw new Error(`${stats.stageName}: 統計值順序錯誤 (min <= median <= max)`)
  }
}

/**
 * 計算階段佔總週期時間的百分比
 *
 * @param stageMean - 該階段的平均值
 * @param totalMeans - 所有階段的平均值陣列
 * @returns 百分比（0-100）
 */
export function calculatePercentage(stageMean: number, totalMeans: number[]): number {
  const total = totalMeans.reduce((sum, value) => sum + value, 0)

  if (total === 0) {
    return 0
  }

  const percentage = (stageMean / total) * 100
  return Math.round(percentage * 10) / 10 // 保留一位小數
}

/**
 * 建立 StageStatistics 實例（工廠方法）
 *
 * @param data - 階段統計資料
 * @returns StageStatistics 實例
 */
export function createStageStatistics(data: {
  stageName: 'coding' | 'pickup' | 'review' | 'merge'
  mean: number
  median: number
  p75: number
  p90: number
  min: number
  max: number
  sampleCount: number
  percentage: number
  isBottleneck: boolean
}): StageStatistics {
  const stats: StageStatistics = {
    stageName: data.stageName,
    mean: Math.round(data.mean * 10) / 10, // 保留一位小數
    median: Math.round(data.median * 10) / 10,
    p75: Math.round(data.p75 * 10) / 10,
    p90: Math.round(data.p90 * 10) / 10,
    min: Math.round(data.min * 10) / 10,
    max: Math.round(data.max * 10) / 10,
    sampleCount: data.sampleCount,
    percentage: data.percentage,
    isBottleneck: data.isBottleneck,
  }

  // 驗證建立的實例
  validateStageStatistics(stats)

  return stats
}
