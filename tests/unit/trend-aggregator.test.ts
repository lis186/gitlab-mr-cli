/**
 * TrendAggregator 服務單元測試 (T011)
 *
 * 驗證時間彙總邏輯的正確性
 */

import { describe, it, expect } from 'vitest'
import { aggregateByGranularity } from '../../src/services/trend-aggregator.js'
import { TimeGranularity } from '../../src/models/trend.js'
import { MergeRequest, MergeRequestState } from '../../src/models/merge-request.js'

describe('TrendAggregator', () => {
  // 建立測試用的 MR 資料
  const createMockMR = (id: number, mergedAt: Date, authorId: number): MergeRequest => ({
    id,
    iid: id,
    title: `Test MR ${id}`,
    state: MergeRequestState.MERGED,
    author: {
      id: authorId,
      name: `User ${authorId}`,
      username: `user${authorId}`,
      avatarUrl: undefined
    },
    createdAt: new Date(mergedAt.getTime() - 86400000), // 1 天前
    updatedAt: mergedAt,
    mergedAt,
    sourceBranch: 'feature',
    targetBranch: 'main',
    webUrl: `https://gitlab.com/test/mr/${id}`
  })

  describe('aggregateByGranularity - DAY', () => {
    it('應正確按日彙總 MR', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-15T10:00:00Z'), 1),
        createMockMR(2, new Date('2025-01-15T14:00:00Z'), 2),
        createMockMR(3, new Date('2025-01-16T10:00:00Z'), 1),
        createMockMR(4, new Date('2025-01-17T10:00:00Z'), 3)
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.DAY)

      expect(result).toHaveLength(3) // 3 個不同的日期
      expect(result[0].timeLabel).toBe('2025-01-15')
      expect(result[0].mergeCount).toBe(2) // 1/15 有 2 個 MR
      expect(result[1].timeLabel).toBe('2025-01-16')
      expect(result[1].mergeCount).toBe(1) // 1/16 有 1 個 MR
      expect(result[2].timeLabel).toBe('2025-01-17')
      expect(result[2].mergeCount).toBe(1) // 1/17 有 1 個 MR
    })

    it('應正確計算每日的活躍開發者', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-15T02:00:00Z'), 1),
        createMockMR(2, new Date('2025-01-15T04:00:00Z'), 2),
        createMockMR(3, new Date('2025-01-15T06:00:00Z'), 1) // 重複的開發者
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.DAY)

      expect(result).toHaveLength(1)
      expect(result[0].activeDeveloperCount).toBe(2) // 只有 2 位不同的開發者
      expect(result[0].activeDeveloperIds.has(1)).toBe(true)
      expect(result[0].activeDeveloperIds.has(2)).toBe(true)
    })

    it('應正確計算每日的人均合併數', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-15T02:00:00Z'), 1),
        createMockMR(2, new Date('2025-01-15T04:00:00Z'), 2),
        createMockMR(3, new Date('2025-01-15T06:00:00Z'), 3),
        createMockMR(4, new Date('2025-01-15T08:00:00Z'), 1)
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.DAY)

      expect(result).toHaveLength(1)
      expect(result[0].mergeCount).toBe(4)
      expect(result[0].activeDeveloperCount).toBe(3)
      expect(result[0].avgMergesPerDeveloper).toBeCloseTo(1.33, 2) // 4 / 3 ≈ 1.33
    })
  })

  describe('aggregateByGranularity - WEEK', () => {
    it('應正確按週彙總 MR（ISO week）', () => {
      const mrs: MergeRequest[] = [
        // 2025-01-13 是週一（2025-W03 的開始）
        createMockMR(1, new Date('2025-01-13T10:00:00Z'), 1),
        createMockMR(2, new Date('2025-01-15T10:00:00Z'), 2),
        // 2025-01-20 是週一（2025-W04 的開始）
        createMockMR(3, new Date('2025-01-20T10:00:00Z'), 1),
        createMockMR(4, new Date('2025-01-22T10:00:00Z'), 3)
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.WEEK)

      expect(result).toHaveLength(2) // 2 個不同的週
      expect(result[0].mergeCount).toBe(2) // W03 有 2 個 MR
      expect(result[1].mergeCount).toBe(2) // W04 有 2 個 MR
    })

    it('週標籤應使用 ISO week 格式', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-15T10:00:00Z'), 1)
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.WEEK)

      expect(result).toHaveLength(1)
      // ISO week 格式：2025-W03
      expect(result[0].timeLabel).toMatch(/^\d{4}-W\d{2}$/)
    })

    it('應正確計算每週的活躍開發者', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-13T10:00:00Z'), 1),
        createMockMR(2, new Date('2025-01-14T10:00:00Z'), 2),
        createMockMR(3, new Date('2025-01-15T10:00:00Z'), 3),
        createMockMR(4, new Date('2025-01-16T10:00:00Z'), 1) // 重複
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.WEEK)

      expect(result).toHaveLength(1)
      expect(result[0].activeDeveloperCount).toBe(3) // 3 位不同的開發者
    })
  })

  describe('aggregateByGranularity - MONTH', () => {
    it('應正確按月彙總 MR', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-05T10:00:00Z'), 1),
        createMockMR(2, new Date('2025-01-15T10:00:00Z'), 2),
        createMockMR(3, new Date('2025-01-25T10:00:00Z'), 1),
        createMockMR(4, new Date('2025-02-10T10:00:00Z'), 3),
        createMockMR(5, new Date('2025-03-01T10:00:00Z'), 2)
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.MONTH)

      expect(result).toHaveLength(3) // 3 個不同的月份
      expect(result[0].timeLabel).toBe('2025-01')
      expect(result[0].mergeCount).toBe(3) // 1 月有 3 個 MR
      expect(result[1].timeLabel).toBe('2025-02')
      expect(result[1].mergeCount).toBe(1) // 2 月有 1 個 MR
      expect(result[2].timeLabel).toBe('2025-03')
      expect(result[2].mergeCount).toBe(1) // 3 月有 1 個 MR
    })

    it('應正確計算每月的活躍開發者', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-05T10:00:00Z'), 1),
        createMockMR(2, new Date('2025-01-15T10:00:00Z'), 2),
        createMockMR(3, new Date('2025-01-25T10:00:00Z'), 3),
        createMockMR(4, new Date('2025-01-28T10:00:00Z'), 1) // 重複
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.MONTH)

      expect(result).toHaveLength(1)
      expect(result[0].activeDeveloperCount).toBe(3) // 3 位不同的開發者
    })
  })

  describe('Edge Cases', () => {
    it('應處理空陣列', () => {
      const result = aggregateByGranularity([], TimeGranularity.DAY)

      expect(result).toHaveLength(0)
    })

    it('應跳過 mergedAt 為 null 的 MR', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-15T10:00:00Z'), 1),
        { ...createMockMR(2, new Date('2025-01-15T14:00:00Z'), 2), mergedAt: null }
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.DAY)

      expect(result).toHaveLength(1)
      expect(result[0].mergeCount).toBe(1) // 只計算有 mergedAt 的 MR
    })

    it('應處理單一 MR', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-15T10:00:00Z'), 1)
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.DAY)

      expect(result).toHaveLength(1)
      expect(result[0].mergeCount).toBe(1)
      expect(result[0].activeDeveloperCount).toBe(1)
    })

    it('結果應按時間排序（從舊到新）', () => {
      const mrs: MergeRequest[] = [
        createMockMR(1, new Date('2025-01-17T10:00:00Z'), 1),
        createMockMR(2, new Date('2025-01-15T10:00:00Z'), 2),
        createMockMR(3, new Date('2025-01-16T10:00:00Z'), 3)
      ]

      const result = aggregateByGranularity(mrs, TimeGranularity.DAY)

      expect(result).toHaveLength(3)
      expect(result[0].timeLabel).toBe('2025-01-15') // 最舊的
      expect(result[1].timeLabel).toBe('2025-01-16')
      expect(result[2].timeLabel).toBe('2025-01-17') // 最新的
    })
  })
})
