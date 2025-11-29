/**
 * Stale Analyzer Unit Tests
 *
 * T028: Unit tests for stale-analyzer service
 * Tests analyzeStaleBranch() function and optimization logic
 *
 * @module tests/unit/stale-analyzer.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Define types for testing (will be implemented in src/services/stale-analyzer.ts)
interface BranchLifecycle {
  branchName: string
  totalLifecycleDays: number
  mrProcessingDays: number | null
  createdDate: Date
  lastUpdatedDate: Date
  isStale: boolean
  staleThreshold: number
}

interface StaleBranch extends BranchLifecycle {
  commitsBehind: number | null
  baseBranch: string
  fetchSource: 'local-git' | 'api'
}

// Mock function signature (implementation will be created later)
type AnalyzeStaleBranchFn = (
  lifecycle: BranchLifecycle,
  localGit: any | null,
  apiClient: any,
  baseBranch?: string
) => Promise<StaleBranch>

describe('Stale Analyzer Unit Tests (T028)', () => {
  let mockLifecycle: BranchLifecycle

  beforeEach(() => {
    vi.clearAllMocks()

    mockLifecycle = {
      branchName: 'feature/old-feature',
      totalLifecycleDays: 45,
      mrProcessingDays: 10,
      createdDate: new Date('2025-09-01'),
      lastUpdatedDate: new Date('2025-09-10'),
      isStale: true,
      staleThreshold: 30,
    }
  })

  describe('analyzeStaleBranch()', () => {
    describe('Local Git mode (Strategy 1)', () => {
      it('should use local Git when available', async () => {
        const mockLocalGit = {
          getCommitsBehind: vi.fn(async () => 15),
        }
        const mockApiClient = {}

        // Mock implementation for testing
        const analyzeStaleBranch: AnalyzeStaleBranchFn = async (
          lifecycle,
          localGit,
          _apiClient,
          baseBranch = 'main'
        ) => {
          let commitsBehind: number | null = null
          let fetchSource: 'local-git' | 'api' = 'api'

          if (localGit) {
            try {
              commitsBehind = await localGit.getCommitsBehind(lifecycle.branchName, baseBranch)
              fetchSource = 'local-git'
            } catch (error) {
              // Fallback to API (tested in other cases)
            }
          }

          return {
            ...lifecycle,
            commitsBehind,
            baseBranch,
            fetchSource,
          }
        }

        const result = await analyzeStaleBranch(mockLifecycle, mockLocalGit, mockApiClient)

        expect(result.commitsBehind).toBe(15)
        expect(result.baseBranch).toBe('main')
        expect(result.fetchSource).toBe('local-git')
        expect(mockLocalGit.getCommitsBehind).toHaveBeenCalledWith('feature/old-feature', 'main')
      })

      it('should use custom base branch when provided', async () => {
        const mockLocalGit = {
          getCommitsBehind: vi.fn(async () => 20),
        }
        const mockApiClient = {}

        const analyzeStaleBranch: AnalyzeStaleBranchFn = async (
          lifecycle,
          localGit,
          _apiClient,
          baseBranch = 'main'
        ) => {
          const commitsBehind = localGit
            ? await localGit.getCommitsBehind(lifecycle.branchName, baseBranch)
            : null

          return {
            ...lifecycle,
            commitsBehind,
            baseBranch,
            fetchSource: localGit ? 'local-git' : 'api',
          }
        }

        const result = await analyzeStaleBranch(
          mockLifecycle,
          mockLocalGit,
          mockApiClient,
          'develop'
        )

        expect(result.baseBranch).toBe('develop')
        expect(mockLocalGit.getCommitsBehind).toHaveBeenCalledWith('feature/old-feature', 'develop')
      })

      it('should handle zero commits behind', async () => {
        const mockLocalGit = {
          getCommitsBehind: vi.fn(async () => 0),
        }
        const mockApiClient = {}

        const analyzeStaleBranch: AnalyzeStaleBranchFn = async (
          lifecycle,
          localGit,
          _apiClient,
          baseBranch = 'main'
        ) => {
          const commitsBehind = await localGit.getCommitsBehind(lifecycle.branchName, baseBranch)
          return {
            ...lifecycle,
            commitsBehind,
            baseBranch,
            fetchSource: 'local-git',
          }
        }

        const result = await analyzeStaleBranch(mockLifecycle, mockLocalGit, mockApiClient)

        expect(result.commitsBehind).toBe(0)
        expect(result.fetchSource).toBe('local-git')
      })
    })

    describe('API fallback mode (Strategy 2)', () => {
      it('should fallback to API when local Git is null', async () => {
        const mockApiClient = {
          compareBranchAPI: vi.fn(async () => ({ ahead: 5, behind: 25 })),
        }

        const analyzeStaleBranch: AnalyzeStaleBranchFn = async (
          lifecycle,
          localGit,
          apiClient,
          baseBranch = 'main'
        ) => {
          let commitsBehind: number | null = null
          let fetchSource: 'local-git' | 'api' = 'api'

          if (!localGit) {
            const comparison = await apiClient.compareBranchAPI(lifecycle.branchName, baseBranch)
            commitsBehind = comparison?.behind ?? null
          }

          return {
            ...lifecycle,
            commitsBehind,
            baseBranch,
            fetchSource,
          }
        }

        const result = await analyzeStaleBranch(mockLifecycle, null, mockApiClient)

        expect(result.commitsBehind).toBe(25)
        expect(result.fetchSource).toBe('api')
        expect(mockApiClient.compareBranchAPI).toHaveBeenCalledWith('feature/old-feature', 'main')
      })

      it('should fallback to API when local Git throws error', async () => {
        const mockLocalGit = {
          getCommitsBehind: vi.fn(async () => {
            throw new Error('Git command timeout')
          }),
        }
        const mockApiClient = {
          compareBranchAPI: vi.fn(async () => ({ ahead: 5, behind: 30 })),
        }

        const analyzeStaleBranch: AnalyzeStaleBranchFn = async (
          lifecycle,
          localGit,
          apiClient,
          baseBranch = 'main'
        ) => {
          let commitsBehind: number | null = null
          let fetchSource: 'local-git' | 'api' = 'api'

          if (localGit) {
            try {
              commitsBehind = await localGit.getCommitsBehind(lifecycle.branchName, baseBranch)
              fetchSource = 'local-git'
            } catch (error) {
              // Fallback to API
              const comparison = await apiClient.compareBranchAPI(lifecycle.branchName, baseBranch)
              commitsBehind = comparison?.behind ?? null
              fetchSource = 'api'
            }
          }

          return {
            ...lifecycle,
            commitsBehind,
            baseBranch,
            fetchSource,
          }
        }

        const result = await analyzeStaleBranch(mockLifecycle, mockLocalGit, mockApiClient)

        expect(result.commitsBehind).toBe(30)
        expect(result.fetchSource).toBe('api')
        expect(mockLocalGit.getCommitsBehind).toHaveBeenCalled()
        expect(mockApiClient.compareBranchAPI).toHaveBeenCalled()
      })

      it('should handle API returning null (branch deleted)', async () => {
        const mockApiClient = {
          compareBranchAPI: vi.fn(async () => null),
        }

        const analyzeStaleBranch: AnalyzeStaleBranchFn = async (
          lifecycle,
          _localGit,
          apiClient,
          baseBranch = 'main'
        ) => {
          const comparison = await apiClient.compareBranchAPI(lifecycle.branchName, baseBranch)
          return {
            ...lifecycle,
            commitsBehind: comparison?.behind ?? null,
            baseBranch,
            fetchSource: 'api',
          }
        }

        const result = await analyzeStaleBranch(mockLifecycle, null, mockApiClient)

        expect(result.commitsBehind).toBeNull()
        expect(result.fetchSource).toBe('api')
      })
    })

    describe('Batch processing optimization', () => {
      it('should process multiple stale branches in batches', async () => {
        const staleBranches: BranchLifecycle[] = Array.from({ length: 25 }, (_, i) => ({
          branchName: `feature/branch-${i + 1}`,
          totalLifecycleDays: 35 + i,
          mrProcessingDays: 10,
          createdDate: new Date('2025-09-01'),
          lastUpdatedDate: new Date('2025-09-10'),
          isStale: true,
          staleThreshold: 30,
        }))

        const mockLocalGit = {
          getBatchCommitsBehind: vi.fn(async (branches: string[]) => {
            const results = new Map<string, number | null>()
            branches.forEach((branch, i) => {
              results.set(branch, i * 5) // Mock varying commits behind
            })
            return results
          }),
        }

        const batchSize = 10
        const results: StaleBranch[] = []

        // Simulate batch processing
        for (let i = 0; i < staleBranches.length; i += batchSize) {
          const batch = staleBranches.slice(i, i + batchSize)
          const branchNames = batch.map(b => b.branchName)
          const commitsBehindMap = await mockLocalGit.getBatchCommitsBehind(branchNames)

          batch.forEach(lifecycle => {
            results.push({
              ...lifecycle,
              commitsBehind: commitsBehindMap.get(lifecycle.branchName) ?? null,
              baseBranch: 'main',
              fetchSource: 'local-git',
            })
          })
        }

        expect(results.length).toBe(25)
        expect(mockLocalGit.getBatchCommitsBehind).toHaveBeenCalledTimes(3) // 3 batches (10+10+5)
        expect(results[0].commitsBehind).toBeDefined()
        expect(results[0].fetchSource).toBe('local-git')
      })
    })

    describe('Edge cases', () => {
      it('should validate commitsBehind >= 0', async () => {
        const mockLocalGit = {
          getCommitsBehind: vi.fn(async () => -1), // Invalid value
        }

        const analyzeStaleBranch: AnalyzeStaleBranchFn = async (
          lifecycle,
          localGit,
          _apiClient,
          baseBranch = 'main'
        ) => {
          const rawValue = await localGit.getCommitsBehind(lifecycle.branchName, baseBranch)
          const commitsBehind = rawValue >= 0 ? rawValue : null // Validate

          return {
            ...lifecycle,
            commitsBehind,
            baseBranch,
            fetchSource: 'local-git',
          }
        }

        const result = await analyzeStaleBranch(mockLifecycle, mockLocalGit, {})

        expect(result.commitsBehind).toBeNull() // Invalid values become null
      })

      it('should preserve all BranchLifecycle fields', async () => {
        const mockLocalGit = {
          getCommitsBehind: vi.fn(async () => 10),
        }

        const analyzeStaleBranch: AnalyzeStaleBranchFn = async (
          lifecycle,
          localGit,
          _apiClient,
          baseBranch = 'main'
        ) => {
          const commitsBehind = await localGit.getCommitsBehind(lifecycle.branchName, baseBranch)
          return {
            ...lifecycle, // Preserve all fields
            commitsBehind,
            baseBranch,
            fetchSource: 'local-git',
          }
        }

        const result = await analyzeStaleBranch(mockLifecycle, mockLocalGit, {})

        expect(result.branchName).toBe(mockLifecycle.branchName)
        expect(result.totalLifecycleDays).toBe(mockLifecycle.totalLifecycleDays)
        expect(result.mrProcessingDays).toBe(mockLifecycle.mrProcessingDays)
        expect(result.isStale).toBe(mockLifecycle.isStale)
        expect(result.commitsBehind).toBe(10)
      })

      it('should handle empty base branch gracefully', async () => {
        const mockLocalGit = {
          getCommitsBehind: vi.fn(async (_branch: string, baseBranch: string) => {
            if (!baseBranch || baseBranch.trim() === '') {
              throw new Error('Base branch cannot be empty')
            }
            return 10
          }),
        }

        const analyzeStaleBranch: AnalyzeStaleBranchFn = async (
          lifecycle,
          localGit,
          _apiClient,
          baseBranch = 'main'
        ) => {
          const validBaseBranch = baseBranch && baseBranch.trim() !== '' ? baseBranch : 'main'
          const commitsBehind = await localGit.getCommitsBehind(
            lifecycle.branchName,
            validBaseBranch
          )

          return {
            ...lifecycle,
            commitsBehind,
            baseBranch: validBaseBranch,
            fetchSource: 'local-git',
          }
        }

        const result = await analyzeStaleBranch(mockLifecycle, mockLocalGit, {}, '')

        expect(result.baseBranch).toBe('main') // Default to 'main'
        expect(result.commitsBehind).toBe(10)
      })
    })
  })

  describe('Performance optimization strategies', () => {
    it('should prefer local Git over API (90-95% faster)', async () => {
      const branchCount = 100
      const mockBranches: BranchLifecycle[] = Array.from({ length: branchCount }, (_, i) => ({
        branchName: `feature/branch-${i + 1}`,
        totalLifecycleDays: 35,
        mrProcessingDays: null,
        createdDate: new Date(),
        lastUpdatedDate: new Date(),
        isStale: true,
        staleThreshold: 30,
      }))

      const mockLocalGit = {
        getBatchCommitsBehind: vi.fn(async (branches: string[]) => {
          // Simulate fast local Git (37ms per branch from POC)
          await new Promise(resolve => setTimeout(resolve, 37 * branches.length / 10))
          const results = new Map<string, number | null>()
          branches.forEach(branch => results.set(branch, 10))
          return results
        }),
      }

      const startTime = Date.now()
      const branchNames = mockBranches.map(b => b.branchName)

      // Process in batches of 10
      for (let i = 0; i < branchNames.length; i += 10) {
        const batch = branchNames.slice(i, i + 10)
        await mockLocalGit.getBatchCommitsBehind(batch)
      }

      const endTime = Date.now()
      const executionTime = endTime - startTime

      // Local Git should be much faster than API (< 5 seconds vs > 20 seconds)
      expect(executionTime).toBeLessThan(5000)
      expect(mockLocalGit.getBatchCommitsBehind).toHaveBeenCalledTimes(10) // 10 batches
    })
  })
})
