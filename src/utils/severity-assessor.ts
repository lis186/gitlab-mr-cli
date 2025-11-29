/**
 * 嚴重程度評估工具
 * 功能：004-commit-size-analysis
 *
 * 根據 LOC 評估 commit 的嚴重程度級別（FR-006）
 */

import { SeverityLevel } from '../types/commit-analysis.js';
import { SEVERITY_THRESHOLDS } from '../constants/commit-analysis.js';

/**
 * 評估 commit 的嚴重程度級別
 *
 * 評估標準（基於程式碼審查效率研究）：
 * - < 100 LOC: NORMAL（無問題，在建議範圍內）
 * - 100-200 LOC: WARNING（警告，接近或超過建議上限）
 * - > 200 LOC: CRITICAL（嚴重，超過絕對上限，需要重構）
 *
 * @param loc - 程式碼行數（additions + deletions）
 * @returns 嚴重程度級別
 *
 * @example
 * ```typescript
 * assessSeverity(50);   // SeverityLevel.NORMAL
 * assessSeverity(150);  // SeverityLevel.WARNING
 * assessSeverity(347);  // SeverityLevel.CRITICAL
 * ```
 */
export function assessSeverity(loc: number): SeverityLevel {
  if (loc < SEVERITY_THRESHOLDS.WARNING) {
    return SeverityLevel.NORMAL;
  }

  if (loc < SEVERITY_THRESHOLDS.CRITICAL) {
    return SeverityLevel.WARNING;
  }

  return SeverityLevel.CRITICAL;
}

/**
 * 取得嚴重程度的顯示名稱（正體中文）
 *
 * @param level - 嚴重程度級別
 * @returns 中文顯示名稱
 */
export function getSeverityLevelDisplayName(level: SeverityLevel): string {
  const displayNames: Record<SeverityLevel, string> = {
    [SeverityLevel.NORMAL]: '正常',
    [SeverityLevel.WARNING]: '警告',
    [SeverityLevel.CRITICAL]: '嚴重',
  };

  return displayNames[level];
}

/**
 * 取得嚴重程度的顏色代碼（用於終端輸出）
 *
 * @param level - 嚴重程度級別
 * @returns chalk 顏色名稱
 */
export function getSeverityLevelColor(level: SeverityLevel): 'green' | 'yellow' | 'red' {
  const colors: Record<SeverityLevel, 'green' | 'yellow' | 'red'> = {
    [SeverityLevel.NORMAL]: 'green',
    [SeverityLevel.WARNING]: 'yellow',
    [SeverityLevel.CRITICAL]: 'red',
  };

  return colors[level];
}
