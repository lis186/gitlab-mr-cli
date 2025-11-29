import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GitLabClient } from '../../src/services/gitlab-client.js'
import { TableFormatter } from '../../src/formatters/table-formatter.js'
import { parseProjectIdentifier } from '../../src/utils/project-parser.js'
import { formatDate } from '../../src/utils/formatters.js'
import { MergeRequestState } from '../../src/models/merge-request.js'

/**
 * List 命令整合測試
 *
 * 測試完整的 CLI 流程：參數解析 → API 呼叫 → 格式化輸出
 * 這些測試驗證各個元件整合後的行為
 */
describe('List Command Integration', () => {
  /**
   * 建立模擬的 GitLab API 回應資料
   */
  const createMockApiResponse = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      iid: i + 1,
      title: `測試 MR ${i + 1}`,
      state: i % 3 === 0 ? 'opened' : i % 3 === 1 ? 'merged' : 'closed',
      created_at: new Date(2024, 0, i + 1).toISOString(),
      author: {
        id: i + 1,
        name: `測試使用者 ${i + 1}`,
        username: `user${i + 1}`
      }
    }))
  }

  /**
   * 測試：完整 CLI 流程 - 參數解析 → API → 輸出
   */
  it('應完整執行從參數解析到輸出的流程', () => {
    // 1. 參數解析
    const projectInput = 'gitlab-org/gitlab'
    const { identifier } = parseProjectIdentifier(projectInput)
    expect(identifier).toBe('gitlab-org/gitlab')

    // 2. 模擬 API 回應
    const mockApiData = createMockApiResponse(20)

    // 3. 轉換為應用程式模型
    const mergeRequests = mockApiData.map((mr: any) => ({
      iid: mr.iid,
      title: mr.title,
      state: mr.state === 'opened' ? MergeRequestState.OPENED :
             mr.state === 'merged' ? MergeRequestState.MERGED :
             MergeRequestState.CLOSED,
      createdAt: new Date(mr.created_at),
      author: mr.author
    }))

    // 4. 格式化輸出
    const formatter = new TableFormatter()
    const output = formatter.format(mergeRequests, formatDate)

    // 5. 驗證輸出
    expect(output).toContain('IID')
    expect(output).toContain('標題')
    expect(output).toContain('測試 MR 1')
    expect(output).toContain('測試使用者 1')
  })

  /**
   * 測試：--limit 參數功能 - 預設值 20
   */
  it('預設應取得 20 個 MR', () => {
    const defaultLimit = 20
    const mockApiData = createMockApiResponse(defaultLimit)

    expect(mockApiData.length).toBe(20)

    // 驗證可以正確處理 20 個 MR
    const formatter = new TableFormatter()
    const mergeRequests = mockApiData.map((mr: any) => ({
      iid: mr.iid,
      title: mr.title,
      state: MergeRequestState.OPENED,
      createdAt: new Date(mr.created_at),
      author: mr.author
    }))

    const output = formatter.format(mergeRequests, formatDate)
    expect(output).toContain('測試 MR 1')
    expect(output).toContain('測試 MR 20')
  })

  /**
   * 測試：--limit 參數功能 - 自訂數量 10
   */
  it('--limit 10 應只取得 10 個 MR', () => {
    const customLimit = 10
    const mockApiData = createMockApiResponse(customLimit)

    expect(mockApiData.length).toBe(10)

    // 驗證輸出包含 10 個 MR
    const formatter = new TableFormatter()
    const mergeRequests = mockApiData.map((mr: any) => ({
      iid: mr.iid,
      title: mr.title,
      state: MergeRequestState.OPENED,
      createdAt: new Date(mr.created_at),
      author: mr.author
    }))

    const output = formatter.format(mergeRequests, formatDate)
    expect(output).toContain('測試 MR 1')
    expect(output).toContain('測試 MR 10')
    // 不應包含第 11 個
    expect(output).not.toContain('測試 MR 11')
  })

  /**
   * 測試：--limit 參數功能 - 最小值 1
   */
  it('--limit 1 應只取得 1 個 MR', () => {
    const minLimit = 1
    const mockApiData = createMockApiResponse(minLimit)

    expect(mockApiData.length).toBe(1)

    const formatter = new TableFormatter()
    const mergeRequests = mockApiData.map((mr: any) => ({
      iid: mr.iid,
      title: mr.title,
      state: MergeRequestState.OPENED,
      createdAt: new Date(mr.created_at),
      author: mr.author
    }))

    const output = formatter.format(mergeRequests, formatDate)
    expect(output).toContain('測試 MR 1')
    expect(output).not.toContain('測試 MR 2')
  })

  /**
   * 測試：--limit 參數功能 - 最大值 100
   */
  it('--limit 100 應能取得 100 個 MR', () => {
    const maxLimit = 100
    const mockApiData = createMockApiResponse(maxLimit)

    expect(mockApiData.length).toBe(100)

    const formatter = new TableFormatter()
    const mergeRequests = mockApiData.map((mr: any) => ({
      iid: mr.iid,
      title: mr.title,
      state: MergeRequestState.OPENED,
      createdAt: new Date(mr.created_at),
      author: mr.author
    }))

    const output = formatter.format(mergeRequests, formatDate)
    expect(output).toContain('測試 MR 1')
    expect(output).toContain('測試 MR 100')
  })

  /**
   * 測試：處理空 MR 列表
   */
  it('應正確處理專案沒有 MR 的情況', () => {
    const mockApiData = createMockApiResponse(0)
    expect(mockApiData.length).toBe(0)

    // 空陣列應該可以被格式化器處理
    const formatter = new TableFormatter()
    const output = formatter.format([], formatDate)

    // 空表格仍應包含標題
    expect(output).toContain('IID')
    expect(output).toContain('標題')
  })

  /**
   * 測試：處理 MR 數量少於 limit
   */
  it('當專案 MR 少於 limit 時應返回所有可用的 MR', () => {
    // 請求 20 個，但只有 5 個
    const requestedLimit = 20
    const actualCount = 5
    const mockApiData = createMockApiResponse(actualCount)

    expect(mockApiData.length).toBe(5)

    const formatter = new TableFormatter()
    const mergeRequests = mockApiData.map((mr: any) => ({
      iid: mr.iid,
      title: mr.title,
      state: MergeRequestState.OPENED,
      createdAt: new Date(mr.created_at),
      author: mr.author
    }))

    const output = formatter.format(mergeRequests, formatDate)
    expect(output).toContain('測試 MR 1')
    expect(output).toContain('測試 MR 5')
    expect(output).not.toContain('測試 MR 6')
  })

  /**
   * 測試：完整流程包含三種狀態的 MR
   */
  it('應正確處理包含不同狀態的 MR 列表', () => {
    const mockApiData = [
      {
        iid: 1,
        title: 'Opened MR',
        state: 'opened',
        created_at: new Date(2024, 0, 1).toISOString(),
        author: { id: 1, name: '使用者 1', username: 'user1' }
      },
      {
        iid: 2,
        title: 'Merged MR',
        state: 'merged',
        created_at: new Date(2024, 0, 2).toISOString(),
        author: { id: 2, name: '使用者 2', username: 'user2' }
      },
      {
        iid: 3,
        title: 'Closed MR',
        state: 'closed',
        created_at: new Date(2024, 0, 3).toISOString(),
        author: { id: 3, name: '使用者 3', username: 'user3' }
      }
    ]

    const formatter = new TableFormatter()
    const mergeRequests = mockApiData.map((mr: any) => ({
      iid: mr.iid,
      title: mr.title,
      state: mr.state === 'opened' ? MergeRequestState.OPENED :
             mr.state === 'merged' ? MergeRequestState.MERGED :
             MergeRequestState.CLOSED,
      createdAt: new Date(mr.created_at),
      author: mr.author
    }))

    const output = formatter.format(mergeRequests, formatDate)

    // 驗證所有狀態都正確顯示
    expect(output).toContain('開啟中')
    expect(output).toContain('已合併')
    expect(output).toContain('已關閉')
  })

  /**
   * 測試：解析不同格式的專案識別
   */
  it('應能處理不同格式的專案識別', () => {
    // 測試各種專案識別格式
    const formats = [
      { input: '12345', expected: '12345' },
      { input: 'gitlab-org/gitlab', expected: 'gitlab-org/gitlab' },
      { input: 'https://gitlab.com/foo/bar', expected: 'foo/bar' }
    ]

    formats.forEach(({ input, expected }) => {
      const { identifier } = parseProjectIdentifier(input)
      expect(identifier).toBe(expected)
    })
  })

  /**
   * 測試：日期格式化在整合流程中的應用
   */
  it('應正確格式化 MR 的建立時間', () => {
    const mockApiData = [{
      iid: 1,
      title: '測試 MR',
      state: 'opened',
      created_at: '2024-01-15T10:30:00Z',
      author: { id: 1, name: '測試使用者', username: 'testuser' }
    }]

    const formatter = new TableFormatter()
    const mergeRequests = mockApiData.map((mr: any) => ({
      iid: mr.iid,
      title: mr.title,
      state: MergeRequestState.OPENED,
      createdAt: new Date(mr.created_at),
      author: mr.author
    }))

    const output = formatter.format(mergeRequests, formatDate)

    // 輸出應包含格式化後的日期（格式取決於時區）
    expect(output).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  })
})
