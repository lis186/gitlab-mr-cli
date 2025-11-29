/**
 * Commit 分析 JSON 格式化器
 * 功能：004-commit-size-analysis
 *
 * 將 commit 分析結果格式化為 JSON 輸出（FR-011）
 */

import type { CommitAnalysis, AggregateStatistics } from '../types/commit-analysis.js';
import type { DeveloperPattern } from '../models/developer-pattern.js';
import type { TrendAnalysisResult } from '../models/trend-period.js';

/**
 * 基本分析結果的 JSON 格式
 */
export interface BasicAnalysisJSON {
  statistics: AggregateStatistics;
  commits: CommitAnalysisJSON[];
}

/**
 * CommitAnalysis 的 JSON 格式（序列化友善）
 */
export interface CommitAnalysisJSON {
  sha: string;
  author: string;
  authorEmail: string;
  timestamp: string; // ISO 8601
  message: string;
  filesChanged: number;
  loc: number;
  additions: number;
  deletions: number;
  sizeCategory: string;
  severityLevel: string;
  refactorSuggestion: string | null;
  isMergeCommit: boolean;
  branch: string | null;
}

/**
 * 格式化基本分析結果為 JSON
 *
 * @param statistics - 彙總統計
 * @param commits - Commit 分析陣列
 * @returns JSON 字串
 */
export function formatBasicAnalysisJSON(
  statistics: AggregateStatistics,
  commits: CommitAnalysis[]
): string {
  const result: BasicAnalysisJSON = {
    statistics,
    commits: commits.map(serializeCommit),
  };

  return JSON.stringify(result, null, 2);
}

/**
 * 格式化問題 commits 為 JSON
 *
 * @param commits - 問題 commits 陣列
 * @returns JSON 字串
 */
export function formatProblemCommitsJSON(commits: CommitAnalysis[]): string {
  const result = {
    problemCommits: commits.map(serializeCommit),
    count: commits.length,
  };

  return JSON.stringify(result, null, 2);
}

/**
 * 將 CommitAnalysis 序列化為 JSON 友善格式
 *
 * @param commit - CommitAnalysis 物件
 * @returns JSON 友善的物件
 */
function serializeCommit(commit: CommitAnalysis): CommitAnalysisJSON {
  return {
    sha: commit.sha,
    author: commit.author,
    authorEmail: commit.authorEmail,
    timestamp: commit.timestamp.toISOString(),
    message: commit.message,
    filesChanged: commit.filesChanged,
    loc: commit.loc,
    additions: commit.additions,
    deletions: commit.deletions,
    sizeCategory: commit.sizeCategory,
    severityLevel: commit.severityLevel,
    refactorSuggestion: commit.refactorSuggestion,
    isMergeCommit: commit.isMergeCommit,
    branch: commit.branch,
  };
}

/**
 * 格式化開發者模式分析為 JSON（使用者故事 3）
 *
 * @param patterns - 開發者模式陣列
 * @param teamAvg - 團隊平均 LOC
 * @returns JSON 字串
 */
export function formatDeveloperPatternsJSON(
  patterns: DeveloperPattern[],
  teamAvg: number
): string {
  const output = {
    teamAverage: {
      avgLOCPerCommit: teamAvg,
    },
    developers: patterns.map((pattern) => ({
      developer: pattern.developer,
      email: pattern.email,
      totalCommits: pattern.totalCommits,
      avgLOC: pattern.avgLOC,
      avgFiles: pattern.avgFiles,
      oversizedCount: pattern.oversizedCount,
      oversizedPercentage: pattern.oversizedPercentage,
      assessment: pattern.assessment,
      suggestion: pattern.suggestion,
    })),
  };

  return JSON.stringify(output, null, 2);
}

/**
 * 格式化趨勢分析為 JSON（使用者故事 4）
 *
 * @param trendResult - 趨勢分析結果
 * @returns JSON 字串
 */
export function formatTrendAnalysisJSON(trendResult: TrendAnalysisResult): string {
  const output = {
    overallTrend: trendResult.overallTrend,
    totalAvgLOCChange: trendResult.totalAvgLOCChange,
    totalOversizedChange: trendResult.totalOversizedChange,
    periods: trendResult.periods.map((period) => ({
      label: period.label,
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString(),
      commits: period.statistics.analyzedCommits,
      avgLOC: period.statistics.avgLOCPerCommit,
      oversizedPercentage: period.statistics.oversizedPercentage,
      trendDirection: period.trendDirection,
      avgLOCChange: period.avgLOCChange,
      oversizedChange: period.oversizedChange,
      isSignificantChange: period.isSignificantChange,
    })),
  };

  return JSON.stringify(output, null, 2);
}
