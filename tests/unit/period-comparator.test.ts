/**
 * Period Comparator Unit Tests
 *
 * T048: Unit tests for period-comparator service
 * Tests period comparison logic, statistics calculation, and trend analysis
 *
 * @module tests/unit/period-comparator.test.ts
 */

import { describe, it, expect } from 'vitest'
import type { BranchLifecycle } from '../../src/types/branch-health.js'

// Helper: Create mock branch lifecycle for period comparison
const createLifecycleForPeriod = (
  branchName: string,
  totalLifecycleDays: number,
  mrProcessingDays: number | null = null
): BranchLifecycle => ({
  branchName,
  totalLifecycleDays,
  mrProcessingDays,
  createdDate: new Date(Date.now() - totalLifecycleDays * 24 * 60 * 60 * 1000),
  lastUpdatedDate: new Date(),
  isStale: totalLifecycleDays > 30,
  staleThreshold: 30,
})

describe('Period Comparator Unit Tests (T048)', () => {
  // NOTE: These tests will initially fail until period-comparator.ts is implemented
  // This follows TDD (Test-Driven Development) approach

  describe('calculatePeriodStatistics()', () => {
    it('should calculate correct statistics for a single period', async () => {
      // Will be implemented in period-comparator.ts
      const { calculatePeriodStatistics } = await import('../../src/services/period-comparator.js')

      const branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/a', 10, 5),
        createLifecycleForPeriod('feature/b', 20, 10),
        createLifecycleForPeriod('feature/c', 30, 15),
      ]

      const startDate = new Date('2025-09-01')
      const endDate = new Date('2025-09-30')
      const label = '2025-09'

      const stats = calculatePeriodStatistics(branches, label, startDate, endDate)

      expect(stats.label).toBe('2025-09')
      expect(stats.startDate).toEqual(startDate)
      expect(stats.endDate).toEqual(endDate)
      expect(stats.totalBranches).toBe(3)
      expect(stats.avgLifecycleDays).toBe(20) // (10 + 20 + 30) / 3
      expect(stats.medianLifecycleDays).toBe(20) // Middle value
      expect(stats.maxLifecycleDays).toBe(30) // Max value
      expect(stats.avgMrProcessingDays).toBe(10) // (5 + 10 + 15) / 3
    })

    it('should handle empty branch list', async () => {
      const { calculatePeriodStatistics } = await import('../../src/services/period-comparator.js')

      const branches: BranchLifecycle[] = []
      const startDate = new Date('2025-09-01')
      const endDate = new Date('2025-09-30')
      const label = '2025-09'

      const stats = calculatePeriodStatistics(branches, label, startDate, endDate)

      expect(stats.totalBranches).toBe(0)
      expect(stats.avgLifecycleDays).toBe(0)
      expect(stats.medianLifecycleDays).toBe(0)
      expect(stats.maxLifecycleDays).toBe(0)
      expect(stats.avgMrProcessingDays).toBe(0)
    })

    it('should handle branches without MR processing days', async () => {
      const { calculatePeriodStatistics } = await import('../../src/services/period-comparator.js')

      const branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/a', 10, null),
        createLifecycleForPeriod('feature/b', 20, null),
        createLifecycleForPeriod('feature/c', 30, 15),
      ]

      const startDate = new Date('2025-09-01')
      const endDate = new Date('2025-09-30')
      const label = '2025-09'

      const stats = calculatePeriodStatistics(branches, label, startDate, endDate)

      expect(stats.avgMrProcessingDays).toBe(15) // Only count branch c
    })

    it('should calculate median correctly for even number of branches', async () => {
      const { calculatePeriodStatistics } = await import('../../src/services/period-comparator.js')

      const branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/a', 10),
        createLifecycleForPeriod('feature/b', 20),
        createLifecycleForPeriod('feature/c', 30),
        createLifecycleForPeriod('feature/d', 40),
      ]

      const startDate = new Date('2025-09-01')
      const endDate = new Date('2025-09-30')
      const label = '2025-09'

      const stats = calculatePeriodStatistics(branches, label, startDate, endDate)

      expect(stats.medianLifecycleDays).toBe(25) // (20 + 30) / 2
    })
  })

  describe('comparePeriods()', () => {
    it('should compare two periods and calculate changes correctly', async () => {
      const { comparePeriods } = await import('../../src/services/period-comparator.js')

      const period1Branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/a', 10, 5),
        createLifecycleForPeriod('feature/b', 20, 10),
        createLifecycleForPeriod('feature/c', 30, 15),
      ]

      const period2Branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/d', 15, 7),
        createLifecycleForPeriod('feature/e', 25, 12),
        createLifecycleForPeriod('feature/f', 35, 17),
        createLifecycleForPeriod('feature/g', 45, 22),
      ]

      const period1Label = '2025-09'
      const period1Start = new Date('2025-09-01')
      const period1End = new Date('2025-09-30')

      const period2Label = '2025-10'
      const period2Start = new Date('2025-10-01')
      const period2End = new Date('2025-10-31')

      const comparison = comparePeriods(
        period1Branches,
        period2Branches,
        period1Label,
        period2Label,
        period1Start,
        period1End,
        period2Start,
        period2End
      )

      expect(comparison.period1.label).toBe('2025-09')
      expect(comparison.period1.totalBranches).toBe(3)
      expect(comparison.period1.avgLifecycleDays).toBe(20) // (10 + 20 + 30) / 3

      expect(comparison.period2.label).toBe('2025-10')
      expect(comparison.period2.totalBranches).toBe(4)
      expect(comparison.period2.avgLifecycleDays).toBe(30) // (15 + 25 + 35 + 45) / 4

      expect(comparison.changes.avgLifecycleDaysChange).toBe(10) // 30 - 20
      expect(comparison.changes.medianLifecycleDaysChange).toBe(10) // 30 - 20
      expect(comparison.changes.totalBranchesChange).toBe(1) // 4 - 3
    })

    it('should identify "improving" trend when avg lifecycle decreases > 2 days', async () => {
      const { comparePeriods } = await import('../../src/services/period-comparator.js')

      const period1Branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/a', 30),
      ]

      const period2Branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/b', 25),
      ]

      const comparison = comparePeriods(
        period1Branches,
        period2Branches,
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )

      expect(comparison.changes.avgLifecycleDaysChange).toBe(-5) // 25 - 30
      expect(comparison.changes.avgLifecycleTrend).toBe('improving')
    })

    it('should identify "worsening" trend when avg lifecycle increases > 2 days', async () => {
      const { comparePeriods } = await import('../../src/services/period-comparator.js')

      const period1Branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/a', 20),
      ]

      const period2Branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/b', 30),
      ]

      const comparison = comparePeriods(
        period1Branches,
        period2Branches,
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )

      expect(comparison.changes.avgLifecycleDaysChange).toBe(10) // 30 - 20
      expect(comparison.changes.avgLifecycleTrend).toBe('worsening')
    })

    it('should identify "stable" trend when change is within ±2 days', async () => {
      const { comparePeriods } = await import('../../src/services/period-comparator.js')

      const testCases = [
        { period1Avg: 20, period2Avg: 21, expectedChange: 1 }, // +1 day
        { period1Avg: 20, period2Avg: 19, expectedChange: -1 }, // -1 day
        { period1Avg: 20, period2Avg: 22, expectedChange: 2 }, // +2 days (boundary)
        { period1Avg: 20, period2Avg: 18, expectedChange: -2 }, // -2 days (boundary)
        { period1Avg: 20, period2Avg: 20, expectedChange: 0 }, // No change
      ]

      for (const testCase of testCases) {
        const period1Branches: BranchLifecycle[] = [
          createLifecycleForPeriod('feature/a', testCase.period1Avg),
        ]

        const period2Branches: BranchLifecycle[] = [
          createLifecycleForPeriod('feature/b', testCase.period2Avg),
        ]

        const comparison = comparePeriods(
          period1Branches,
          period2Branches,
          '2025-09',
          '2025-10',
          new Date('2025-09-01'),
          new Date('2025-09-30'),
          new Date('2025-10-01'),
          new Date('2025-10-31')
        )

        expect(comparison.changes.avgLifecycleDaysChange).toBe(testCase.expectedChange)
        expect(comparison.changes.avgLifecycleTrend).toBe('stable')
      }
    })

    it('should handle boundary cases for trend detection', async () => {
      const { comparePeriods } = await import('../../src/services/period-comparator.js')

      // Test: exactly -2.0 days → stable
      const improvingBoundary = comparePeriods(
        [createLifecycleForPeriod('a', 22)],
        [createLifecycleForPeriod('b', 20)],
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )
      expect(improvingBoundary.changes.avgLifecycleTrend).toBe('stable')

      // Test: exactly +2.0 days → stable
      const worseningBoundary = comparePeriods(
        [createLifecycleForPeriod('a', 20)],
        [createLifecycleForPeriod('b', 22)],
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )
      expect(worseningBoundary.changes.avgLifecycleTrend).toBe('stable')

      // Test: -2.1 days → improving
      const justImproving = comparePeriods(
        [createLifecycleForPeriod('a', 22.1)],
        [createLifecycleForPeriod('b', 20)],
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )
      expect(justImproving.changes.avgLifecycleTrend).toBe('improving')

      // Test: +2.1 days → worsening
      const justWorsening = comparePeriods(
        [createLifecycleForPeriod('a', 20)],
        [createLifecycleForPeriod('b', 22.1)],
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )
      expect(justWorsening.changes.avgLifecycleTrend).toBe('worsening')
    })

    it('should handle empty periods correctly', async () => {
      const { comparePeriods } = await import('../../src/services/period-comparator.js')

      const comparison = comparePeriods(
        [],
        [],
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )

      expect(comparison.period1.totalBranches).toBe(0)
      expect(comparison.period2.totalBranches).toBe(0)
      expect(comparison.changes.avgLifecycleDaysChange).toBe(0)
      expect(comparison.changes.totalBranchesChange).toBe(0)
      expect(comparison.changes.avgLifecycleTrend).toBe('stable')
    })

    it('should handle one empty period', async () => {
      const { comparePeriods } = await import('../../src/services/period-comparator.js')

      const period2Branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/a', 20),
      ]

      const comparison = comparePeriods(
        [],
        period2Branches,
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )

      expect(comparison.period1.totalBranches).toBe(0)
      expect(comparison.period2.totalBranches).toBe(1)
      expect(comparison.changes.totalBranchesChange).toBe(1)
    })
  })

  describe('Edge cases and validation', () => {
    it('should handle large datasets efficiently', async () => {
      const { comparePeriods } = await import('../../src/services/period-comparator.js')

      const period1Branches: BranchLifecycle[] = Array.from({ length: 200 }, (_, i) =>
        createLifecycleForPeriod(`feature/p1-${i}`, 10 + i % 50, 5 + i % 20)
      )

      const period2Branches: BranchLifecycle[] = Array.from({ length: 250 }, (_, i) =>
        createLifecycleForPeriod(`feature/p2-${i}`, 15 + i % 60, 7 + i % 25)
      )

      const startTime = Date.now()

      const comparison = comparePeriods(
        period1Branches,
        period2Branches,
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )

      const duration = Date.now() - startTime

      expect(comparison.period1.totalBranches).toBe(200)
      expect(comparison.period2.totalBranches).toBe(250)
      expect(duration).toBeLessThan(1000) // Should complete in < 1 second
    })

    it('should handle branches with same lifecycle days (no variation)', async () => {
      const { calculatePeriodStatistics } = await import('../../src/services/period-comparator.js')

      const branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/a', 20, 10),
        createLifecycleForPeriod('feature/b', 20, 10),
        createLifecycleForPeriod('feature/c', 20, 10),
      ]

      const stats = calculatePeriodStatistics(
        branches,
        '2025-09',
        new Date('2025-09-01'),
        new Date('2025-09-30')
      )

      expect(stats.avgLifecycleDays).toBe(20)
      expect(stats.medianLifecycleDays).toBe(20)
      expect(stats.maxLifecycleDays).toBe(20)
      expect(stats.avgMrProcessingDays).toBe(10)
    })

    it('should handle extreme values correctly', async () => {
      const { calculatePeriodStatistics } = await import('../../src/services/period-comparator.js')

      const branches: BranchLifecycle[] = [
        createLifecycleForPeriod('feature/a', 1, 1), // Very short
        createLifecycleForPeriod('feature/b', 500, 200), // Very long
        createLifecycleForPeriod('feature/c', 50, 25), // Normal
      ]

      const stats = calculatePeriodStatistics(
        branches,
        '2025-09',
        new Date('2025-09-01'),
        new Date('2025-09-30')
      )

      expect(stats.avgLifecycleDays).toBeCloseTo(183.67, 1) // (1 + 500 + 50) / 3
      expect(stats.medianLifecycleDays).toBe(50) // Middle value
      expect(stats.maxLifecycleDays).toBe(500)
      expect(stats.avgMrProcessingDays).toBeCloseTo(75.33, 1) // (1 + 200 + 25) / 3
    })
  })
})
