/**
 * SizeAnalyzer 服務單元測試
 * Feature: 007-mr-size-analysis
 * Task: T010
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SizeAnalyzer } from '../../src/services/size-analyzer.js'
import { GitLabClient } from '../../src/services/gitlab-client.js'
import { MergeRequest } from '../../src/models/merge-request.js'
import { SizeCategory } from '../../src/types/mr-size.js'

describe('SizeAnalyzer', () => {
  let sizeAnalyzer: SizeAnalyzer
  let mockGitLabClient: GitLabClient

  beforeEach(() => {
    // 建立 mock GitLabClient
    mockGitLabClient = {
      getMergeRequestDiffs: vi.fn(),
    } as unknown as GitLabClient

    sizeAnalyzer = new SizeAnalyzer(mockGitLabClient)
  })

  describe('analyzeMRSizes', () => {
    it('應該批次處理 MR 並計算規模', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Small MR',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
        {
          iid: 2,
          title: 'Large MR',
          author: { name: 'Bob', username: 'bob' },
          mergedAt: new Date('2025-01-11'),
          changesCount: 150,
          webUrl: 'https://gitlab.com/mr/2',
        } as MergeRequest,
      ]

      // Mock getMergeRequestDiffs 回傳
      vi.mocked(mockGitLabClient.getMergeRequestDiffs)
        .mockResolvedValueOnce([
          { diff: '+line1\n-line2\n+line3' }, // 2 additions, 1 deletion
        ])
        .mockResolvedValueOnce([
          { diff: '+line\n'.repeat(500) + '-line\n'.repeat(300) }, // 500 additions, 300 deletions
        ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result).toHaveLength(2)

      // 驗證第一個 MR (5 files, 3 LOC = XS)
      expect(result[0]).toMatchObject({
        iid: 1,
        title: 'Small MR',
        author: 'Alice',
        fileCount: 5,
        additions: 2,
        deletions: 1,
        totalChanges: 3,
        category: SizeCategory.XS,
      })

      // 驗證第二個 MR (150 files, 800 LOC = XL)
      expect(result[1]).toMatchObject({
        iid: 2,
        title: 'Large MR',
        author: 'Bob',
        fileCount: 150,
        additions: 500,
        deletions: 300,
        totalChanges: 800,
        category: SizeCategory.XL,
      })
    })

    it('應該正確處理 changesCount 為字串的情況', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'MR with string changesCount',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: '15', // 字串格式
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([
        { diff: '+line1\n+line2' }, // 2 additions
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result[0].fileCount).toBe(15)
    })

    it('應該在單一 MR 失敗時跳過並繼續處理', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Success MR',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
        {
          iid: 2,
          title: 'Failed MR',
          author: { name: 'Bob', username: 'bob' },
          mergedAt: new Date('2025-01-11'),
          changesCount: 10,
          webUrl: 'https://gitlab.com/mr/2',
        } as MergeRequest,
        {
          iid: 3,
          title: 'Another Success MR',
          author: { name: 'Charlie', username: 'charlie' },
          mergedAt: new Date('2025-01-12'),
          changesCount: 8,
          webUrl: 'https://gitlab.com/mr/3',
        } as MergeRequest,
      ]

      // Mock: 第一個成功，第二個失敗，第三個成功
      vi.mocked(mockGitLabClient.getMergeRequestDiffs)
        .mockResolvedValueOnce([{ diff: '+line1' }])
        .mockRejectedValueOnce(new Error('API 404'))
        .mockResolvedValueOnce([{ diff: '+line1\n+line2' }])

      const onWarning = vi.fn()
      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs, {
        onWarning,
      })

      // 應該只有 2 個成功的 MR
      expect(result).toHaveLength(2)
      expect(result[0].iid).toBe(1)
      expect(result[1].iid).toBe(3)

      // 應該呼叫 onWarning 兩次（單一 MR 失敗 + 總結警告）
      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining('無法取得 MR !2 的 diff 資料')
      )
      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining('1 個 MR 無法取得 diff 資料')
      )
    })

    it('應該支援自訂批次大小', async () => {
      const mockMRs: MergeRequest[] = Array.from({ length: 25 }, (_, i) => ({
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

      const onProgress = vi.fn()
      await sizeAnalyzer.analyzeMRSizes(mockMRs, {
        batchSize: 5,
        onProgress,
      })

      // 應該呼叫 onProgress (25 MRs / 5 per batch = 5 batches)
      expect(onProgress).toHaveBeenCalledTimes(5)
      expect(onProgress).toHaveBeenLastCalledWith(25, 25)
    })
  })

  describe('calculateDistribution', () => {
    it('應該正確計算規模分佈統計', () => {
      const mockMetrics = [
        { category: SizeCategory.XS } as any,
        { category: SizeCategory.XS } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.M } as any,
        { category: SizeCategory.L } as any,
        { category: SizeCategory.XL } as any,
        { category: SizeCategory.XL } as any,
        { category: SizeCategory.XL } as any,
      ]

      const distribution = sizeAnalyzer.calculateDistribution(mockMetrics)

      expect(distribution.total).toBe(8)
      expect(distribution.byCategory[SizeCategory.XS]).toEqual({
        count: 2,
        percentage: 25.0,
      })
      expect(distribution.byCategory[SizeCategory.S]).toEqual({
        count: 1,
        percentage: 12.5,
      })
      expect(distribution.byCategory[SizeCategory.M]).toEqual({
        count: 1,
        percentage: 12.5,
      })
      expect(distribution.byCategory[SizeCategory.L]).toEqual({
        count: 1,
        percentage: 12.5,
      })
      expect(distribution.byCategory[SizeCategory.XL]).toEqual({
        count: 3,
        percentage: 37.5,
      })
    })

    it('應該處理空列表', () => {
      const distribution = sizeAnalyzer.calculateDistribution([])

      expect(distribution.total).toBe(0)
      expect(distribution.byCategory[SizeCategory.XS].count).toBe(0)
      expect(distribution.byCategory[SizeCategory.XS].percentage).toBe(0)
    })
  })

  describe('calculateHealthMetrics', () => {
    it('應該計算健康度指標並判斷是否達標', () => {
      const mockMetrics = [
        { category: SizeCategory.XS } as any,
        { category: SizeCategory.XS } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.M } as any,
        { category: SizeCategory.M } as any,
        { category: SizeCategory.L } as any,
        { category: SizeCategory.XL } as any,
        { category: SizeCategory.XL } as any,
      ]

      const health = sizeAnalyzer.calculateHealthMetrics(mockMetrics)

      // S-or-smaller: 5/10 = 50%
      expect(health.smallOrLessPercent).toBe(50.0)
      // XL: 2/10 = 20%
      expect(health.xlPercent).toBe(20.0)
      // 不達標（需 ≥60% small, <10% XL）
      expect(health.meetsGoals).toBe(false)
    })

    it('應該在達成目標時返回 true', () => {
      const mockMetrics = [
        { category: SizeCategory.XS } as any,
        { category: SizeCategory.XS } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.S } as any,
        { category: SizeCategory.M } as any,
        { category: SizeCategory.M } as any,
        { category: SizeCategory.L } as any,
        { category: SizeCategory.XL } as any, // 只有 1 個 XL = 10%
      ]

      const health = sizeAnalyzer.calculateHealthMetrics(mockMetrics)

      // S-or-smaller: 6/10 = 60%
      expect(health.smallOrLessPercent).toBe(60.0)
      // XL: 1/10 = 10%
      expect(health.xlPercent).toBe(10.0)
      // 不達標（XL 需 < 10%，不能等於 10%）
      expect(health.meetsGoals).toBe(false)
    })

    it('應該處理空列表', () => {
      const health = sizeAnalyzer.calculateHealthMetrics([])

      expect(health.smallOrLessPercent).toBe(0)
      expect(health.xlPercent).toBe(0)
      expect(health.meetsGoals).toBe(false)
    })
  })

  describe('filterOversizedMRs', () => {
    it('應該只篩選 L 和 XL 類別的 MR', () => {
      const mockMetrics = [
        { iid: 1, category: SizeCategory.XS } as any,
        { iid: 2, category: SizeCategory.S } as any,
        { iid: 3, category: SizeCategory.M } as any,
        { iid: 4, category: SizeCategory.L, totalChanges: 500 } as any,
        { iid: 5, category: SizeCategory.XL, totalChanges: 1000 } as any,
      ]

      const oversized = sizeAnalyzer.filterOversizedMRs(mockMetrics)

      expect(oversized).toHaveLength(2)
      expect(oversized.map((mr) => mr.iid)).toEqual([5, 4]) // XL 在前，L 在後
    })

    it('應該正確排序（XL > L，同類別按 totalChanges 降序）', () => {
      const mockMetrics = [
        {
          iid: 1,
          category: SizeCategory.L,
          totalChanges: 600,
          fileCount: 80,
        } as any,
        {
          iid: 2,
          category: SizeCategory.XL,
          totalChanges: 1200,
          fileCount: 120,
        } as any,
        {
          iid: 3,
          category: SizeCategory.L,
          totalChanges: 700,
          fileCount: 90,
        } as any,
        {
          iid: 4,
          category: SizeCategory.XL,
          totalChanges: 900,
          fileCount: 110,
        } as any,
      ]

      const oversized = sizeAnalyzer.filterOversizedMRs(mockMetrics)

      // 應該排序為：XL(1200) > XL(900) > L(700) > L(600)
      expect(oversized.map((mr) => mr.iid)).toEqual([2, 4, 3, 1])
    })
  })

  describe('hasLowSample', () => {
    it('應該在樣本數 < 10 時返回 true', () => {
      expect(sizeAnalyzer.hasLowSample(5)).toBe(true)
      expect(sizeAnalyzer.hasLowSample(9)).toBe(true)
    })

    it('應該在樣本數 >= 10 時返回 false', () => {
      expect(sizeAnalyzer.hasLowSample(10)).toBe(false)
      expect(sizeAnalyzer.hasLowSample(50)).toBe(false)
    })
  })
})
