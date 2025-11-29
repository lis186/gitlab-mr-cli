/**
 * User Story 3: Naming Convention Check Integration Tests
 *
 * T040: End-to-end integration tests covering 2 acceptance scenarios:
 * 1. 200 branches < 10 seconds, filtering inactive branches
 * 2. Regular expression error handling
 *
 * @module tests/integration/us3-naming-check.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateLifecycles } from '../../src/services/lifecycle-calculator'
import { checkBranchNaming, calculateNamingStatistics, validatePattern } from '../../src/services/naming-checker'

// Mock GitLab API responses for naming check
const createMockBranchesWithMRs = (count: number, activeBranchCount: number) => {
  const now = Date.now()

  return Array.from({ length: count }, (_, i) => {
    // Create mix of active (< 90 days) and inactive (> 90 days) branches
    const daysOld = i < activeBranchCount ? i : 100 + i // First N are active, rest inactive
    const isActive = daysOld <= 90

    // Mix of naming patterns: feature/, bugfix/, hotfix/, random
    const namePatterns = [
      'feature/user-auth',
      'bugfix/fix-login',
      'hotfix/security-patch',
      'random-branch-name',
      'develop-something',
    ]
    const branchName = i < count / 2
      ? `${namePatterns[i % 3]}/${i + 1}` // Matches pattern
      : `${namePatterns[3]}-${i + 1}` // Doesn't match pattern

    return {
      branch: {
        name: branchName,
        commit: {
          committed_date: new Date(now - daysOld * 24 * 60 * 60 * 1000).toISOString(),
          author_name: `Developer ${(i % 5) + 1}`,
        },
        protected: false,
        merged: false,
      },
      mergeRequest: i % 3 === 0 ? {
        iid: i + 1,
        created_at: new Date(now - (daysOld - 5) * 24 * 60 * 60 * 1000).toISOString(),
        source_branch: branchName,
        state: 'opened',
        title: `Implement feature ${i + 1}`,
      } : null,
    }
  })
}

describe('US3: Naming Convention Check - Integration Tests (T040)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Scenario 1: 200 branches < 10 seconds, filtering inactive branches', () => {
    it('should check naming for 200 branches in < 10 seconds, filtering inactive branches (> 90 days)', async () => {
      const totalBranches = 200
      const activeBranches = 150 // Active: < 90 days
      const pattern = '^(feature|bugfix|hotfix)/' // Standard team naming convention

      const mockData = createMockBranchesWithMRs(totalBranches, activeBranches)

      // Start performance timer
      const startTime = Date.now()

      // Step 1: Calculate lifecycles
      const lifecycles = calculateLifecycles(mockData, 30)

      // Step 2: Check naming conventions (only active branches)
      const namingResults = checkBranchNaming(lifecycles, pattern)

      // Step 3: Calculate statistics
      const statistics = calculateNamingStatistics(lifecycles, namingResults)

      // End performance timer
      const endTime = Date.now()
      const executionTime = endTime - startTime

      // Assertions
      expect(lifecycles.length).toBe(totalBranches)
      expect(namingResults.length).toBeLessThanOrEqual(activeBranches) // Only active branches checked
      expect(executionTime).toBeLessThan(10000) // < 10 seconds

      // Verify active branch filtering (FR-006)
      namingResults.forEach(result => {
        expect(result.isActive).toBe(true)
        const lifecycle = lifecycles.find(lc => lc.branchName === result.branchName)
        expect(lifecycle?.totalLifecycleDays).toBeLessThanOrEqual(90)
      })

      // Verify statistics
      expect(statistics.totalBranches).toBe(totalBranches)
      expect(statistics.activeBranches).toBeLessThanOrEqual(activeBranches)
      expect(statistics.inactiveBranches).toBeGreaterThan(0)
      expect(statistics.matchingBranches + statistics.nonMatchingBranches).toBe(statistics.activeBranches)
      expect(statistics.matchRate).toBeGreaterThanOrEqual(0)
      expect(statistics.matchRate).toBeLessThanOrEqual(100)
    }, 15000) // Timeout: 15 seconds (buffer for 10s target)

    it('should correctly identify matching vs non-matching branches', () => {
      const pattern = '^(feature|bugfix|hotfix)/'

      const mockData = [
        {
          branch: {
            name: 'feature/user-auth',
            commit: {
              committed_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 1',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
        {
          branch: {
            name: 'bugfix/fix-login',
            commit: {
              committed_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 2',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
        {
          branch: {
            name: 'random-branch-name',
            commit: {
              committed_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 3',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
        {
          branch: {
            name: 'develop-test',
            commit: {
              committed_date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // Inactive
              author_name: 'Developer 4',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
      ]

      const lifecycles = calculateLifecycles(mockData, 30)
      const namingResults = checkBranchNaming(lifecycles, pattern)

      // Only active branches (< 90 days) should be checked
      expect(namingResults.length).toBe(3) // Excludes 'develop-test' (100 days old)

      // Verify matching branches
      const matching = namingResults.filter(r => r.matchesPattern)
      expect(matching.length).toBe(2) // 'feature/user-auth', 'bugfix/fix-login'
      expect(matching.some(r => r.branchName === 'feature/user-auth')).toBe(true)
      expect(matching.some(r => r.branchName === 'bugfix/fix-login')).toBe(true)

      // Verify non-matching branches
      const nonMatching = namingResults.filter(r => !r.matchesPattern)
      expect(nonMatching.length).toBe(1) // 'random-branch-name'
      expect(nonMatching[0].branchName).toBe('random-branch-name')
    })

    it('should exclude all branches when all are inactive (> 90 days)', () => {
      const pattern = '^(feature|bugfix|hotfix)/'

      const mockData = [
        {
          branch: {
            name: 'feature/old-feature',
            commit: {
              committed_date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days
              author_name: 'Developer 1',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
        {
          branch: {
            name: 'bugfix/old-fix',
            commit: {
              committed_date: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), // 120 days
              author_name: 'Developer 2',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
      ]

      const lifecycles = calculateLifecycles(mockData, 30)
      const namingResults = checkBranchNaming(lifecycles, pattern)

      // All branches are inactive, so none should be checked
      expect(namingResults.length).toBe(0)
    })
  })

  describe('Scenario 2: Regular expression error handling', () => {
    it('should reject invalid regex patterns with helpful error message', () => {
      const invalidPatterns = [
        '',                    // Empty pattern
        '   ',                 // Whitespace only
        '^(feature|bugfix',    // Unclosed parenthesis
        '[a-z',                // Unclosed bracket
        '(?P<name>)',          // Invalid named group (not supported in JS)
      ]

      invalidPatterns.forEach(pattern => {
        const result = validatePattern(pattern)

        expect(result.isValid).toBe(false)
        expect(result.error).toBeTruthy()

        if (pattern.trim() === '') {
          expect(result.error).toContain('empty')
        } else {
          expect(result.error).toContain('Invalid regular expression')
        }

        // Should provide suggestion
        expect(result.suggestion).toBeTruthy()
      })
    })

    it('should accept valid regex patterns', () => {
      const validPatterns = [
        '^(feature|bugfix|hotfix)/',
        '^[a-z]+/[a-z0-9-]+$',
        '^feat/.*',
        'JIRA-\\d+',
      ]

      validPatterns.forEach(pattern => {
        const result = validatePattern(pattern)

        expect(result.isValid).toBe(true)
        expect(result.error).toBeUndefined()
        expect(result.suggestion).toBeUndefined()
      })
    })

    it('should throw error when checkBranchNaming receives invalid pattern', () => {
      const mockData = createMockBranchesWithMRs(10, 5)
      const lifecycles = calculateLifecycles(mockData, 30)
      const invalidPattern = '^(feature|bugfix' // Unclosed parenthesis

      expect(() => {
        checkBranchNaming(lifecycles, invalidPattern)
      }).toThrow('Invalid regular expression pattern')
    })

    it('should handle complex regex patterns correctly', () => {
      const complexPatterns = [
        { pattern: '^(feature|bugfix|hotfix)/[A-Z]+-\\d+', name: 'JIRA ticket format' },
        { pattern: '^\\d{3}-[a-z-]+$', name: 'Numeric prefix with kebab-case' },
        { pattern: '^(feat|fix|docs|style|refactor|test|chore)/', name: 'Conventional commits' },
      ]

      const mockData = [
        {
          branch: {
            name: 'feature/JIRA-123',
            commit: {
              committed_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 1',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
        {
          branch: {
            name: '003-branch-lifecycle',
            commit: {
              committed_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 2',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
        {
          branch: {
            name: 'feat/new-feature',
            commit: {
              committed_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 3',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
      ]

      const lifecycles = calculateLifecycles(mockData, 30)

      // Test each pattern
      const results1 = checkBranchNaming(lifecycles, complexPatterns[0].pattern)
      expect(results1.filter(r => r.matchesPattern).length).toBe(1) // Only 'feature/JIRA-123'

      const results2 = checkBranchNaming(lifecycles, complexPatterns[1].pattern)
      expect(results2.filter(r => r.matchesPattern).length).toBe(1) // Only '003-branch-lifecycle'

      const results3 = checkBranchNaming(lifecycles, complexPatterns[2].pattern)
      expect(results3.filter(r => r.matchesPattern).length).toBe(1) // Only 'feat/new-feature'
    })
  })

  describe('Performance and edge cases', () => {
    it('should handle empty branch list gracefully', () => {
      const pattern = '^(feature|bugfix|hotfix)/'
      const lifecycles = calculateLifecycles([], 30)
      const namingResults = checkBranchNaming(lifecycles, pattern)

      expect(lifecycles.length).toBe(0)
      expect(namingResults.length).toBe(0)
    })

    it('should handle 100% match rate correctly', () => {
      const pattern = '^(feature|bugfix)/'

      const mockData = [
        {
          branch: {
            name: 'feature/test-1',
            commit: {
              committed_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 1',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
        {
          branch: {
            name: 'bugfix/test-2',
            commit: {
              committed_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 2',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
      ]

      const lifecycles = calculateLifecycles(mockData, 30)
      const namingResults = checkBranchNaming(lifecycles, pattern)
      const statistics = calculateNamingStatistics(lifecycles, namingResults)

      expect(statistics.matchRate).toBe(100)
      expect(statistics.nonMatchingBranches).toBe(0)
    })

    it('should handle 0% match rate correctly', () => {
      const pattern = '^(feature|bugfix)/'

      const mockData = [
        {
          branch: {
            name: 'random-branch-1',
            commit: {
              committed_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 1',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
        {
          branch: {
            name: 'develop-test',
            commit: {
              committed_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
              author_name: 'Developer 2',
            },
            protected: false,
            merged: false,
          },
          mergeRequest: null,
        },
      ]

      const lifecycles = calculateLifecycles(mockData, 30)
      const namingResults = checkBranchNaming(lifecycles, pattern)
      const statistics = calculateNamingStatistics(lifecycles, namingResults)

      expect(statistics.matchRate).toBe(0)
      expect(statistics.matchingBranches).toBe(0)
      expect(statistics.nonMatchingBranches).toBe(namingResults.length)
    })
  })
})
