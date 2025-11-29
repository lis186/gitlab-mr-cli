/**
 * 規模分類工具
 * 功能：004-commit-size-analysis
 *
 * 根據 LOC（程式碼行數）將 commit 分類到對應的規模類別（FR-004）
 */

import { SizeCategory } from '../types/commit-analysis.js';
import { LOC_THRESHOLDS } from '../constants/commit-analysis.js';

/**
 * 將 commit 規模（LOC）分類到對應的規模類別
 *
 * 分類標準（基於業界研究）：
 * - < 50 LOC: SMALL（小型）
 * - 50-100 LOC: MEDIUM（中型）
 * - 100-200 LOC: LARGE（大型，警告級別）
 * - > 200 LOC: OVERSIZED（超大，嚴重級別）
 *
 * @param loc - 程式碼行數（additions + deletions）
 * @returns 規模類別
 *
 * @example
 * ```typescript
 * classifySize(30);   // SizeCategory.SMALL
 * classifySize(75);   // SizeCategory.MEDIUM
 * classifySize(150);  // SizeCategory.LARGE
 * classifySize(347);  // SizeCategory.OVERSIZED
 * ```
 */
export function classifySize(loc: number): SizeCategory {
  if (loc < LOC_THRESHOLDS.SMALL) {
    return SizeCategory.SMALL;
  }

  if (loc < LOC_THRESHOLDS.MEDIUM) {
    return SizeCategory.MEDIUM;
  }

  if (loc < LOC_THRESHOLDS.LARGE) {
    return SizeCategory.LARGE;
  }

  return SizeCategory.OVERSIZED;
}

/**
 * 取得規模類別的顯示名稱（正體中文）
 *
 * @param category - 規模類別
 * @returns 中文顯示名稱
 */
export function getSizeCategoryDisplayName(category: SizeCategory): string {
  const displayNames: Record<SizeCategory, string> = {
    [SizeCategory.SMALL]: '小型',
    [SizeCategory.MEDIUM]: '中型',
    [SizeCategory.LARGE]: '大型',
    [SizeCategory.OVERSIZED]: '超大',
  };

  return displayNames[category];
}

/**
 * 取得規模類別的 LOC 範圍描述
 *
 * @param category - 規模類別
 * @returns LOC 範圍字串
 */
export function getSizeCategoryRange(category: SizeCategory): string {
  const ranges: Record<SizeCategory, string> = {
    [SizeCategory.SMALL]: `< ${LOC_THRESHOLDS.SMALL} LOC`,
    [SizeCategory.MEDIUM]: `${LOC_THRESHOLDS.SMALL}-${LOC_THRESHOLDS.MEDIUM} LOC`,
    [SizeCategory.LARGE]: `${LOC_THRESHOLDS.MEDIUM}-${LOC_THRESHOLDS.LARGE} LOC`,
    [SizeCategory.OVERSIZED]: `> ${LOC_THRESHOLDS.LARGE} LOC`,
  };

  return ranges[category];
}
