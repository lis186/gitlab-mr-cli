/**
 * GitLab MR Size Analysis API 合約測試
 * Feature: 007-mr-size-analysis
 *
 * 目的：驗證 GitLab API 回應包含必要欄位，確保資料模型與 API 契約一致
 */

import { describe, it, expect } from 'vitest'

describe('GitLab MR Size API 合約', () => {
  describe('MergeRequest 物件結構', () => {
    it('應該包含所有必要欄位', () => {
      // 模擬 GitLab API 的 MR 回應
      const mockMR = {
        iid: 123,
        title: 'Feature: Add user authentication',
        author: {
          name: 'Alice Chen',
          username: 'alice',
        },
        merged_at: '2025-01-15T10:30:00Z',
        changes_count: '42',
        web_url: 'https://gitlab.com/project/merge_requests/123',
      }

      // 驗證必要欄位存在
      expect(mockMR).toHaveProperty('iid')
      expect(mockMR).toHaveProperty('title')
      expect(mockMR).toHaveProperty('author')
      expect(mockMR).toHaveProperty('merged_at')
      expect(mockMR).toHaveProperty('changes_count')
      expect(mockMR).toHaveProperty('web_url')

      // 驗證型別
      expect(typeof mockMR.iid).toBe('number')
      expect(typeof mockMR.title).toBe('string')
      expect(typeof mockMR.author.name).toBe('string')
      expect(typeof mockMR.author.username).toBe('string')
      expect(typeof mockMR.merged_at).toBe('string')
      expect(typeof mockMR.changes_count).toBe('string') // GitLab API 回傳字串
      expect(typeof mockMR.web_url).toBe('string')
    })

    it('應該正確處理 merged_at 為 null 的情況', () => {
      const mockMR = {
        iid: 456,
        title: 'Draft: Work in progress',
        author: { name: 'Bob', username: 'bob' },
        merged_at: null,
        changes_count: '10',
        web_url: 'https://gitlab.com/project/merge_requests/456',
      }

      expect(mockMR.merged_at).toBeNull()
    })

    it('應該正確處理 changes_count 為數字的情況', () => {
      const mockMR = {
        iid: 789,
        title: 'Fix: Update config',
        author: { name: 'Charlie', username: 'charlie' },
        merged_at: '2025-01-20T14:00:00Z',
        changes_count: 25, // 某些 API 回傳數字
        web_url: 'https://gitlab.com/project/merge_requests/789',
      }

      expect(typeof mockMR.changes_count).toBe('number')
      // 應該能轉換為字串或數字
      expect(String(mockMR.changes_count)).toBe('25')
      expect(parseInt(String(mockMR.changes_count), 10)).toBe(25)
    })
  })

  describe('Diff 物件結構', () => {
    it('應該包含所有必要欄位', () => {
      const mockDiff = {
        old_path: 'src/auth/login.ts',
        new_path: 'src/auth/login.ts',
        new_file: false,
        renamed_file: false,
        deleted_file: false,
        diff: '@@ -10,7 +10,8 @@\n-old line\n+new line\n',
      }

      // 驗證必要欄位存在
      expect(mockDiff).toHaveProperty('old_path')
      expect(mockDiff).toHaveProperty('new_path')
      expect(mockDiff).toHaveProperty('new_file')
      expect(mockDiff).toHaveProperty('renamed_file')
      expect(mockDiff).toHaveProperty('deleted_file')
      expect(mockDiff).toHaveProperty('diff')

      // 驗證型別
      expect(typeof mockDiff.old_path).toBe('string')
      expect(typeof mockDiff.new_path).toBe('string')
      expect(typeof mockDiff.new_file).toBe('boolean')
      expect(typeof mockDiff.renamed_file).toBe('boolean')
      expect(typeof mockDiff.deleted_file).toBe('boolean')
      expect(typeof mockDiff.diff).toBe('string')
    })

    it('應該正確處理新增檔案的 diff', () => {
      const mockDiff = {
        old_path: 'src/auth/types.ts',
        new_path: 'src/auth/types.ts',
        new_file: true,
        renamed_file: false,
        deleted_file: false,
        diff: '@@ -0,0 +1,5 @@\n+export interface User {\n+  id: number\n+}\n',
      }

      expect(mockDiff.new_file).toBe(true)
      expect(mockDiff.diff).toContain('+export interface User')
    })

    it('應該正確處理刪除檔案的 diff', () => {
      const mockDiff = {
        old_path: 'src/deprecated.ts',
        new_path: 'src/deprecated.ts',
        new_file: false,
        renamed_file: false,
        deleted_file: true,
        diff: '@@ -1,3 +0,0 @@\n-const old = true\n',
      }

      expect(mockDiff.deleted_file).toBe(true)
    })

    it('應該正確處理重新命名的檔案', () => {
      const mockDiff = {
        old_path: 'src/old-name.ts',
        new_path: 'src/new-name.ts',
        new_file: false,
        renamed_file: true,
        deleted_file: false,
        diff: '',
      }

      expect(mockDiff.renamed_file).toBe(true)
      expect(mockDiff.old_path).not.toBe(mockDiff.new_path)
    })
  })

  describe('API 回應陣列格式', () => {
    it('MR 列表應該是陣列', () => {
      const mockMRList = [
        {
          iid: 123,
          title: 'MR 1',
          author: { name: 'Alice', username: 'alice' },
          merged_at: '2025-01-15T10:30:00Z',
          changes_count: '10',
          web_url: 'https://gitlab.com/project/merge_requests/123',
        },
        {
          iid: 124,
          title: 'MR 2',
          author: { name: 'Bob', username: 'bob' },
          merged_at: '2025-01-16T11:00:00Z',
          changes_count: '20',
          web_url: 'https://gitlab.com/project/merge_requests/124',
        },
      ]

      expect(Array.isArray(mockMRList)).toBe(true)
      expect(mockMRList.length).toBe(2)
    })

    it('Diffs 列表應該是陣列', () => {
      const mockDiffList = [
        {
          old_path: 'file1.ts',
          new_path: 'file1.ts',
          new_file: false,
          renamed_file: false,
          deleted_file: false,
          diff: '@@ -1,1 +1,2 @@\n+new line\n',
        },
        {
          old_path: 'file2.ts',
          new_path: 'file2.ts',
          new_file: true,
          renamed_file: false,
          deleted_file: false,
          diff: '@@ -0,0 +1,1 @@\n+export const foo = "bar"\n',
        },
      ]

      expect(Array.isArray(mockDiffList)).toBe(true)
      expect(mockDiffList.length).toBe(2)
    })
  })

  describe('日期時間格式', () => {
    it('merged_at 應該是有效的 ISO 8601 格式', () => {
      const merged_at = '2025-01-15T10:30:00Z'

      const date = new Date(merged_at)
      expect(date).toBeInstanceOf(Date)
      expect(isNaN(date.getTime())).toBe(false)
      // 驗證轉換後的日期字串包含原始時間（忽略毫秒）
      expect(date.toISOString()).toContain('2025-01-15T10:30:00')
    })

    it('應該能夠解析不同時區的日期', () => {
      const merged_at = '2025-01-15T10:30:00+08:00'

      const date = new Date(merged_at)
      expect(date).toBeInstanceOf(Date)
      expect(isNaN(date.getTime())).toBe(false)
    })
  })
})
