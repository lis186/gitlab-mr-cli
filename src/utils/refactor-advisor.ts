/**
 * 重構建議計算工具
 * 功能：004-commit-size-analysis
 *
 * 為超大 commits 生成具體的重構建議（FR-010）
 */

/**
 * 生成重構建議
 *
 * 使用目標規模法計算（基於 clarification Q4 的決策）：
 *
 * - 200-400 LOC:
 *   建議拆分成至少 ⌈LOC/100⌉ 個 commits（目標每個 <100 LOC）
 *
 * - 400-800 LOC:
 *   建議拆分成至少 ⌈LOC/100⌉ 個 commits（建議更小批次，理想每個 <50 LOC）
 *
 * - > 800 LOC:
 *   建議拆分成至少 ⌈LOC/100⌉ 個 commits（嚴重過大，請審查是否應為多個獨立功能）
 *
 * @param loc - 程式碼行數（additions + deletions）
 * @returns 重構建議字串，若 loc < 200 則回傳 null
 *
 * @example
 * ```typescript
 * generateRefactorSuggestion(150);  // null（未超過閾值）
 * generateRefactorSuggestion(347);  // "拆分成至少 4 個 commits（目標每個 <100 LOC）"
 * generateRefactorSuggestion(650);  // "拆分成至少 7 個 commits（建議更小批次，理想每個 <50 LOC）"
 * generateRefactorSuggestion(1200); // "拆分成至少 12 個 commits（嚴重過大，請審查是否應為多個獨立功能）"
 * ```
 */
export function generateRefactorSuggestion(loc: number): string | null {
  // 未超過嚴重閾值（200 LOC），無需建議
  if (loc < 200) {
    return null;
  }

  // 計算建議拆分數量（目標每個 <100 LOC）
  const suggestedSplits = Math.ceil(loc / 100);

  // 200-400 LOC: 基本建議
  if (loc < 400) {
    return `拆分成至少 ${suggestedSplits} 個 commits（目標每個 <100 LOC）`;
  }

  // 400-800 LOC: 建議更小批次
  if (loc < 800) {
    return `拆分成至少 ${suggestedSplits} 個 commits（建議更小批次，理想每個 <50 LOC）`;
  }

  // > 800 LOC: 嚴重過大，可能需要重新規劃
  return `拆分成至少 ${suggestedSplits} 個 commits（嚴重過大，請審查是否應為多個獨立功能）`;
}

/**
 * 判斷 commit 是否需要重構
 *
 * @param loc - 程式碼行數
 * @returns 是否需要重構（> 200 LOC）
 */
export function needsRefactoring(loc: number): boolean {
  return loc >= 200;
}

/**
 * 計算建議的拆分數量
 *
 * @param loc - 程式碼行數
 * @returns 建議拆分成幾個 commits
 */
export function calculateSuggestedSplits(loc: number): number {
  if (loc < 200) {
    return 1; // 無需拆分
  }

  return Math.ceil(loc / 100);
}

/**
 * 計算拆分後每個 commit 的目標 LOC
 *
 * @param loc - 總程式碼行數
 * @param splits - 拆分數量
 * @returns 每個 commit 的目標 LOC
 */
export function calculateTargetLOCPerSplit(loc: number, splits: number): number {
  return Math.ceil(loc / splits);
}
