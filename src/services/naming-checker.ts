/**
 * Naming Convention Checker
 *
 * T042: Checks if branch names match team naming conventions
 * Only checks active branches (totalLifecycleDays ≤ 90)
 *
 * Based on specs/003-branch-lifecycle-optimized/data-model.md
 *
 * @module services/naming-checker
 */

import type { BranchLifecycle } from '../types/branch-health.js'

/**
 * Naming convention validation result
 */
export interface NamingConvention {
  branchName: string
  matchesPattern: boolean
  pattern: string
  isActive: boolean
  lastUpdatedDate: Date
}

/**
 * Naming check statistics
 */
export interface NamingStatistics {
  totalBranches: number
  activeBranches: number
  inactiveBranches: number
  matchingBranches: number
  nonMatchingBranches: number
  matchRate: number // Percentage (0-100)
}

/**
 * Check if a branch name matches the naming convention
 *
 * @param lifecycle - Branch lifecycle data
 * @param patternStr - Regular expression pattern string
 * @returns NamingConvention result, or null if branch is inactive (> 90 days)
 */
export function checkNamingConvention(
  lifecycle: BranchLifecycle,
  patternStr: string
): NamingConvention | null {
  const isActive = lifecycle.totalLifecycleDays <= 90

  // Only check active branches (FR-006)
  if (!isActive) {
    return null
  }

  try {
    const pattern = new RegExp(patternStr)
    const matchesPattern = pattern.test(lifecycle.branchName)

    return {
      branchName: lifecycle.branchName,
      matchesPattern,
      pattern: patternStr,
      isActive,
      lastUpdatedDate: lifecycle.lastUpdatedDate,
    }
  } catch (error) {
    // Invalid regex pattern - will be caught at command validation level
    throw new Error(`Invalid regular expression pattern: ${patternStr}`)
  }
}

/**
 * Check naming conventions for multiple branches
 *
 * @param lifecycles - Array of branch lifecycles
 * @param patternStr - Regular expression pattern string
 * @returns Array of naming convention results (excluding inactive branches)
 */
export function checkBranchNaming(
  lifecycles: BranchLifecycle[],
  patternStr: string
): NamingConvention[] {
  const results: NamingConvention[] = []

  for (const lifecycle of lifecycles) {
    const result = checkNamingConvention(lifecycle, patternStr)
    if (result) {
      // Only include active branches
      results.push(result)
    }
  }

  return results
}

/**
 * Calculate naming check statistics
 *
 * @param lifecycles - Array of branch lifecycles
 * @param namingResults - Array of naming convention results
 * @returns Naming statistics
 */
export function calculateNamingStatistics(
  lifecycles: BranchLifecycle[],
  namingResults: NamingConvention[]
): NamingStatistics {
  const totalBranches = lifecycles.length
  const activeBranches = namingResults.length
  const inactiveBranches = totalBranches - activeBranches

  const matchingBranches = namingResults.filter(r => r.matchesPattern).length
  const nonMatchingBranches = activeBranches - matchingBranches

  const matchRate = activeBranches > 0 ? (matchingBranches / activeBranches) * 100 : 0

  return {
    totalBranches,
    activeBranches,
    inactiveBranches,
    matchingBranches,
    nonMatchingBranches,
    matchRate,
  }
}

/**
 * Validate regular expression pattern
 *
 * @param patternStr - Pattern string to validate
 * @returns Validation result with error message if invalid
 */
export function validatePattern(patternStr: string): {
  isValid: boolean
  error?: string
  suggestion?: string
} {
  if (!patternStr || patternStr.trim() === '') {
    return {
      isValid: false,
      error: 'Pattern cannot be empty',
      suggestion: 'Example: "^(feature|bugfix|hotfix)/"',
    }
  }

  try {
    new RegExp(patternStr)
    return { isValid: true }
  } catch (error: any) {
    return {
      isValid: false,
      error: `Invalid regular expression: ${error.message}`,
      suggestion: 'Example patterns: "^(feature|bugfix|hotfix)/", "^[a-z]+/[a-z0-9-]+$"',
    }
  }
}

/**
 * Get branches that match the naming convention
 *
 * @param namingResults - Array of naming convention results
 * @returns Array of matching branches
 */
export function getMatchingBranches(namingResults: NamingConvention[]): NamingConvention[] {
  return namingResults.filter(r => r.matchesPattern)
}

/**
 * Get branches that do NOT match the naming convention
 *
 * @param namingResults - Array of naming convention results
 * @returns Array of non-matching branches
 */
export function getNonMatchingBranches(namingResults: NamingConvention[]): NamingConvention[] {
  return namingResults.filter(r => !r.matchesPattern)
}
