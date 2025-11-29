/**
 * 日期工具函式單元測試
 */

import { describe, it, expect } from 'vitest'
import { parsePeriod, parseISODate, validateDateRange, getDaysDifference, normalizeStartOfDay, normalizeEndOfDay } from '../../src/utils/date-utils.js'

describe('date-utils', () => {
  describe('parsePeriod', () => {
    it('應正確解析天數格式（30d）', () => {
      const result = parsePeriod('30d')

      expect(result.startDate).toBeInstanceOf(Date)
      expect(result.endDate).toBeInstanceOf(Date)

      // 驗證日期範圍約為 30 天（包含起始和結束日）
      const daysDiff = getDaysDifference(result.startDate, result.endDate)
      expect(daysDiff).toBe(31) // 包含起始和結束日期
    })

    it('應正確解析月份格式（6m）', () => {
      const result = parsePeriod('6m')

      expect(result.startDate).toBeInstanceOf(Date)
      expect(result.endDate).toBeInstanceOf(Date)

      // 驗證日期範圍約為 6 個月（180 天左右）
      const daysDiff = getDaysDifference(result.startDate, result.endDate)
      expect(daysDiff).toBeGreaterThan(170)
      expect(daysDiff).toBeLessThan(190)
    })

    it('應正確解析年份格式（1y）', () => {
      const result = parsePeriod('1y')

      expect(result.startDate).toBeInstanceOf(Date)
      expect(result.endDate).toBeInstanceOf(Date)

      // 驗證日期範圍約為 1 年（365 天左右）
      const daysDiff = getDaysDifference(result.startDate, result.endDate)
      expect(daysDiff).toBeGreaterThan(360)
      expect(daysDiff).toBeLessThan(370)
    })

    it('應拒絕無效的格式', () => {
      expect(() => parsePeriod('invalid')).toThrow()
      expect(() => parsePeriod('30')).toThrow()
      expect(() => parsePeriod('d30')).toThrow()
      expect(() => parsePeriod('30x')).toThrow()
    })
  })

  describe('parseISODate', () => {
    it('應正確解析 ISO 8601 日期', () => {
      const date = parseISODate('2025-01-15')

      expect(date).toBeInstanceOf(Date)
      expect(date.getFullYear()).toBe(2025)
      expect(date.getMonth()).toBe(0) // 0 = January
      expect(date.getDate()).toBe(15)
    })

    it('應拒絕無效的日期格式', () => {
      expect(() => parseISODate('invalid')).toThrow()
      // Note: JavaScript Date 接受多種格式，包括 '2025/01/01' 和 '2025-13-01'
      // 我們只檢查完全無效的字串
    })
  })

  describe('validateDateRange', () => {
    it('應接受有效的日期範圍', () => {
      const startDate = new Date('2025-01-01')
      const endDate = new Date('2025-01-31')

      expect(() => validateDateRange(startDate, endDate)).not.toThrow()
    })

    it('應拒絕結束日期早於開始日期', () => {
      const startDate = new Date('2025-01-31')
      const endDate = new Date('2025-01-01')

      expect(() => validateDateRange(startDate, endDate)).toThrow()
    })

    it('應接受相同的開始和結束日期', () => {
      const date = new Date('2025-01-15')

      expect(() => validateDateRange(date, date)).not.toThrow()
    })
  })

  describe('getDaysDifference', () => {
    it('應正確計算天數差異', () => {
      const start = new Date('2025-01-01')
      const end = new Date('2025-01-31')

      const diff = getDaysDifference(start, end)
      expect(diff).toBe(31)
    })

    it('相同日期應回傳 1 天', () => {
      const date = new Date('2025-01-15')

      const diff = getDaysDifference(date, date)
      expect(diff).toBe(1)
    })
  })

  describe('normalizeStartOfDay', () => {
    it('應正規化日期為當天開始時間（UTC 00:00:00.000）', () => {
      const normalized = normalizeStartOfDay('2025-10-15')

      expect(normalized).toBeInstanceOf(Date)
      expect(normalized.toISOString()).toBe('2025-10-15T00:00:00.000Z')
    })

    it('應正確處理不同格式的日期字串', () => {
      const dates = [
        '2025-01-01',
        '2025-12-31',
        '2024-02-29', // Leap year
      ]

      dates.forEach(dateStr => {
        const normalized = normalizeStartOfDay(dateStr)
        expect(normalized.getUTCHours()).toBe(0)
        expect(normalized.getUTCMinutes()).toBe(0)
        expect(normalized.getUTCSeconds()).toBe(0)
        expect(normalized.getUTCMilliseconds()).toBe(0)
      })
    })

    it('應在時區無關的情況下一致地正規化', () => {
      const date1 = normalizeStartOfDay('2025-10-15')
      const date2 = normalizeStartOfDay('2025-10-15')

      expect(date1.getTime()).toBe(date2.getTime())
      expect(date1.toISOString()).toBe(date2.toISOString())
    })
  })

  describe('normalizeEndOfDay', () => {
    it('應正規化日期為當天結束時間（UTC 23:59:59.999）', () => {
      const normalized = normalizeEndOfDay('2025-10-15')

      expect(normalized).toBeInstanceOf(Date)
      expect(normalized.toISOString()).toBe('2025-10-15T23:59:59.999Z')
    })

    it('應正確處理不同格式的日期字串', () => {
      const dates = [
        '2025-01-01',
        '2025-12-31',
        '2024-02-29', // Leap year
      ]

      dates.forEach(dateStr => {
        const normalized = normalizeEndOfDay(dateStr)
        expect(normalized.getUTCHours()).toBe(23)
        expect(normalized.getUTCMinutes()).toBe(59)
        expect(normalized.getUTCSeconds()).toBe(59)
        expect(normalized.getUTCMilliseconds()).toBe(999)
      })
    })

    it('應在時區無關的情況下一致地正規化', () => {
      const date1 = normalizeEndOfDay('2025-10-15')
      const date2 = normalizeEndOfDay('2025-10-15')

      expect(date1.getTime()).toBe(date2.getTime())
      expect(date1.toISOString()).toBe(date2.toISOString())
    })
  })

  describe('normalizeStartOfDay 與 normalizeEndOfDay 對稱性', () => {
    it('單日範圍應涵蓋完整 24 小時（86399999 毫秒）', () => {
      const start = normalizeStartOfDay('2025-10-15')
      const end = normalizeEndOfDay('2025-10-15')

      const diffMs = end.getTime() - start.getTime()
      expect(diffMs).toBe(86399999) // 23h 59m 59s 999ms
    })

    it('開始時間應早於結束時間', () => {
      const start = normalizeStartOfDay('2025-10-15')
      const end = normalizeEndOfDay('2025-10-15')

      expect(start.getTime()).toBeLessThan(end.getTime())
    })

    it('應支援跨月份的日期範圍', () => {
      const start = normalizeStartOfDay('2025-09-30')
      const end = normalizeEndOfDay('2025-10-01')

      expect(start.getTime()).toBeLessThan(end.getTime())
      expect(start.toISOString()).toBe('2025-09-30T00:00:00.000Z')
      expect(end.toISOString()).toBe('2025-10-01T23:59:59.999Z')
    })

    it('應支援跨年份的日期範圍', () => {
      const start = normalizeStartOfDay('2024-12-31')
      const end = normalizeEndOfDay('2025-01-01')

      expect(start.getTime()).toBeLessThan(end.getTime())
      expect(start.toISOString()).toBe('2024-12-31T00:00:00.000Z')
      expect(end.toISOString()).toBe('2025-01-01T23:59:59.999Z')
    })
  })
})
