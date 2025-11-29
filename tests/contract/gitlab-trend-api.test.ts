/**
 * GitLab API 時間範圍查詢合約測試 (T008)
 *
 * 驗證 GitLab API 時間範圍查詢參數的正確性
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitLabClient } from '../../src/services/gitlab-client.js'
import { Gitlab } from '@gitbeaker/rest'

describe('GitLab Trend API Contract', () => {
  let client: GitLabClient
  let mockGitlabClient: any

  beforeEach(() => {
    // 建立模擬的 GitLab 客戶端
    mockGitlabClient = {
      MergeRequests: {
        all: vi.fn().mockResolvedValue([])
      }
    }

    // 模擬 Gitlab 建構子
    vi.spyOn(Gitlab.prototype, 'constructor' as any).mockImplementation(() => mockGitlabClient)

    client = new GitLabClient({
      identifier: 'test-project',
      host: 'https://gitlab.com',
      token: 'test-token'
    })

    // 直接替換內部 client
    ;(client as any).client = mockGitlabClient
  })

  it('應查詢已合併的 MR 並在客戶端過濾時間範圍', async () => {
    // GitLab REST API 不支援 merged_after/merged_before，改用客戶端過濾
    const startDate = new Date('2025-01-01T00:00:00.000Z')
    const endDate = new Date('2025-01-31T23:59:59.999Z')

    await client.getMergedMRsByTimeRange(startDate, endDate)

    // 驗證 API 調用參數（不包含 merged_after/merged_before）
    expect(mockGitlabClient.MergeRequests.all).toHaveBeenCalledWith({
      projectId: 'test-project',
      state: 'merged',
      orderBy: 'updated_at',
      sort: 'desc',
      perPage: 100,
      maxPages: 10 // 預設值
    })
  })

  it('應支援自訂 perPage 參數', async () => {
    const startDate = new Date('2025-01-01')
    const endDate = new Date('2025-01-31')

    await client.getMergedMRsByTimeRange(startDate, endDate, { perPage: 50 })

    expect(mockGitlabClient.MergeRequests.all).toHaveBeenCalledWith(
      expect.objectContaining({
        perPage: 50
      })
    )
  })

  it('應支援自訂 maxPages 參數', async () => {
    const startDate = new Date('2025-01-01')
    const endDate = new Date('2025-01-31')

    await client.getMergedMRsByTimeRange(startDate, endDate, { maxPages: 10 })

    expect(mockGitlabClient.MergeRequests.all).toHaveBeenCalledWith(
      expect.objectContaining({
        maxPages: 10
      })
    )
  })

  it('應使用 state=merged 過濾已合併的 MR', async () => {
    const startDate = new Date('2025-01-01')
    const endDate = new Date('2025-01-31')

    await client.getMergedMRsByTimeRange(startDate, endDate)

    expect(mockGitlabClient.MergeRequests.all).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'merged'
      })
    )
  })

  it('應過濾掉 mergedAt 為 null 的 MR', async () => {
    // 模擬 API 回應
    mockGitlabClient.MergeRequests.all.mockResolvedValue([
      {
        id: 1,
        iid: 1,
        title: 'MR with merged_at',
        state: 'merged',
        author: { id: 1, name: 'User 1', username: 'user1' },
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:30:00.000Z',
        merged_at: '2025-01-15T11:00:00.000Z',
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/mr/1'
      },
      {
        id: 2,
        iid: 2,
        title: 'MR without merged_at',
        state: 'merged',
        author: { id: 2, name: 'User 2', username: 'user2' },
        created_at: '2025-01-16T10:00:00.000Z',
        updated_at: '2025-01-16T10:30:00.000Z',
        merged_at: null, // 缺少 merged_at
        source_branch: 'feature2',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/mr/2'
      }
    ])

    const startDate = new Date('2025-01-01')
    const endDate = new Date('2025-01-31')

    const results = await client.getMergedMRsByTimeRange(startDate, endDate)

    // 應該只回傳有 mergedAt 的 MR
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(1)
    expect(results[0].mergedAt).not.toBeNull()
  })

  it('應正確在客戶端過濾時間範圍', async () => {
    // 模擬 API 返回多筆 MR，包含在範圍內和範圍外的
    const startDate = new Date('2025-01-15T08:30:00.000Z')
    const endDate = new Date('2025-01-20T18:45:30.500Z')

    mockGitlabClient.MergeRequests.all.mockResolvedValue([
      {
        id: 1,
        iid: 1,
        title: 'MR 1',
        author: { id: 1, username: 'user1', name: 'User 1' },
        merged_at: '2025-01-16T10:00:00.000Z', // 在範圍內
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-16T10:00:00.000Z'
      },
      {
        id: 2,
        iid: 2,
        title: 'MR 2',
        author: { id: 2, username: 'user2', name: 'User 2' },
        merged_at: '2025-01-14T10:00:00.000Z', // 在範圍外（太早）
        created_at: '2025-01-13T10:00:00.000Z',
        updated_at: '2025-01-14T10:00:00.000Z'
      },
      {
        id: 3,
        iid: 3,
        title: 'MR 3',
        author: { id: 3, username: 'user3', name: 'User 3' },
        merged_at: '2025-01-21T10:00:00.000Z', // 在範圍外（太晚）
        created_at: '2025-01-20T10:00:00.000Z',
        updated_at: '2025-01-21T10:00:00.000Z'
      },
      {
        id: 4,
        iid: 4,
        title: 'MR 4',
        author: { id: 4, username: 'user4', name: 'User 4' },
        merged_at: '2025-01-20T18:45:30.500Z', // 剛好在範圍內（邊界）
        created_at: '2025-01-19T10:00:00.000Z',
        updated_at: '2025-01-20T18:45:30.500Z'
      }
    ])

    const results = await client.getMergedMRsByTimeRange(startDate, endDate)

    // 驗證客戶端過濾正確：只返回在時間範圍內的 MR
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe(1)
    expect(results[1].id).toBe(4)
  })
})
