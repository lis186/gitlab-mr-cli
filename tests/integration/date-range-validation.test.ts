/**
 * 日期範圍驗證整合測試
 *
 * 測試日期正規化函數與實際使用案例的整合
 */

import { describe, it, expect } from 'vitest'
import { normalizeDateString, validateDateRange } from '../../src/utils/time-utils.js'

describe('日期範圍驗證 - 整合測試', () => {
  describe('完整流程測試：從輸入到 Date 物件', () => {
    it('應正確處理查詢當天的完整流程', () => {
      const sinceStr = '2025-11-05'
      const untilStr = '2025-11-05'

      // 步驟 1: 驗證日期範圍
      expect(() => validateDateRange(sinceStr, untilStr)).not.toThrow()

      // 步驟 2: 正規化日期字串
      const since = normalizeDateString(sinceStr, 'start')
      const until = normalizeDateString(untilStr, 'end')

      // 步驟 3: 驗證時間窗口
      const windowMs = until.getTime() - since.getTime()
      const windowHours = windowMs / (1000 * 60 * 60)

      expect(windowHours).toBeGreaterThan(23.99)
      expect(windowHours).toBeLessThan(24)
    })

    it('應正確處理查詢季度的完整流程', () => {
      const sinceStr = '2025-01-01'
      const untilStr = '2025-03-31'

      // 步驟 1: 驗證日期範圍
      expect(() => validateDateRange(sinceStr, untilStr)).not.toThrow()

      // 步驟 2: 正規化日期字串
      const since = normalizeDateString(sinceStr, 'start')
      const until = normalizeDateString(untilStr, 'end')

      // 步驟 3: 驗證邊界條件
      const firstMoment = new Date('2025-01-01T00:00:00.000Z')
      const lastMoment = new Date('2025-03-31T23:59:59.999Z')

      expect(firstMoment.getTime()).toBeGreaterThanOrEqual(since.getTime())
      expect(firstMoment.getTime()).toBeLessThanOrEqual(until.getTime())
      expect(lastMoment.getTime()).toBeGreaterThanOrEqual(since.getTime())
      expect(lastMoment.getTime()).toBeLessThanOrEqual(until.getTime())
    })

    it('應在使用者輸入反向日期範圍時提早拋出錯誤', () => {
      const sinceStr = '2025-12-31'
      const untilStr = '2025-01-01'

      // 驗證應在 normalizeDateString 之前就拋出錯誤
      expect(() => validateDateRange(sinceStr, untilStr)).toThrow(
        '無效的日期範圍: 開始日期（2025-12-31）不能晚於結束日期（2025-01-01）'
      )
    })
  })

  describe('模擬 MR 查詢流程', () => {
    it('應正確過濾在日期範圍內的 MR', () => {
      const sinceStr = '2025-01-01'
      const untilStr = '2025-03-31'

      // 步驟 1: 驗證與正規化
      validateDateRange(sinceStr, untilStr)
      const since = normalizeDateString(sinceStr, 'start')
      const until = normalizeDateString(untilStr, 'end')

      // 步驟 2: 模擬 MR 資料
      const mockMRs = [
        { id: 1, mergedAt: new Date('2024-12-31T23:59:59.999Z') }, // 範圍外（前）
        { id: 2, mergedAt: new Date('2025-01-01T00:00:00.000Z') }, // 範圍內（開始）
        { id: 3, mergedAt: new Date('2025-02-15T12:00:00.000Z') }, // 範圍內（中間）
        { id: 4, mergedAt: new Date('2025-03-31T23:59:59.999Z') }, // 範圍內（結束）
        { id: 5, mergedAt: new Date('2025-04-01T00:00:00.000Z') }, // 範圍外（後）
      ]

      // 步驟 3: 執行過濾（模擬 GitLabClient.getMergedMRsByTimeRange 的邏輯）
      const filtered = mockMRs.filter((mr) => {
        const mergedTime = mr.mergedAt.getTime()
        return mergedTime >= since.getTime() && mergedTime <= until.getTime()
      })

      // 步驟 4: 驗證結果
      expect(filtered).toHaveLength(3)
      expect(filtered.map((mr) => mr.id)).toEqual([2, 3, 4])
    })

    it('修復前後對比：證明時間窗口問題已解決', () => {
      const sinceStr = '2025-11-05'
      const untilStr = '2025-11-05'

      // 模擬修復前的錯誤邏輯
      const wrongSince = new Date(sinceStr)
      const wrongUntil = new Date(untilStr)

      // 模擬修復後的正確邏輯
      validateDateRange(sinceStr, untilStr)
      const correctSince = normalizeDateString(sinceStr, 'start')
      const correctUntil = normalizeDateString(untilStr, 'end')

      // 模擬當天合併的 MR
      const mockMRs = [
        { id: 1, mergedAt: new Date('2025-11-05T00:00:00.000Z') },
        { id: 2, mergedAt: new Date('2025-11-05T09:00:00.000Z') },
        { id: 3, mergedAt: new Date('2025-11-05T15:30:00.000Z') },
        { id: 4, mergedAt: new Date('2025-11-05T23:59:59.999Z') },
      ]

      // 錯誤邏輯：時間窗口為 0，只能匹配到精確時間
      const wrongFiltered = mockMRs.filter((mr) => {
        const mergedTime = mr.mergedAt.getTime()
        return mergedTime >= wrongSince.getTime() && mergedTime <= wrongUntil.getTime()
      })

      // 正確邏輯：時間窗口為 24 小時，匹配所有當天的 MR
      const correctFiltered = mockMRs.filter((mr) => {
        const mergedTime = mr.mergedAt.getTime()
        return mergedTime >= correctSince.getTime() && mergedTime <= correctUntil.getTime()
      })

      // 驗證：修復前只找到 1 個，修復後找到 4 個
      expect(wrongFiltered).toHaveLength(1)
      expect(correctFiltered).toHaveLength(4)
    })
  })

  describe('錯誤處理流程', () => {
    it('應在第一步就攔截無效的日期格式', () => {
      expect(() => validateDateRange('2025/01/01', '2025-12-31')).toThrow(
        '無效的日期格式'
      )
    })

    it('應在第一步就攔截無效的日期值', () => {
      expect(() => validateDateRange('2025-01-01', '2025-13-01')).toThrow('無效的日期')
    })

    it('應在第一步就攔截反向的日期範圍', () => {
      expect(() => validateDateRange('2025-12-31', '2025-01-01')).toThrow(
        '無效的日期範圍'
      )
    })
  })
})
