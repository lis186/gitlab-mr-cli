/**
 * Period Comparator Service
 *
 * T051: Compares branch health metrics across different time periods
 * Implements period-by-period analysis to track improvement or regression
 *
 * Based on specs/003-branch-lifecycle-optimized/data-model.md
 *
 * @module services/period-comparator
 */

import type { BranchLifecycle, PeriodStatistics, PeriodComparison, PeriodChanges } from '../types/branch-health.js'
import { mean, median } from '../utils/statistics.js'

/**
 * Calculate statistics for a single time period
 *
 * @param branches - Branch lifecycles for this period
 * @param label - Period label (e.g., "2025-09")
 * @param startDate - Period start date
 * @param endDate - Period end date
 * @returns Period statistics
 */
export function calculatePeriodStatistics(
  branches: BranchLifecycle[],
  label: string,
  startDate: Date,
  endDate: Date
): PeriodStatistics {
  const totalBranches = branches.length

  // Handle empty branch list
  if (totalBranches === 0) {
    return {
      label,
      startDate,
      endDate,
      totalBranches: 0,
      avgLifecycleDays: 0,
      medianLifecycleDays: 0,
      maxLifecycleDays: 0,
      avgMrProcessingDays: 0,
    }
  }

  // Extract lifecycle days
  const lifecycleDays = branches.map(b => b.totalLifecycleDays)

  // Calculate lifecycle statistics
  const avgLifecycleDays = mean(lifecycleDays)
  const medianLifecycleDays = median(lifecycleDays)
  const maxLifecycleDays = Math.max(...lifecycleDays)

  // Calculate MR processing days (only for branches with MR)
  const mrProcessingDays = branches
    .map(b => b.mrProcessingDays)
    .filter((days): days is number => days !== null)

  const avgMrProcessingDays = mrProcessingDays.length > 0
    ? mean(mrProcessingDays)
    : 0

  return {
    label,
    startDate,
    endDate,
    totalBranches,
    avgLifecycleDays,
    medianLifecycleDays,
    maxLifecycleDays,
    avgMrProcessingDays,
  }
}

/**
 * Compare two time periods and calculate changes
 *
 * Trend determination (based on data-model.md):
 * - avgLifecycleDaysChange < -2.0 → "improving" (lifecycle decreased > 2 days)
 * - avgLifecycleDaysChange > 2.0 → "worsening" (lifecycle increased > 2 days)
 * - Otherwise → "stable" (change within ±2 days)
 *
 * @param period1Branches - Branches from first period
 * @param period2Branches - Branches from second period
 * @param period1Label - First period label
 * @param period2Label - Second period label
 * @param period1Start - First period start date
 * @param period1End - First period end date
 * @param period2Start - Second period start date
 * @param period2End - Second period end date
 * @returns Period comparison with changes and trends
 */
export function comparePeriods(
  period1Branches: BranchLifecycle[],
  period2Branches: BranchLifecycle[],
  period1Label: string,
  period2Label: string,
  period1Start: Date,
  period1End: Date,
  period2Start: Date,
  period2End: Date
): PeriodComparison {
  // Calculate statistics for each period
  const period1 = calculatePeriodStatistics(period1Branches, period1Label, period1Start, period1End)
  const period2 = calculatePeriodStatistics(period2Branches, period2Label, period2Start, period2End)

  // Calculate changes
  const avgLifecycleDaysChange = period2.avgLifecycleDays - period1.avgLifecycleDays
  const medianLifecycleDaysChange = period2.medianLifecycleDays - period1.medianLifecycleDays
  const totalBranchesChange = period2.totalBranches - period1.totalBranches

  // Determine trend (threshold: 2.0 days)
  const threshold = 2.0
  let avgLifecycleTrend: 'improving' | 'worsening' | 'stable'

  if (avgLifecycleDaysChange < -threshold) {
    avgLifecycleTrend = 'improving'
  } else if (avgLifecycleDaysChange > threshold) {
    avgLifecycleTrend = 'worsening'
  } else {
    avgLifecycleTrend = 'stable'
  }

  const changes: PeriodChanges = {
    avgLifecycleDaysChange,
    avgLifecycleTrend,
    medianLifecycleDaysChange,
    totalBranchesChange,
  }

  return {
    period1,
    period2,
    changes,
  }
}
