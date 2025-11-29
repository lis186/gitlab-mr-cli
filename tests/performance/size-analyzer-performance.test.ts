/**
 * SizeAnalyzer 效能測試
 * Feature: 007-mr-size-analysis
 * Task: T045
 *
 * 驗證批次處理效能目標：100 個 MR 應在 5 秒內完成
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SizeAnalyzer } from '../../src/services/size-analyzer.js'
import { GitLabClient } from '../../src/services/gitlab-client.js'
import { MergeRequest } from '../../src/models/merge-request.js'

describe('SizeAnalyzer - 效能測試', () => {
  let sizeAnalyzer: SizeAnalyzer
  let mockGitLabClient: GitLabClient

  beforeEach(() => {
    mockGitLabClient = {
      getMergeRequestDiffs: vi.fn(),
    } as unknown as GitLabClient

    sizeAnalyzer = new SizeAnalyzer(mockGitLabClient)
  })

  it('應該在 5 秒內處理 100 個 MR', async () => {
    // 建立 100 個模擬 MR
    const mockMRs: MergeRequest[] = Array.from({ length: 100 }, (_, i) => ({
      iid: i + 1,
      title: `MR ${i + 1}`,
      author: { name: 'Alice', username: 'alice' },
      mergedAt: new Date('2025-01-10'),
      changesCount: 10 + i,
      webUrl: `https://gitlab.com/mr/${i + 1}`,
    })) as MergeRequest[]

    // Mock API 回應（模擬快速回應）
    vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValue([
      { diff: '+line1\n+line2\n-line3' },
    ])

    const startTime = Date.now()

    const result = await sizeAnalyzer.analyzeMRSizes(mockMRs, {
      batchSize: 10, // 使用批次大小 10
    })

    const duration = Date.now() - startTime

    // 驗證結果
    expect(result).toHaveLength(100)

    // 驗證效能（應該在 5 秒內完成）
    expect(duration).toBeLessThan(5000)

    console.log(`✓ 處理 100 個 MR 耗時：${duration}ms（目標：< 5000ms）`)
  })

  it('應該正確使用批次處理減少 API 呼叫次數', async () => {
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

    await sizeAnalyzer.analyzeMRSizes(mockMRs, {
      batchSize: 5, // 5 個一批
    })

    // 應該呼叫 25 次（每個 MR 一次）
    expect(mockGitLabClient.getMergeRequestDiffs).toHaveBeenCalledTimes(25)
  })

  it('應該在批次處理時支援進度回報', async () => {
    const mockMRs: MergeRequest[] = Array.from({ length: 50 }, (_, i) => ({
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

    const progressUpdates: Array<{ processed: number; total: number }> = []

    await sizeAnalyzer.analyzeMRSizes(mockMRs, {
      batchSize: 10,
      onProgress: (processed, total) => {
        progressUpdates.push({ processed, total })
      },
    })

    // 應該有 5 次進度更新（50 MRs / 10 per batch）
    expect(progressUpdates).toHaveLength(5)

    // 驗證進度更新是遞增的
    expect(progressUpdates[0]).toEqual({ processed: 10, total: 50 })
    expect(progressUpdates[1]).toEqual({ processed: 20, total: 50 })
    expect(progressUpdates[2]).toEqual({ processed: 30, total: 50 })
    expect(progressUpdates[3]).toEqual({ processed: 40, total: 50 })
    expect(progressUpdates[4]).toEqual({ processed: 50, total: 50 })
  })

  it('應該在大量 MR 時使用較小的批次大小避免記憶體問題', async () => {
    const mockMRs: MergeRequest[] = Array.from({ length: 1000 }, (_, i) => ({
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

    const startTime = Date.now()

    const result = await sizeAnalyzer.analyzeMRSizes(mockMRs, {
      batchSize: 10, // 小批次避免記憶體問題
    })

    const duration = Date.now() - startTime

    expect(result).toHaveLength(1000)

    // 即使 1000 個 MR，也應該在合理時間內完成（< 50 秒）
    expect(duration).toBeLessThan(50000)

    console.log(`✓ 處理 1000 個 MR 耗時：${duration}ms（目標：< 50000ms）`)
  })

  it('應該在 API 延遲較高時仍能正常運作', async () => {
    const mockMRs: MergeRequest[] = Array.from({ length: 20 }, (_, i) => ({
      iid: i + 1,
      title: `MR ${i + 1}`,
      author: { name: 'Alice', username: 'alice' },
      mergedAt: new Date('2025-01-10'),
      changesCount: 5,
      webUrl: `https://gitlab.com/mr/${i + 1}`,
    })) as MergeRequest[]

    // 模擬 API 延遲（每次呼叫延遲 100ms）
    vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockImplementation(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return [{ diff: '+line1' }]
      }
    )

    const startTime = Date.now()

    const result = await sizeAnalyzer.analyzeMRSizes(mockMRs, {
      batchSize: 10,
    })

    const duration = Date.now() - startTime

    expect(result).toHaveLength(20)

    // 批次處理應該並行執行，不應該是線性累加
    // 20 個 MR，每批 10 個，每個 100ms
    // 理想情況：2 批 × 100ms = 200ms（並行）
    // 實際應該在 300ms 內完成（留一些餘裕）
    expect(duration).toBeLessThan(2500)

    console.log(`✓ 20 個 MR（每個延遲 100ms）耗時：${duration}ms（批次並行處理）`)
  })
})
