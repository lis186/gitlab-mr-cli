/**
 * normalizeDateString 單元測試
 *
 * 測試 time-utils.ts 中的日期正規化函數
 */

import { describe, it, expect } from 'vitest'
import { normalizeDateString, validateDateRange } from '../../src/utils/time-utils.js'

describe('normalizeDateString', () => {
  describe('基本功能', () => {
    it('應將 start 類型日期設為當天開始時間（00:00:00.000Z）', () => {
      const date = normalizeDateString('2025-11-05', 'start')

      expect(date.toISOString()).toBe('2025-11-05T00:00:00.000Z')
      expect(date.getUTCHours()).toBe(0)
      expect(date.getUTCMinutes()).toBe(0)
      expect(date.getUTCSeconds()).toBe(0)
      expect(date.getUTCMilliseconds()).toBe(0)
    })

    it('應將 end 類型日期設為當天結束時間（23:59:59.999Z）', () => {
      const date = normalizeDateString('2025-11-05', 'end')

      expect(date.toISOString()).toBe('2025-11-05T23:59:59.999Z')
      expect(date.getUTCHours()).toBe(23)
      expect(date.getUTCMinutes()).toBe(59)
      expect(date.getUTCSeconds()).toBe(59)
      expect(date.getUTCMilliseconds()).toBe(999)
    })

    it('應正確處理月初日期', () => {
      const start = normalizeDateString('2025-01-01', 'start')
      const end = normalizeDateString('2025-01-01', 'end')

      expect(start.toISOString()).toBe('2025-01-01T00:00:00.000Z')
      expect(end.toISOString()).toBe('2025-01-01T23:59:59.999Z')
    })

    it('應正確處理月底日期', () => {
      const start = normalizeDateString('2025-01-31', 'start')
      const end = normalizeDateString('2025-01-31', 'end')

      expect(start.toISOString()).toBe('2025-01-31T00:00:00.000Z')
      expect(end.toISOString()).toBe('2025-01-31T23:59:59.999Z')
    })

    it('應正確處理年底日期', () => {
      const start = normalizeDateString('2025-12-31', 'start')
      const end = normalizeDateString('2025-12-31', 'end')

      expect(start.toISOString()).toBe('2025-12-31T00:00:00.000Z')
      expect(end.toISOString()).toBe('2025-12-31T23:59:59.999Z')
    })

    it('應正確處理閏年 2 月 29 日', () => {
      const start = normalizeDateString('2024-02-29', 'start')
      const end = normalizeDateString('2024-02-29', 'end')

      expect(start.toISOString()).toBe('2024-02-29T00:00:00.000Z')
      expect(end.toISOString()).toBe('2024-02-29T23:59:59.999Z')
    })
  })

  describe('時間窗口計算', () => {
    it('查詢同一天時，時間窗口應為完整的 24 小時', () => {
      const since = normalizeDateString('2025-11-05', 'start')
      const until = normalizeDateString('2025-11-05', 'end')

      const windowMs = until.getTime() - since.getTime()
      const windowHours = windowMs / (1000 * 60 * 60)

      // 應該接近 24 小時（允許 999 毫秒的誤差）
      expect(windowHours).toBeGreaterThan(23.99)
      expect(windowHours).toBeLessThan(24)
    })

    it('查詢日期範圍時，應包含開始和結束日期', () => {
      const since = normalizeDateString('2025-01-01', 'start')
      const until = normalizeDateString('2025-01-31', 'end')

      // 測試邊界：2025-01-01T00:00:00.000Z 應在範圍內
      const firstMoment = new Date('2025-01-01T00:00:00.000Z')
      expect(firstMoment.getTime()).toBeGreaterThanOrEqual(since.getTime())
      expect(firstMoment.getTime()).toBeLessThanOrEqual(until.getTime())

      // 測試邊界：2025-01-31T23:59:59.999Z 應在範圍內
      const lastMoment = new Date('2025-01-31T23:59:59.999Z')
      expect(lastMoment.getTime()).toBeGreaterThanOrEqual(since.getTime())
      expect(lastMoment.getTime()).toBeLessThanOrEqual(until.getTime())

      // 測試超出範圍：2024-12-31T23:59:59.999Z 應不在範圍內
      const beforeRange = new Date('2024-12-31T23:59:59.999Z')
      expect(beforeRange.getTime()).toBeLessThan(since.getTime())

      // 測試超出範圍：2025-02-01T00:00:00.000Z 應不在範圍內
      const afterRange = new Date('2025-02-01T00:00:00.000Z')
      expect(afterRange.getTime()).toBeGreaterThan(until.getTime())
    })
  })

  describe('輸入驗證', () => {
    it('應拒絕空字串', () => {
      expect(() => normalizeDateString('', 'start')).toThrow('日期字串不可為空')
    })

    it('應拒絕無效的日期格式', () => {
      expect(() => normalizeDateString('2025/11/05', 'start')).toThrow(
        '無效的日期格式: 2025/11/05（預期格式：YYYY-MM-DD）'
      )
      expect(() => normalizeDateString('05-11-2025', 'start')).toThrow()
      expect(() => normalizeDateString('2025-1-5', 'start')).toThrow()
      expect(() => normalizeDateString('20251105', 'start')).toThrow()
      expect(() => normalizeDateString('invalid', 'start')).toThrow()
    })

    it('應拒絕無效的月份（超過 12）', () => {
      expect(() => normalizeDateString('2025-13-01', 'start')).toThrow('無效的日期')
    })

    it('應拒絕無效的日/月組合（2 月 30 日）', () => {
      expect(() => normalizeDateString('2025-02-30', 'start')).toThrow('無效的日期')
    })

    it('應拒絕無效的日/月組合（4 月 31 日）', () => {
      expect(() => normalizeDateString('2025-04-31', 'start')).toThrow('無效的日期')
    })

    it('應拒絕無效的日/月組合（非閏年 2 月 29 日）', () => {
      expect(() => normalizeDateString('2025-02-29', 'start')).toThrow('無效的日期')
    })

    it('應拒絕無效的日期（0 日）', () => {
      expect(() => normalizeDateString('2025-01-00', 'start')).toThrow('無效的日期')
    })

    it('應自動移除已存在的時間部分', () => {
      // 如果使用者傳入包含時間的字串，應自動截取日期部分
      const date1 = normalizeDateString('2025-11-05T12:34:56Z', 'start')
      const date2 = normalizeDateString('2025-11-05', 'start')

      expect(date1.toISOString()).toBe(date2.toISOString())
    })
  })

  describe('實際使用案例', () => {
    it('案例 1: 查詢當天的 MR（--since 2025-11-05 --until 2025-11-05）', () => {
      const since = normalizeDateString('2025-11-05', 'start')
      const until = normalizeDateString('2025-11-05', 'end')

      // 模擬當天不同時間合併的 MR
      const mrs = [
        { id: 1, mergedAt: new Date('2025-11-05T00:00:00.000Z') },
        { id: 2, mergedAt: new Date('2025-11-05T09:00:00.000Z') },
        { id: 3, mergedAt: new Date('2025-11-05T15:30:00.000Z') },
        { id: 4, mergedAt: new Date('2025-11-05T23:59:59.999Z') },
      ]

      const filtered = mrs.filter(
        (mr) =>
          mr.mergedAt.getTime() >= since.getTime() && mr.mergedAt.getTime() <= until.getTime()
      )

      // 應該找到所有 4 個 MR
      expect(filtered).toHaveLength(4)
    })

    it('案例 2: 查詢範圍時不應遺漏最後一天的資料', () => {
      const since = normalizeDateString('2025-01-01', 'start')
      const until = normalizeDateString('2025-03-31', 'end')

      const mrs = [
        { id: 1, mergedAt: new Date('2024-12-31T23:59:59.999Z') }, // 範圍外（前）
        { id: 2, mergedAt: new Date('2025-01-01T00:00:00.000Z') }, // 範圍內
        { id: 3, mergedAt: new Date('2025-02-15T12:00:00.000Z') }, // 範圍內
        { id: 4, mergedAt: new Date('2025-03-31T23:59:59.999Z') }, // 範圍內
        { id: 5, mergedAt: new Date('2025-04-01T00:00:00.000Z') }, // 範圍外（後）
      ]

      const filtered = mrs.filter(
        (mr) =>
          mr.mergedAt.getTime() >= since.getTime() && mr.mergedAt.getTime() <= until.getTime()
      )

      // 應該找到 3 個範圍內的 MR
      expect(filtered).toHaveLength(3)
      expect(filtered.map((mr) => mr.id)).toEqual([2, 3, 4])
    })

    it('案例 3: 修復前後對比（證明問題已解決）', () => {
      // 修復前的錯誤邏輯
      const wrongSince = new Date('2025-11-05')
      const wrongUntil = new Date('2025-11-05')

      // 修復後的正確邏輯
      const correctSince = normalizeDateString('2025-11-05', 'start')
      const correctUntil = normalizeDateString('2025-11-05', 'end')

      // 錯誤邏輯的時間窗口為 0
      expect(wrongUntil.getTime() - wrongSince.getTime()).toBe(0)

      // 正確邏輯的時間窗口接近 24 小時
      const windowMs = correctUntil.getTime() - correctSince.getTime()
      const windowHours = windowMs / (1000 * 60 * 60)
      expect(windowHours).toBeGreaterThan(23.99)
    })
  })
})

describe('validateDateRange', () => {
  describe('有效的日期範圍', () => {
    it('應接受開始日期早於結束日期', () => {
      expect(() => validateDateRange('2025-01-01', '2025-12-31')).not.toThrow()
      expect(() => validateDateRange('2025-01-01', '2025-01-31')).not.toThrow()
      expect(() => validateDateRange('2025-11-01', '2025-11-05')).not.toThrow()
    })

    it('應接受開始日期等於結束日期（查詢當天）', () => {
      expect(() => validateDateRange('2025-11-05', '2025-11-05')).not.toThrow()
      expect(() => validateDateRange('2025-01-01', '2025-01-01')).not.toThrow()
    })

    it('應接受跨年度的日期範圍', () => {
      expect(() => validateDateRange('2024-12-01', '2025-01-31')).not.toThrow()
      expect(() => validateDateRange('2024-01-01', '2025-12-31')).not.toThrow()
    })
  })

  describe('無效的日期範圍', () => {
    it('應拒絕開始日期晚於結束日期', () => {
      expect(() => validateDateRange('2025-12-31', '2025-01-01')).toThrow(
        '無效的日期範圍: 開始日期（2025-12-31）不能晚於結束日期（2025-01-01）'
      )
      expect(() => validateDateRange('2025-11-05', '2025-11-01')).toThrow()
      expect(() => validateDateRange('2025-02-01', '2025-01-31')).toThrow()
    })

    it('應拒絕開始日期晚於結束日期（跨年）', () => {
      expect(() => validateDateRange('2025-01-01', '2024-12-31')).toThrow()
    })
  })

  describe('輸入驗證', () => {
    it('應在日期格式無效時拋出錯誤', () => {
      expect(() => validateDateRange('invalid', '2025-12-31')).toThrow('無效的日期格式')
      expect(() => validateDateRange('2025-01-01', 'invalid')).toThrow('無效的日期格式')
      expect(() => validateDateRange('2025/01/01', '2025-12-31')).toThrow('無效的日期格式')
    })

    it('應在日期值無效時拋出錯誤', () => {
      expect(() => validateDateRange('2025-13-01', '2025-12-31')).toThrow('無效的日期')
      expect(() => validateDateRange('2025-01-01', '2025-13-01')).toThrow('無效的日期')
    })
  })

  describe('實際使用案例', () => {
    it('案例 1: 防止使用者錯誤輸入反向的日期範圍', () => {
      // 使用者可能不小心將 since 和 until 輸入反了
      expect(() => validateDateRange('2025-03-31', '2025-01-01')).toThrow(
        '無效的日期範圍'
      )
    })

    it('案例 2: 允許查詢單一季度', () => {
      expect(() => validateDateRange('2025-01-01', '2025-03-31')).not.toThrow()
      expect(() => validateDateRange('2025-04-01', '2025-06-30')).not.toThrow()
    })

    it('案例 3: 允許查詢整年', () => {
      expect(() => validateDateRange('2025-01-01', '2025-12-31')).not.toThrow()
    })
  })
})
