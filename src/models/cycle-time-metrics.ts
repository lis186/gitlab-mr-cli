/**
 * MR 週期時間指標模型
 *
 * 提供 CycleTimeMetrics 的驗證與工廠方法
 *
 * @module models/cycle-time-metrics
 */

import type { CycleTimeMetrics } from '../types/cycle-time.js'

/**
 * 驗證 CycleTimeMetrics 資料的完整性
 *
 * @param metrics - 週期時間指標
 * @throws Error 當驗證失敗時
 */
export function validateCycleTimeMetrics(metrics: CycleTimeMetrics): void {
  // 驗證階段時間
  if (metrics.stages.codingTime < 0) {
    throw new Error(`MR !${metrics.mr.iid}: Coding Time 不可為負值`)
  }

  if (metrics.stages.pickupTime !== null && metrics.stages.pickupTime < 0) {
    throw new Error(`MR !${metrics.mr.iid}: Pickup Time 不可為負值`)
  }

  if (metrics.stages.reviewTime !== null && metrics.stages.reviewTime < 0) {
    throw new Error(`MR !${metrics.mr.iid}: Review Time 不可為負值`)
  }

  // 允許 Merge Time = 0（快速合併、自動合併情況）
  if (metrics.stages.mergeTime < 0) {
    throw new Error(`MR !${metrics.mr.iid}: Merge Time 不可為負值`)
  }

  // 驗證總週期時間
  if (metrics.totalCycleTime <= 0) {
    throw new Error(`MR !${metrics.mr.iid}: 總週期時間必須大於 0`)
  }

  // 驗證時間戳邏輯順序
  const { createdAt, lastReviewAt, mergedAt } = metrics.timestamps

  const created = new Date(createdAt)
  const merged = new Date(mergedAt)

  // 註：不再強制要求 firstCommit <= created，因為 rebase/amend 會更新 commit 時間
  // 計算層會處理這種情況（返回 0）

  if (merged < created) {
    throw new Error(`MR !${metrics.mr.iid}: 合併時間不可早於建立時間`)
  }

  // 驗證審查時間順序（如果有審查）
  if (lastReviewAt) {
    const lastReview = new Date(lastReviewAt)

    // 註：時間過濾已在 CycleTimeCalculator.getReviewTimes() 中處理
    // 使用 5 秒時間寬容機制處理時鐘同步問題
    // 允許 lastReviewAt 略晚於 mergedAt（最多 5 秒）
    const TOLERANCE_MS = 5000 // 5 秒
    const timeDiff = lastReview.getTime() - merged.getTime()

    if (timeDiff > TOLERANCE_MS) {
      throw new Error(
        `MR !${metrics.mr.iid}: 合併時間不可早於最後審查時間（超過 ${TOLERANCE_MS / 1000} 秒寬容範圍）`
      )
    }
  }
}

/**
 * 計算總週期時間
 *
 * @param stages - 四階段時間
 * @returns 總週期時間（null 視為 0）
 */
export function calculateTotalCycleTime(stages: CycleTimeMetrics['stages']): number {
  const { codingTime, pickupTime, reviewTime, mergeTime } = stages

  return (
    codingTime +
    (pickupTime ?? 0) +
    (reviewTime ?? 0) +
    mergeTime
  )
}

/**
 * 建立 CycleTimeMetrics 實例（工廠方法）
 *
 * @param data - MR 資料與計算後的階段時間
 * @returns CycleTimeMetrics 實例
 */
export function createCycleTimeMetrics(data: {
  mr: {
    iid: number
    title: string
    author: string
    webUrl: string
  }
  timestamps: {
    firstCommitAt: string
    createdAt: string
    firstReviewAt: string | null
    lastReviewAt: string | null
    mergedAt: string
  }
  stages: {
    codingTime: number
    pickupTime: number | null
    reviewTime: number | null
    mergeTime: number
  }
}): CycleTimeMetrics {
  const totalCycleTime = calculateTotalCycleTime(data.stages)
  const hasReview = data.timestamps.firstReviewAt !== null

  const metrics: CycleTimeMetrics = {
    mr: data.mr,
    timestamps: data.timestamps,
    stages: data.stages,
    totalCycleTime,
    hasReview,
  }

  // 驗證建立的實例
  validateCycleTimeMetrics(metrics)

  return metrics
}
