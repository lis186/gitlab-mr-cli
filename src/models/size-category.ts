/**
 * MR 規模分類模型
 * Feature: 007-mr-size-analysis
 */

import { SizeCategory } from '../types/mr-size.js'

/**
 * 規模門檻定義
 */
export interface SizeThresholds {
  files: number // 檔案數門檻
  loc: number // 行數門檻（Lines of Code: additions + deletions）
}

/**
 * 各規模類別的門檻常數
 */
export const SIZE_THRESHOLDS: Record<SizeCategory, SizeThresholds> = {
  [SizeCategory.XS]: { files: 10, loc: 100 },
  [SizeCategory.S]: { files: 20, loc: 200 },
  [SizeCategory.M]: { files: 50, loc: 400 },
  [SizeCategory.L]: { files: 100, loc: 800 },
  [SizeCategory.XL]: { files: Infinity, loc: Infinity },
}

/**
 * 樣本數警告門檻
 */
export const MIN_SAMPLE_SIZE = 10

/**
 * 團隊健康度目標
 */
export const HEALTH_GOALS = {
  smallOrLessPercent: 60, // XS + S 至少 60%
  xlPercent: 10, // XL 不超過 10%
}

/**
 * 根據檔案數和行數變更分類 MR 規模
 * 當門檻衝突時使用較大的類別
 *
 * @param fileCount - 變更檔案數量
 * @param lineChanges - 總行數變更（additions + deletions）
 * @returns 規模分類
 *
 * @example
 * // 檔案數符合 XS，但行數符合 XL → 取較大者 XL
 * categorizeMRSize(5, 900) // 回傳 SizeCategory.XL
 *
 * @example
 * // 檔案數和行數都符合 M
 * categorizeMRSize(30, 250) // 回傳 SizeCategory.M
 */
export function categorizeMRSize(fileCount: number, lineChanges: number): SizeCategory {
  const fileCat = findCategoryByFiles(fileCount)
  const lineCat = findCategoryByLines(lineChanges)
  return maxCategory(fileCat, lineCat)
}

/**
 * 根據檔案數找出對應的規模類別
 */
function findCategoryByFiles(count: number): SizeCategory {
  if (count <= SIZE_THRESHOLDS.XS.files) return SizeCategory.XS
  if (count <= SIZE_THRESHOLDS.S.files) return SizeCategory.S
  if (count <= SIZE_THRESHOLDS.M.files) return SizeCategory.M
  if (count <= SIZE_THRESHOLDS.L.files) return SizeCategory.L
  return SizeCategory.XL
}

/**
 * 根據行數變更找出對應的規模類別
 */
function findCategoryByLines(loc: number): SizeCategory {
  if (loc <= SIZE_THRESHOLDS.XS.loc) return SizeCategory.XS
  if (loc <= SIZE_THRESHOLDS.S.loc) return SizeCategory.S
  if (loc <= SIZE_THRESHOLDS.M.loc) return SizeCategory.M
  if (loc <= SIZE_THRESHOLDS.L.loc) return SizeCategory.L
  return SizeCategory.XL
}

/**
 * 回傳兩個規模類別中較大的那個
 */
function maxCategory(a: SizeCategory, b: SizeCategory): SizeCategory {
  const order = [SizeCategory.XS, SizeCategory.S, SizeCategory.M, SizeCategory.L, SizeCategory.XL]
  return order.indexOf(a) > order.indexOf(b) ? a : b
}

/**
 * 檢查檔案數是否超出該類別的門檻
 */
export function exceedsFileThreshold(fileCount: number, category: 'L' | 'XL'): boolean {
  return fileCount > SIZE_THRESHOLDS[category === 'XL' ? 'L' : 'M'].files
}

/**
 * 檢查行數是否超出該類別的門檻
 */
export function exceedsLOCThreshold(lineChanges: number, category: 'L' | 'XL'): boolean {
  return lineChanges > SIZE_THRESHOLDS[category === 'XL' ? 'L' : 'M'].loc
}
