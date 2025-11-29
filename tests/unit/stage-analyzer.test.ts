/**
 * StageAnalyzer 單元測試
 *
 * 測試統計指標計算與 DORA 層級分類
 */

import { describe, it, expect } from 'vitest'
import { StageAnalyzer } from '../../src/services/stage-analyzer.js'
import { createCycleTimeMetrics } from '../../src/models/cycle-time-metrics.js'
import type { CycleTimeMetrics } from '../../src/types/cycle-time.js'

describe('StageAnalyzer', () => {
  // 建立測試用的 Metrics
  function createTestMetrics(
    codingTime: number,
    pickupTime: number | null,
    reviewTime: number | null,
    mergeTime: number
  ): CycleTimeMetrics {
    return createCycleTimeMetrics({
      mr: {
        iid: 1,
        title: 'Test MR',
        author: 'Test User',
        webUrl: 'https://gitlab.com/test/project/-/merge_requests/1',
      },
      timestamps: {
        firstCommitAt: '2024-01-01T10:00:00Z',
        createdAt: '2024-01-02T10:00:00Z',
        firstReviewAt: pickupTime !== null ? '2024-01-02T12:00:00Z' : null,
        lastReviewAt: reviewTime !== null ? '2024-01-02T14:00:00Z' : null,
        mergedAt: '2024-01-03T10:00:00Z',
      },
      stages: {
        codingTime,
        pickupTime,
        reviewTime,
        mergeTime,
      },
    })
  }

  describe('calculateStageStatistics()', () => {
    it('應正確計算單一階段的統計指標', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(10, 5, 8, 2),
        createTestMetrics(20, 10, 12, 4),
        createTestMetrics(15, 8, 10, 3),
      ]

      const codingStats = StageAnalyzer.calculateStageStatistics(metrics, 'coding')

      expect(codingStats.mean).toBeCloseTo(15, 1) // (10 + 20 + 15) / 3 = 15
      expect(codingStats.median).toBe(15) // 排序後 [10, 15, 20] 的中位數
      expect(codingStats.p75).toBeCloseTo(17.5, 1) // 75th percentile
      expect(codingStats.p90).toBeCloseTo(19, 1) // 90th percentile
    })

    it('應正確處理部分 MR 沒有審查的情況', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(10, 5, 8, 2),
        createTestMetrics(20, null, null, 15), // 沒有審查
        createTestMetrics(15, 8, 10, 3),
      ]

      const pickupStats = StageAnalyzer.calculateStageStatistics(metrics, 'pickup')

      expect(pickupStats.mean).toBeCloseTo(6.5, 1) // (5 + 8) / 2
      expect(pickupStats.sampleCount).toBe(2) // 只有 2 個有效值
    })

    it('應在全部為 null 時拋出錯誤', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(10, null, null, 2),
        createTestMetrics(20, null, null, 4),
      ]

      expect(() => {
        StageAnalyzer.calculateStageStatistics(metrics, 'pickup')
      }).toThrow('無有效資料')
    })

    it('應正確處理單一 MR', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(42, 10, 20, 5),
      ]

      const codingStats = StageAnalyzer.calculateStageStatistics(metrics, 'coding')

      expect(codingStats.mean).toBe(42)
      expect(codingStats.median).toBe(42)
      expect(codingStats.p75).toBe(42)
      expect(codingStats.p90).toBe(42)
      expect(codingStats.sampleCount).toBe(1)
    })
  })

  describe('calculateAllStageStatistics()', () => {
    it('應正確計算所有四階段的統計指標', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(10, 5, 8, 2),
        createTestMetrics(20, 10, 12, 4),
        createTestMetrics(15, 8, 10, 3),
      ]

      const allStats = StageAnalyzer.calculateAllStageStatistics(metrics)

      expect(allStats.coding.mean).toBeCloseTo(15, 1)
      expect(allStats.pickup.mean).toBeCloseTo(7.67, 1) // (5+10+8)/3
      expect(allStats.review.mean).toBeCloseTo(10, 1) // (8+12+10)/3
      expect(allStats.merge.mean).toBeCloseTo(3, 1) // (2+4+3)/3
    })

    it('應正確處理部分 MR 沒有審查的情況', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(10, 5, 8, 2),
        createTestMetrics(20, null, null, 15), // 沒有審查
        createTestMetrics(15, 8, 10, 3),
      ]

      const allStats = StageAnalyzer.calculateAllStageStatistics(metrics)

      // Pickup 和 Review 只計算有值的 MR
      expect(allStats.pickup.sampleCount).toBe(2)
      expect(allStats.review.sampleCount).toBe(2)

      // Coding 和 Merge 計算全部
      expect(allStats.coding.sampleCount).toBe(3)
      expect(allStats.merge.sampleCount).toBe(3)
    })
  })

  describe('calculateTotalStatistics()', () => {
    it('應正確計算總週期時間統計', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(10, 5, 8, 2), // total: 25
        createTestMetrics(20, 10, 12, 4), // total: 46
        createTestMetrics(15, 8, 10, 3), // total: 36
      ]

      const totalStats = StageAnalyzer.calculateTotalStatistics(metrics)

      expect(totalStats.mean).toBeCloseTo(35.7, 1) // (25+46+36)/3
      expect(totalStats.median).toBe(36) // [25, 36, 46]
      // calculateTotalStatistics 不返回 validCount
    })

    it('應正確處理沒有審查的 MR（null 視為 0）', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(10, 5, 8, 2), // total: 25
        createTestMetrics(20, null, null, 15), // total: 35 (null 當 0)
      ]

      const totalStats = StageAnalyzer.calculateTotalStatistics(metrics)

      expect(totalStats.mean).toBeCloseTo(30, 1) // (25+35)/2
    })
  })

  describe('classifyDoraTier()', () => {
    it('應正確分類為 Elite（< 26 小時）', () => {
      const tier = StageAnalyzer.classifyDoraTier(20)
      expect(tier).toBe('Elite')
    })

    it('應正確分類為 High（26-168 小時，即 1 週）', () => {
      const tier1 = StageAnalyzer.classifyDoraTier(26)
      expect(tier1).toBe('High')

      const tier2 = StageAnalyzer.classifyDoraTier(100)
      expect(tier2).toBe('High')

      const tier3 = StageAnalyzer.classifyDoraTier(167)
      expect(tier3).toBe('High')
    })

    it('應正確分類為 Medium（168-720 小時，即 1 個月）', () => {
      const tier1 = StageAnalyzer.classifyDoraTier(168)
      expect(tier1).toBe('Medium')

      const tier2 = StageAnalyzer.classifyDoraTier(500)
      expect(tier2).toBe('Medium')

      const tier3 = StageAnalyzer.classifyDoraTier(719)
      expect(tier3).toBe('Medium')
    })

    it('應正確分類為 Low（>= 720 小時）', () => {
      const tier1 = StageAnalyzer.classifyDoraTier(720)
      expect(tier1).toBe('Low')

      const tier2 = StageAnalyzer.classifyDoraTier(1000)
      expect(tier2).toBe('Low')
    })

    it('應處理邊界值', () => {
      expect(StageAnalyzer.classifyDoraTier(25.99)).toBe('Elite')
      expect(StageAnalyzer.classifyDoraTier(26)).toBe('High')
      expect(StageAnalyzer.classifyDoraTier(167.99)).toBe('High')
      expect(StageAnalyzer.classifyDoraTier(168)).toBe('Medium')
      expect(StageAnalyzer.classifyDoraTier(719.99)).toBe('Medium')
      expect(StageAnalyzer.classifyDoraTier(720)).toBe('Low')
    })
  })

  describe('identifyBottleneck()', () => {
    it('應正確識別 coding 為瓶頸', () => {
      // 使用實際的 StageStatistics 物件
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(100, 20, 30, 10), // Coding 最高
        createTestMetrics(90, 18, 28, 9),
      ]

      const allStats = StageAnalyzer.calculateAllStageStatistics(metrics)
      const bottleneck = StageAnalyzer.identifyBottleneck(allStats)

      expect(bottleneck).toBe('coding')
    })

    it('應正確識別 review 為瓶頸', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(20, 10, 100, 15), // Review 最高
        createTestMetrics(18, 9, 90, 14),
      ]

      const allStats = StageAnalyzer.calculateAllStageStatistics(metrics)
      const bottleneck = StageAnalyzer.identifyBottleneck(allStats)

      expect(bottleneck).toBe('review')
    })

    it('應正確識別 pickup 為瓶頸', () => {
      const metrics: CycleTimeMetrics[] = [
        createTestMetrics(20, 100, 30, 10), // Pickup 最高
        createTestMetrics(18, 90, 28, 9),
      ]

      const allStats = StageAnalyzer.calculateAllStageStatistics(metrics)
      const bottleneck = StageAnalyzer.identifyBottleneck(allStats)

      expect(bottleneck).toBe('pickup')
    })
  })
})
