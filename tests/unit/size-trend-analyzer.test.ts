/**
 * 規模趨勢分析器單元測試
 * Feature: 007-mr-size-analysis - Phase 5 (US3)
 */

import { describe, it, expect } from 'vitest'
import { SizeTrendAnalyzer } from '../../src/services/size-trend-analyzer.js'
import { SizeAnalyzer } from '../../src/services/size-analyzer.js'
import { MRSizeMetrics, SizeCategory } from '../../src/types/mr-size.js'

// Mock GitLabClient
const mockGitLabClient = {} as any
const sizeAnalyzer = new SizeAnalyzer(mockGitLabClient)
const trendAnalyzer = new SizeTrendAnalyzer(sizeAnalyzer)

describe('SizeTrendAnalyzer', () => {
  describe('analyzeTrend', () => {
    it('應該按月份分組 MR', () => {
      const mockMRs: MRSizeMetrics[] = [
        {
          iid: 1,
          title: 'Jan MR 1',
          author: 'Alice',
          mergedAt: new Date('2025-01-15'),
          fileCount: 5,
          additions: 30,
          deletions: 20,
          totalChanges: 50,
          category: SizeCategory.XS,
          webUrl: 'https://gitlab.com/project/merge_requests/1',
        },
        {
          iid: 2,
          title: 'Jan MR 2',
          author: 'Bob',
          mergedAt: new Date('2025-01-20'),
          fileCount: 15,
          additions: 100,
          deletions: 80,
          totalChanges: 180,
          category: SizeCategory.S,
          webUrl: 'https://gitlab.com/project/merge_requests/2',
        },
        {
          iid: 3,
          title: 'Feb MR 1',
          author: 'Charlie',
          mergedAt: new Date('2025-02-10'),
          fileCount: 30,
          additions: 200,
          deletions: 150,
          totalChanges: 350,
          category: SizeCategory.M,
          webUrl: 'https://gitlab.com/project/merge_requests/3',
        },
      ]

      const result = trendAnalyzer.analyzeTrend(mockMRs, {
        since: new Date('2025-01-01'),
        until: new Date('2025-02-28'),
      })

      expect(result.monthlyData).toHaveLength(2)
      expect(result.monthlyData[0]?.month).toBe('2025-01')
      expect(result.monthlyData[0]?.total).toBe(2)
      expect(result.monthlyData[1]?.month).toBe('2025-02')
      expect(result.monthlyData[1]?.total).toBe(1)
    })

    it('應該正確處理跨年份的月份分組', () => {
      const mockMRs: MRSizeMetrics[] = [
        {
          iid: 1,
          title: 'Dec 2024',
          author: 'Alice',
          mergedAt: new Date('2024-12-15'),
          fileCount: 5,
          additions: 30,
          deletions: 20,
          totalChanges: 50,
          category: SizeCategory.XS,
          webUrl: 'https://gitlab.com/project/merge_requests/1',
        },
        {
          iid: 2,
          title: 'Jan 2025',
          author: 'Bob',
          mergedAt: new Date('2025-01-10'),
          fileCount: 15,
          additions: 100,
          deletions: 80,
          totalChanges: 180,
          category: SizeCategory.S,
          webUrl: 'https://gitlab.com/project/merge_requests/2',
        },
      ]

      const result = trendAnalyzer.analyzeTrend(mockMRs, {
        since: new Date('2024-12-01'),
        until: new Date('2025-01-31'),
      })

      expect(result.monthlyData).toHaveLength(2)
      expect(result.monthlyData[0]?.month).toBe('2024-12')
      expect(result.monthlyData[1]?.month).toBe('2025-01')
    })

    it('應該標記樣本數不足的月份', () => {
      const mockMRs: MRSizeMetrics[] = Array.from({ length: 5 }, (_, i) => ({
        iid: i + 1,
        title: `MR ${i + 1}`,
        author: 'Alice',
        mergedAt: new Date('2025-01-15'),
        fileCount: 5,
        additions: 30,
        deletions: 20,
        totalChanges: 50,
        category: SizeCategory.XS,
        webUrl: `https://gitlab.com/project/merge_requests/${i + 1}`,
      }))

      const result = trendAnalyzer.analyzeTrend(mockMRs, {
        since: new Date('2025-01-01'),
        until: new Date('2025-01-31'),
      })

      expect(result.monthlyData).toHaveLength(1)
      expect(result.monthlyData[0]?.total).toBe(5)
      expect(result.monthlyData[0]?.hasLowSample).toBe(true) // < 10
    })

    it('應該計算每月的規模分佈', () => {
      const mockMRs: MRSizeMetrics[] = [
        {
          iid: 1,
          title: 'XS MR',
          author: 'Alice',
          mergedAt: new Date('2025-01-15'),
          fileCount: 5,
          additions: 30,
          deletions: 20,
          totalChanges: 50,
          category: SizeCategory.XS,
          webUrl: 'https://gitlab.com/project/merge_requests/1',
        },
        {
          iid: 2,
          title: 'S MR',
          author: 'Bob',
          mergedAt: new Date('2025-01-20'),
          fileCount: 15,
          additions: 100,
          deletions: 80,
          totalChanges: 180,
          category: SizeCategory.S,
          webUrl: 'https://gitlab.com/project/merge_requests/2',
        },
        {
          iid: 3,
          title: 'XL MR',
          author: 'Charlie',
          mergedAt: new Date('2025-01-25'),
          fileCount: 150,
          additions: 5000,
          deletions: 3000,
          totalChanges: 8000,
          category: SizeCategory.XL,
          webUrl: 'https://gitlab.com/project/merge_requests/3',
        },
      ]

      const result = trendAnalyzer.analyzeTrend(mockMRs, {
        since: new Date('2025-01-01'),
        until: new Date('2025-01-31'),
      })

      const janData = result.monthlyData[0]!
      expect(janData.distribution.byCategory.XS.count).toBe(1)
      expect(janData.distribution.byCategory.S.count).toBe(1)
      expect(janData.distribution.byCategory.XL.count).toBe(1)
      expect(janData.distribution.total).toBe(3)
    })

    it('應該計算整體分佈', () => {
      const mockMRs: MRSizeMetrics[] = Array.from({ length: 20 }, (_, i) => ({
        iid: i + 1,
        title: `MR ${i + 1}`,
        author: 'Alice',
        mergedAt: new Date(`2025-${(i % 3) + 1}-15`), // 分散在 3 個月
        fileCount: 5,
        additions: 30,
        deletions: 20,
        totalChanges: 50,
        category: SizeCategory.XS,
        webUrl: `https://gitlab.com/project/merge_requests/${i + 1}`,
      }))

      const result = trendAnalyzer.analyzeTrend(mockMRs, {
        since: new Date('2025-01-01'),
        until: new Date('2025-03-31'),
      })

      expect(result.overall.total).toBe(20)
      expect(result.overall.byCategory.XS.count).toBe(20)
    })

    it('應該按月份排序', () => {
      const mockMRs: MRSizeMetrics[] = [
        {
          iid: 1,
          title: 'Mar MR',
          author: 'Alice',
          mergedAt: new Date('2025-03-15'),
          fileCount: 5,
          additions: 30,
          deletions: 20,
          totalChanges: 50,
          category: SizeCategory.XS,
          webUrl: 'https://gitlab.com/project/merge_requests/1',
        },
        {
          iid: 2,
          title: 'Jan MR',
          author: 'Bob',
          mergedAt: new Date('2025-01-15'),
          fileCount: 15,
          additions: 100,
          deletions: 80,
          totalChanges: 180,
          category: SizeCategory.S,
          webUrl: 'https://gitlab.com/project/merge_requests/2',
        },
        {
          iid: 3,
          title: 'Feb MR',
          author: 'Charlie',
          mergedAt: new Date('2025-02-15'),
          fileCount: 30,
          additions: 200,
          deletions: 150,
          totalChanges: 350,
          category: SizeCategory.M,
          webUrl: 'https://gitlab.com/project/merge_requests/3',
        },
      ]

      const result = trendAnalyzer.analyzeTrend(mockMRs, {
        since: new Date('2025-01-01'),
        until: new Date('2025-03-31'),
      })

      // 應該按時間順序排列
      expect(result.monthlyData[0]?.month).toBe('2025-01')
      expect(result.monthlyData[1]?.month).toBe('2025-02')
      expect(result.monthlyData[2]?.month).toBe('2025-03')
    })
  })
})
