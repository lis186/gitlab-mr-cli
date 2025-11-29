/**
 * Diff 解析工具
 * Feature: 007-mr-size-analysis
 */

/**
 * Diff 統計結果
 */
export interface DiffStats {
  additions: number // 新增行數
  deletions: number // 刪除行數
}

/**
 * 計算 diff 字串中的行數變更
 * 解析 unified diff 格式，統計 additions (+) 和 deletions (-)
 *
 * @param diff - unified diff 格式的字串
 * @returns 新增和刪除的行數統計
 *
 * @example
 * const diff = `@@ -10,7 +10,8 @@
 *  -  if (!username || !password) {
 *  -    throw new Error('Invalid credentials')
 *  +  if (!username) {
 *  +    throw new Error('Username is required')
 *  +  }`
 * calculateLineChanges(diff) // { additions: 3, deletions: 2 }
 */
export function calculateLineChanges(diff: string): DiffStats {
  if (!diff || diff.trim() === '') {
    return { additions: 0, deletions: 0 }
  }

  const lines = diff.split('\n')
  let additions = 0
  let deletions = 0

  for (const line of lines) {
    // 新增行：以 + 開頭，但不是檔案標記 +++
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++
    }
    // 刪除行：以 - 開頭，但不是檔案標記 ---
    else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++
    }
  }

  return { additions, deletions }
}

/**
 * 計算多個 diff 的總計統計
 *
 * @param diffs - diff 陣列
 * @returns 累加的統計結果
 */
export function calculateTotalChanges(diffs: Array<{ diff: string }>): DiffStats {
  let totalAdditions = 0
  let totalDeletions = 0

  for (const diffObj of diffs) {
    const { additions, deletions } = calculateLineChanges(diffObj.diff)
    totalAdditions += additions
    totalDeletions += deletions
  }

  return {
    additions: totalAdditions,
    deletions: totalDeletions,
  }
}
