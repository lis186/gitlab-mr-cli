/**
 * Naming Checker Unit Tests
 *
 * T041: Unit tests for naming-checker service
 * Tests all naming convention functions: checkNamingConvention, checkBranchNaming,
 * calculateNamingStatistics, validatePattern, getMatchingBranches, getNonMatchingBranches
 *
 * @module tests/unit/naming-checker.test.ts
 */

import { describe, it, expect } from 'vitest'
import type { BranchLifecycle } from '../../src/types/branch-health.js'
import {
  checkNamingConvention,
  checkBranchNaming,
  calculateNamingStatistics,
  validatePattern,
  getMatchingBranches,
  getNonMatchingBranches,
  type NamingConvention,
} from '../../src/services/naming-checker.js'

// Helper: Create mock branch lifecycle
const createLifecycle = (
  branchName: string,
  totalLifecycleDays: number,
  lastUpdatedDate: Date = new Date()
): BranchLifecycle => ({
  branchName,
  totalLifecycleDays,
  mrProcessingDays: null,
  createdDate: new Date(lastUpdatedDate.getTime() - totalLifecycleDays * 24 * 60 * 60 * 1000),
  lastUpdatedDate,
  isStale: totalLifecycleDays > 30,
  staleThreshold: 30,
})

describe('Naming Checker Unit Tests (T041)', () => {
  describe('checkNamingConvention()', () => {
    it('should return null for inactive branches (> 90 days)', () => {
      const lifecycle = createLifecycle('feature/old-branch', 100)
      const pattern = '^(feature|bugfix)/'

      const result = checkNamingConvention(lifecycle, pattern)

      expect(result).toBeNull()
    })

    it('should return NamingConvention for active branches (≤ 90 days)', () => {
      const lifecycle = createLifecycle('feature/new-branch', 50)
      const pattern = '^(feature|bugfix)/'

      const result = checkNamingConvention(lifecycle, pattern)

      expect(result).not.toBeNull()
      expect(result?.branchName).toBe('feature/new-branch')
      expect(result?.isActive).toBe(true)
      expect(result?.matchesPattern).toBe(true)
      expect(result?.pattern).toBe(pattern)
    })

    it('should correctly identify matching branches', () => {
      const pattern = '^(feature|bugfix|hotfix)/'
      const matchingBranches = [
        'feature/user-auth',
        'bugfix/fix-login',
        'hotfix/security-patch',
        'feature/add-dashboard',
      ]

      matchingBranches.forEach(branchName => {
        const lifecycle = createLifecycle(branchName, 30)
        const result = checkNamingConvention(lifecycle, pattern)

        expect(result).not.toBeNull()
        expect(result?.matchesPattern).toBe(true)
      })
    })

    it('should correctly identify non-matching branches', () => {
      const pattern = '^(feature|bugfix|hotfix)/'
      const nonMatchingBranches = [
        'random-branch',
        'develop-test',
        'main',
        '003-branch-lifecycle',
      ]

      nonMatchingBranches.forEach(branchName => {
        const lifecycle = createLifecycle(branchName, 30)
        const result = checkNamingConvention(lifecycle, pattern)

        expect(result).not.toBeNull()
        expect(result?.matchesPattern).toBe(false)
      })
    })

    it('should throw error for invalid regex pattern', () => {
      const lifecycle = createLifecycle('feature/test', 30)
      const invalidPattern = '^(feature|bugfix' // Unclosed parenthesis

      expect(() => {
        checkNamingConvention(lifecycle, invalidPattern)
      }).toThrow('Invalid regular expression pattern')
    })

    it('should handle complex regex patterns', () => {
      const testCases = [
        { pattern: '^[a-z]+/[a-z0-9-]+$', branch: 'feature/user-auth-123', expected: true },
        { pattern: '^[a-z]+/[a-z0-9-]+$', branch: 'Feature/UserAuth', expected: false },
        { pattern: '^\\d{3}-[a-z-]+$', branch: '003-branch-lifecycle', expected: true },
        { pattern: '^\\d{3}-[a-z-]+$', branch: 'branch-lifecycle', expected: false },
        { pattern: 'JIRA-\\d+', branch: 'feature/JIRA-123', expected: true },
        { pattern: 'JIRA-\\d+', branch: 'feature/jira-123', expected: false },
      ]

      testCases.forEach(({ pattern, branch, expected }) => {
        const lifecycle = createLifecycle(branch, 30)
        const result = checkNamingConvention(lifecycle, pattern)

        expect(result).not.toBeNull()
        expect(result?.matchesPattern).toBe(expected)
      })
    })

    it('should handle edge case: exactly 90 days (boundary)', () => {
      const lifecycle = createLifecycle('feature/boundary', 90)
      const pattern = '^feature/'

      const result = checkNamingConvention(lifecycle, pattern)

      expect(result).not.toBeNull() // 90 days is still active (≤ 90)
      expect(result?.isActive).toBe(true)
      expect(result?.matchesPattern).toBe(true)
    })

    it('should handle edge case: 91 days (just inactive)', () => {
      const lifecycle = createLifecycle('feature/just-inactive', 91)
      const pattern = '^feature/'

      const result = checkNamingConvention(lifecycle, pattern)

      expect(result).toBeNull() // 91 days is inactive (> 90)
    })
  })

  describe('checkBranchNaming()', () => {
    it('should check multiple branches and filter inactive ones', () => {
      const lifecycles: BranchLifecycle[] = [
        createLifecycle('feature/active-1', 30),
        createLifecycle('bugfix/active-2', 60),
        createLifecycle('feature/inactive-1', 100),
        createLifecycle('random-active', 20),
        createLifecycle('feature/inactive-2', 150),
      ]
      const pattern = '^(feature|bugfix)/'

      const results = checkBranchNaming(lifecycles, pattern)

      expect(results.length).toBe(3) // Only active branches (30, 60, 20 days)
      expect(results.every(r => r.isActive)).toBe(true)
      expect(results.some(r => r.branchName === 'feature/active-1')).toBe(true)
      expect(results.some(r => r.branchName === 'bugfix/active-2')).toBe(true)
      expect(results.some(r => r.branchName === 'random-active')).toBe(true)
      expect(results.some(r => r.branchName === 'feature/inactive-1')).toBe(false)
    })

    it('should return empty array when all branches are inactive', () => {
      const lifecycles: BranchLifecycle[] = [
        createLifecycle('feature/old-1', 100),
        createLifecycle('feature/old-2', 120),
        createLifecycle('bugfix/old-3', 200),
      ]
      const pattern = '^(feature|bugfix)/'

      const results = checkBranchNaming(lifecycles, pattern)

      expect(results.length).toBe(0)
    })

    it('should return empty array for empty input', () => {
      const results = checkBranchNaming([], '^feature/')

      expect(results.length).toBe(0)
    })

    it('should handle large branch lists efficiently', () => {
      const lifecycles: BranchLifecycle[] = Array.from({ length: 500 }, (_, i) =>
        createLifecycle(`feature/branch-${i}`, i % 100) // Mix of active/inactive
      )
      const pattern = '^feature/'

      const startTime = Date.now()
      const results = checkBranchNaming(lifecycles, pattern)
      const duration = Date.now() - startTime

      expect(results.length).toBeGreaterThan(0)
      expect(results.length).toBeLessThan(lifecycles.length) // Some filtered
      expect(duration).toBeLessThan(1000) // Should complete in < 1 second
    })
  })

  describe('calculateNamingStatistics()', () => {
    it('should calculate correct statistics', () => {
      const lifecycles: BranchLifecycle[] = [
        createLifecycle('feature/active-1', 30),
        createLifecycle('bugfix/active-2', 60),
        createLifecycle('random-active', 20),
        createLifecycle('feature/inactive-1', 100),
        createLifecycle('feature/inactive-2', 150),
      ]

      const namingResults: NamingConvention[] = [
        {
          branchName: 'feature/active-1',
          matchesPattern: true,
          pattern: '^(feature|bugfix)/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'bugfix/active-2',
          matchesPattern: true,
          pattern: '^(feature|bugfix)/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'random-active',
          matchesPattern: false,
          pattern: '^(feature|bugfix)/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
      ]

      const statistics = calculateNamingStatistics(lifecycles, namingResults)

      expect(statistics.totalBranches).toBe(5)
      expect(statistics.activeBranches).toBe(3)
      expect(statistics.inactiveBranches).toBe(2)
      expect(statistics.matchingBranches).toBe(2)
      expect(statistics.nonMatchingBranches).toBe(1)
      expect(statistics.matchRate).toBeCloseTo(66.67, 1) // 2/3 * 100 ≈ 66.67%
    })

    it('should handle 100% match rate', () => {
      const lifecycles: BranchLifecycle[] = [
        createLifecycle('feature/a', 30),
        createLifecycle('bugfix/b', 60),
      ]

      const namingResults: NamingConvention[] = [
        {
          branchName: 'feature/a',
          matchesPattern: true,
          pattern: '^(feature|bugfix)/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'bugfix/b',
          matchesPattern: true,
          pattern: '^(feature|bugfix)/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
      ]

      const statistics = calculateNamingStatistics(lifecycles, namingResults)

      expect(statistics.matchRate).toBe(100)
      expect(statistics.matchingBranches).toBe(2)
      expect(statistics.nonMatchingBranches).toBe(0)
    })

    it('should handle 0% match rate', () => {
      const lifecycles: BranchLifecycle[] = [
        createLifecycle('random-a', 30),
        createLifecycle('develop-b', 60),
      ]

      const namingResults: NamingConvention[] = [
        {
          branchName: 'random-a',
          matchesPattern: false,
          pattern: '^(feature|bugfix)/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'develop-b',
          matchesPattern: false,
          pattern: '^(feature|bugfix)/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
      ]

      const statistics = calculateNamingStatistics(lifecycles, namingResults)

      expect(statistics.matchRate).toBe(0)
      expect(statistics.matchingBranches).toBe(0)
      expect(statistics.nonMatchingBranches).toBe(2)
    })

    it('should handle empty results (all branches inactive)', () => {
      const lifecycles: BranchLifecycle[] = [
        createLifecycle('feature/old-1', 100),
        createLifecycle('feature/old-2', 120),
      ]

      const namingResults: NamingConvention[] = []

      const statistics = calculateNamingStatistics(lifecycles, namingResults)

      expect(statistics.totalBranches).toBe(2)
      expect(statistics.activeBranches).toBe(0)
      expect(statistics.inactiveBranches).toBe(2)
      expect(statistics.matchingBranches).toBe(0)
      expect(statistics.nonMatchingBranches).toBe(0)
      expect(statistics.matchRate).toBe(0)
    })

    it('should handle empty input', () => {
      const statistics = calculateNamingStatistics([], [])

      expect(statistics.totalBranches).toBe(0)
      expect(statistics.activeBranches).toBe(0)
      expect(statistics.inactiveBranches).toBe(0)
      expect(statistics.matchingBranches).toBe(0)
      expect(statistics.nonMatchingBranches).toBe(0)
      expect(statistics.matchRate).toBe(0)
    })
  })

  describe('validatePattern()', () => {
    it('should accept valid regex patterns', () => {
      const validPatterns = [
        '^(feature|bugfix|hotfix)/',
        '^[a-z]+/[a-z0-9-]+$',
        '^feat/.*',
        'JIRA-\\d+',
        '^\\d{3}-[a-z-]+$',
      ]

      validPatterns.forEach(pattern => {
        const result = validatePattern(pattern)

        expect(result.isValid).toBe(true)
        expect(result.error).toBeUndefined()
        expect(result.suggestion).toBeUndefined()
      })
    })

    it('should reject empty pattern', () => {
      const result = validatePattern('')

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Pattern cannot be empty')
      expect(result.suggestion).toBe('Example: "^(feature|bugfix|hotfix)/"')
    })

    it('should reject whitespace-only pattern', () => {
      const result = validatePattern('   ')

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Pattern cannot be empty')
      expect(result.suggestion).toBe('Example: "^(feature|bugfix|hotfix)/"')
    })

    it('should reject invalid regex syntax', () => {
      const invalidPatterns = [
        '^(feature|bugfix', // Unclosed parenthesis
        '[a-z',             // Unclosed bracket
        '(?P<name>)',       // Named groups not supported in JS
        '*invalid',         // Invalid quantifier
      ]

      invalidPatterns.forEach(pattern => {
        const result = validatePattern(pattern)

        expect(result.isValid).toBe(false)
        expect(result.error).toContain('Invalid regular expression')
        expect(result.suggestion).toBeTruthy()
      })
    })

    it('should provide helpful suggestions', () => {
      const result1 = validatePattern('')
      expect(result1.suggestion).toContain('feature')

      const result2 = validatePattern('^(invalid')
      expect(result2.suggestion).toContain('Example patterns')
    })
  })

  describe('getMatchingBranches()', () => {
    it('should return only matching branches', () => {
      const namingResults: NamingConvention[] = [
        {
          branchName: 'feature/a',
          matchesPattern: true,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'random-b',
          matchesPattern: false,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'feature/c',
          matchesPattern: true,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
      ]

      const matching = getMatchingBranches(namingResults)

      expect(matching.length).toBe(2)
      expect(matching.every(r => r.matchesPattern)).toBe(true)
      expect(matching.some(r => r.branchName === 'feature/a')).toBe(true)
      expect(matching.some(r => r.branchName === 'feature/c')).toBe(true)
    })

    it('should return empty array when no matches', () => {
      const namingResults: NamingConvention[] = [
        {
          branchName: 'random-a',
          matchesPattern: false,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'random-b',
          matchesPattern: false,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
      ]

      const matching = getMatchingBranches(namingResults)

      expect(matching.length).toBe(0)
    })

    it('should return empty array for empty input', () => {
      const matching = getMatchingBranches([])

      expect(matching.length).toBe(0)
    })
  })

  describe('getNonMatchingBranches()', () => {
    it('should return only non-matching branches', () => {
      const namingResults: NamingConvention[] = [
        {
          branchName: 'feature/a',
          matchesPattern: true,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'random-b',
          matchesPattern: false,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'develop-c',
          matchesPattern: false,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
      ]

      const nonMatching = getNonMatchingBranches(namingResults)

      expect(nonMatching.length).toBe(2)
      expect(nonMatching.every(r => !r.matchesPattern)).toBe(true)
      expect(nonMatching.some(r => r.branchName === 'random-b')).toBe(true)
      expect(nonMatching.some(r => r.branchName === 'develop-c')).toBe(true)
    })

    it('should return empty array when all match', () => {
      const namingResults: NamingConvention[] = [
        {
          branchName: 'feature/a',
          matchesPattern: true,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
        {
          branchName: 'feature/b',
          matchesPattern: true,
          pattern: '^feature/',
          isActive: true,
          lastUpdatedDate: new Date(),
        },
      ]

      const nonMatching = getNonMatchingBranches(namingResults)

      expect(nonMatching.length).toBe(0)
    })

    it('should return empty array for empty input', () => {
      const nonMatching = getNonMatchingBranches([])

      expect(nonMatching.length).toBe(0)
    })
  })

  describe('Edge cases and boundary conditions', () => {
    it('should handle special characters in branch names', () => {
      const specialBranches = [
        'feature/user-auth_v2',
        'bugfix/fix-#123',
        'hotfix/security@patch',
        'feature/add.new.feature',
      ]

      specialBranches.forEach(branchName => {
        const lifecycle = createLifecycle(branchName, 30)
        const result = checkNamingConvention(lifecycle, '^(feature|bugfix|hotfix)/')

        expect(result).not.toBeNull()
        expect(result?.branchName).toBe(branchName)
      })
    })

    it('should handle case-sensitive pattern matching', () => {
      const lifecycle1 = createLifecycle('Feature/Test', 30)
      const lifecycle2 = createLifecycle('feature/test', 30)

      const pattern = '^feature/' // Lowercase only

      const result1 = checkNamingConvention(lifecycle1, pattern)
      const result2 = checkNamingConvention(lifecycle2, pattern)

      expect(result1?.matchesPattern).toBe(false) // 'Feature' doesn't match '^feature/'
      expect(result2?.matchesPattern).toBe(true)  // 'feature' matches
    })

    it('should handle very long branch names', () => {
      const longName = 'feature/' + 'a'.repeat(200)
      const lifecycle = createLifecycle(longName, 30)
      const pattern = '^feature/'

      const result = checkNamingConvention(lifecycle, pattern)

      expect(result).not.toBeNull()
      expect(result?.branchName).toBe(longName)
      expect(result?.matchesPattern).toBe(true)
    })

    it('should handle pattern matching entire branch name', () => {
      const lifecycle = createLifecycle('main', 30)
      const pattern = '^main$' // Exact match

      const result = checkNamingConvention(lifecycle, pattern)

      expect(result).not.toBeNull()
      expect(result?.matchesPattern).toBe(true)
    })
  })
})
