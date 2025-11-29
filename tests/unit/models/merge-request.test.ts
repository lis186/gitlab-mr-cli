import { describe, it, expect } from 'vitest'
import { fromGitLabAPI, MergeRequestState } from '../../../src/models/merge-request.js'

/**
 * MergeRequest 模型單元測試
 *
 * 測試 fromGitLabAPI 轉換函數是否正確將 GitLab API 回應轉換為應用程式模型
 */
describe('MergeRequest.fromGitLabAPI', () => {
  /**
   * 測試：正確轉換 opened 狀態的 MR
   */
  it('應正確轉換 opened 狀態的 MR', () => {
    const apiResponse = {
      iid: 123,
      title: '新增使用者認證功能',
      state: 'opened',
      created_at: '2024-01-15T10:30:00Z',
      author: {
        id: 1,
        name: '張小明',
        username: 'zhangxiaoming'
      }
    }

    const result = fromGitLabAPI(apiResponse)

    expect(result.iid).toBe(123)
    expect(result.title).toBe('新增使用者認證功能')
    expect(result.state).toBe(MergeRequestState.OPENED)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt.toISOString()).toBe('2024-01-15T10:30:00.000Z')
    expect(result.author.id).toBe(1)
    expect(result.author.name).toBe('張小明')
    expect(result.author.username).toBe('zhangxiaoming')
  })

  /**
   * 測試：正確轉換 merged 狀態的 MR
   */
  it('應正確轉換 merged 狀態的 MR', () => {
    const apiResponse = {
      iid: 456,
      title: '修正登入錯誤',
      state: 'merged',
      created_at: '2024-02-20T14:45:30Z',
      author: {
        id: 2,
        name: '李小華',
        username: 'lixiaohua'
      }
    }

    const result = fromGitLabAPI(apiResponse)

    expect(result.state).toBe(MergeRequestState.MERGED)
    expect(result.iid).toBe(456)
    expect(result.title).toBe('修正登入錯誤')
  })

  /**
   * 測試：正確轉換 closed 狀態的 MR
   */
  it('應正確轉換 closed 狀態的 MR', () => {
    const apiResponse = {
      iid: 789,
      title: '重構資料庫查詢',
      state: 'closed',
      created_at: '2024-03-10T09:15:00Z',
      author: {
        id: 3,
        name: '王大明',
        username: 'wangdaming'
      }
    }

    const result = fromGitLabAPI(apiResponse)

    expect(result.state).toBe(MergeRequestState.CLOSED)
    expect(result.iid).toBe(789)
  })

  /**
   * 測試：正確處理包含特殊字元的標題
   */
  it('應正確處理包含特殊字元的標題', () => {
    const apiResponse = {
      iid: 100,
      title: 'Fix: API 回應格式 & 錯誤處理 (urgent)',
      state: 'opened',
      created_at: '2024-01-15T10:30:00Z',
      author: {
        id: 1,
        name: 'Test User',
        username: 'test'
      }
    }

    const result = fromGitLabAPI(apiResponse)

    expect(result.title).toBe('Fix: API 回應格式 & 錯誤處理 (urgent)')
  })

  /**
   * 測試：正確轉換日期時間
   */
  it('應正確將 ISO 8601 字串轉換為 Date 物件', () => {
    const apiResponse = {
      iid: 1,
      title: 'Test',
      state: 'opened',
      created_at: '2024-06-30T23:59:59Z',
      author: {
        id: 1,
        name: 'Test',
        username: 'test'
      }
    }

    const result = fromGitLabAPI(apiResponse)

    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt.getUTCFullYear()).toBe(2024)
    expect(result.createdAt.getUTCMonth()).toBe(5) // 月份從 0 開始
    expect(result.createdAt.getUTCDate()).toBe(30)
    expect(result.createdAt.getUTCHours()).toBe(23)
    expect(result.createdAt.getUTCMinutes()).toBe(59)
    expect(result.createdAt.getUTCSeconds()).toBe(59)
  })
})
