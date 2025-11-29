/**
 * Stale Branch Analyzer
 *
 * T030: Analyzes stale branches with commits behind calculation
 * Implements three-tier optimization: Local Git → API Batch → Smart Limiting
 *
 * Based on specs/003-branch-lifecycle-optimized/data-model.md
 *
 * @module services/stale-analyzer
 */

import type { LocalGitClient } from './local-git-client.js'
import type { GitLabClient } from './gitlab-client.js'

/**
 * Branch lifecycle data (from lifecycle-calculator)
 */
export interface BranchLifecycle {
  branchName: string
  totalLifecycleDays: number
  mrProcessingDays: number | null
  createdDate: Date
  lastUpdatedDate: Date
  isStale: boolean
  staleThreshold: number
}

/**
 * Stale branch with commits behind analysis
 *
 * Extends BranchLifecycle with additional fields:
 * - commitsBehind: number of commits behind base branch
 * - baseBranch: comparison base branch name
 * - fetchSource: data source used for commits behind calculation
 */
export interface StaleBranch extends BranchLifecycle {
  commitsBehind: number | null
  baseBranch: string
  fetchSource: 'local-git' | 'api'
}

/**
 * Options for stale branch analysis
 */
export interface StaleAnalysisOptions {
  baseBranch?: string
  batchSize?: number
  onProgress?: (completed: number, total: number) => void
  onWarning?: (message: string) => void
}

/**
 * Analyze a single stale branch with commits behind calculation
 *
 * Strategy:
 * 1. Try local Git first (fast, 95% performance improvement)
 * 2. Fallback to API if local Git fails
 * 3. Return null for commitsBehind if both fail
 *
 * @param lifecycle - Branch lifecycle data
 * @param localGit - Local Git client (null if unavailable)
 * @param apiClient - GitLab API client (fallback)
 * @param baseBranch - Base branch for comparison (default: 'main')
 * @returns Stale branch with commits behind data
 */
export async function analyzeStaleBranch(
  lifecycle: BranchLifecycle,
  localGit: LocalGitClient | null,
  apiClient: GitLabClient,
  baseBranch: string = 'main',
  onWarning?: (message: string) => void
): Promise<StaleBranch> {
  let commitsBehind: number | null = null
  let fetchSource: 'local-git' | 'api' = 'api'

  // Validate base branch (Issue #2: Warn user about empty base branch)
  const validBaseBranch = baseBranch && baseBranch.trim() !== '' ? baseBranch : 'main'

  if (!baseBranch || baseBranch.trim() === '') {
    onWarning?.(`Empty base branch provided, defaulting to 'main'`)
  }

  // Strategy 1: Try local Git (preferred)
  if (localGit) {
    try {
      const rawValue = await localGit.getCommitsBehind(lifecycle.branchName, validBaseBranch)

      // Validate commitsBehind >= 0
      if (typeof rawValue === 'number' && rawValue >= 0) {
        commitsBehind = rawValue
        fetchSource = 'local-git'
      }
    } catch (error) {
      // Local Git failed, will fallback to API
    }
  }

  // Strategy 2: Fallback to API if local Git unavailable or failed
  if (commitsBehind === null) {
    try {
      const comparison = await apiClient.compareBranchAPI(
        lifecycle.branchName,
        validBaseBranch,
        { onWarning }
      )

      if (comparison && typeof comparison.behind === 'number' && comparison.behind >= 0) {
        commitsBehind = comparison.behind
        fetchSource = 'api'
      }
    } catch (error) {
      // API also failed, commitsBehind remains null
    }
  }

  return {
    ...lifecycle,
    commitsBehind,
    baseBranch: validBaseBranch,
    fetchSource,
  }
}

/**
 * Analyze multiple stale branches in batches
 *
 * Optimization:
 * - Uses batch processing (default: 10 branches per batch)
 * - Processes batches sequentially to avoid overwhelming system
 * - Uses Promise.allSettled for graceful error handling
 * - Reports progress after each batch
 *
 * @param lifecycles - Array of stale branch lifecycles
 * @param localGit - Local Git client (null if unavailable)
 * @param apiClient - GitLab API client (fallback)
 * @param options - Analysis options
 * @returns Array of stale branches with commits behind data
 */
export async function analyzeStaleBranches(
  lifecycles: BranchLifecycle[],
  localGit: LocalGitClient | null,
  apiClient: GitLabClient,
  options: StaleAnalysisOptions = {}
): Promise<StaleBranch[]> {
  const { baseBranch = 'main', batchSize = 10, onProgress, onWarning } = options

  const results: StaleBranch[] = []

  // Prefer batch API when local Git is available
  if (localGit) {
    // Use LocalGitClient.getBatchCommitsBehind for optimal performance
    const branchNames = lifecycles.map(lc => lc.branchName)

    // Process in batches
    for (let i = 0; i < branchNames.length; i += batchSize) {
      const batch = branchNames.slice(i, i + batchSize)

      try {
        const commitsBehindMap = await localGit.getBatchCommitsBehind(batch, baseBranch, onWarning)

        // Match results with lifecycles
        batch.forEach(branchName => {
          const lifecycle = lifecycles.find(lc => lc.branchName === branchName)
          if (lifecycle) {
            const rawValue = commitsBehindMap.get(branchName)
            const commitsBehind = typeof rawValue === 'number' && rawValue >= 0 ? rawValue : null

            results.push({
              ...lifecycle,
              commitsBehind,
              baseBranch,
              fetchSource: 'local-git',
            })
          } else {
            // Defensive programming: This should never happen if batch and lifecycles are in sync
            // Issue #3: Use onWarning callback instead of console.warn for better testability
            onWarning?.(`[stale-analyzer] Warning: Branch "${branchName}" in batch but not found in lifecycles`)
          }
        })
      } catch (error) {
        // Batch failed, fallback to individual API calls for this batch
        const batchLifecycles = lifecycles.filter(lc => batch.includes(lc.branchName))
        const fallbackResults = await Promise.allSettled(
          batchLifecycles.map(lc => analyzeStaleBranch(lc, null, apiClient, baseBranch, onWarning))
        )

        fallbackResults.forEach(result => {
          if (result.status === 'fulfilled') {
            results.push(result.value)
          }
        })
      }

      // Report progress
      if (onProgress) {
        const completed = Math.min(i + batchSize, branchNames.length)
        onProgress(completed, branchNames.length)
      }
    }
  } else {
    // No local Git, use API batch processing
    const branchNames = lifecycles.map(lc => lc.branchName)

    // Process in batches (smaller batch size for API: 5)
    const apiBatchSize = 5
    for (let i = 0; i < branchNames.length; i += apiBatchSize) {
      const batch = branchNames.slice(i, i + apiBatchSize)

      try {
        const commitsBehindMap = await apiClient.compareBranchesAPI(batch, baseBranch, { onWarning })

        // Match results with lifecycles
        batch.forEach(branchName => {
          const lifecycle = lifecycles.find(lc => lc.branchName === branchName)
          if (lifecycle) {
            const comparison = commitsBehindMap.get(branchName)
            const commitsBehind =
              comparison && typeof comparison.behind === 'number' && comparison.behind >= 0
                ? comparison.behind
                : null

            results.push({
              ...lifecycle,
              commitsBehind,
              baseBranch,
              fetchSource: 'api',
            })
          } else {
            // Defensive programming: This should never happen if batch and lifecycles are in sync
            // Issue #3: Use onWarning callback instead of console.warn for better testability
            onWarning?.(`[stale-analyzer] Warning: Branch "${branchName}" in batch but not found in lifecycles`)
          }
        })
      } catch (error) {
        // Batch failed, fallback to individual calls
        const batchLifecycles = lifecycles.filter(lc => batch.includes(lc.branchName))
        const fallbackResults = await Promise.allSettled(
          batchLifecycles.map(lc => analyzeStaleBranch(lc, null, apiClient, baseBranch, onWarning))
        )

        fallbackResults.forEach(result => {
          if (result.status === 'fulfilled') {
            results.push(result.value)
          }
        })
      }

      // Report progress
      if (onProgress) {
        const completed = Math.min(i + apiBatchSize, branchNames.length)
        onProgress(completed, branchNames.length)
      }
    }
  }

  return results
}

/**
 * Get top N stale branches sorted by lifecycle days
 *
 * @param staleBranches - Array of stale branches
 * @param topN - Number of top branches to return (default: 10)
 * @returns Top N stale branches sorted by lifecycle days (descending)
 */
export function getTopStaleBranches(staleBranches: StaleBranch[], topN: number = 10): StaleBranch[] {
  return staleBranches
    .sort((a, b) => b.totalLifecycleDays - a.totalLifecycleDays)
    .slice(0, topN)
}
