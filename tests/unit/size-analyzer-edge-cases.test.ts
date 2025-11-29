/**
 * SizeAnalyzer 邊界案例單元測試
 * Feature: 007-mr-size-analysis
 * Task: T022b
 *
 * 驗證邊界案例：
 * - 專案 MR < 10 個時顯示樣本數不足警告
 * - MR = 0 時顯示友善提示訊息
 * - 極端規模的 MR
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SizeAnalyzer } from '../../src/services/size-analyzer.js'
import { GitLabClient } from '../../src/services/gitlab-client.js'
import { MergeRequest } from '../../src/models/merge-request.js'
import { SizeCategory } from '../../src/types/mr-size.js'

describe('SizeAnalyzer - 邊界案例', () => {
  let sizeAnalyzer: SizeAnalyzer
  let mockGitLabClient: GitLabClient

  beforeEach(() => {
    mockGitLabClient = {
      getMergeRequestDiffs: vi.fn(),
    } as unknown as GitLabClient

    sizeAnalyzer = new SizeAnalyzer(mockGitLabClient)
  })

  describe('樣本數不足（< 10 個 MR）', () => {
    it('應該在 MR 數量 < 10 時標記為樣本數不足', () => {
      expect(sizeAnalyzer.hasLowSample(0)).toBe(true)
      expect(sizeAnalyzer.hasLowSample(1)).toBe(true)
      expect(sizeAnalyzer.hasLowSample(5)).toBe(true)
      expect(sizeAnalyzer.hasLowSample(9)).toBe(true)
    })

    it('應該在 MR 數量 >= 10 時不標記為樣本數不足', () => {
      expect(sizeAnalyzer.hasLowSample(10)).toBe(false)
      expect(sizeAnalyzer.hasLowSample(11)).toBe(false)
      expect(sizeAnalyzer.hasLowSample(100)).toBe(false)
    })

    it('應該正確計算少量 MR（5 個）的規模分佈', async () => {
      const mockMRs: MergeRequest[] = Array.from({ length: 5 }, (_, i) => ({
        iid: i + 1,
        title: `MR ${i + 1}`,
        author: { name: 'Alice', username: 'alice' },
        mergedAt: new Date('2025-01-10'),
        changesCount: 5,
        webUrl: `https://gitlab.com/mr/${i + 1}`,
      })) as MergeRequest[]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValue([
        { diff: '+line1' },
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)
      const distribution = sizeAnalyzer.calculateDistribution(result)

      expect(distribution.total).toBe(5)
      expect(sizeAnalyzer.hasLowSample(distribution.total)).toBe(true)
    })
  })

  describe('零 MR 情況', () => {
    it('應該在 MR = 0 時返回空陣列', async () => {
      const result = await sizeAnalyzer.analyzeMRSizes([])

      expect(result).toHaveLength(0)
    })

    it('應該在 MR = 0 時計算出零分佈', () => {
      const distribution = sizeAnalyzer.calculateDistribution([])

      expect(distribution.total).toBe(0)
      expect(distribution.byCategory[SizeCategory.XS].count).toBe(0)
      expect(distribution.byCategory[SizeCategory.XS].percentage).toBe(0)
      expect(distribution.healthMetrics.smallOrLessPercent).toBe(0)
      expect(distribution.healthMetrics.xlPercent).toBe(0)
      expect(distribution.healthMetrics.meetsGoals).toBe(false)
    })

    it('應該在 MR = 0 時返回空的過大 MR 列表', () => {
      const oversized = sizeAnalyzer.filterOversizedMRs([])

      expect(oversized).toHaveLength(0)
    })
  })

  describe('極端規模的 MR', () => {
    it('應該處理極大的檔案數（10000 個檔案）', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Massive file count MR',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 10000,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([
        { diff: '+line1' }, // 1 line change
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result[0].fileCount).toBe(10000)
      expect(result[0].category).toBe(SizeCategory.XL)
    })

    it('應該處理極大的行數變更（100000 行）', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Massive LOC MR',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
      ]

      // 生成 50000 additions + 50000 deletions
      const hugeDiff = '+line\n'.repeat(50000) + '-line\n'.repeat(50000)
      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([
        { diff: hugeDiff },
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result[0].additions).toBe(50000)
      expect(result[0].deletions).toBe(50000)
      expect(result[0].totalChanges).toBe(100000)
      expect(result[0].category).toBe(SizeCategory.XL)
    })

    it('應該處理零變更的 MR（0 檔案，0 行）', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Empty MR',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 0,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result[0].fileCount).toBe(0)
      expect(result[0].additions).toBe(0)
      expect(result[0].deletions).toBe(0)
      expect(result[0].totalChanges).toBe(0)
      expect(result[0].category).toBe(SizeCategory.XS)
    })
  })

  describe('單一規模類別的分佈', () => {
    it('應該處理所有 MR 都是 XS 的情況', async () => {
      const mockMRs: MergeRequest[] = Array.from({ length: 20 }, (_, i) => ({
        iid: i + 1,
        title: `Small MR ${i + 1}`,
        author: { name: 'Alice', username: 'alice' },
        mergedAt: new Date('2025-01-10'),
        changesCount: 3,
        webUrl: `https://gitlab.com/mr/${i + 1}`,
      })) as MergeRequest[]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValue([
        { diff: '+line1\n+line2' }, // 2 additions
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)
      const distribution = sizeAnalyzer.calculateDistribution(result)

      expect(distribution.total).toBe(20)
      expect(distribution.byCategory[SizeCategory.XS].count).toBe(20)
      expect(distribution.byCategory[SizeCategory.XS].percentage).toBe(100)
      expect(distribution.byCategory[SizeCategory.S].count).toBe(0)
      expect(distribution.byCategory[SizeCategory.M].count).toBe(0)
      expect(distribution.byCategory[SizeCategory.L].count).toBe(0)
      expect(distribution.byCategory[SizeCategory.XL].count).toBe(0)

      // 健康度應該達標（100% small, 0% XL）
      expect(distribution.healthMetrics.meetsGoals).toBe(true)
    })

    it('應該處理所有 MR 都是 XL 的情況', async () => {
      const mockMRs: MergeRequest[] = Array.from({ length: 20 }, (_, i) => ({
        iid: i + 1,
        title: `Huge MR ${i + 1}`,
        author: { name: 'Alice', username: 'alice' },
        mergedAt: new Date('2025-01-10'),
        changesCount: 200,
        webUrl: `https://gitlab.com/mr/${i + 1}`,
      })) as MergeRequest[]

      const hugeDiff = '+line\n'.repeat(1000)
      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValue([
        { diff: hugeDiff },
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)
      const distribution = sizeAnalyzer.calculateDistribution(result)

      expect(distribution.total).toBe(20)
      expect(distribution.byCategory[SizeCategory.XL].count).toBe(20)
      expect(distribution.byCategory[SizeCategory.XL].percentage).toBe(100)
      expect(distribution.byCategory[SizeCategory.XS].count).toBe(0)

      // 健康度不應該達標（0% small, 100% XL）
      expect(distribution.healthMetrics.meetsGoals).toBe(false)
      expect(distribution.healthMetrics.smallOrLessPercent).toBe(0)
      expect(distribution.healthMetrics.xlPercent).toBe(100)
    })
  })

  describe('規模分類臨界值', () => {
    it('應該正確分類臨界值的 MR（XS/S 邊界）', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Exactly XS threshold',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 10, // 正好 10 個檔案
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
        {
          iid: 2,
          title: 'Just over XS threshold',
          author: { name: 'Bob', username: 'bob' },
          mergedAt: new Date('2025-01-11'),
          changesCount: 11, // 超過 10 個檔案
          webUrl: 'https://gitlab.com/mr/2',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs)
        .mockResolvedValueOnce([{ diff: '+line1'.repeat(50) }]) // 50 LOC
        .mockResolvedValueOnce([{ diff: '+line1'.repeat(50) }]) // 50 LOC

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      // 10 檔案 + 50 LOC = XS（≤10 檔案且 ≤100 LOC）
      expect(result[0].category).toBe(SizeCategory.XS)

      // 11 檔案 + 50 LOC = S（≤20 檔案且 ≤200 LOC）
      expect(result[1].category).toBe(SizeCategory.S)
    })

    it('應該正確分類臨界值的 MR（L/XL 邊界）', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Exactly L threshold',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 100, // 正好 100 個檔案
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
        {
          iid: 2,
          title: 'Just over L threshold',
          author: { name: 'Bob', username: 'bob' },
          mergedAt: new Date('2025-01-11'),
          changesCount: 101, // 超過 100 個檔案
          webUrl: 'https://gitlab.com/mr/2',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs)
        .mockResolvedValueOnce([{ diff: '+line1'.repeat(500) }]) // 500 LOC
        .mockResolvedValueOnce([{ diff: '+line1'.repeat(500) }]) // 500 LOC

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      // 100 檔案 + 500 LOC = L（≤100 檔案且 ≤800 LOC）
      expect(result[0].category).toBe(SizeCategory.L)

      // 101 檔案 + 500 LOC = XL（>100 檔案）
      expect(result[1].category).toBe(SizeCategory.XL)
    })
  })

  describe('百分比計算精度', () => {
    it('應該正確處理無法整除的百分比', () => {
      const mockMetrics = [
        { category: SizeCategory.XS } as any,
        { category: SizeCategory.XS } as any,
        { category: SizeCategory.S } as any,
      ]

      const distribution = sizeAnalyzer.calculateDistribution(mockMetrics)

      // 2/3 = 66.666...% 應該四捨五入到 66.7%
      expect(distribution.byCategory[SizeCategory.XS].percentage).toBe(66.7)
      // 1/3 = 33.333...% 應該四捨五入到 33.3%
      expect(distribution.byCategory[SizeCategory.S].percentage).toBe(33.3)
    })

    it('應該確保健康度百分比計算一致', () => {
      const mockMetrics = [
        { category: SizeCategory.XS } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.M } as any,
        { category: SizeCategory.M } as any,
        { category: SizeCategory.L } as any,
        { category: SizeCategory.XL } as any,
      ]

      const health = sizeAnalyzer.calculateHealthMetrics(mockMetrics)

      // S-or-smaller: 3/7 = 42.857...% → 42.9%
      expect(health.smallOrLessPercent).toBe(42.9)
      // XL: 1/7 = 14.285...% → 14.3%
      expect(health.xlPercent).toBe(14.3)
    })
  })
})
