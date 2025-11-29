import { describe, it, expect } from 'vitest'
import { formatDate } from '../../../src/utils/formatters.js'

/**
 * formatDate 單元測試
 *
 * 測試日期格式化函數是否正確將 Date 物件轉換為 YYYY-MM-DD HH:mm 格式
 */
describe('formatDate', () => {
  /**
   * 測試：格式化標準日期時間
   */
  it('應將 Date 物件格式化為 YYYY-MM-DD HH:mm 格式', () => {
    const date = new Date('2024-01-15T10:30:00Z')
    const result = formatDate(date)

    // 注意：由於時區差異，實際輸出可能不同
    // 這裡測試格式是否正確（包含年月日時分）
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  /**
   * 測試：正確補零單位數的月份
   */
  it('應正確補零單位數的月份', () => {
    // 2024年1月（單位數月份）
    const date = new Date(2024, 0, 15, 10, 30) // 月份從 0 開始
    const result = formatDate(date)

    expect(result).toContain('2024-01-')
  })

  /**
   * 測試：正確補零單位數的日期
   */
  it('應正確補零單位數的日期', () => {
    // 5 號（單位數日期）
    const date = new Date(2024, 5, 5, 10, 30)
    const result = formatDate(date)

    expect(result).toContain('-05 ')
  })

  /**
   * 測試：正確補零單位數的小時
   */
  it('應正確補零單位數的小時', () => {
    // 上午 9 點（單位數小時）
    const date = new Date(2024, 0, 15, 9, 30)
    const result = formatDate(date)

    expect(result).toContain(' 09:')
  })

  /**
   * 測試：正確補零單位數的分鐘
   */
  it('應正確補零單位數的分鐘', () => {
    // 5 分（單位數分鐘）
    const date = new Date(2024, 0, 15, 10, 5)
    const result = formatDate(date)

    expect(result).toContain(':05')
  })

  /**
   * 測試：處理午夜時間
   */
  it('應正確處理午夜時間', () => {
    const date = new Date(2024, 0, 1, 0, 0)
    const result = formatDate(date)

    expect(result).toContain(' 00:00')
  })

  /**
   * 測試：處理接近午夜的時間
   */
  it('應正確處理接近午夜的時間', () => {
    const date = new Date(2024, 0, 1, 23, 59)
    const result = formatDate(date)

    expect(result).toContain(' 23:59')
  })

  /**
   * 測試：處理年初日期
   */
  it('應正確處理年初日期', () => {
    const date = new Date(2024, 0, 1, 12, 0)
    const result = formatDate(date)

    expect(result).toContain('2024-01-01')
  })

  /**
   * 測試：處理年末日期
   */
  it('應正確處理年末日期', () => {
    const date = new Date(2024, 11, 31, 12, 0) // 12 月是 11
    const result = formatDate(date)

    expect(result).toContain('2024-12-31')
  })

  /**
   * 測試：處理閏年 2 月 29 日
   */
  it('應正確處理閏年 2 月 29 日', () => {
    const date = new Date(2024, 1, 29, 12, 0) // 2024 是閏年
    const result = formatDate(date)

    expect(result).toContain('2024-02-29')
  })

  /**
   * 測試：格式一致性
   */
  it('所有日期應保持相同格式長度', () => {
    const dates = [
      new Date(2024, 0, 1, 0, 0),    // 最小值
      new Date(2024, 11, 31, 23, 59), // 最大值
      new Date(2024, 5, 15, 12, 30),  // 中間值
    ]

    const results = dates.map(formatDate)

    // 所有結果應該是相同長度（YYYY-MM-DD HH:mm = 16 字元）
    expect(results[0].length).toBe(16)
    expect(results[1].length).toBe(16)
    expect(results[2].length).toBe(16)
  })

  /**
   * 測試：完整範例驗證
   */
  it('應產生符合文件範例的格式', () => {
    // 根據函數文件中的範例
    const date = new Date(2024, 0, 15, 10, 30)
    const result = formatDate(date)

    // 應符合 YYYY-MM-DD HH:mm 格式
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(result).toContain('2024-01-15')
    expect(result).toContain('10:30')
  })

  /**
   * 測試：處理不同年份
   */
  it('應正確處理不同年份', () => {
    const date2023 = new Date(2023, 0, 1, 12, 0)
    const date2024 = new Date(2024, 0, 1, 12, 0)
    const date2025 = new Date(2025, 0, 1, 12, 0)

    expect(formatDate(date2023)).toContain('2023-')
    expect(formatDate(date2024)).toContain('2024-')
    expect(formatDate(date2025)).toContain('2025-')
  })
})
