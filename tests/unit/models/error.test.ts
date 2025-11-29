import { describe, it, expect } from 'vitest'
import { AppError, ErrorType } from '../../../src/models/error.js'

/**
 * AppError 單元測試
 *
 * 測試應用程式錯誤模型的基本功能
 */
describe('AppError', () => {
  /**
   * 測試：建立基本 AppError
   */
  it('應正確建立 AppError 實例', () => {
    const error = new AppError(
      ErrorType.AUTH_ERROR,
      '認證失敗'
    )

    expect(error).toBeInstanceOf(AppError)
    expect(error).toBeInstanceOf(Error)
    expect(error.type).toBe(ErrorType.AUTH_ERROR)
    expect(error.message).toBe('認證失敗')
    expect(error.name).toBe('AppError')
  })

  /**
   * 測試：包含原始錯誤
   */
  it('應正確儲存原始錯誤', () => {
    const originalError = new Error('Original error message')
    const error = new AppError(
      ErrorType.NETWORK_ERROR,
      '網路錯誤',
      originalError
    )

    expect(error.originalError).toBe(originalError)
    expect(error.originalError?.message).toBe('Original error message')
  })

  /**
   * 測試：不包含原始錯誤
   */
  it('原始錯誤應為可選參數', () => {
    const error = new AppError(
      ErrorType.INVALID_INPUT,
      '輸入錯誤'
    )

    expect(error.originalError).toBeUndefined()
  })

  /**
   * 測試：支援所有錯誤類型
   */
  it('應支援所有定義的錯誤類型', () => {
    const errorTypes = [
      ErrorType.AUTH_ERROR,
      ErrorType.PROJECT_NOT_FOUND,
      ErrorType.NETWORK_ERROR,
      ErrorType.INVALID_INPUT,
      ErrorType.API_ERROR
    ]

    errorTypes.forEach(type => {
      const error = new AppError(type, '測試錯誤')
      expect(error.type).toBe(type)
    })
  })

  /**
   * 測試：錯誤訊息可存取
   */
  it('錯誤訊息應可透過 message 屬性存取', () => {
    const message = '這是一個測試錯誤訊息'
    const error = new AppError(
      ErrorType.API_ERROR,
      message
    )

    expect(error.message).toBe(message)
  })

  /**
   * 測試：錯誤類型可存取
   */
  it('錯誤類型應可透過 type 屬性存取', () => {
    const error = new AppError(
      ErrorType.PROJECT_NOT_FOUND,
      '專案不存在'
    )

    expect(error.type).toBe(ErrorType.PROJECT_NOT_FOUND)
  })

  /**
   * 測試：可以用於 instanceof 檢查
   */
  it('應可使用 instanceof 檢查', () => {
    const error = new AppError(
      ErrorType.AUTH_ERROR,
      '認證失敗'
    )

    expect(error instanceof AppError).toBe(true)
    expect(error instanceof Error).toBe(true)
  })

  /**
   * 測試：可以在 try-catch 中捕獲
   */
  it('應可在 try-catch 中正確捕獲', () => {
    expect(() => {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        '測試錯誤'
      )
    }).toThrow(AppError)

    expect(() => {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        '測試錯誤'
      )
    }).toThrow('測試錯誤')
  })

  /**
   * 測試：錯誤堆疊可用
   */
  it('應包含錯誤堆疊資訊', () => {
    const error = new AppError(
      ErrorType.API_ERROR,
      'API 錯誤'
    )

    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('AppError')
  })

  /**
   * 測試：可以包裝其他類型的錯誤
   */
  it('應可包裝標準 Error', () => {
    const standardError = new Error('Standard error')
    const appError = new AppError(
      ErrorType.API_ERROR,
      'Wrapped error',
      standardError
    )

    expect(appError.originalError).toBe(standardError)
    expect(appError.originalError?.message).toBe('Standard error')
  })

  /**
   * 測試：ErrorType 列舉值
   */
  it('ErrorType 應包含所有必要的錯誤類型', () => {
    expect(ErrorType.AUTH_ERROR).toBe('AUTH_ERROR')
    expect(ErrorType.PROJECT_NOT_FOUND).toBe('PROJECT_NOT_FOUND')
    expect(ErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR')
    expect(ErrorType.INVALID_INPUT).toBe('INVALID_INPUT')
    expect(ErrorType.API_ERROR).toBe('API_ERROR')
  })

  /**
   * 測試：name 屬性正確設定
   */
  it('name 屬性應為 AppError', () => {
    const error = new AppError(
      ErrorType.AUTH_ERROR,
      '測試'
    )

    expect(error.name).toBe('AppError')
  })
})
