import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitLabClient } from '../../../src/services/gitlab-client.js'

/**
 * getMergeRequestChanges 行數計算測試
 *
 * 迴歸保護：這個方法曾經誤把 GitLab 的 changes_count 當成 "+50 -20" 格式的行數解析。
 * changes_count 實際是「變更檔案數」，導致 additions 存的是檔案數、deletions 恆為 0，
 * 回報的行數會比真實值低一到兩個數量級。
 * 現在一律從實際 diff 計算。
 */
describe('GitLabClient.getMergeRequestChanges', () => {
  let client: GitLabClient

  beforeEach(() => {
    client = new GitLabClient({
      identifier: 'group/project',
      host: 'https://gitlab.example.com',
      token: 'test-token',
    })
  })

  it('應從 diff 計算新增與刪除行數', async () => {
    vi.spyOn(client, 'getMergeRequestDiffs').mockResolvedValue([
      {
        diff: '@@ -1,3 +1,4 @@\n context\n-removed line\n+added one\n+added two\n',
      },
    ])

    const result = await client.getMergeRequestChanges(1)

    expect(result).toEqual({ additions: 2, deletions: 1 })
  })

  it('應累加多個檔案的 diff', async () => {
    vi.spyOn(client, 'getMergeRequestDiffs').mockResolvedValue([
      { diff: '@@ -1 +1,2 @@\n+first\n+second\n' },
      { diff: '@@ -1,2 +1 @@\n-gone\n' },
    ])

    const result = await client.getMergeRequestChanges(2)

    expect(result).toEqual({ additions: 2, deletions: 1 })
  })

  it('不得把 diff 的檔案標記行（+++/---）算成變更', async () => {
    vi.spyOn(client, 'getMergeRequestDiffs').mockResolvedValue([
      {
        diff: '--- a/file.swift\n+++ b/file.swift\n@@ -1 +1 @@\n-old\n+new\n',
      },
    ])

    const result = await client.getMergeRequestChanges(3)

    expect(result).toEqual({ additions: 1, deletions: 1 })
  })

  it('MR 無變更時應回 0', async () => {
    vi.spyOn(client, 'getMergeRequestDiffs').mockResolvedValue([])

    const result = await client.getMergeRequestChanges(4)

    expect(result).toEqual({ additions: 0, deletions: 0 })
  })

  it('diff 被標記為 collapsed 時應拋錯而非少算行數', async () => {
    // GitLab 對過大的 patch 會回 collapsed: true 且 diff 為空字串。
    // 靜默當成 0 行會產生看起來合理的錯數字，所以要明確失敗。
    vi.spyOn(client, 'getMergeRequestDiffs').mockResolvedValue([
      { diff: '@@ -1 +1,2 @@\n+kept\n' },
      { diff: '', collapsed: true },
    ])

    await expect(client.getMergeRequestChanges(6)).rejects.toThrow(/截斷/)
  })

  it('diff 被標記為 too_large 時應拋錯', async () => {
    vi.spyOn(client, 'getMergeRequestDiffs').mockResolvedValue([
      { diff: '', too_large: true },
    ])

    await expect(client.getMergeRequestChanges(7)).rejects.toThrow(/截斷/)
  })

  it('diff 為空但沒有截斷旗標時不得拋錯（二進位檔的合法情形）', async () => {
    // 二進位檔（圖片、字型）的 diff 合法地是空字串，
    // 判斷依據必須是旗標而不是「diff 是不是空的」。
    vi.spyOn(client, 'getMergeRequestDiffs').mockResolvedValue([
      { diff: '' },
      { diff: '@@ -1 +1 @@\n+text change\n' },
    ])

    const result = await client.getMergeRequestChanges(8)

    expect(result).toEqual({ additions: 1, deletions: 0 })
  })

  it('應走 diff 路徑，不得依賴 changes_count', async () => {
    // changes_count 是檔案數，不帶行數資訊；即使它是 "20+"，
    // 行數也只能來自 diff。這裡以「有呼叫 diffs」證明資料來源正確。
    const diffsSpy = vi
      .spyOn(client, 'getMergeRequestDiffs')
      .mockResolvedValue([{ diff: '@@ -1 +1 @@\n+only line\n' }])

    const result = await client.getMergeRequestChanges(5)

    expect(diffsSpy).toHaveBeenCalledWith(5, undefined)
    expect(result.additions).toBe(1)
  })
})
