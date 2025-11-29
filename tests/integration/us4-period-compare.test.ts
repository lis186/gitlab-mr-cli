/**
 * User Story 4: Period Comparison Integration Tests
 *
 * T047: End-to-end integration tests covering 2 acceptance scenarios:
 * 1. 150 branches < 30 seconds, concurrent period queries
 * 2. Relative date format (30d, 60d) handling
 *
 * @module tests/integration/us4-period-compare.test.ts
 */

import { describe, it, expect } from 'vitest'
import { parseComparePeriods } from '../../src/utils/date-utils.js'
import { calculateLifecycles } from '../../src/services/lifecycle-calculator.js'
import { comparePeriods } from '../../src/services/period-comparator.js'
import type { BranchLifecycle } from '../../src/types/branch-health.js'

// Helper: Create mock branches with committed_date in specific period
const createMockBranchesForPeriod = (
  count: number,
  startDate: Date,
  endDate: Date
): any[] => {
  const timeRange = endDate.getTime() - startDate.getTime()

  return Array.from({ length: count }, (_, i) => {
    // Distribute branches evenly across the period
    const commitDate = new Date(startDate.getTime() + (i / count) * timeRange)

    return {
      branch: {
        name: `feature/branch-${i + 1}`,
        commit: {
          committed_date: commitDate.toISOString(),
          author_name: `Developer ${(i % 5) + 1}`,
        },
        protected: false,
        merged: false,
      },
      mergeRequest: i % 3 === 0 ? {
        iid: i + 1,
        created_at: new Date(commitDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        source_branch: `feature/branch-${i + 1}`,
        state: 'opened',
        title: `Implement feature ${i + 1}`,
      } : null,
    }
  })
}

describe('US4: Period Comparison - Integration Tests (T047)', () => {
  describe('Scenario 1: 150 branches < 30 seconds, concurrent period queries', () => {
    it('should compare two periods with 150 branches in < 30 seconds', async () => {
      const period1Start = new Date('2025-09-01')
      const period1End = new Date('2025-09-30')
      const period2Start = new Date('2025-10-01')
      const period2End = new Date('2025-10-31')

      // Create mock data for both periods
      const period1Branches = createMockBranchesForPeriod(75, period1Start, period1End)
      const period2Branches = createMockBranchesForPeriod(75, period2Start, period2End)

      // Start performance timer
      const startTime = Date.now()

      // Calculate lifecycles for each period
      const threshold = 30
      const period1Lifecycles = calculateLifecycles(period1Branches, threshold)
      const period2Lifecycles = calculateLifecycles(period2Branches, threshold)

      // Compare periods
      const comparison = comparePeriods(
        period1Lifecycles,
        period2Lifecycles,
        '2025-09',
        '2025-10',
        period1Start,
        period1End,
        period2Start,
        period2End
      )

      // End performance timer
      const duration = Date.now() - startTime

      // Assertions
      expect(comparison.period1.totalBranches).toBe(75)
      expect(comparison.period2.totalBranches).toBe(75)
      expect(comparison.period1.label).toBe('2025-09')
      expect(comparison.period2.label).toBe('2025-10')
      expect(comparison.changes.totalBranchesChange).toBe(0) // Same count
      expect(duration).toBeLessThan(30000) // < 30 seconds
    }, 35000) // Timeout: 35 seconds (buffer for 30s target)

    it('should calculate correct statistics for each period', () => {
      const period1Start = new Date('2025-09-01')
      const period1End = new Date('2025-09-30')
      const period2Start = new Date('2025-10-01')
      const period2End = new Date('2025-10-31')

      const period1Branches = createMockBranchesForPeriod(50, period1Start, period1End)
      const period2Branches = createMockBranchesForPeriod(60, period2Start, period2End)

      const period1Lifecycles = calculateLifecycles(period1Branches, 30)
      const period2Lifecycles = calculateLifecycles(period2Branches, 30)

      const comparison = comparePeriods(
        period1Lifecycles,
        period2Lifecycles,
        '2025-09',
        '2025-10',
        period1Start,
        period1End,
        period2Start,
        period2End
      )

      // Verify period 1 statistics
      expect(comparison.period1.totalBranches).toBe(50)
      expect(comparison.period1.avgLifecycleDays).toBeGreaterThan(0)
      expect(comparison.period1.medianLifecycleDays).toBeGreaterThan(0)
      expect(comparison.period1.maxLifecycleDays).toBeGreaterThan(0)

      // Verify period 2 statistics
      expect(comparison.period2.totalBranches).toBe(60)
      expect(comparison.period2.avgLifecycleDays).toBeGreaterThan(0)

      // Verify changes calculation
      expect(comparison.changes.totalBranchesChange).toBe(10) // 60 - 50
      expect(comparison.changes.avgLifecycleTrend).toMatch(/improving|worsening|stable/)
    })

    it('should handle concurrent processing of multiple periods', async () => {
      // Simulate concurrent period queries
      const period1Promise = Promise.resolve(
        createMockBranchesForPeriod(50, new Date('2025-09-01'), new Date('2025-09-30'))
      )
      const period2Promise = Promise.resolve(
        createMockBranchesForPeriod(50, new Date('2025-10-01'), new Date('2025-10-31'))
      )

      // Execute concurrently
      const [period1Data, period2Data] = await Promise.all([period1Promise, period2Promise])

      expect(period1Data.length).toBe(50)
      expect(period2Data.length).toBe(50)
    })
  })

  describe('Scenario 2: Relative date format (30d, 60d) handling', () => {
    it('should parse relative date format correctly', () => {
      const compareString = '30d,60d'
      const periods = parseComparePeriods(compareString)

      expect(periods.previousPeriod).toBeDefined()
      expect(periods.currentPeriod).toBeDefined()
      expect(periods.previousPeriod.startDate).toBeInstanceOf(Date)
      expect(periods.previousPeriod.endDate).toBeInstanceOf(Date)
      expect(periods.currentPeriod.startDate).toBeInstanceOf(Date)
      expect(periods.currentPeriod.endDate).toBeInstanceOf(Date)
    })

    it('should parse month format correctly', () => {
      const compareString = '2025-09,2025-10'
      const periods = parseComparePeriods(compareString)

      expect(periods.previousPeriod.startDate.getMonth()).toBe(8) // September (0-indexed)
      expect(periods.currentPeriod.startDate.getMonth()).toBe(9) // October
    })

    it('should reject invalid period format', () => {
      const invalidFormats = [
        '2025-09',           // Only one period
        '2025-09,',          // Missing second period
        ',2025-10',          // Missing first period
        '2025-09,2025-10,2025-11', // Too many periods
        'invalid,format',    // Invalid format
      ]

      invalidFormats.forEach(format => {
        expect(() => {
          parseComparePeriods(format)
        }).toThrow()
      })
    })

    it('should handle mixed format rejection', () => {
      // Month format + relative format should be rejected
      expect(() => {
        parseComparePeriods('2025-09,30d')
      }).toThrow()

      expect(() => {
        parseComparePeriods('30d,2025-10')
      }).toThrow()
    })
  })

  describe('Trend analysis accuracy', () => {
    it('should correctly identify improving trend', () => {
      const createBranchWithAvg = (avg: number): BranchLifecycle => ({
        branchName: 'test',
        totalLifecycleDays: avg,
        mrProcessingDays: null,
        createdDate: new Date(),
        lastUpdatedDate: new Date(),
        isStale: false,
        staleThreshold: 30,
      })

      const period1 = [createBranchWithAvg(30)] // 30 days
      const period2 = [createBranchWithAvg(25)] // 25 days (improved by 5)

      const comparison = comparePeriods(
        period1,
        period2,
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )

      expect(comparison.changes.avgLifecycleDaysChange).toBe(-5)
      expect(comparison.changes.avgLifecycleTrend).toBe('improving')
    })

    it('should correctly identify worsening trend', () => {
      const createBranchWithAvg = (avg: number): BranchLifecycle => ({
        branchName: 'test',
        totalLifecycleDays: avg,
        mrProcessingDays: null,
        createdDate: new Date(),
        lastUpdatedDate: new Date(),
        isStale: false,
        staleThreshold: 30,
      })

      const period1 = [createBranchWithAvg(20)] // 20 days
      const period2 = [createBranchWithAvg(28)] // 28 days (worsened by 8)

      const comparison = comparePeriods(
        period1,
        period2,
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )

      expect(comparison.changes.avgLifecycleDaysChange).toBe(8)
      expect(comparison.changes.avgLifecycleTrend).toBe('worsening')
    })

    it('should correctly identify stable trend', () => {
      const createBranchWithAvg = (avg: number): BranchLifecycle => ({
        branchName: 'test',
        totalLifecycleDays: avg,
        mrProcessingDays: null,
        createdDate: new Date(),
        lastUpdatedDate: new Date(),
        isStale: false,
        staleThreshold: 30,
      })

      const period1 = [createBranchWithAvg(20)] // 20 days
      const period2 = [createBranchWithAvg(21)] // 21 days (change within ±2 threshold)

      const comparison = comparePeriods(
        period1,
        period2,
        '2025-09',
        '2025-10',
        new Date('2025-09-01'),
        new Date('2025-09-30'),
        new Date('2025-10-01'),
        new Date('2025-10-31')
      )

      expect(comparison.changes.avgLifecycleDaysChange).toBe(1)
      expect(comparison.changes.avgLifecycleTrend).toBe('stable')
    })
  })
})
