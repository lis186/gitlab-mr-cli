import { describe, it, expect } from 'vitest'
import { TableFormatter } from '../../src/formatters/table-formatter.js'
import { JsonFormatter } from '../../src/formatters/json-formatter.js'
import { CompactFormatter } from '../../src/formatters/compact-formatter.js'
import { MergeRequest, MergeRequestState } from '../../src/models/merge-request.js'
import { formatDate } from '../../src/utils/formatters.js'

/**
 * 輸出格式選項整合測試
 *
 * 測試 --format 參數的完整流程：
 * - T069: --format=json 完整流程
 * - T070: --format=compact 完整流程
 * - T071: --format=table（預設）完整流程
 * - T072: 驗證 JSON 輸出為有效 JSON 格式
 */
describe('Format Options Integration', () => {
  /**
   * 建立測試用的 MR 資料
   */
  const createTestMergeRequests = (): MergeRequest[] => {
    return [
      {
        id: 123456,
        iid: 42,
        title: 'Add new feature for user management',
        state: MergeRequestState.OPENED,
        author: {
          id: 789,
          name: 'John Doe',
          username: 'johndoe'
        },
        createdAt: new Date('2025-10-20T10:30:00Z'),
        updatedAt: new Date('2025-10-21T08:15:00Z'),
        sourceBranch: 'feature/user-mgmt',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/group/project/-/merge_requests/42'
      },
      {
        id: 123457,
        iid: 41,
        title: 'Fix bug in authentication module',
        state: MergeRequestState.MERGED,
        author: {
          id: 790,
          name: 'Jane Smith',
          username: 'janesmith'
        },
        createdAt: new Date('2025-10-19T14:20:00Z'),
        updatedAt: new Date('2025-10-20T16:45:00Z'),
        sourceBranch: 'fix/auth-bug',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/group/project/-/merge_requests/41'
      },
      {
        id: 123458,
        iid: 40,
        title: 'Update dependencies to latest versions',
        state: MergeRequestState.CLOSED,
        author: {
          id: 791,
          name: 'Bob Chen',
          username: 'bobchen'
        },
        createdAt: new Date('2025-10-18T09:15:00Z'),
        updatedAt: new Date('2025-10-19T11:30:00Z'),
        sourceBranch: 'chore/update-deps',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/group/project/-/merge_requests/40'
      }
    ]
  }

  /**
   * T069: 測試 --format=json 完整流程
   */
  describe('JSON format (--format=json)', () => {
    it('應正確輸出 JSON 格式', () => {
      const mrs = createTestMergeRequests()
      const formatter = new JsonFormatter()
      const output = formatter.format(mrs)

      // 應該是有效的 JSON
      expect(() => JSON.parse(output)).not.toThrow()

      const parsed = JSON.parse(output)

      // 應包含 total 欄位
      expect(parsed).toHaveProperty('total')
      expect(parsed.total).toBe(3)

      // 應包含 mergeRequests 陣列
      expect(parsed).toHaveProperty('mergeRequests')
      expect(parsed.mergeRequests).toBeInstanceOf(Array)
      expect(parsed.mergeRequests).toHaveLength(3)
    })

    it('JSON 輸出應包含所有必要欄位', () => {
      const mrs = createTestMergeRequests()
      const formatter = new JsonFormatter()
      const output = formatter.format(mrs)

      const parsed = JSON.parse(output)
      const firstMR = parsed.mergeRequests[0]

      // 檢查所有必要欄位
      expect(firstMR).toHaveProperty('id')
      expect(firstMR).toHaveProperty('iid')
      expect(firstMR).toHaveProperty('title')
      expect(firstMR).toHaveProperty('state')
      expect(firstMR).toHaveProperty('author')
      expect(firstMR).toHaveProperty('createdAt')
      expect(firstMR).toHaveProperty('updatedAt')
      expect(firstMR).toHaveProperty('sourceBranch')
      expect(firstMR).toHaveProperty('targetBranch')
      expect(firstMR).toHaveProperty('webUrl')

      // 檢查具體值
      expect(firstMR.id).toBe(123456)
      expect(firstMR.iid).toBe(42)
      expect(firstMR.title).toBe('Add new feature for user management')
      expect(firstMR.state).toBe('opened')
    })

    it('JSON 輸出的作者資訊應完整', () => {
      const mrs = createTestMergeRequests()
      const formatter = new JsonFormatter()
      const output = formatter.format(mrs)

      const parsed = JSON.parse(output)
      const author = parsed.mergeRequests[0].author

      expect(author).toHaveProperty('id')
      expect(author).toHaveProperty('name')
      expect(author).toHaveProperty('username')
      expect(author.id).toBe(789)
      expect(author.name).toBe('John Doe')
      expect(author.username).toBe('johndoe')
    })

    /**
     * T072: 驗證 JSON 輸出為有效 JSON 格式
     */
    it('JSON 輸出應始終為有效的 JSON', () => {
      const testCases = [
        createTestMergeRequests(),
        [createTestMergeRequests()[0]],
        []
      ]

      const formatter = new JsonFormatter()

      testCases.forEach(mrs => {
        const output = formatter.format(mrs)

        // 不應拋出解析錯誤
        expect(() => JSON.parse(output)).not.toThrow()

        // 解析後應該是物件
        const parsed = JSON.parse(output)
        expect(typeof parsed).toBe('object')
        expect(parsed).not.toBeNull()
      })
    })

    it('JSON 輸出的日期應為 ISO 8601 格式', () => {
      const mrs = createTestMergeRequests()
      const formatter = new JsonFormatter()
      const output = formatter.format(mrs)

      const parsed = JSON.parse(output)
      const firstMR = parsed.mergeRequests[0]

      // ISO 8601 格式
      expect(firstMR.createdAt).toBe('2025-10-20T10:30:00.000Z')
      expect(firstMR.updatedAt).toBe('2025-10-21T08:15:00.000Z')
    })

    it('JSON 輸出應包含所有三種狀態的 MR', () => {
      const mrs = createTestMergeRequests()
      const formatter = new JsonFormatter()
      const output = formatter.format(mrs)

      const parsed = JSON.parse(output)

      expect(parsed.mergeRequests[0].state).toBe('opened')
      expect(parsed.mergeRequests[1].state).toBe('merged')
      expect(parsed.mergeRequests[2].state).toBe('closed')
    })
  })

  /**
   * T070: 測試 --format=compact 完整流程
   */
  describe('Compact format (--format=compact)', () => {
    it('應正確輸出簡潔格式', () => {
      const mrs = createTestMergeRequests()
      const formatter = new CompactFormatter()
      const output = formatter.format(mrs, formatDate)

      // 應包含 MR IID
      expect(output).toContain('!42')
      expect(output).toContain('!41')
      expect(output).toContain('!40')

      // 應包含狀態（正體中文）
      expect(output).toContain('[開啟中]')
      expect(output).toContain('[已合併]')
      expect(output).toContain('[已關閉]')

      // 應包含標題
      expect(output).toContain('Add new feature for user management')
      expect(output).toContain('Fix bug in authentication module')
      expect(output).toContain('Update dependencies to latest versions')

      // 應包含作者
      expect(output).toContain('John Doe')
      expect(output).toContain('Jane Smith')
      expect(output).toContain('Bob Chen')
    })

    it('簡潔格式應包含 MR 連結', () => {
      const mrs = createTestMergeRequests()
      const formatter = new CompactFormatter()
      const output = formatter.format(mrs, formatDate)

      // 應包含所有 MR 的 URL
      expect(output).toContain('https://gitlab.com/group/project/-/merge_requests/42')
      expect(output).toContain('https://gitlab.com/group/project/-/merge_requests/41')
      expect(output).toContain('https://gitlab.com/group/project/-/merge_requests/40')
    })

    it('簡潔格式應包含總計訊息', () => {
      const mrs = createTestMergeRequests()
      const formatter = new CompactFormatter()
      const output = formatter.format(mrs, formatDate)

      expect(output).toContain('總計：3 個 Merge Requests')
    })

    it('簡潔格式每個 MR 應有兩行（資訊 + URL）', () => {
      const mrs = [createTestMergeRequests()[0]]
      const formatter = new CompactFormatter()
      const output = formatter.format(mrs, formatDate)

      const lines = output.split('\n')

      // 第一行：MR 資訊
      expect(lines[0]).toContain('!42')
      expect(lines[0]).toContain('[開啟中]')

      // 第二行：URL（帶縮排）
      expect(lines[1]).toMatch(/^\s+https:\/\//)
    })

    it('簡潔格式多個 MR 應用空行分隔', () => {
      const mrs = createTestMergeRequests()
      const formatter = new CompactFormatter()
      const output = formatter.format(mrs, formatDate)

      const lines = output.split('\n')

      // 檢查是否有空行分隔
      let emptyLineCount = 0
      lines.forEach(line => {
        if (line === '') emptyLineCount++
      })

      // 3 個 MR 之間應該有 2 個空行，加上總計前的空行，至少 3 個
      expect(emptyLineCount).toBeGreaterThanOrEqual(2)
    })
  })

  /**
   * T071: 測試 --format=table（預設）完整流程
   */
  describe('Table format (--format=table, default)', () => {
    it('應正確輸出表格格式', () => {
      const mrs = createTestMergeRequests()
      const formatter = new TableFormatter()
      const output = formatter.format(mrs, formatDate)

      // 應包含表格標題
      expect(output).toContain('IID')
      expect(output).toContain('標題')
      expect(output).toContain('作者')
      expect(output).toContain('狀態')
      expect(output).toContain('建立時間')

      // 應包含 MR 資料
      expect(output).toContain('42')
      expect(output).toContain('Add new feature for user management')
      expect(output).toContain('John Doe')
    })

    it('表格格式應包含正體中文狀態', () => {
      const mrs = createTestMergeRequests()
      const formatter = new TableFormatter()
      const output = formatter.format(mrs, formatDate)

      // 應包含所有狀態的正體中文
      expect(output).toContain('開啟中')
      expect(output).toContain('已合併')
      expect(output).toContain('已關閉')
    })

    it('表格格式應正確顯示所有 MR', () => {
      const mrs = createTestMergeRequests()
      const formatter = new TableFormatter()
      const output = formatter.format(mrs, formatDate)

      // 檢查所有 3 個 MR 都在輸出中
      expect(output).toContain('42')
      expect(output).toContain('41')
      expect(output).toContain('40')

      expect(output).toContain('John Doe')
      expect(output).toContain('Jane Smith')
      expect(output).toContain('Bob Chen')
    })

    it('表格格式應處理空列表', () => {
      const formatter = new TableFormatter()
      const output = formatter.format([], formatDate)

      // 空表格仍應包含標題
      expect(output).toContain('IID')
      expect(output).toContain('標題')
    })

    it('表格格式應截斷長標題', () => {
      const longTitle = 'A'.repeat(100)
      const mrs: MergeRequest[] = [{
        id: 1,
        iid: 1,
        title: longTitle,
        state: MergeRequestState.OPENED,
        author: { id: 1, name: 'Test', username: 'test' },
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceBranch: 'test',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/test/-/merge_requests/1'
      }]

      const formatter = new TableFormatter()
      const output = formatter.format(mrs, formatDate)

      // 標題應該被截斷並加上省略號（cli-table3 可能使用 … 而不是 ...）
      expect(output).toMatch(/\.{3}|…/)
      expect(output).not.toContain(longTitle)
    })
  })

  /**
   * 測試：比較三種格式的完整流程
   */
  describe('Format comparison', () => {
    it('三種格式應處理相同的 MR 資料', () => {
      const mrs = createTestMergeRequests()

      const tableFormatter = new TableFormatter()
      const jsonFormatter = new JsonFormatter()
      const compactFormatter = new CompactFormatter()

      const tableOutput = tableFormatter.format(mrs, formatDate)
      const jsonOutput = jsonFormatter.format(mrs)
      const compactOutput = compactFormatter.format(mrs, formatDate)

      // 所有格式都應該包含基本資訊
      // Table
      expect(tableOutput).toContain('42')
      expect(tableOutput).toContain('John Doe')

      // JSON
      const jsonParsed = JSON.parse(jsonOutput)
      expect(jsonParsed.mergeRequests[0].iid).toBe(42)
      expect(jsonParsed.mergeRequests[0].author.name).toBe('John Doe')

      // Compact
      expect(compactOutput).toContain('!42')
      expect(compactOutput).toContain('John Doe')
    })

    it('JSON 格式應為機器可讀，其他格式為人類可讀', () => {
      const mrs = createTestMergeRequests()

      const jsonFormatter = new JsonFormatter()
      const jsonOutput = jsonFormatter.format(mrs)

      // JSON 應該可以被解析
      expect(() => JSON.parse(jsonOutput)).not.toThrow()

      const tableFormatter = new TableFormatter()
      const tableOutput = tableFormatter.format(mrs, formatDate)

      // Table 格式包含視覺元素（邊框等）
      expect(tableOutput).toContain('│')

      const compactFormatter = new CompactFormatter()
      const compactOutput = compactFormatter.format(mrs, formatDate)

      // Compact 格式使用 ! 前綴
      expect(compactOutput).toContain('!')
    })
  })
})
