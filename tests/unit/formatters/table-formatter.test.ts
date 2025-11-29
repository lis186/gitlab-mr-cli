import { describe, it, expect } from 'vitest'
import { TableFormatter } from '../../../src/formatters/table-formatter.js'
import { MergeRequest, MergeRequestState } from '../../../src/models/merge-request.js'

/**
 * TableFormatter 單元測試
 *
 * 測試表格格式化器是否正確產生表格輸出
 */
describe('TableFormatter', () => {
  /**
   * 建立測試用的 MR 資料
   */
  const createMockMR = (overrides?: Partial<MergeRequest>): MergeRequest => ({
    iid: 123,
    title: '測試 MR 標題',
    state: MergeRequestState.OPENED,
    createdAt: new Date('2024-01-15T10:30:00Z'),
    author: {
      id: 1,
      name: '張小明',
      username: 'zhangxiaoming'
    },
    ...overrides
  })

  /**
   * 簡單的日期格式化函數用於測試
   */
  const testFormatDate = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  /**
   * 測試：格式化單一 MR
   */
  it('應正確格式化單一 MR', () => {
    const formatter = new TableFormatter()
    const mrs = [createMockMR()]
    const output = formatter.format(mrs, testFormatDate)

    // 驗證輸出包含必要資訊
    expect(output).toContain('123')
    expect(output).toContain('測試 MR 標題')
    expect(output).toContain('張小明')
    expect(output).toContain('開啟中')
    expect(output).toContain('2024-01-15')
  })

  /**
   * 測試：格式化多個 MR
   */
  it('應正確格式化多個 MR', () => {
    const formatter = new TableFormatter()
    const mrs = [
      createMockMR({ iid: 1, title: 'MR 1', state: MergeRequestState.OPENED }),
      createMockMR({ iid: 2, title: 'MR 2', state: MergeRequestState.MERGED }),
      createMockMR({ iid: 3, title: 'MR 3', state: MergeRequestState.CLOSED })
    ]
    const output = formatter.format(mrs, testFormatDate)

    // 驗證所有 MR 都出現在輸出中
    expect(output).toContain('1')
    expect(output).toContain('2')
    expect(output).toContain('3')
    expect(output).toContain('MR 1')
    expect(output).toContain('MR 2')
    expect(output).toContain('MR 3')
  })

  /**
   * 測試：正確顯示不同狀態
   */
  it('應正確顯示所有 MR 狀態', () => {
    const formatter = new TableFormatter()
    const mrs = [
      createMockMR({ state: MergeRequestState.OPENED }),
      createMockMR({ state: MergeRequestState.MERGED }),
      createMockMR({ state: MergeRequestState.CLOSED })
    ]
    const output = formatter.format(mrs, testFormatDate)

    // 驗證狀態文字
    expect(output).toContain('開啟中')
    expect(output).toContain('已合併')
    expect(output).toContain('已關閉')
  })

  /**
   * 測試：截斷過長的標題
   */
  it('應截斷超過 47 個字元的標題', () => {
    const formatter = new TableFormatter()
    const longTitle = 'A'.repeat(60) // 60 個字元的標題
    const mrs = [createMockMR({ title: longTitle })]
    const output = formatter.format(mrs, testFormatDate)

    // 應包含截斷後的標題（47 字元 + '...'）
    // 注意：輸出可能包含 ANSI 顏色碼和表格邊框，所以檢查是否包含縮短的版本和省略符號
    const shortenedTitle = 'A'.repeat(47)
    expect(output).toContain(shortenedTitle)
    expect(output).toContain('…') // cli-table3 使用 … 而不是 ...
    // 不應包含完整的 60 字元標題
    expect(output).not.toContain('A'.repeat(60))
  })

  /**
   * 測試：不截斷正常長度的標題
   */
  it('應保留正常長度的標題', () => {
    const formatter = new TableFormatter()
    const normalTitle = '正常長度的標題'
    const mrs = [createMockMR({ title: normalTitle })]
    const output = formatter.format(mrs, testFormatDate)

    // 應包含完整標題
    expect(output).toContain(normalTitle)
    // 不應有省略符號
    expect(output).not.toContain(normalTitle + '...')
  })

  /**
   * 測試：表格包含標題列
   */
  it('應包含表格標題列', () => {
    const formatter = new TableFormatter()
    const mrs = [createMockMR()]
    const output = formatter.format(mrs, testFormatDate)

    // 驗證表格標題（注意：chalk 可能會添加 ANSI 顏色碼，所以只檢查文字內容）
    expect(output).toContain('IID')
    expect(output).toContain('標題')
    expect(output).toContain('作者')
    expect(output).toContain('狀態')
    expect(output).toContain('建立時間')
  })

  /**
   * 測試：空陣列應返回空表格
   */
  it('應處理空 MR 陣列', () => {
    const formatter = new TableFormatter()
    const output = formatter.format([], testFormatDate)

    // 空表格仍應包含標題列
    expect(output).toContain('IID')
    expect(output).toContain('標題')
  })

  /**
   * 測試：使用自訂日期格式化函數
   */
  it('應使用提供的日期格式化函數', () => {
    const formatter = new TableFormatter()
    const customFormatDate = (date: Date) => 'CUSTOM_DATE'
    const mrs = [createMockMR()]
    const output = formatter.format(mrs, customFormatDate)

    // 應使用自訂格式
    expect(output).toContain('CUSTOM_DATE')
  })

  /**
   * 測試：正確顯示作者名稱
   */
  it('應正確顯示不同作者名稱', () => {
    const formatter = new TableFormatter()
    const mrs = [
      createMockMR({ author: { id: 1, name: '張三', username: 'zhang3' } }),
      createMockMR({ author: { id: 2, name: '李四', username: 'li4' } }),
      createMockMR({ author: { id: 3, name: 'John Doe', username: 'johndoe' } })
    ]
    const output = formatter.format(mrs, testFormatDate)

    // 驗證所有作者名稱都出現
    expect(output).toContain('張三')
    expect(output).toContain('李四')
    expect(output).toContain('John Doe')
  })
})
