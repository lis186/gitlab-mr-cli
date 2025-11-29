/**
 * CycleTime 命令整合測試
 *
 * 驗證 cycle-time 命令的完整流程
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import CycleTime from '../../src/commands/cycle-time.js'
import { GitLabClient } from '../../src/services/gitlab-client.js'

describe('CycleTime Command Integration', () => {
  let mockGetClient: any
  let mockGetMergeRequestCommits: any
  let mockGetMergeRequestNotes: any
  let mockGitLabClient: any

  beforeEach(() => {
    // Mock GitLab API responses
    const mockMergeRequests = [
      {
        iid: 1,
        title: 'Test MR 1',
        author: { name: 'Alice' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/1',
        created_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-03T10:00:00Z',
      },
      {
        iid: 2,
        title: 'Test MR 2',
        author: { name: 'Bob' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/2',
        created_at: '2024-01-03T10:00:00Z',
        merged_at: '2024-01-04T10:00:00Z',
      },
    ]

    const mockCommits = [
      { created_at: '2024-01-01T10:00:00Z' },
    ]

    const mockNotes = [
      {
        created_at: '2024-01-02T12:00:00Z',
        system: false,
        body: 'First review comment',
        noteable_type: 'MergeRequest',
      },
    ]

    // Mock GitLab client methods
    mockGetClient = vi.fn().mockReturnValue({
      MergeRequests: {
        all: vi.fn().mockResolvedValue(mockMergeRequests),
      },
    })

    mockGetMergeRequestCommits = vi.fn().mockResolvedValue(mockCommits)
    mockGetMergeRequestNotes = vi.fn().mockResolvedValue(mockNotes)

    mockGitLabClient = {
      getClient: mockGetClient,
      getProjectIdentifier: vi.fn().mockReturnValue('test/project'),
      getMergeRequestCommits: mockGetMergeRequestCommits,
      getMergeRequestNotes: mockGetMergeRequestNotes,
    }

    // Mock GitLabClient constructor
    vi.spyOn(GitLabClient.prototype, 'getClient').mockImplementation(mockGetClient)
    vi.spyOn(GitLabClient.prototype, 'getProjectIdentifier').mockImplementation(
      mockGitLabClient.getProjectIdentifier
    )
    vi.spyOn(GitLabClient.prototype, 'getMergeRequestCommits').mockImplementation(
      mockGetMergeRequestCommits
    )
    vi.spyOn(GitLabClient.prototype, 'getMergeRequestNotes').mockImplementation(
      mockGetMergeRequestNotes
    )
  })

  describe('基礎分析', () => {
    it('應成功執行基本分析（不報錯）', async () => {
      const command = new CycleTime(
        ['--project', 'test/project', '--days', '30'],
        {} as any
      )

      // Mock parse to return flags with token
      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          days: 30,
          json: false,
        },
      })

      // Mock log to suppress output
      vi.spyOn(command, 'log').mockImplementation(() => {})
      vi.spyOn(command, 'warn').mockImplementation(() => {})

      // Should not throw
      await expect(command.run()).resolves.not.toThrow()
    })

    it.skip('應在 JSON 模式下輸出有效 JSON（待實作）', async () => {
      // TODO: 完整的 mock 設置需要更複雜的 GitLab API responses
      // 目前跳過此測試，作為未來改善的標記
    })

    it('應在缺少 token 時報錯', async () => {
      const command = new CycleTime(
        ['--project', 'test/project'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: undefined,
          host: 'https://gitlab.com',
          days: 30,
        },
      })

      // Mock error to capture it
      const mockError = vi.spyOn(command, 'error').mockImplementation(() => {
        throw new Error('Token required')
      })

      await expect(command.run()).rejects.toThrow('Token required')
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('GitLab Personal Access Token')
      )
    })
  })

  describe('趨勢分析', () => {
    it('應成功執行趨勢分析', async () => {
      const command = new CycleTime(
        ['--project', 'test/project', '--trend', 'weekly'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          days: 30,
          trend: 'weekly',
          json: false,
        },
      })

      vi.spyOn(command, 'log').mockImplementation(() => {})
      vi.spyOn(command, 'warn').mockImplementation(() => {})

      await expect(command.run()).resolves.not.toThrow()
    })

    it.skip('應在趨勢 JSON 模式下輸出有效結構（待實作）', async () => {
      // TODO: 完整的 mock 設置需要更複雜的 GitLab API responses
      // 目前跳過此測試，作為未來改善的標記
    })
  })
})
