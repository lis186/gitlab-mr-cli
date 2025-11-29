/**
 * Developer Pattern 資料模型
 * 功能：004-commit-size-analysis - US3
 *
 * 用於表示個別開發者的 commit 規模模式
 */

import { DEVELOPER_THRESHOLDS } from '../constants/commit-analysis.js';

/**
 * 開發者評估等級（FR-012a）
 */
export enum DeveloperAssessment {
  EXCELLENT = 'excellent',           // 0-5% oversized
  GOOD = 'good',                      // 5-15% oversized
  NEEDS_IMPROVEMENT = 'needs_improvement', // 15-25% oversized
  CRITICAL = 'critical',              // >25% oversized
}

/**
 * 開發者 Commit 規模模式
 */
export interface DeveloperPattern {
  /** 開發者名稱 */
  developer: string;

  /** 開發者 Email */
  email: string;

  /** Commit 總數 */
  totalCommits: number;

  /** 平均 LOC/commit */
  avgLOC: number;

  /** 平均檔案數/commit */
  avgFiles: number;

  /** 超大 commits 數量（>200 LOC） */
  oversizedCount: number;

  /** 超大率（百分比） */
  oversizedPercentage: number;

  /** 評估等級 */
  assessment: DeveloperAssessment;

  /** 改善建議（若有） */
  suggestion: string | null;
}

/**
 * 建立 DeveloperPattern 實例
 *
 * @param data - 開發者模式資料
 * @returns DeveloperPattern 實例
 */
export function createDeveloperPattern(data: {
  developer: string;
  email: string;
  totalCommits: number;
  avgLOC: number;
  avgFiles: number;
  oversizedCount: number;
  oversizedPercentage: number;
  assessment: DeveloperAssessment;
  suggestion: string | null;
}): DeveloperPattern {
  return {
    developer: data.developer,
    email: data.email,
    totalCommits: data.totalCommits,
    avgLOC: data.avgLOC,
    avgFiles: data.avgFiles,
    oversizedCount: data.oversizedCount,
    oversizedPercentage: data.oversizedPercentage,
    assessment: data.assessment,
    suggestion: data.suggestion,
  };
}

/**
 * 評估開發者的 commit 規模模式（FR-012a）
 *
 * @param oversizedPercentage - 超大 commits 百分比
 * @returns 評估等級
 */
export function assessDeveloper(oversizedPercentage: number): DeveloperAssessment {
  if (oversizedPercentage <= DEVELOPER_THRESHOLDS.EXCELLENT) {
    return DeveloperAssessment.EXCELLENT;
  }
  if (oversizedPercentage <= DEVELOPER_THRESHOLDS.GOOD) {
    return DeveloperAssessment.GOOD;
  }
  if (oversizedPercentage <= DEVELOPER_THRESHOLDS.NEEDS_IMPROVEMENT) {
    return DeveloperAssessment.NEEDS_IMPROVEMENT;
  }
  return DeveloperAssessment.CRITICAL;
}

/**
 * 取得開發者評估的顯示名稱
 *
 * @param assessment - 評估等級
 * @returns 顯示名稱
 */
export function getDeveloperAssessmentDisplayName(
  assessment: DeveloperAssessment
): string {
  const displayNames = {
    [DeveloperAssessment.EXCELLENT]: '優秀',
    [DeveloperAssessment.GOOD]: '良好',
    [DeveloperAssessment.NEEDS_IMPROVEMENT]: '需改善',
    [DeveloperAssessment.CRITICAL]: '嚴重',
  };
  return displayNames[assessment];
}

/**
 * 取得開發者評估的顏色
 *
 * @param assessment - 評估等級
 * @returns chalk 顏色名稱
 */
export function getDeveloperAssessmentColor(
  assessment: DeveloperAssessment
): 'green' | 'cyan' | 'yellow' | 'red' {
  const colors = {
    [DeveloperAssessment.EXCELLENT]: 'green' as const,
    [DeveloperAssessment.GOOD]: 'cyan' as const,
    [DeveloperAssessment.NEEDS_IMPROVEMENT]: 'yellow' as const,
    [DeveloperAssessment.CRITICAL]: 'red' as const,
  };
  return colors[assessment];
}

/**
 * 生成開發者改善建議
 *
 * @param assessment - 評估等級
 * @param oversizedPercentage - 超大率
 * @returns 建議文字，若無需改善則為 null
 */
export function generateDeveloperSuggestion(
  assessment: DeveloperAssessment,
  oversizedPercentage: number
): string | null {
  if (assessment === DeveloperAssessment.EXCELLENT) {
    return null;
  }

  if (assessment === DeveloperAssessment.GOOD) {
    return '建議：持續保持小批量實踐，避免超大 commits';
  }

  if (assessment === DeveloperAssessment.NEEDS_IMPROVEMENT) {
    return `警告：${oversizedPercentage.toFixed(1)}% commits 過大，建議重新檢視 commit 策略，將大型變更拆分為多個小 commits`;
  }

  return `嚴重：${oversizedPercentage.toFixed(1)}% commits 過大，強烈建議重新訓練 commit 習慣，採用更小的批次`;
}
