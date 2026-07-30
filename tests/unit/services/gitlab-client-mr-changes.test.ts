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
