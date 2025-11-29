import { describe, it, expect } from 'vitest'
import { ErrorFormatter } from '../../../src/utils/error-formatter.js'
import { AppError, ErrorType } from '../../../src/models/error.js'

/**
 * ErrorFormatter 單元測試
 *
 * 測試錯誤格式化器是否正確將 AppError 轉換為使用者友善的訊息
 */
describe('ErrorFormatter', () => {
  /**
   * 測試：格式化 AUTH_ERROR（FR-020 格式）
   */
  it('應正確格式化 AUTH_ERROR', () => {
    const error = new AppError(
      ErrorType.AUTH_ERROR,
      '認證失敗'
    )

    const formatted = ErrorFormatter.format(error)

    expect(formatted).toContain('Error: Authentication')
    expect(formatted).toContain('GitLab 認證失敗')
    expect(formatted).toContain('Suggestion')
    expect(formatted).toContain('GitLab Personal Access Token')
  })

  /**
   * 測試：格式化 PROJECT_NOT_FOUND（FR-020 格式）
   */
  it('應正確格式化 PROJECT_NOT_FOUND', () => {
    const error = new AppError(
      ErrorType.PROJECT_NOT_FOUND,
      '找不到專案'
    )

    const formatted = ErrorFormatter.format(error)

    expect(formatted).toContain('Error: Permission/Not Found')
    expect(formatted).toContain('找不到指定的專案')
    expect(formatted).toContain('Suggestion')
    expect(formatted).toContain('確認專案識別格式正確')
  })

  /**
   * 測試：格式化 NETWORK_ERROR（FR-020 格式）
   */
  it('應正確格式化 NETWORK_ERROR', () => {
    const error = new AppError(
      ErrorType.NETWORK_ERROR,
      '網路錯誤'
    )

    const formatted = ErrorFormatter.format(error)

    expect(formatted).toContain('Error: Network')
    expect(formatted).toContain('網路連線失敗')
    expect(formatted).toContain('Suggestion')
    expect(formatted).toContain('檢查網路連線')
  })

  /**
   * 測試：格式化 INVALID_INPUT（FR-020 格式）
   */
  it('應正確格式化 INVALID_INPUT', () => {
    const error = new AppError(
      ErrorType.INVALID_INPUT,
      '輸入錯誤'
    )

    const formatted = ErrorFormatter.format(error)

    expect(formatted).toContain('Error: Validation')
    expect(formatted).toContain('輸入格式錯誤')
    expect(formatted).toContain('Suggestion')
    expect(formatted).toContain('數字 ID')
    expect(formatted).toContain('專案路徑')
    expect(formatted).toContain('完整 URL')
  })

  /**
   * 測試：格式化 API_ERROR（FR-020 格式）
   */
  it('應正確格式化 API_ERROR', () => {
    const error = new AppError(
      ErrorType.API_ERROR,
      'API 錯誤'
    )

    const formatted = ErrorFormatter.format(error)

    expect(formatted).toContain('Error: API Error')
    expect(formatted).toContain('GitLab API 發生錯誤')
    expect(formatted).toContain('Suggestion')
  })

  /**
   * 測試：--verbose 模式顯示技術細節（FR-020）
   */
  it('應在 verbose 模式顯示技術細節', () => {
    const originalError = new Error('401 Unauthorized')
    const error = new AppError(
      ErrorType.AUTH_ERROR,
      '認證失敗',
      originalError
    )

    const formatted = ErrorFormatter.format(error, true)

    expect(formatted).toContain('Technical Details (--verbose)')
    expect(formatted).toContain('Error Type: AUTH_ERROR')
    expect(formatted).toContain('Original Message: 401 Unauthorized')
  })

  /**
   * 測試：非 verbose 模式不顯示技術細節
   */
  it('應在非 verbose 模式隱藏技術細節', () => {
    const originalError = new Error('401 Unauthorized')
    const error = new AppError(
      ErrorType.AUTH_ERROR,
      '認證失敗',
      originalError
    )

    const formatted = ErrorFormatter.format(error, false)

    expect(formatted).not.toContain('Technical Details')
    expect(formatted).not.toContain('Error Type')
    expect(formatted).not.toContain('Original Message')
  })

  /**
   * 測試：getMessage 返回簡短訊息
   */
  it('getMessage 應返回簡短錯誤訊息', () => {
    const error = new AppError(
      ErrorType.AUTH_ERROR,
      '認證失敗'
    )

    const message = ErrorFormatter.getMessage(error)

    expect(message).toBe('GitLab 認證失敗：Token 無效或已過期')
    expect(message).not.toContain('Suggestion')
    expect(message).not.toContain('Error:')
  })

  /**
   * 測試：getSuggestedActions 返回建議動作列表
   */
  it('getSuggestedActions 應返回建議動作陣列', () => {
    const error = new AppError(
      ErrorType.AUTH_ERROR,
      '認證失敗'
    )

    const actions = ErrorFormatter.getSuggestedActions(error)

    expect(actions).toBeInstanceOf(Array)
    expect(actions.length).toBeGreaterThan(0)
    expect(actions[0]).toContain('GitLab Personal Access Token')
  })

  /**
   * 測試：所有錯誤類型都有對應的訊息
   */
  it('應為所有錯誤類型提供訊息', () => {
    const errorTypes = [
      ErrorType.AUTH_ERROR,
      ErrorType.PROJECT_NOT_FOUND,
      ErrorType.NETWORK_ERROR,
      ErrorType.INVALID_INPUT,
      ErrorType.API_ERROR
    ]

    errorTypes.forEach(type => {
      const error = new AppError(type, '測試錯誤')
      const message = ErrorFormatter.getMessage(error)
      expect(message).toBeTruthy()
      expect(message.length).toBeGreaterThan(0)
    })
  })

  /**
   * 測試：所有錯誤類型都有建議動作
   */
  it('應為所有錯誤類型提供建議動作', () => {
    const errorTypes = [
      ErrorType.AUTH_ERROR,
      ErrorType.PROJECT_NOT_FOUND,
      ErrorType.NETWORK_ERROR,
      ErrorType.INVALID_INPUT,
      ErrorType.API_ERROR
    ]

    errorTypes.forEach(type => {
      const error = new AppError(type, '測試錯誤')
      const actions = ErrorFormatter.getSuggestedActions(error)
      expect(actions).toBeInstanceOf(Array)
      expect(actions.length).toBeGreaterThan(0)
    })
  })

  /**
   * 測試：格式化輸出包含所有必要部分（FR-020 格式）
   */
  it('format 應包含錯誤訊息和建議動作', () => {
    const error = new AppError(
      ErrorType.PROJECT_NOT_FOUND,
      '找不到專案'
    )

    const formatted = ErrorFormatter.format(error)

    // 應包含錯誤標籤（FR-020 格式）
    expect(formatted).toContain('Error: Permission/Not Found')
    // 應包含建議動作標籤
    expect(formatted).toContain('Suggestion')
    // 應包含具體的建議
    expect(formatted).toContain('確認專案識別格式正確')
  })

  /**
   * 測試：正體中文訊息
   */
  it('所有錯誤訊息應使用正體中文', () => {
    const errorTypes = [
      ErrorType.AUTH_ERROR,
      ErrorType.PROJECT_NOT_FOUND,
      ErrorType.NETWORK_ERROR,
      ErrorType.INVALID_INPUT,
      ErrorType.API_ERROR
    ]

    errorTypes.forEach(type => {
      const error = new AppError(type, '測試錯誤')
      const formatted = ErrorFormatter.format(error)

      // 檢查是否包含中文字元
      expect(/[\u4e00-\u9fa5]/.test(formatted)).toBe(true)
      // 不應包含簡體中文特有詞彙
      expect(formatted).not.toContain('网络')
      expect(formatted).not.toContain('认证')
      expect(formatted).not.toContain('错误')
    })
  })
})
