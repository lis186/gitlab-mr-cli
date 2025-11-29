import { describe, it, expect } from 'vitest'
import { JsonFormatter } from '../../../src/formatters/json-formatter.js'
import { MergeRequest, MergeRequestState } from '../../../src/models/merge-request.js'

/**
 * JsonFormatter 單元測試
 *
 * 測試 JSON 格式化器是否正確將 MR 列表轉換為 JSON 格式
 */
describe('JsonFormatter', () => {
  /**
   * 測試：格式化空列表
   */
  it('應正確格式化空列表', () => {
    const formatter = new JsonFormatter()
    const output = formatter.format([])

    const parsed = JSON.parse(output)
    expect(parsed.total).toBe(0)
    expect(parsed.mergeRequests).toEqual([])
  })

  /**
   * 測試：格式化單個 MR
   */
  it('應正確格式化單個 MR', () => {
    const mr: MergeRequest = {
      id: 123456,
      iid: 42,
      title: 'Test MR',
      state: MergeRequestState.OPENED,
      author: {
        id: 789,
        name: 'John Doe',
        username: 'johndoe'
      },
      createdAt: new Date('2025-10-20T10:30:00Z'),
      updatedAt: new Date('2025-10-21T08:15:00Z'),
      sourceBranch: 'feature/test',
      targetBranch: 'main',
      webUrl: 'https://gitlab.com/group/project/-/merge_requests/42'
    }

    const formatter = new JsonFormatter()
    const output = formatter.format([mr])

    const parsed = JSON.parse(output)
    expect(parsed.total).toBe(1)
    expect(parsed.mergeRequests).toHaveLength(1)
    expect(parsed.mergeRequests[0].id).toBe(123456)
    expect(parsed.mergeRequests[0].iid).toBe(42)
    expect(parsed.mergeRequests[0].title).toBe('Test MR')
    expect(parsed.mergeRequests[0].state).toBe('opened')
  })

  /**
   * 測試：格式化多個 MR
   */
  it('應正確格式化多個 MR', () => {
    const mrs: MergeRequest[] = [
      {
        id: 1,
        iid: 1,
        title: 'MR 1',
        state: MergeRequestState.OPENED,
        author: { id: 1, name: 'Author 1', username: 'author1' },
        createdAt: new Date('2025-10-20T10:00:00Z'),
        updatedAt: new Date('2025-10-20T11:00:00Z'),
        sourceBranch: 'feat1',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/proj/-/merge_requests/1'
      },
      {
        id: 2,
        iid: 2,
        title: 'MR 2',
        state: MergeRequestState.MERGED,
        author: { id: 2, name: 'Author 2', username: 'author2' },
        createdAt: new Date('2025-10-19T10:00:00Z'),
        updatedAt: new Date('2025-10-19T12:00:00Z'),
        sourceBranch: 'feat2',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/proj/-/merge_requests/2'
      }
    ]

    const formatter = new JsonFormatter()
    const output = formatter.format(mrs)

    const parsed = JSON.parse(output)
    expect(parsed.total).toBe(2)
    expect(parsed.mergeRequests).toHaveLength(2)
  })

  /**
   * 測試：包含所有必要欄位
   */
  it('應包含所有必要的 MR 欄位', () => {
    const mr: MergeRequest = {
      id: 123456,
      iid: 42,
      title: 'Complete MR',
      state: MergeRequestState.MERGED,
      author: {
        id: 789,
        name: 'Jane Smith',
        username: 'janesmith'
      },
      createdAt: new Date('2025-10-20T10:30:00Z'),
      updatedAt: new Date('2025-10-21T08:15:00Z'),
      sourceBranch: 'feature/complete',
      targetBranch: 'develop',
      webUrl: 'https://gitlab.com/org/repo/-/merge_requests/42'
    }

    const formatter = new JsonFormatter()
    const output = formatter.format([mr])

    const parsed = JSON.parse(output)
    const mrData = parsed.mergeRequests[0]

    // 檢查所有必要欄位存在
    expect(mrData).toHaveProperty('id')
    expect(mrData).toHaveProperty('iid')
    expect(mrData).toHaveProperty('title')
    expect(mrData).toHaveProperty('state')
    expect(mrData).toHaveProperty('author')
    expect(mrData).toHaveProperty('createdAt')
    expect(mrData).toHaveProperty('updatedAt')
    expect(mrData).toHaveProperty('sourceBranch')
    expect(mrData).toHaveProperty('targetBranch')
    expect(mrData).toHaveProperty('webUrl')

    // 檢查 author 物件結構
    expect(mrData.author).toHaveProperty('id')
    expect(mrData.author).toHaveProperty('name')
    expect(mrData.author).toHaveProperty('username')
  })

  /**
   * 測試：日期格式為 ISO 8601
   */
  it('日期應使用 ISO 8601 格式', () => {
    const mr: MergeRequest = {
      id: 123,
      iid: 1,
      title: 'Test',
      state: MergeRequestState.OPENED,
      author: { id: 1, name: 'Test', username: 'test' },
      createdAt: new Date('2025-10-20T10:30:45.123Z'),
      updatedAt: new Date('2025-10-21T08:15:30.456Z'),
      sourceBranch: 'test',
      targetBranch: 'main',
      webUrl: 'https://gitlab.com/test/-/merge_requests/1'
    }

    const formatter = new JsonFormatter()
    const output = formatter.format([mr])

    const parsed = JSON.parse(output)
    const mrData = parsed.mergeRequests[0]

    // ISO 8601 格式應該包含 'T' 和 'Z'
    expect(mrData.createdAt).toBe('2025-10-20T10:30:45.123Z')
    expect(mrData.updatedAt).toBe('2025-10-21T08:15:30.456Z')
  })

  /**
   * 測試：輸出為有效的 JSON
   */
  it('輸出應為有效的 JSON 字串', () => {
    const mrs: MergeRequest[] = [
      {
        id: 1,
        iid: 1,
        title: 'Test MR',
        state: MergeRequestState.OPENED,
        author: { id: 1, name: 'Test', username: 'test' },
        createdAt: new Date('2025-10-20T10:00:00Z'),
        updatedAt: new Date('2025-10-20T11:00:00Z'),
        sourceBranch: 'test',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/test/-/merge_requests/1'
      }
    ]

    const formatter = new JsonFormatter()
    const output = formatter.format(mrs)

    // 不應拋出錯誤
    expect(() => JSON.parse(output)).not.toThrow()
  })

  /**
   * 測試：total 欄位反映實際 MR 數量
   */
  it('total 欄位應反映實際的 MR 數量', () => {
    const createMR = (id: number): MergeRequest => ({
      id,
      iid: id,
      title: `MR ${id}`,
      state: MergeRequestState.OPENED,
      author: { id, name: `Author ${id}`, username: `author${id}` },
      createdAt: new Date(),
      updatedAt: new Date(),
      sourceBranch: 'test',
      targetBranch: 'main',
      webUrl: `https://gitlab.com/test/-/merge_requests/${id}`
    })

    const formatter = new JsonFormatter()

    // 測試不同數量
    for (const count of [0, 1, 5, 20, 100]) {
      const mrs = Array.from({ length: count }, (_, i) => createMR(i + 1))
      const output = formatter.format(mrs)
      const parsed = JSON.parse(output)

      expect(parsed.total).toBe(count)
      expect(parsed.mergeRequests).toHaveLength(count)
    }
  })

  /**
   * 測試：處理所有 MR 狀態
   */
  it('應正確處理所有 MR 狀態', () => {
    const states = [
      MergeRequestState.OPENED,
      MergeRequestState.MERGED,
      MergeRequestState.CLOSED
    ]

    const mrs: MergeRequest[] = states.map((state, index) => ({
      id: index + 1,
      iid: index + 1,
      title: `MR ${index + 1}`,
      state,
      author: { id: 1, name: 'Test', username: 'test' },
      createdAt: new Date(),
      updatedAt: new Date(),
      sourceBranch: 'test',
      targetBranch: 'main',
      webUrl: `https://gitlab.com/test/-/merge_requests/${index + 1}`
    }))

    const formatter = new JsonFormatter()
    const output = formatter.format(mrs)

    const parsed = JSON.parse(output)
    expect(parsed.mergeRequests[0].state).toBe('opened')
    expect(parsed.mergeRequests[1].state).toBe('merged')
    expect(parsed.mergeRequests[2].state).toBe('closed')
  })

  /**
   * 測試：JSON 輸出格式化（包含縮排）
   */
  it('輸出應為格式化的 JSON（包含縮排）', () => {
    const mr: MergeRequest = {
      id: 1,
      iid: 1,
      title: 'Test',
      state: MergeRequestState.OPENED,
      author: { id: 1, name: 'Test', username: 'test' },
      createdAt: new Date('2025-10-20T10:00:00Z'),
      updatedAt: new Date('2025-10-20T11:00:00Z'),
      sourceBranch: 'test',
      targetBranch: 'main',
      webUrl: 'https://gitlab.com/test/-/merge_requests/1'
    }

    const formatter = new JsonFormatter()
    const output = formatter.format([mr])

    // 應包含換行和縮排
    expect(output).toContain('\n')
    expect(output).toContain('  ')
  })
})
