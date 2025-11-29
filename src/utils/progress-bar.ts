/**
 * Progress Bar Utility
 *
 * T036: Provides progress indicator for long-running operations (> 5 seconds)
 * Uses cli-progress to display progress bars in terminal
 *
 * Format: 分析分支 [████████████░░░░░░░░] 60% | 120/200
 *
 * @module utils/progress-bar
 */

import cliProgress from 'cli-progress'

/**
 * Progress bar instance wrapper
 */
export class ProgressBar {
  private bar: cliProgress.SingleBar | null = null
  private label: string
  private total: number
  private skipProgress: boolean

  /**
   * Create a progress bar
   *
   * @param label - Progress bar label (e.g., "分析分支")
   * @param total - Total number of items to process
   * @param skipProgress - Skip progress display (e.g., for JSON mode)
   */
  constructor(label: string, total: number, skipProgress: boolean = false) {
    this.label = label
    this.total = total
    this.skipProgress = skipProgress
  }

  /**
   * Start the progress bar
   */
  start(): void {
    if (this.skipProgress || this.total === 0) {
      return
    }

    this.bar = new cliProgress.SingleBar(
      {
        format: `${this.label} [{bar}] {percentage}% | {value}/{total}`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    )

    this.bar.start(this.total, 0)
  }

  /**
   * Update progress
   *
   * @param current - Current progress value
   */
  update(current: number): void {
    if (this.skipProgress || !this.bar) {
      return
    }

    this.bar.update(current)
  }

  /**
   * Stop and remove the progress bar
   */
  stop(): void {
    if (this.skipProgress || !this.bar) {
      return
    }

    this.bar.stop()
    this.bar = null
  }
}

/**
 * Create a progress bar for stale branch analysis
 *
 * @param total - Total number of branches to analyze
 * @param skipProgress - Skip progress display (e.g., for JSON mode)
 * @returns Progress bar instance
 */
export function createStaleBranchProgressBar(
  total: number,
  skipProgress: boolean = false
): ProgressBar {
  return new ProgressBar('分析過時分支', total, skipProgress)
}

/**
 * Create a progress bar for branch fetching
 *
 * @param total - Total number of branches to fetch
 * @param skipProgress - Skip progress display (e.g., for JSON mode)
 * @returns Progress bar instance
 */
export function createBranchFetchProgressBar(
  total: number,
  skipProgress: boolean = false
): ProgressBar {
  return new ProgressBar('查詢分支資料', total, skipProgress)
}

/**
 * Create a progress bar for commit analysis
 * T035: FR-017 - Show progress for >100 commits
 *
 * @param total - Total number of commits to analyze
 * @param skipProgress - Skip progress display (e.g., for JSON mode)
 * @returns Progress bar instance
 */
export function createCommitAnalysisProgressBar(
  total: number,
  skipProgress: boolean = false
): ProgressBar {
  return new ProgressBar('分析 Commits', total, skipProgress)
}

/**
 * Create a progress bar for AI Review analysis
 * 012-ai-review-analysis: Show progress for MR analysis
 *
 * @param total - Total number of MRs to analyze
 * @param skipProgress - Skip progress display (e.g., for JSON mode)
 * @returns Progress bar instance
 */
export function createAIReviewProgressBar(
  total: number,
  skipProgress: boolean = false
): ProgressBar {
  return new ProgressBar('分析 MR', total, skipProgress)
}
