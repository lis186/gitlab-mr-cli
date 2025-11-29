/**
 * AggregateStatistics 模型
 * 功能：004-commit-size-analysis
 *
 * 代表一組 commits 的摘要指標
 */

import type {
  AggregateStatistics,
  SizeDistribution,
  CommitAnalysis,
  SizeCategory,
} from '../types/commit-analysis.js';
import { HealthAssessment } from '../types/commit-analysis.js';
import { HEALTH_THRESHOLDS } from '../constants/commit-analysis.js';

/**
 * 從 commits 陣列計算彙總統計
 *
 * @param commits - CommitAnalysis 陣列（已排除 merge commits 和 0 LOC）
 * @param totalCommits - 原始總 commit 數（包含排除的）
 * @returns AggregateStatistics 物件
 */
export function calculateAggregateStatistics(
  commits: CommitAnalysis[],
  totalCommits: number
): AggregateStatistics {
  const analyzedCommits = commits.length;
  const excludedCommits = totalCommits - analyzedCommits;

  // 計算平均值
  const avgFilesPerCommit = analyzedCommits > 0
    ? commits.reduce((sum, c) => sum + c.filesChanged, 0) / analyzedCommits
    : 0;

  const avgLOCPerCommit = analyzedCommits > 0
    ? commits.reduce((sum, c) => sum + c.loc, 0) / analyzedCommits
    : 0;

  // 計算中位數 LOC
  const medianLOC = calculateMedian(commits.map(c => c.loc));

  // 計算最大 LOC
  const maxLOC = analyzedCommits > 0
    ? Math.max(...commits.map(c => c.loc))
    : 0;

  // 計算規模分布
  const distribution = calculateSizeDistribution(commits);

  // 計算超大 commits 百分比
  const oversizedPercentage = analyzedCommits > 0
    ? (distribution.oversized.count / analyzedCommits) * 100
    : 0;

  // 評估健康度
  const healthAssessment = assessHealth(oversizedPercentage);

  return {
    totalCommits,
    analyzedCommits,
    excludedCommits,
    avgFilesPerCommit,
    avgLOCPerCommit,
    medianLOC,
    maxLOC,
    distribution,
    healthAssessment,
    oversizedPercentage,
  };
}

/**
 * 計算規模分布統計（FR-007）
 *
 * @param commits - CommitAnalysis 陣列
 * @returns SizeDistribution 物件
 */
function calculateSizeDistribution(commits: CommitAnalysis[]): SizeDistribution {
  const total = commits.length;

  // 計算每個類別的數量
  const counts = commits.reduce(
    (acc, commit) => {
      acc[commit.sizeCategory]++;
      return acc;
    },
    {
      small: 0,
      medium: 0,
      large: 0,
      oversized: 0,
    } as Record<SizeCategory, number>
  );

  // 計算百分比
  const distribution: SizeDistribution = {
    small: {
      count: counts.small,
      percentage: total > 0 ? (counts.small / total) * 100 : 0,
    },
    medium: {
      count: counts.medium,
      percentage: total > 0 ? (counts.medium / total) * 100 : 0,
    },
    large: {
      count: counts.large,
      percentage: total > 0 ? (counts.large / total) * 100 : 0,
    },
    oversized: {
      count: counts.oversized,
      percentage: total > 0 ? (counts.oversized / total) * 100 : 0,
    },
  };

  return distribution;
}

/**
 * 評估整體健康度（FR-008）
 *
 * 基於超大 commits 百分比：
 * - 0-5%: EXCELLENT
 * - 5-10%: GOOD
 * - 10-15%: MODERATE
 * - 15-25%: NEEDS_IMPROVEMENT
 * - >25%: CRITICAL
 *
 * @param oversizedPercentage - 超大 commits 百分比
 * @returns HealthAssessment 列舉值
 */
function assessHealth(oversizedPercentage: number): HealthAssessment {
  if (oversizedPercentage <= HEALTH_THRESHOLDS.EXCELLENT) {
    return HealthAssessment.EXCELLENT;
  }

  if (oversizedPercentage <= HEALTH_THRESHOLDS.GOOD) {
    return HealthAssessment.GOOD;
  }

  if (oversizedPercentage <= HEALTH_THRESHOLDS.MODERATE) {
    return HealthAssessment.MODERATE;
  }

  if (oversizedPercentage <= HEALTH_THRESHOLDS.NEEDS_IMPROVEMENT) {
    return HealthAssessment.NEEDS_IMPROVEMENT;
  }

  return HealthAssessment.CRITICAL;
}

/**
 * 計算中位數（FR-005）
 *
 * @param values - 數值陣列
 * @returns 中位數
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    // 偶數個元素：取中間兩數的平均
    const left = sorted[mid - 1];
    const right = sorted[mid];
    return left !== undefined && right !== undefined ? (left + right) / 2 : 0;
  } else {
    // 奇數個元素：取中間值
    const median = sorted[mid];
    return median !== undefined ? median : 0;
  }
}

/**
 * 取得健康度評估的顯示名稱（正體中文）
 *
 * @param assessment - 健康度評估
 * @returns 中文顯示名稱
 */
export function getHealthAssessmentDisplayName(assessment: HealthAssessment): string {
  const displayNames: Record<HealthAssessment, string> = {
    [HealthAssessment.EXCELLENT]: '優秀',
    [HealthAssessment.GOOD]: '良好',
    [HealthAssessment.MODERATE]: '中等',
    [HealthAssessment.NEEDS_IMPROVEMENT]: '需改善',
    [HealthAssessment.CRITICAL]: '嚴重',
  };

  return displayNames[assessment];
}

/**
 * 取得健康度評估的顏色代碼
 *
 * @param assessment - 健康度評估
 * @returns chalk 顏色名稱
 */
export function getHealthAssessmentColor(
  assessment: HealthAssessment
): 'green' | 'cyan' | 'yellow' | 'magenta' | 'red' {
  const colors: Record<HealthAssessment, 'green' | 'cyan' | 'yellow' | 'magenta' | 'red'> = {
    [HealthAssessment.EXCELLENT]: 'green',
    [HealthAssessment.GOOD]: 'cyan',
    [HealthAssessment.MODERATE]: 'yellow',
    [HealthAssessment.NEEDS_IMPROVEMENT]: 'magenta',
    [HealthAssessment.CRITICAL]: 'red',
  };

  return colors[assessment];
}
