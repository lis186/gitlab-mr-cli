/**
 * MR 摘要模型
 *
 * 代表 MR 的整體統計資訊
 */

import type { Actor } from './actor.js';

/**
 * Comment 詳細分類 (新增於 2025-11-09)
 */
export interface CommentBreakdown {
  humanReviewComments: number;  // 人類 Reviewer 的評論
  aiComments: number;           // AI 審查評論
  authorResponses: number;      // 作者回應
  ciBotComments: number;        // CI Bot 評論
}

/**
 * MR 摘要 - 整體活動統計
 */
export interface MRSummary {
  commits: number;           // Commit 總數
  aiReviews: number;         // AI 審查總數
  humanComments: number;     // 人工評論總數 (包含 human review + author responses，為了向後相容保留)
  systemEvents: number;      // 系統事件總數
  totalEvents: number;       // 總事件數
  contributors: Actor[];     // 參與者列表（去重）
  reviewers: Actor[];        // 審查者列表（排除作者，去重）

  /** Comment 詳細分類 (可選，用於更精確的負擔分析) */
  commentBreakdown?: CommentBreakdown;
}

/**
 * 建立空的 MR 摘要
 */
export function createEmptySummary(): MRSummary {
  return {
    commits: 0,
    aiReviews: 0,
    humanComments: 0,
    systemEvents: 0,
    totalEvents: 0,
    contributors: [],
    reviewers: [],
  };
}

/**
 * 驗證 MR 摘要
 */
export function validateMRSummary(summary: MRSummary): boolean {
  // 所有計數必須非負數
  if (
    summary.commits < 0 ||
    summary.aiReviews < 0 ||
    summary.humanComments < 0 ||
    summary.systemEvents < 0 ||
    summary.totalEvents < 0
  ) {
    return false;
  }

  // 總事件數應等於各類事件數的總和
  const calculatedTotal =
    summary.commits +
    summary.aiReviews +
    summary.humanComments +
    summary.systemEvents;

  if (summary.totalEvents !== calculatedTotal) {
    return false;
  }

  // 參與者陣列應包含唯一的操作者
  const contributorIds = summary.contributors.map((c) => c.id);
  const uniqueContributorIds = new Set(contributorIds);
  if (contributorIds.length !== uniqueContributorIds.size) {
    return false;
  }

  // 審查者陣列應包含唯一的操作者
  const reviewerIds = summary.reviewers.map((r) => r.id);
  const uniqueReviewerIds = new Set(reviewerIds);
  if (reviewerIds.length !== uniqueReviewerIds.size) {
    return false;
  }

  return true;
}

/**
 * 根據 ID 去重操作者
 */
export function deduplicateActors(actors: Actor[]): Actor[] {
  const seen = new Set<number>();
  const result: Actor[] = [];

  for (const actor of actors) {
    if (!seen.has(actor.id)) {
      seen.add(actor.id);
      result.push(actor);
    }
  }

  return result;
}

/**
 * 從操作者列表中排除作者
 */
export function excludeAuthor(actors: Actor[], authorId: number): Actor[] {
  return actors.filter((actor) => actor.id !== authorId);
}
