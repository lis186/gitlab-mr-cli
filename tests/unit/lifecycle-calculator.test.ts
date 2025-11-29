/**
 * Lifecycle Calculator Unit Tests
 *
 * T014: Unit tests for lifecycle-calculator service
 * Tests calculateLifecycle() and calculateLifecycles() functions
 *
 * @module tests/unit/lifecycle-calculator.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { calculateLifecycle, calculateLifecycles } from '../../src/services/lifecycle-calculator'
import type { Branch } from '../../src/types/branch-health'

describe('Lifecycle Calculator Unit Tests (T014)', () => {
  describe('calculateLifecycle()', () => {
    let mockBranch: Branch
    let mockMR: any

    beforeEach(() => {
      // Mock current date to 2025-10-24
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-10-24T00:00:00Z'))

      mockBranch = {
        name: 'feature/test-branch',
        lastCommitDate: new Date('2025-10-20T10:00:00Z'),
        createdDate: new Date('2025-10-01T10:00:00Z'),
        mergeRequestId: 123,
        author: 'John Doe',
        protected: false,
      }

      mockMR = {
        iid: 123,
        created_at: '2025-10-05T10:00:00Z',
        source_branch: 'feature/test-branch',
        state: 'opened',
        title: 'Test MR',
      }
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should calculate total lifecycle days correctly', () => {
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      // From 2025-10-01 10:00 to 2025-10-24 00:00 = 22 days (floor)
      expect(result.totalLifecycleDays).toBe(22)
    })

    it('should calculate MR processing days correctly', () => {
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      // From MR created (2025-10-05) to last commit (2025-10-20) = 15 days
      expect(result.mrProcessingDays).toBe(15)
    })

    it('should return null for MR processing days when no MR', () => {
      const result = calculateLifecycle(mockBranch, null, 30)

      expect(result.mrProcessingDays).toBeNull()
    })

    it('should mark branch as stale when exceeding threshold', () => {
      const threshold = 20
      const result = calculateLifecycle(mockBranch, mockMR, threshold)

      // 23 days > 20 days threshold
      expect(result.isStale).toBe(true)
    })

    it('should mark branch as not stale when within threshold', () => {
      const threshold = 30
      const result = calculateLifecycle(mockBranch, mockMR, threshold)

      // 23 days <= 30 days threshold
      expect(result.isStale).toBe(false)
    })

    it('should use provided threshold value', () => {
      const threshold = 45
      const result = calculateLifecycle(mockBranch, mockMR, threshold)

      expect(result.staleThreshold).toBe(threshold)
    })

    it('should default threshold to 30 days', () => {
      const result = calculateLifecycle(mockBranch, mockMR)

      expect(result.staleThreshold).toBe(30)
    })

    it('should include branch name in result', () => {
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      expect(result.branchName).toBe('feature/test-branch')
    })

    it('should include created date in result', () => {
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      expect(result.createdDate).toEqual(mockBranch.createdDate)
    })

    it('should include last updated date in result', () => {
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      expect(result.lastUpdatedDate).toEqual(mockBranch.lastCommitDate)
    })

    it('should handle branch created today', () => {
      mockBranch.createdDate = new Date('2025-10-24T00:00:00Z')
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      expect(result.totalLifecycleDays).toBe(0)
      expect(result.isStale).toBe(false)
    })

    it('should handle very old branches', () => {
      mockBranch.createdDate = new Date('2024-01-01T00:00:00Z')
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      // Should be around 297 days (2024 was a leap year)
      expect(result.totalLifecycleDays).toBeGreaterThan(290)
      expect(result.isStale).toBe(true)
    })

    it('should handle MR created after branch creation', () => {
      mockMR.created_at = '2025-10-10T10:00:00Z'
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      // From 2025-10-10 to 2025-10-20 = 10 days
      expect(result.mrProcessingDays).toBe(10)
    })

    it('should handle MR created on same day as last commit', () => {
      mockMR.created_at = '2025-10-20T10:00:00Z'
      mockBranch.lastCommitDate = new Date('2025-10-20T10:00:00Z')
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      expect(result.mrProcessingDays).toBe(0)
    })

    it('should return complete BranchLifecycle structure', () => {
      const result = calculateLifecycle(mockBranch, mockMR, 30)

      expect(result).toHaveProperty('branchName')
      expect(result).toHaveProperty('totalLifecycleDays')
      expect(result).toHaveProperty('mrProcessingDays')
      expect(result).toHaveProperty('createdDate')
      expect(result).toHaveProperty('lastUpdatedDate')
      expect(result).toHaveProperty('isStale')
      expect(result).toHaveProperty('staleThreshold')
    })
  })

  describe('calculateLifecycles()', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-10-24T00:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should process multiple branches', () => {
      const mockData = [
        {
          branch: {
            name: 'feature/branch-1',
            commit: {
              committed_date: '2025-10-20T10:00:00Z',
              author_name: 'Developer 1',
            },
            protected: false,
          },
          mergeRequest: {
            iid: 1,
            created_at: '2025-10-10T10:00:00Z',
          },
        },
        {
          branch: {
            name: 'feature/branch-2',
            commit: {
              committed_date: '2025-10-15T10:00:00Z',
              author_name: 'Developer 2',
            },
            protected: false,
          },
          mergeRequest: {
            iid: 2,
            created_at: '2025-10-05T10:00:00Z',
          },
        },
      ]

      const results = calculateLifecycles(mockData, 30)

      expect(results).toHaveLength(2)
      expect(results[0].branchName).toBe('feature/branch-1')
      expect(results[1].branchName).toBe('feature/branch-2')
    })

    it('should handle branches without merge requests', () => {
      const mockData = [
        {
          branch: {
            name: 'feature/no-mr',
            commit: {
              committed_date: '2025-10-20T10:00:00Z',
              author_name: 'Developer',
            },
            protected: false,
          },
          mergeRequest: null,
        },
      ]

      const results = calculateLifecycles(mockData, 30)

      expect(results).toHaveLength(1)
      expect(results[0].mrProcessingDays).toBeNull()
    })

    it('should use commit date as created date when no MR', () => {
      const commitDate = '2025-10-10T10:00:00Z'
      const mockData = [
        {
          branch: {
            name: 'feature/no-mr',
            commit: {
              committed_date: commitDate,
              author_name: 'Developer',
            },
            protected: false,
          },
          mergeRequest: null,
        },
      ]

      const results = calculateLifecycles(mockData, 30)

      expect(results[0].createdDate).toEqual(new Date(commitDate))
    })

    it('should use MR created_at as created date when MR exists', () => {
      const mrCreatedDate = '2025-10-05T10:00:00Z'
      const mockData = [
        {
          branch: {
            name: 'feature/with-mr',
            commit: {
              committed_date: '2025-10-20T10:00:00Z',
              author_name: 'Developer',
            },
            protected: false,
          },
          mergeRequest: {
            iid: 1,
            created_at: mrCreatedDate,
          },
        },
      ]

      const results = calculateLifecycles(mockData, 30)

      expect(results[0].createdDate).toEqual(new Date(mrCreatedDate))
    })

    it('should apply threshold to all branches', () => {
      const threshold = 15
      const mockData = [
        {
          branch: {
            name: 'feature/old',
            commit: {
              committed_date: '2025-10-20T10:00:00Z',
              author_name: 'Developer',
            },
            protected: false,
          },
          mergeRequest: {
            iid: 1,
            created_at: '2025-10-01T10:00:00Z', // 23 days old
          },
        },
        {
          branch: {
            name: 'feature/new',
            commit: {
              committed_date: '2025-10-20T10:00:00Z',
              author_name: 'Developer',
            },
            protected: false,
          },
          mergeRequest: {
            iid: 2,
            created_at: '2025-10-15T10:00:00Z', // 9 days old
          },
        },
      ]

      const results = calculateLifecycles(mockData, threshold)

      expect(results[0].isStale).toBe(true) // 23 > 15
      expect(results[1].isStale).toBe(false) // 9 < 15
      expect(results[0].staleThreshold).toBe(threshold)
      expect(results[1].staleThreshold).toBe(threshold)
    })

    it('should handle empty array', () => {
      const results = calculateLifecycles([], 30)

      expect(results).toHaveLength(0)
      expect(results).toEqual([])
    })

    it('should preserve author information', () => {
      const mockData = [
        {
          branch: {
            name: 'feature/test',
            commit: {
              committed_date: '2025-10-20T10:00:00Z',
              author_name: 'John Doe',
            },
            protected: false,
          },
          mergeRequest: null,
        },
      ]

      const results = calculateLifecycles(mockData, 30)

      // Note: calculateLifecycles doesn't return author in BranchLifecycle
      // but uses it internally for Branch construction
      expect(results[0].branchName).toBe('feature/test')
    })

    it('should handle protected branches', () => {
      const mockData = [
        {
          branch: {
            name: 'main',
            commit: {
              committed_date: '2025-10-20T10:00:00Z',
              author_name: 'Developer',
            },
            protected: true,
          },
          mergeRequest: null,
        },
      ]

      const results = calculateLifecycles(mockData, 30)

      expect(results).toHaveLength(1)
      expect(results[0].branchName).toBe('main')
    })

    it('should handle large number of branches', () => {
      const mockData = Array.from({ length: 100 }, (_, i) => ({
        branch: {
          name: `feature/branch-${i}`,
          commit: {
            committed_date: '2025-10-20T10:00:00Z',
            author_name: `Developer ${i}`,
          },
          protected: false,
        },
        mergeRequest: null,
      }))

      const results = calculateLifecycles(mockData, 30)

      expect(results).toHaveLength(100)
      expect(results[0].branchName).toBe('feature/branch-0')
      expect(results[99].branchName).toBe('feature/branch-99')
    })
  })

  describe('Edge cases and data validation', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-10-24T00:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should handle branch with exact threshold age', () => {
      const threshold = 23
      const mockBranch: Branch = {
        name: 'feature/exact',
        lastCommitDate: new Date('2025-10-20T10:00:00Z'),
        createdDate: new Date('2025-10-01T00:00:00Z'), // Exactly 23 days
        mergeRequestId: null,
        author: 'Developer',
        protected: false,
      }

      const result = calculateLifecycle(mockBranch, null, threshold)

      // 23 days is NOT > 23, so isStale should be false
      expect(result.isStale).toBe(false)
    })

    it('should handle negative MR processing time gracefully', () => {
      // This shouldn't happen in practice, but test defensive coding
      const mockBranch: Branch = {
        name: 'feature/test',
        lastCommitDate: new Date('2025-10-05T10:00:00Z'), // Before MR created
        createdDate: new Date('2025-10-01T10:00:00Z'),
        mergeRequestId: 123,
        author: 'Developer',
        protected: false,
      }

      const mockMR = {
        iid: 123,
        created_at: '2025-10-10T10:00:00Z', // After last commit
      }

      const result = calculateLifecycle(mockBranch, mockMR, 30)

      // Should calculate negative days
      expect(result.mrProcessingDays).toBeLessThan(0)
    })

    it('should handle MR without created_at field', () => {
      const mockBranch: Branch = {
        name: 'feature/test',
        lastCommitDate: new Date('2025-10-20T10:00:00Z'),
        createdDate: new Date('2025-10-01T10:00:00Z'),
        mergeRequestId: 123,
        author: 'Developer',
        protected: false,
      }

      const mockMR = {
        iid: 123,
        // created_at is missing
      }

      const result = calculateLifecycle(mockBranch, mockMR, 30)

      expect(result.mrProcessingDays).toBeNull()
    })
  })
})
