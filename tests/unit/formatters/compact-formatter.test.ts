import { describe, it, expect } from 'vitest'
import { CompactFormatter } from '../../../src/formatters/compact-formatter.js'
import { MergeRequest, MergeRequestState } from '../../../src/models/merge-request.js'

/**
 * CompactFormatter 單元測試
 *
 * 測試簡潔格式化器是否正確格式化 MR 列表
 */
describe('CompactFormatter', () => {
  /**
   * 簡單的日期格式化函數（用於測試）
   */
  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  /**
   * 測試：格式化空列表
   */
  it('應正確格式化空列表', () => {
    const formatter = new CompactFormatter()
    const output = formatter.format([], formatDate)

    expect(output).toBe('')
  })

  /**
   * 測試：格式化單個 MR
   */
  it('應正確格式化單個 MR', () => {
    const mr: MergeRequest = {
      id: 123456,
      iid: 42,
      title: 'Add new feature',
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

    const formatter = new CompactFormatter()
    const output = formatter.format([mr], formatDate)

    // 應包含 MR 資訊
    expect(output).toContain('!42')
    expect(output).toContain('[開啟中]')
    expect(output).toContain('Add new feature')
    expect(output).toContain('John Doe')
    expect(output).toContain('2025-10-20')
    expect(output).toContain('https://gitlab.com/group/project/-/merge_requests/42')
    expect(output).toContain('總計：1 個 Merge Requests')
  })

  /**
   * 測試：第一行格式正確
   */
  it('第一行應符合格式：!{iid}  [{狀態}] {標題} ({作者}, {日期})', () => {
    const mr: MergeRequest = {
      id: 1,
      iid: 42,
      title: 'Test MR',
      state: MergeRequestState.MERGED,
      author: { id: 1, name: 'Jane Smith', username: 'jane' },
      createdAt: new Date('2025-10-20T10:00:00Z'),
      updatedAt: new Date('2025-10-20T11:00:00Z'),
      sourceBranch: 'test',
      targetBranch: 'main',
      webUrl: 'https://gitlab.com/test/-/merge_requests/42'
    }

    const formatter = new CompactFormatter()
    const output = formatter.format([mr], formatDate)
    const lines = output.split('\n')

    // 第一行應符合格式
    expect(lines[0]).toBe('!42  [已合併] Test MR (Jane Smith, 2025-10-20)')
  })

  /**
   * 測試：第二行包含縮排和 URL
   */
  it('第二行應包含縮排和 MR URL', () => {
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

    const formatter = new CompactFormatter()
    const output = formatter.format([mr], formatDate)
    const lines = output.split('\n')

    // 第二行應以空格開頭（縮排）並包含 URL
    expect(lines[1]).toMatch(/^\s+https:\/\//)
    expect(lines[1]).toBe('     https://gitlab.com/test/-/merge_requests/1')
  })

  /**
   * 測試：多個 MR 用空行分隔
   */
  it('多個 MR 應用空行分隔', () => {
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

    const formatter = new CompactFormatter()
    const output = formatter.format(mrs, formatDate)
    const lines = output.split('\n')

    // 每個 MR 佔 2 行（資訊 + URL），MR 之間有空行
    // MR1: lines[0-1], 空行: line[2], MR2: lines[3-4], 空行: line[5], 總計: line[6]
    expect(lines[0]).toContain('!1')
    expect(lines[1]).toContain('merge_requests/1')
    expect(lines[2]).toBe('')
    expect(lines[3]).toContain('!2')
    expect(lines[4]).toContain('merge_requests/2')
  })

  /**
   * 測試：正確顯示所有狀態的正體中文
   */
  it('應正確顯示所有 MR 狀態的正體中文', () => {
    const createMR = (iid: number, state: MergeRequestState): MergeRequest => ({
      id: iid,
      iid,
      title: `MR ${iid}`,
      state,
      author: { id: 1, name: 'Test', username: 'test' },
      createdAt: new Date('2025-10-20T10:00:00Z'),
      updatedAt: new Date('2025-10-20T11:00:00Z'),
      sourceBranch: 'test',
      targetBranch: 'main',
      webUrl: `https://gitlab.com/test/-/merge_requests/${iid}`
    })

    const mrs: MergeRequest[] = [
      createMR(1, MergeRequestState.OPENED),
      createMR(2, MergeRequestState.MERGED),
      createMR(3, MergeRequestState.CLOSED)
    ]

    const formatter = new CompactFormatter()
    const output = formatter.format(mrs, formatDate)

    expect(output).toContain('[開啟中]')
    expect(output).toContain('[已合併]')
    expect(output).toContain('[已關閉]')
  })

  /**
   * 測試：總計訊息正確
   */
  it('應在最後顯示正確的總計訊息', () => {
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

    const formatter = new CompactFormatter()

    // 測試不同數量
    for (const count of [1, 5, 20]) {
      const mrs = Array.from({ length: count }, (_, i) => createMR(i + 1))
      const output = formatter.format(mrs, formatDate)

      expect(output).toContain(`總計：${count} 個 Merge Requests`)
    }
  })

  /**
   * 測試：輸出結構完整
   */
  it('輸出結構應完整（MR 資訊 + URL + 總計）', () => {
    const mr: MergeRequest = {
      id: 1,
      iid: 1,
      title: 'Complete test',
      state: MergeRequestState.OPENED,
      author: { id: 1, name: 'Complete Author', username: 'complete' },
      createdAt: new Date('2025-10-20T10:00:00Z'),
      updatedAt: new Date('2025-10-20T11:00:00Z'),
      sourceBranch: 'test',
      targetBranch: 'main',
      webUrl: 'https://gitlab.com/complete/-/merge_requests/1'
    }

    const formatter = new CompactFormatter()
    const output = formatter.format([mr], formatDate)
    const lines = output.split('\n')

    // 應該有：MR 資訊行、URL 行、空行、總計行
    expect(lines.length).toBeGreaterThanOrEqual(3)

    // 最後一行應該是總計
    expect(lines[lines.length - 1]).toContain('總計：')
  })

  /**
   * 測試：處理長標題
   */
  it('應正確處理長標題', () => {
    const longTitle = 'A'.repeat(200)
    const mr: MergeRequest = {
      id: 1,
      iid: 1,
      title: longTitle,
      state: MergeRequestState.OPENED,
      author: { id: 1, name: 'Test', username: 'test' },
      createdAt: new Date('2025-10-20T10:00:00Z'),
      updatedAt: new Date('2025-10-20T11:00:00Z'),
      sourceBranch: 'test',
      targetBranch: 'main',
      webUrl: 'https://gitlab.com/test/-/merge_requests/1'
    }

    const formatter = new CompactFormatter()
    const output = formatter.format([mr], formatDate)

    // 應包含完整標題（不截斷）
    expect(output).toContain(longTitle)
  })

  /**
   * 測試：使用自訂日期格式化函數
   */
  it('應正確使用自訂日期格式化函數', () => {
    const customFormatDate = (date: Date): string => {
      return `Custom: ${date.getFullYear()}`
    }

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

    const formatter = new CompactFormatter()
    const output = formatter.format([mr], customFormatDate)

    expect(output).toContain('Custom: 2025')
  })
})
