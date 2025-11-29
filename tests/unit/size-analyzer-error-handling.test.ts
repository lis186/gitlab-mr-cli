/**
 * SizeAnalyzer 錯誤處理單元測試
 * Feature: 007-mr-size-analysis
 * Task: T011b
 *
 * 驗證各種錯誤情境的處理：
 * - changes_count = null
 * - additions = undefined
 * - API 404 錯誤
 * - 缺失 diff 資料
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SizeAnalyzer } from '../../src/services/size-analyzer.js'
import { GitLabClient } from '../../src/services/gitlab-client.js'
import { MergeRequest } from '../../src/models/merge-request.js'
import { SizeCategory } from '../../src/types/mr-size.js'

describe('SizeAnalyzer - 錯誤處理', () => {
  let sizeAnalyzer: SizeAnalyzer
  let mockGitLabClient: GitLabClient

  beforeEach(() => {
    mockGitLabClient = {
      getMergeRequestDiffs: vi.fn(),
    } as unknown as GitLabClient

    sizeAnalyzer = new SizeAnalyzer(mockGitLabClient)
  })

  describe('處理缺失的 changesCount', () => {
    it('應該在 changesCount 為 null 時使用 0', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'MR with null changesCount',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: null, // null 值
          webUrl: 'https://gitlab.com/mr/1',
        } as any,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([
        { diff: '+line1\n+line2' }, // 2 additions
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result).toHaveLength(1)
      expect(result[0].fileCount).toBe(0)
      expect(result[0].category).toBe(SizeCategory.XS) // 0 files, 2 LOC = XS
    })

    it('應該在 changesCount 為 undefined 時使用 0', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'MR without changesCount',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          // changesCount 未定義
          webUrl: 'https://gitlab.com/mr/1',
        } as any,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([
        { diff: '+line1' },
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result).toHaveLength(1)
      expect(result[0].fileCount).toBe(0)
    })

    it('應該在 changesCount 為空字串時使用 0', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'MR with empty string changesCount',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: '', // 空字串
          webUrl: 'https://gitlab.com/mr/1',
        } as any,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([
        { diff: '+line1' },
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result).toHaveLength(1)
      expect(result[0].fileCount).toBe(0)
    })
  })

  describe('處理缺失的 diff 資料', () => {
    it('應該在 diff API 返回空陣列時計算為 0 變更', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'MR with no diffs',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result).toHaveLength(1)
      expect(result[0].additions).toBe(0)
      expect(result[0].deletions).toBe(0)
      expect(result[0].totalChanges).toBe(0)
    })

    it('應該在 diff 欄位為空字串時計算為 0 變更', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'MR with empty diff',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([
        { diff: '' }, // 空 diff
      ])

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result).toHaveLength(1)
      expect(result[0].additions).toBe(0)
      expect(result[0].deletions).toBe(0)
    })

    it('應該在 diff 欄位缺失時計算為 0 變更', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'MR with missing diff field',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockResolvedValueOnce([
        {}, // 沒有 diff 欄位
      ] as any)

      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      expect(result).toHaveLength(1)
      expect(result[0].additions).toBe(0)
      expect(result[0].deletions).toBe(0)
    })
  })

  describe('處理 API 錯誤', () => {
    it('應該在 API 404 錯誤時跳過該 MR 並記錄警告', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Valid MR',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
        {
          iid: 2,
          title: 'MR with API 404',
          author: { name: 'Bob', username: 'bob' },
          mergedAt: new Date('2025-01-11'),
          changesCount: 10,
          webUrl: 'https://gitlab.com/mr/2',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs)
        .mockResolvedValueOnce([{ diff: '+line1' }])
        .mockRejectedValueOnce(new Error('404: Not Found'))

      const onWarning = vi.fn()
      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs, { onWarning })

      // 應該只返回第一個成功的 MR
      expect(result).toHaveLength(1)
      expect(result[0].iid).toBe(1)

      // 應該呼叫警告回呼
      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining('無法取得 MR !2 的 diff 資料')
      )
      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining('404: Not Found')
      )
    })

    it('應該在網路錯誤時跳過該 MR', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'MR with network error',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockRejectedValueOnce(
        new Error('ECONNREFUSED')
      )

      const onWarning = vi.fn()
      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs, { onWarning })

      expect(result).toHaveLength(0)
      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining('ECONNREFUSED')
      )
    })

    it('應該在 API rate limit 錯誤時跳過該 MR', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'MR causing rate limit',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs).mockRejectedValueOnce(
        new Error('429: Too Many Requests')
      )

      const onWarning = vi.fn()
      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs, { onWarning })

      expect(result).toHaveLength(0)
      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining('429: Too Many Requests')
      )
    })
  })

  describe('批次處理中的錯誤累積', () => {
    it('應該統計所有失敗的 MR 並顯示總數', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Success 1',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
        {
          iid: 2,
          title: 'Fail 1',
          author: { name: 'Bob', username: 'bob' },
          mergedAt: new Date('2025-01-11'),
          changesCount: 10,
          webUrl: 'https://gitlab.com/mr/2',
        } as MergeRequest,
        {
          iid: 3,
          title: 'Fail 2',
          author: { name: 'Charlie', username: 'charlie' },
          mergedAt: new Date('2025-01-12'),
          changesCount: 8,
          webUrl: 'https://gitlab.com/mr/3',
        } as MergeRequest,
        {
          iid: 4,
          title: 'Success 2',
          author: { name: 'David', username: 'david' },
          mergedAt: new Date('2025-01-13'),
          changesCount: 12,
          webUrl: 'https://gitlab.com/mr/4',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs)
        .mockResolvedValueOnce([{ diff: '+line1' }])
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce([{ diff: '+line1' }])

      const onWarning = vi.fn()
      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs, { onWarning })

      // 應該有 2 個成功
      expect(result).toHaveLength(2)

      // 應該顯示總失敗數
      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining('2 個 MR 無法取得 diff 資料')
      )
    })

    it('應該在全部失敗時返回空陣列並記錄警告', async () => {
      const mockMRs: MergeRequest[] = [
        {
          iid: 1,
          title: 'Fail 1',
          author: { name: 'Alice', username: 'alice' },
          mergedAt: new Date('2025-01-10'),
          changesCount: 5,
          webUrl: 'https://gitlab.com/mr/1',
        } as MergeRequest,
        {
          iid: 2,
          title: 'Fail 2',
          author: { name: 'Bob', username: 'bob' },
          mergedAt: new Date('2025-01-11'),
          changesCount: 10,
          webUrl: 'https://gitlab.com/mr/2',
        } as MergeRequest,
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs)
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))

      const onWarning = vi.fn()
      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs, { onWarning })

      expect(result).toHaveLength(0)
      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining('2 個 MR 無法取得 diff 資料')
      )
    })
  })

  describe('不提供 onWarning 回呼時的處理', () => {
    it('應該在沒有 onWarning 時靜默失敗', async () => {
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
      ]

      vi.mocked(mockGitLabClient.getMergeRequestDiffs)
        .mockResolvedValueOnce([{ diff: '+line1' }])
        .mockRejectedValueOnce(new Error('API Error'))

      // 不提供 onWarning
      const result = await sizeAnalyzer.analyzeMRSizes(mockMRs)

      // 應該只返回成功的 MR
      expect(result).toHaveLength(1)
      expect(result[0].iid).toBe(1)
    })
  })
})
