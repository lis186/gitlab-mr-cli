import { describe, it, expect } from 'vitest'
import { parseProjectIdentifier } from '../../../src/utils/project-parser.js'

/**
 * parseProjectIdentifier 單元測試
 *
 * 測試專案識別字解析功能是否正確處理各種輸入格式
 */
describe('parseProjectIdentifier', () => {
  /**
   * 測試：解析數字 ID
   */
  it('應正確解析數字專案 ID', () => {
    const result = parseProjectIdentifier('12345')

    expect(result.identifier).toBe('12345')
    expect(result.host).toBeUndefined()
  })

  /**
   * 測試：解析命名空間/專案路徑
   */
  it('應正確解析 namespace/project 格式', () => {
    const result = parseProjectIdentifier('gitlab-org/gitlab')

    expect(result.identifier).toBe('gitlab-org/gitlab')
    expect(result.host).toBeUndefined()
  })

  /**
   * 測試：解析完整 GitLab.com URL
   */
  it('應正確解析 GitLab.com 完整 URL', () => {
    const result = parseProjectIdentifier('https://gitlab.com/foo/bar')

    expect(result.identifier).toBe('foo/bar')
    expect(result.host).toBe('https://gitlab.com')
  })

  /**
   * 測試：解析自架 GitLab URL
   */
  it('應正確解析自架 GitLab 伺服器 URL', () => {
    const result = parseProjectIdentifier('https://gitlab.example.com/team/project')

    expect(result.identifier).toBe('team/project')
    expect(result.host).toBe('https://gitlab.example.com')
  })

  /**
   * 測試：解析帶有子群組的專案路徑
   */
  it('應正確解析多層子群組路徑', () => {
    const result = parseProjectIdentifier('group/subgroup/subsubgroup/project')

    expect(result.identifier).toBe('group/subgroup/subsubgroup/project')
    expect(result.host).toBeUndefined()
  })

  /**
   * 測試：解析帶有子群組的 URL
   */
  it('應正確解析包含子群組的完整 URL', () => {
    const result = parseProjectIdentifier('https://gitlab.com/org/team/subteam/repo')

    expect(result.identifier).toBe('org/team/subteam/repo')
    expect(result.host).toBe('https://gitlab.com')
  })

  /**
   * 測試：解析帶有連字號和底線的專案名稱
   */
  it('應正確處理包含連字號和底線的專案名稱', () => {
    const result1 = parseProjectIdentifier('my-org/my-project')
    expect(result1.identifier).toBe('my-org/my-project')

    const result2 = parseProjectIdentifier('my_org/my_project')
    expect(result2.identifier).toBe('my_org/my_project')

    const result3 = parseProjectIdentifier('my-org_123/my_project-456')
    expect(result3.identifier).toBe('my-org_123/my_project-456')
  })

  /**
   * 測試：解析 HTTP URL（應自動升級為 HTTPS）
   */
  it('應正確處理 HTTP URL', () => {
    const result = parseProjectIdentifier('http://gitlab.com/foo/bar')

    expect(result.identifier).toBe('foo/bar')
    expect(result.host).toBe('http://gitlab.com')
  })

  /**
   * 測試：解析帶有 .git 後綴的 URL
   */
  it('應正確處理帶有 .git 後綴的 URL', () => {
    const result = parseProjectIdentifier('https://gitlab.com/foo/bar.git')

    expect(result.identifier).toBe('foo/bar')
    expect(result.host).toBe('https://gitlab.com')
  })

  /**
   * 測試：解析純數字 ID（字串格式）
   */
  it('應將純數字 ID 視為專案 ID', () => {
    const result = parseProjectIdentifier('999999')

    expect(result.identifier).toBe('999999')
    expect(result.host).toBeUndefined()
  })

  /**
   * 測試：解析帶有 port 的自架 GitLab URL
   */
  it('應正確處理帶有 port 的 URL', () => {
    const result = parseProjectIdentifier('https://gitlab.example.com:8080/team/project')

    expect(result.identifier).toBe('team/project')
    expect(result.host).toBe('https://gitlab.example.com:8080')
  })
})
