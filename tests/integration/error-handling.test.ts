import { describe, it, expect } from 'vitest'
import { GitLabClient } from '../../src/services/gitlab-client.js'
import { parseProjectIdentifier } from '../../src/utils/project-parser.js'
import { AppError, ErrorType } from '../../src/models/error.js'

/**
 * 錯誤處理整合測試
 *
 * 測試各種錯誤場景的端對端處理
 */
describe('Error Handling Integration', () => {
  /**
   * T055: INVALID_INPUT - 無效的專案識別
   */
  describe('INVALID_INPUT scenarios', () => {
    it('應在空白專案識別時拋出 INVALID_INPUT 錯誤', () => {
      expect(() => {
        parseProjectIdentifier('')
      }).toThrow(AppError)

      try {
        parseProjectIdentifier('')
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect((error as AppError).type).toBe(ErrorType.INVALID_INPUT)
        expect((error as AppError).message).toContain('不可為空')
      }
    })

    it('應在純空格專案識別時拋出 INVALID_INPUT 錯誤', () => {
      expect(() => {
        parseProjectIdentifier('   ')
      }).toThrow(AppError)

      try {
        parseProjectIdentifier('   ')
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect((error as AppError).type).toBe(ErrorType.INVALID_INPUT)
      }
    })

    it('應在無效格式時拋出 INVALID_INPUT 錯誤', () => {
      const invalidInputs = [
        'invalid',
        'no-slash',
        'too/many/slashes/here/invalid',
      ]

      // 注意：'too/many/slashes/here/invalid' 實際上是有效的（支援多層子群組）
      // 所以我們只測試真正無效的格式
      const trulyInvalid = ['invalid', 'no-slash']

      trulyInvalid.forEach(input => {
        try {
          parseProjectIdentifier(input)
          // 如果沒拋錯，測試失敗
          expect.fail(`應該拋出錯誤: ${input}`)
        } catch (error) {
          expect(error).toBeInstanceOf(AppError)
          expect((error as AppError).type).toBe(ErrorType.INVALID_INPUT)
          expect((error as AppError).message).toContain(input)
        }
      })
    })
  })

  /**
   * T052: AUTH_ERROR - 認證失敗
   *
   * 注意：這個測試需要實際連接 GitLab API
   * 使用無效 token 來觸發 401 錯誤
   */
  describe('AUTH_ERROR scenarios', () => {
    it('應在無效 token 時拋出 AUTH_ERROR', async () => {
      const client = new GitLabClient({
        identifier: 'test/project',
        host: 'https://gitlab.com',
        token: 'invalid-token-12345'
      })

      try {
        await client.getMergeRequests(5)
        // 如果沒拋錯，測試失敗
        expect.fail('應該拋出 AUTH_ERROR')
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect((error as AppError).type).toBe(ErrorType.AUTH_ERROR)
        expect((error as AppError).message).toContain('認證')
      }
    }, 10000) // 10 秒超時
  })

  /**
   * T053: PROJECT_NOT_FOUND - 專案不存在或無權限
   *
   * 注意：這個測試需要實際連接 GitLab API
   * 使用不存在的專案來觸發 404 錯誤
   */
  describe('PROJECT_NOT_FOUND scenarios', () => {
    it('應在專案不存在時拋出 PROJECT_NOT_FOUND', async () => {
      // 使用一個幾乎不可能存在的專案名稱
      const client = new GitLabClient({
        identifier: 'non-existent-namespace-99999/non-existent-project-99999',
        host: 'https://gitlab.com',
        token: 'any-token-will-do-for-404'
      })

      try {
        await client.getMergeRequests(5)
        // 如果沒拋錯，測試失敗（可能是網路問題或其他錯誤）
        expect.fail('應該拋出 PROJECT_NOT_FOUND 或 AUTH_ERROR')
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        // 可能是 404 (PROJECT_NOT_FOUND) 或 401 (AUTH_ERROR)
        // 兩者都是預期的
        expect([ErrorType.PROJECT_NOT_FOUND, ErrorType.AUTH_ERROR]).toContain(
          (error as AppError).type
        )
      }
    }, 10000) // 10 秒超時
  })

  /**
   * T054: NETWORK_ERROR - 網路連線錯誤
   *
   * 測試網路錯誤檢測邏輯
   */
  describe('NETWORK_ERROR scenarios', () => {
    it('應能識別網路錯誤訊息', async () => {
      // 使用無效的主機名稱
      const client = new GitLabClient({
        identifier: 'test/project',
        host: 'https://this-domain-does-not-exist-12345.invalid',
        token: 'any-token'
      })

      try {
        await client.getMergeRequests(5)
        expect.fail('應該拋出 NETWORK_ERROR')
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        // 應該是網路錯誤或 API 錯誤
        expect([ErrorType.NETWORK_ERROR, ErrorType.API_ERROR]).toContain(
          (error as AppError).type
        )
      }
    }, 15000) // 15 秒超時（DNS 查詢可能需要較長時間）
  })

  /**
   * T056: 驗證所有錯誤訊息使用正體中文
   */
  describe('Traditional Chinese error messages', () => {
    it('INVALID_INPUT 錯誤訊息應為正體中文', () => {
      try {
        parseProjectIdentifier('invalid')
      } catch (error) {
        const message = (error as AppError).message
        // 應包含中文字元
        expect(/[\u4e00-\u9fa5]/.test(message)).toBe(true)
        // 應使用正體中文
        expect(message).toContain('無效')
        // 不應使用簡體中文
        expect(message).not.toContain('无效')
      }
    })

    it('AUTH_ERROR 錯誤類型名稱應正確', async () => {
      const client = new GitLabClient({
        identifier: 'test/project',
        host: 'https://gitlab.com',
        token: 'invalid-token'
      })

      try {
        await client.getMergeRequests(5)
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        const appError = error as AppError
        expect(appError.type).toBe(ErrorType.AUTH_ERROR)
        expect(appError.message).toContain('認證')
      }
    }, 10000)
  })

  /**
   * 測試：錯誤保留原始錯誤資訊
   */
  describe('Error wrapping', () => {
    it('AppError 應保留原始錯誤資訊', async () => {
      const client = new GitLabClient({
        identifier: 'test/project',
        host: 'https://gitlab.com',
        token: 'invalid-token'
      })

      try {
        await client.getMergeRequests(5)
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        const appError = error as AppError
        expect(appError.originalError).toBeDefined()
        expect(appError.originalError).toBeInstanceOf(Error)
      }
    }, 10000)
  })

  /**
   * 測試：專案識別解析的邊界情況
   */
  describe('Project identifier edge cases', () => {
    it('應正確處理帶空格的輸入', () => {
      const result = parseProjectIdentifier('  gitlab-org/gitlab  ')
      expect(result.identifier).toBe('gitlab-org/gitlab')
    })

    it('應正確處理數字 ID', () => {
      const result = parseProjectIdentifier('12345')
      expect(result.identifier).toBe('12345')
    })

    it('應正確處理帶空格的數字 ID', () => {
      const result = parseProjectIdentifier('  12345  ')
      expect(result.identifier).toBe('12345')
    })
  })
})
