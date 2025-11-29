/**
 * 統計計算服務單元測試
 */

import { describe, it, expect } from 'vitest'
import { assessBatchSize } from '../../src/models/statistics.js'
import { calculateChangePercentage, normalizeToWeeklyAverage } from '../../src/services/statistics-calculator.js'

describe('assessBatchSize', () => {
  it('應正確判定符合小批量標準', () => {
    const assessment = assessBatchSize(5, 3)

    expect(assessment.isHealthy).toBe(true)
    expect(assessment.threshold).toBe(3)
    expect(assessment.actualValue).toBe(5)
    expect(assessment.statusMessage).toContain('✓')
    expect(assessment.statusMessage).toContain('符合小批量工作模式')
    expect(assessment.suggestion).toBeUndefined()
  })

  it('應正確判定未達小批量標準', () => {
    const assessment = assessBatchSize(2, 3)

    expect(assessment.isHealthy).toBe(false)
    expect(assessment.threshold).toBe(3)
    expect(assessment.actualValue).toBe(2)
    expect(assessment.statusMessage).toContain('✗')
    expect(assessment.statusMessage).toContain('未達小批量標準')
    expect(assessment.suggestion).toBeDefined()
    expect(assessment.suggestion).toContain('建議')
  })

  it('應處理剛好達標的情況', () => {
    const assessment = assessBatchSize(3, 3)

    expect(assessment.isHealthy).toBe(true)
  })

  it('應支援自訂閾值', () => {
    const assessment = assessBatchSize(4, 5)

    expect(assessment.isHealthy).toBe(false)
    expect(assessment.threshold).toBe(5)
  })

  it('應正確處理零值', () => {
    const assessment = assessBatchSize(0, 3)

    expect(assessment.isHealthy).toBe(false)
    expect(assessment.actualValue).toBe(0)
  })

  it('應正確處理小數值', () => {
    const assessment = assessBatchSize(3.5, 3)

    expect(assessment.isHealthy).toBe(true)
    expect(assessment.actualValue).toBe(3.5)
  })

  // T044: 自訂閾值評估測試
  describe('自訂閾值評估', () => {
    it('應正確使用閾值 5 進行評估', () => {
      const assessment = assessBatchSize(4.5, 5)

      expect(assessment.isHealthy).toBe(false)
      expect(assessment.threshold).toBe(5)
      expect(assessment.actualValue).toBe(4.5)
      expect(assessment.statusMessage).toContain('未達小批量標準')
      expect(assessment.statusMessage).toContain('< 5')
    })

    it('應正確使用閾值 10 進行評估', () => {
      const assessment = assessBatchSize(8, 10)

      expect(assessment.isHealthy).toBe(false)
      expect(assessment.threshold).toBe(10)
      expect(assessment.actualValue).toBe(8)
      expect(assessment.statusMessage).toContain('< 10')
    })

    it('應在達到自訂閾值時判定為健康', () => {
      const assessment = assessBatchSize(10, 10)

      expect(assessment.isHealthy).toBe(true)
      expect(assessment.threshold).toBe(10)
      expect(assessment.actualValue).toBe(10)
      expect(assessment.statusMessage).toContain('符合小批量工作模式')
    })

    it('應支援極低閾值（如 1）', () => {
      const lowAssessment = assessBatchSize(1.5, 1)
      expect(lowAssessment.isHealthy).toBe(true)

      const veryLowAssessment = assessBatchSize(0.5, 1)
      expect(veryLowAssessment.isHealthy).toBe(false)
    })

    it('應支援極高閾值（如 20）', () => {
      const highThreshold = assessBatchSize(15, 20)
      expect(highThreshold.isHealthy).toBe(false)
      expect(highThreshold.threshold).toBe(20)

      const meetHighThreshold = assessBatchSize(20, 20)
      expect(meetHighThreshold.isHealthy).toBe(true)
    })

    it('不同閾值應生成不同的狀態訊息', () => {
      const threshold3 = assessBatchSize(2, 3)
      const threshold5 = assessBatchSize(2, 5)
      const threshold10 = assessBatchSize(2, 10)

      expect(threshold3.statusMessage).toContain('< 3')
      expect(threshold5.statusMessage).toContain('< 5')
      expect(threshold10.statusMessage).toContain('< 10')

      // 三個都應該不健康
      expect(threshold3.isHealthy).toBe(false)
      expect(threshold5.isHealthy).toBe(false)
      expect(threshold10.isHealthy).toBe(false)
    })
  })
})

describe('calculateChangePercentage', () => {
  it('應正確計算正向變化百分比', () => {
    const percentage = calculateChangePercentage(50, 75)
    expect(percentage).toBe(50) // (75 - 50) / 50 * 100 = 50%
  })

  it('應正確計算負向變化百分比', () => {
    const percentage = calculateChangePercentage(100, 75)
    expect(percentage).toBe(-25) // (75 - 100) / 100 * 100 = -25%
  })

  it('應處理零變化', () => {
    const percentage = calculateChangePercentage(50, 50)
    expect(percentage).toBe(0)
  })

  it('應處理從零增加的情況', () => {
    const percentage = calculateChangePercentage(0, 50)
    expect(percentage).toBe(100) // 從零增加視為 100% 增長
  })

  it('應處理從零到零的情況', () => {
    const percentage = calculateChangePercentage(0, 0)
    expect(percentage).toBe(0)
  })

  it('應正確計算小數變化', () => {
    const percentage = calculateChangePercentage(3.5, 4.2)
    expect(percentage).toBeCloseTo(20, 1) // (4.2 - 3.5) / 3.5 * 100 = 20%
  })

  it('應處理減少到零的情況', () => {
    const percentage = calculateChangePercentage(50, 0)
    expect(percentage).toBe(-100)
  })
})

describe('normalizeToWeeklyAverage', () => {
  it('應正確計算週平均（整週數）', () => {
    const weeklyAvg = normalizeToWeeklyAverage(28, 14) // 14天 = 2週
    expect(weeklyAvg).toBe(14) // 28 / 2 = 14
  })

  it('應正確計算週平均（非整週數）', () => {
    const weeklyAvg = normalizeToWeeklyAverage(30, 10) // 10天 = 1.43週
    expect(weeklyAvg).toBeCloseTo(21, 1) // 30 / 1.43 ≈ 21
  })

  it('應處理零天數', () => {
    const weeklyAvg = normalizeToWeeklyAverage(50, 0)
    expect(weeklyAvg).toBe(0)
  })

  it('應處理零合併數', () => {
    const weeklyAvg = normalizeToWeeklyAverage(0, 14)
    expect(weeklyAvg).toBe(0)
  })

  it('應正確計算單週', () => {
    const weeklyAvg = normalizeToWeeklyAverage(15, 7) // 7天 = 1週
    expect(weeklyAvg).toBe(15)
  })

  it('應正確計算月份（約30天）', () => {
    const weeklyAvg = normalizeToWeeklyAverage(40, 30) // 30天 ≈ 4.3週
    expect(weeklyAvg).toBeCloseTo(9.33, 2) // 40 / 4.3 ≈ 9.33
  })
})
