/**
 * 過大 MR 篩選單元測試
 * Feature: 007-mr-size-analysis - Phase 4 (US2)
 */

import { describe, it, expect } from 'vitest'
import { SizeAnalyzer } from '../../src/services/size-analyzer.js'
import { SizeCategory, MRSizeMetrics } from '../../src/types/mr-size.js'

// Mock GitLabClient
const mockGitLabClient = {} as any

describe('SizeAnalyzer - filterOversizedMRs', () => {
  const analyzer = new SizeAnalyzer(mockGitLabClient)

  it('應該只篩選 L 和 XL 類別的 MR', () => {
    const mockMRs: MRSizeMetrics[] = [
      {
        iid: 1,
        title: 'XS MR',
        author: 'Alice',
        mergedAt: new Date(),
        fileCount: 5,
        additions: 30,
        deletions: 20,
        totalChanges: 50,
        category: SizeCategory.XS,
        webUrl: 'https://gitlab.com/project/merge_requests/1',
      },
      {
        iid: 2,
        title: 'L MR',
        author: 'Bob',
        mergedAt: new Date(),
        fileCount: 80,
        additions: 400,
        deletions: 300,
        totalChanges: 700,
        category: SizeCategory.L,
        webUrl: 'https://gitlab.com/project/merge_requests/2',
      },
      {
        iid: 3,
        title: 'XL MR',
        author: 'Charlie',
        mergedAt: new Date(),
        fileCount: 150,
        additions: 5000,
        deletions: 3000,
        totalChanges: 8000,
        category: SizeCategory.XL,
        webUrl: 'https://gitlab.com/project/merge_requests/3',
      },
      {
        iid: 4,
        title: 'M MR',
        author: 'David',
        mergedAt: new Date(),
        fileCount: 30,
        additions: 200,
        deletions: 100,
        totalChanges: 300,
        category: SizeCategory.M,
        webUrl: 'https://gitlab.com/project/merge_requests/4',
      },
    ]

    const oversized = analyzer.filterOversizedMRs(mockMRs)

    expect(oversized).toHaveLength(2)
    expect(oversized[0]?.category).toBe('XL')
    expect(oversized[1]?.category).toBe('L')
  })

  it('應該按規模排序：XL 在 L 前面', () => {
    const mockMRs: MRSizeMetrics[] = [
      {
        iid: 1,
        title: 'L MR 1',
        author: 'Alice',
        mergedAt: new Date(),
        fileCount: 80,
        additions: 400,
        deletions: 300,
        totalChanges: 700,
        category: SizeCategory.L,
        webUrl: 'https://gitlab.com/project/merge_requests/1',
      },
      {
        iid: 2,
        title: 'XL MR',
        author: 'Bob',
        mergedAt: new Date(),
        fileCount: 150,
        additions: 5000,
        deletions: 3000,
        totalChanges: 8000,
        category: SizeCategory.XL,
        webUrl: 'https://gitlab.com/project/merge_requests/2',
      },
      {
        iid: 3,
        title: 'L MR 2',
        author: 'Charlie',
        mergedAt: new Date(),
        fileCount: 60,
        additions: 350,
        deletions: 250,
        totalChanges: 600,
        category: SizeCategory.L,
        webUrl: 'https://gitlab.com/project/merge_requests/3',
      },
    ]

    const oversized = analyzer.filterOversizedMRs(mockMRs)

    expect(oversized).toHaveLength(3)
    // XL 應該在最前面
    expect(oversized[0]?.category).toBe('XL')
    expect(oversized[0]?.iid).toBe(2)
    // L 應該在後面
    expect(oversized[1]?.category).toBe('L')
    expect(oversized[2]?.category).toBe('L')
  })

  it('應該在同類別內按行數降序排序', () => {
    const mockMRs: MRSizeMetrics[] = [
      {
        iid: 1,
        title: 'L MR - Small',
        author: 'Alice',
        mergedAt: new Date(),
        fileCount: 60,
        additions: 300,
        deletions: 200,
        totalChanges: 500, // 較小
        category: SizeCategory.L,
        webUrl: 'https://gitlab.com/project/merge_requests/1',
      },
      {
        iid: 2,
        title: 'L MR - Large',
        author: 'Bob',
        mergedAt: new Date(),
        fileCount: 80,
        additions: 450,
        deletions: 350,
        totalChanges: 800, // 較大
        category: SizeCategory.L,
        webUrl: 'https://gitlab.com/project/merge_requests/2',
      },
      {
        iid: 3,
        title: 'L MR - Medium',
        author: 'Charlie',
        mergedAt: new Date(),
        fileCount: 70,
        additions: 400,
        deletions: 250,
        totalChanges: 650, // 中等
        category: SizeCategory.L,
        webUrl: 'https://gitlab.com/project/merge_requests/3',
      },
    ]

    const oversized = analyzer.filterOversizedMRs(mockMRs)

    expect(oversized).toHaveLength(3)
    // 按行數降序：800 > 650 > 500
    expect(oversized[0]?.totalChanges).toBe(800)
    expect(oversized[0]?.iid).toBe(2)
    expect(oversized[1]?.totalChanges).toBe(650)
    expect(oversized[1]?.iid).toBe(3)
    expect(oversized[2]?.totalChanges).toBe(500)
    expect(oversized[2]?.iid).toBe(1)
  })

  it('應該正確設定門檻超出標記', () => {
    const mockMRs: MRSizeMetrics[] = [
      {
        iid: 1,
        title: 'XL MR - 檔案數超標',
        author: 'Alice',
        mergedAt: new Date(),
        fileCount: 150, // > 100 (L 上限)
        additions: 300,
        deletions: 200,
        totalChanges: 500, // < 800 (L 上限)
        category: SizeCategory.XL,
        webUrl: 'https://gitlab.com/project/merge_requests/1',
      },
      {
        iid: 2,
        title: 'XL MR - 行數超標',
        author: 'Bob',
        mergedAt: new Date(),
        fileCount: 50, // < 100
        additions: 5000,
        deletions: 4000,
        totalChanges: 9000, // > 800 (L 上限)
        category: SizeCategory.XL,
        webUrl: 'https://gitlab.com/project/merge_requests/2',
      },
      {
        iid: 3,
        title: 'L MR - 檔案數超標',
        author: 'Charlie',
        mergedAt: new Date(),
        fileCount: 60, // > 50 (M 上限)
        additions: 200,
        deletions: 150,
        totalChanges: 350, // < 400 (M 上限)
        category: SizeCategory.L,
        webUrl: 'https://gitlab.com/project/merge_requests/3',
      },
    ]

    const oversized = analyzer.filterOversizedMRs(mockMRs)

    expect(oversized).toHaveLength(3)

    // 排序後：XL（按行數降序）→ L
    // oversized[0]: XL MR 2 (9000 行) - 行數超標
    expect(oversized[0]?.totalChanges).toBe(9000)
    expect(oversized[0]?.exceedsLOCThreshold).toBe(true)
    expect(oversized[0]?.exceedsFileThreshold).toBe(false)

    // oversized[1]: XL MR 1 (500 行) - 檔案數超標
    expect(oversized[1]?.totalChanges).toBe(500)
    expect(oversized[1]?.exceedsFileThreshold).toBe(true)
    expect(oversized[1]?.exceedsLOCThreshold).toBe(false)

    // oversized[2]: L MR 3 (350 行) - 檔案數超標
    expect(oversized[2]?.totalChanges).toBe(350)
    expect(oversized[2]?.exceedsFileThreshold).toBe(true)
    expect(oversized[2]?.exceedsLOCThreshold).toBe(false)
  })

  it('應該處理空陣列', () => {
    const oversized = analyzer.filterOversizedMRs([])
    expect(oversized).toHaveLength(0)
  })

  it('應該處理沒有過大 MR 的情況', () => {
    const mockMRs: MRSizeMetrics[] = [
      {
        iid: 1,
        title: 'XS MR',
        author: 'Alice',
        mergedAt: new Date(),
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
        mergedAt: new Date(),
        fileCount: 15,
        additions: 100,
        deletions: 80,
        totalChanges: 180,
        category: SizeCategory.S,
        webUrl: 'https://gitlab.com/project/merge_requests/2',
      },
    ]

    const oversized = analyzer.filterOversizedMRs(mockMRs)
    expect(oversized).toHaveLength(0)
  })
})
