/**
 * Hybrid Reviewer Configuration
 *
 * Some reviewers exhibit both AI and human review patterns. This configuration
 * defines rules for classifying their reviews based on timing and context.
 */

/**
 * Default AI response threshold in seconds (8 minutes)
 * Empirically derived from project data analysis.
 * Reviews under this threshold are typically AI-assisted.
 */
export const DEFAULT_AI_RESPONSE_THRESHOLD_SECONDS = 480;

/**
 * Configuration for a hybrid reviewer (someone who does both AI-assisted and manual reviews)
 */
export interface HybridReviewerConfig {
  /**
   * Username of the hybrid reviewer
   */
  username: string;

  /**
   * Time threshold in seconds. If the reviewer responds faster than this,
   * treat as AI-assisted review. If slower, treat as manual human review.
   *
   * Rationale: AI reviews typically happen within minutes, while human reviews
   * take longer due to context switching and deeper analysis.
   */
  timeThresholdSeconds: number;

  /**
   * If true, treat as human review when there's already an AI review from another reviewer.
   * This prevents double-counting AI reviews and captures the "human verification" role.
   */
  treatAsHumanIfOtherAIReviewExists: boolean;

  /**
   * Burst detection configuration for identifying rapid consecutive reviews (AI pattern)
   */
  burstDetection?: {
    /**
     * Minimum number of reviews in rapid succession to be considered a burst
     */
    minReviewCount: number;

    /**
     * Maximum time window in seconds for reviews to be considered a burst
     */
    timeWindowSeconds: number;
  };

  /**
   * Optional description explaining why this reviewer is classified as hybrid
   */
  description?: string;
}

/**
 * Hybrid reviewer configurations
 *
 * To add a new hybrid reviewer:
 * 1. Add a new entry to this array
 * 2. Determine the appropriate time threshold by analyzing their review patterns
 * 3. Add tests in mr-timeline-service.test.ts
 *
 * Example configuration:
 * {
 *   username: 'hybrid-reviewer',
 *   timeThresholdSeconds: 480, // 8 minutes
 *   treatAsHumanIfOtherAIReviewExists: true,
 *   burstDetection: {
 *     minReviewCount: 5,
 *     timeWindowSeconds: 60,
 *   },
 *   description: 'Reviewer with mixed AI-assisted and manual review patterns.',
 * }
 */
export const HYBRID_REVIEWERS: readonly HybridReviewerConfig[] = [
  // Add your hybrid reviewers here
  // Example:
  // {
  //   username: 'your-hybrid-reviewer',
  //   timeThresholdSeconds: DEFAULT_AI_RESPONSE_THRESHOLD_SECONDS,
  //   treatAsHumanIfOtherAIReviewExists: true,
  //   burstDetection: {
  //     minReviewCount: 5,
  //     timeWindowSeconds: 60,
  //   },
  // },
] as const;

/**
 * Check if a username is a configured hybrid reviewer
 */
export function isHybridReviewer(username: string): boolean {
  return HYBRID_REVIEWERS.some((config) => config.username === username);
}

/**
 * Get configuration for a hybrid reviewer
 */
export function getHybridReviewerConfig(username: string): HybridReviewerConfig | undefined {
  return HYBRID_REVIEWERS.find((config) => config.username === username);
}

/**
 * Determine if a hybrid reviewer's action should be classified as AI review
 *
 * @param username - Reviewer username
 * @param responseTimeSeconds - Time from MR creation/last commit to this review
 * @param hasEarlierAIReview - Whether there's already an AI review from another reviewer
 * @param isBurstReview - Whether this review is part of a rapid burst (multiple reviews in short time)
 * @returns true if should be classified as AI review, false for human review
 */
export function shouldClassifyAsAIReview(
  username: string,
  responseTimeSeconds: number,
  hasEarlierAIReview: boolean,
  isBurstReview: boolean = false
): boolean {
  const config = getHybridReviewerConfig(username);
  if (!config) {
    return false; // Not a hybrid reviewer, defer to normal classification
  }

  // Burst detection: If this is part of a rapid review burst, it's AI-assisted
  if (isBurstReview) {
    return true;
  }

  // If another AI already reviewed and we treat that as human review trigger
  if (config.treatAsHumanIfOtherAIReviewExists && hasEarlierAIReview) {
    return false; // Treat as human review
  }

  // Check time threshold
  return responseTimeSeconds <= config.timeThresholdSeconds;
}
