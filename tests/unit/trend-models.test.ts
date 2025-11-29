/**
 * 趨勢資料模型單元測試
 */

import { describe, it, expect } from 'vitest'
import { TimePeriodImpl, TimeGranularity, TrendDataPointImpl } from '../../src/models/trend.js'

describe('TimePeriodImpl', () => {
  it('應正確計算天數', () => {
    const period = new TimePeriodImpl(
      new Date('2025-01-01'),
      new Date('2025-01-31'),
      TimeGranularity.DAY
    )

    expect(period.daysCount).toBe(31)
  })

  it('應正確計算週數', () => {
    const period = new TimePeriodImpl(
      new Date('2025-01-01'),
      new Date('2025-01-31'),
      TimeGranularity.WEEK
    )

    // 31 天 ≈ 5 週
    expect(period.weeksCount).toBe(5)
  })

  it('應拒絕結束日期早於開始日期', () => {
    expect(() => {
      new TimePeriodImpl(
        new Date('2025-01-31'),
        new Date('2025-01-01'),
        TimeGranularity.DAY
      )
    }).toThrow('結束日期不能早於開始日期')
  })

  it('應接受相同的開始和結束日期', () => {
    const period = new TimePeriodImpl(
      new Date('2025-01-15'),
      new Date('2025-01-15'),
      TimeGranularity.DAY
    )

    expect(period.daysCount).toBe(1)
  })
})

describe('TrendDataPointImpl', () => {
  it('應正確計算活躍開發者數量', () => {
    const developers = new Set([1, 2, 3, 4, 5])
    const dataPoint = new TrendDataPointImpl(
      '2025-W01',
      new Date('2025-01-01'),
      new Date('2025-01-07'),
      20,
      developers
    )

    expect(dataPoint.activeDeveloperCount).toBe(5)
  })

  it('應正確計算人均合併數', () => {
    const developers = new Set([1, 2, 3, 4, 5])
    const dataPoint = new TrendDataPointImpl(
      '2025-W01',
      new Date('2025-01-01'),
      new Date('2025-01-07'),
      20,
      developers
    )

    expect(dataPoint.avgMergesPerDeveloper).toBe(4) // 20 / 5 = 4
  })

  it('應處理除以零的情況', () => {
    const developers = new Set<number>()
    const dataPoint = new TrendDataPointImpl(
      '2025-W01',
      new Date('2025-01-01'),
      new Date('2025-01-07'),
      20,
      developers
    )

    expect(dataPoint.activeDeveloperCount).toBe(0)
    expect(dataPoint.avgMergesPerDeveloper).toBe(0)
  })

  it('應正確處理小數點結果', () => {
    const developers = new Set([1, 2, 3])
    const dataPoint = new TrendDataPointImpl(
      '2025-W01',
      new Date('2025-01-01'),
      new Date('2025-01-07'),
      10,
      developers
    )

    expect(dataPoint.avgMergesPerDeveloper).toBeCloseTo(3.33, 2)
  })
})
