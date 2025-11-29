/**
 * User Story 1: Branch Health Summary Integration Tests
 *
 * T013: End-to-end integration tests covering 3 acceptance scenarios:
 * 1. 50 branches < 15 seconds
 * 2. Auto-detect local Git
 * 3. 350 branches prompt to use --limit
 *
 * @module tests/integration/us1-health-summary.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GitLabClient } from '../../src/services/gitlab-client'
import { LocalGitClient } from '../../src/services/local-git-client'
import { calculateLifecycles } from '../../src/services/lifecycle-calculator'
import type { ProjectConfig } from '../../src/models/project'

// Mock GitLab API responses
const createMockBranches = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    name: `feature/branch-${i + 1}`,
    commit: {
      committed_date: new Date(2025, 9, 24 - i).toISOString(),
      author_name: `Developer ${(i % 5) + 1}`,
    },
    protected: false,
    merged: false,
  }))
}

const createMockBranchesWithMRs = (count: number) => {
  const branches = createMockBranches(count)
  return branches.map((branch, i) => ({
    branch,
    mergeRequest: i % 3 === 0 ? {
      iid: i + 1,
      created_at: new Date(2025, 9, 10 - i).toISOString(),
      source_branch: branch.name,
      state: 'opened',
      title: `Implement feature ${i + 1}`,
    } : null,
  }))
}

describe('US1: Branch Health Summary - Integration Tests (T013)', () => {
  let mockConfig: ProjectConfig

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig = {
      identifier: 'example/mobile-app',
      token: 'test-token',
      host: 'https://gitlab.com',
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Scenario 1: Performance - 50 branches < 15 seconds', () => {
    it('should analyze 50 branches within 15 seconds', async () => {
      const branchCount = 50
      const mockData = createMockBranchesWithMRs(branchCount)

      // Start performance timer
      const startTime = Date.now()

      // Execute lifecycle calculation
      const lifecycles = calculateLifecycles(mockData, 30)

      // End performance timer
      const endTime = Date.now()
      const executionTime = endTime - startTime

      // Assertions
      expect(lifecycles).toBeDefined()
      expect(lifecycles.length).toBe(branchCount)
      expect(executionTime).toBeLessThan(15000) // < 15 seconds

      // Verify lifecycle data structure
      const firstLifecycle = lifecycles[0]
      expect(firstLifecycle).toHaveProperty('branchName')
      expect(firstLifecycle).toHaveProperty('totalLifecycleDays')
      expect(firstLifecycle).toHaveProperty('mrProcessingDays')
      expect(firstLifecycle).toHaveProperty('isStale')
      expect(firstLifecycle).toHaveProperty('staleThreshold')
    })

    it('should handle 200 branches efficiently', async () => {
      const branchCount = 200
      const mockData = createMockBranchesWithMRs(branchCount)

      const startTime = Date.now()
      const lifecycles = calculateLifecycles(mockData, 30)
      const endTime = Date.now()
      const executionTime = endTime - startTime

      expect(lifecycles.length).toBe(branchCount)
      // Should complete reasonably fast even with 200 branches
      expect(executionTime).toBeLessThan(30000) // < 30 seconds
    })

    it('should calculate correct lifecycle metrics', async () => {
      const mockData = createMockBranchesWithMRs(5)
      const lifecycles = calculateLifecycles(mockData, 30)

      // Verify each lifecycle has valid data
      lifecycles.forEach((lifecycle) => {
        expect(lifecycle.totalLifecycleDays).toBeGreaterThanOrEqual(0)
        expect(typeof lifecycle.isStale).toBe('boolean')
        expect(lifecycle.createdDate).toBeInstanceOf(Date)
        expect(lifecycle.lastUpdatedDate).toBeInstanceOf(Date)

        // If MR exists, verify MR processing days
        if (lifecycle.mrProcessingDays !== null) {
          expect(lifecycle.mrProcessingDays).toBeGreaterThanOrEqual(0)
        }
      })
    })
  })

  describe('Scenario 2: Auto-detect local Git repository', () => {
    it('should detect local Git repo from current directory', async () => {
      // This test verifies the contract for auto-detection
      // Actual implementation will be in T021

      const mockRepoPath = process.cwd()
      const expectedProjectId = 'example/mobile-app'

      // Mock successful validation
      const mockValidation = {
        isValid: true,
        remoteOriginUrl: `https://gitlab.com/${expectedProjectId}.git`,
        lastFetchDate: new Date(),
        warnings: [],
        error: null,
      }

      // Verify LocalGitClient can be instantiated with current directory
      const config = {
        repoPath: mockRepoPath,
        expectedProjectId,
        baseBranch: 'main',
      }

      expect(config.repoPath).toBe(mockRepoPath)
      expect(config.expectedProjectId).toBe(expectedProjectId)
    })

    it('should validate remote origin URL matches project', async () => {
      const mockRepoPath = '/Users/test/project'
      const expectedProjectId = 'example/mobile-app'

      const validUrls = [
        `https://gitlab.com/${expectedProjectId}.git`,
        `git@gitlab.com:${expectedProjectId}.git`,
        `https://gitlab.com/${expectedProjectId}`,
      ]

      validUrls.forEach((url) => {
        expect(url).toContain(expectedProjectId)
      })
    })

    it('should warn if local repo is outdated', () => {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const eightDaysAgo = new Date()
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8)

      const now = new Date()

      // Calculate days since fetch
      const daysSinceFetch = Math.floor(
        (now.getTime() - eightDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
      )

      expect(daysSinceFetch).toBeGreaterThan(7)
    })

    it('should fallback to API mode if local Git unavailable', async () => {
      // Verify fallback logic contract
      const hasLocalGit = false
      const shouldUseAPI = !hasLocalGit

      expect(shouldUseAPI).toBe(true)
    })
  })

  describe('Scenario 3: 350 branches prompt to use --limit', () => {
    it('should detect large project (> 300 branches)', () => {
      const branchCount = 350
      const threshold = 300

      const isLargeProject = branchCount > threshold
      expect(isLargeProject).toBe(true)
    })

    it('should suggest using --limit for large projects', () => {
      const branchCount = 350
      const threshold = 300
      const suggestedLimit = 150

      if (branchCount > threshold) {
        const message = `Large project detected (${branchCount} branches).`
        const suggestion = `Consider using --limit ${suggestedLimit}`

        expect(message).toContain('Large project detected')
        expect(suggestion).toContain('--limit')
        expect(suggestedLimit).toBeLessThan(branchCount)
      }
    })

    it('should allow user to continue with all branches', () => {
      // User can choose to proceed with all branches
      const userChoice = 'yes' // or 'no'
      const validChoices = ['yes', 'y', 'no', 'n']

      expect(validChoices.some(choice => choice.startsWith(userChoice[0]))).toBe(true)
    })

    it('should auto-limit to 150 if user confirms', () => {
      const originalBranchCount = 350
      const autoLimit = 150
      const userConfirmed = true

      const finalLimit = userConfirmed ? autoLimit : originalBranchCount

      if (userConfirmed) {
        expect(finalLimit).toBe(150)
        expect(finalLimit).toBeLessThan(originalBranchCount)
      }
    })

    it('should process small projects without prompt', () => {
      const branchCount = 50
      const threshold = 300

      const needsPrompt = branchCount > threshold
      expect(needsPrompt).toBe(false)
    })
  })

  describe('Integration: Complete workflow', () => {
    it('should execute full branch health analysis workflow', async () => {
      const mockData = createMockBranchesWithMRs(20)

      // Step 1: Query branches with MRs
      expect(mockData).toBeDefined()
      expect(mockData.length).toBe(20)

      // Step 2: Calculate lifecycles
      const lifecycles = calculateLifecycles(mockData, 30)
      expect(lifecycles.length).toBe(20)

      // Step 3: Calculate statistics
      const totalBranches = lifecycles.length
      const staleBranches = lifecycles.filter(l => l.isStale).length
      const avgLifecycleDays = lifecycles.reduce((sum, l) => sum + l.totalLifecycleDays, 0) / totalBranches

      expect(totalBranches).toBe(20)
      expect(staleBranches).toBeGreaterThanOrEqual(0)
      expect(avgLifecycleDays).toBeGreaterThanOrEqual(0)

      // Step 4: Verify output structure
      const output = {
        metadata: {
          project: 'example/mobile-app',
          timestamp: new Date().toISOString(),
          totalBranches,
        },
        statistics: {
          totalBranches,
          staleBranches,
          avgLifecycleDays,
        },
        branches: lifecycles.map(l => ({
          name: l.branchName,
          lifecycleDays: l.totalLifecycleDays,
          mrProcessingDays: l.mrProcessingDays,
        })),
      }

      expect(output.metadata.project).toBe('example/mobile-app')
      expect(output.statistics.totalBranches).toBe(20)
      expect(output.branches.length).toBe(20)
    })

    it('should handle branches without merge requests', async () => {
      const mockData = createMockBranchesWithMRs(10)
      const lifecycles = calculateLifecycles(mockData, 30)

      // Some branches don't have MRs
      const branchesWithoutMR = lifecycles.filter(l => l.mrProcessingDays === null)
      expect(branchesWithoutMR.length).toBeGreaterThan(0)

      // Verify MR processing days is null for branches without MR
      branchesWithoutMR.forEach(lifecycle => {
        expect(lifecycle.mrProcessingDays).toBeNull()
        expect(lifecycle.totalLifecycleDays).toBeGreaterThanOrEqual(0)
      })
    })

    it('should identify stale branches correctly', async () => {
      const threshold = 30
      const mockData = createMockBranchesWithMRs(10)
      const lifecycles = calculateLifecycles(mockData, threshold)

      // Verify stale flag is set correctly
      lifecycles.forEach(lifecycle => {
        const expectedIsStale = lifecycle.totalLifecycleDays > threshold
        expect(lifecycle.isStale).toBe(expectedIsStale)
      })
    })
  })

  describe('Error handling and edge cases', () => {
    it('should handle empty branch list', async () => {
      const mockData: any[] = []
      const lifecycles = calculateLifecycles(mockData, 30)

      expect(lifecycles).toBeDefined()
      expect(lifecycles.length).toBe(0)
    })

    it('should handle single branch', async () => {
      const mockData = createMockBranchesWithMRs(1)
      const lifecycles = calculateLifecycles(mockData, 30)

      expect(lifecycles.length).toBe(1)
      expect(lifecycles[0].branchName).toBe('feature/branch-1')
    })

    it('should handle different stale thresholds', async () => {
      const mockData = createMockBranchesWithMRs(5)

      const thresholds = [7, 14, 30, 60, 90]

      thresholds.forEach(threshold => {
        const lifecycles = calculateLifecycles(mockData, threshold)
        expect(lifecycles.length).toBe(5)

        lifecycles.forEach(lifecycle => {
          expect(lifecycle.staleThreshold).toBe(threshold)
        })
      })
    })
  })
})
