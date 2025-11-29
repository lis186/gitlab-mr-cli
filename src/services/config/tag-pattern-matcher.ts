/**
 * 標籤格式匹配服務
 *
 * 根據配置的 pattern 匹配標籤，提取標籤中的年、月、patch 等群組
 *
 * @module services/config/tag-pattern-matcher
 */

import type { TagPattern } from '../../types/release-config.js';

/**
 * 標籤匹配結果
 */
export interface TagMatchResult {
  /** 是否匹配成功 */
  matched: boolean;
  /** 提取的欄位（僅當 matched = true 時存在） */
  fields?: Record<string, string | number>;
}

/**
 * 批次標籤匹配結果
 */
export interface BatchMatchResult {
  /** 標籤名稱 */
  tag: string;
  /** 是否匹配成功 */
  matched: boolean;
  /** 提取的欄位（僅當 matched = true 時存在） */
  fields?: Record<string, string | number>;
}

/**
 * 標籤格式匹配服務
 *
 * 負責根據配置的正則表達式匹配標籤，並提取群組資料
 */
export class TagPatternMatcher {
  /**
   * 匹配單一標籤並提取欄位
   *
   * @param options - 匹配選項
   * @param options.tag - 標籤名稱
   * @param options.pattern - 正則表達式 pattern
   * @param options.groups - 群組映射（欄位名稱 → 群組索引）
   * @returns 匹配結果
   *
   * @example
   * ```typescript
   * const matcher = new TagPatternMatcher();
   * const result = matcher.match({
   *   tag: 'AppStore25.10.5',
   *   pattern: '^AppStore(\\d{2})\\.(\\d{1,2})\\.(\\d+)$',
   *   groups: { year: 1, month: 2, patch: 3 }
   * });
   *
   * if (result.matched) {
   *   console.log(result.fields); // { year: 25, month: 10, patch: 5 }
   * }
   * ```
   */
  match(options: {
    tag: string;
    pattern: string;
    groups: Record<string, number>;
  }): TagMatchResult {
    const { tag, pattern, groups } = options;

    try {
      const regex = new RegExp(pattern);
      const match = regex.exec(tag);

      if (!match) {
        return { matched: false };
      }

      // 提取群組資料
      const fields = this.extractGroups(match, groups);

      return {
        matched: true,
        fields,
      };
    } catch (error) {
      // 正則表達式編譯失敗
      return { matched: false };
    }
  }

  /**
   * 批次匹配多個標籤
   *
   * @param options - 批次匹配選項
   * @param options.tags - 標籤名稱陣列
   * @param options.pattern - 正則表達式 pattern
   * @param options.groups - 群組映射
   * @returns 批次匹配結果陣列
   *
   * @example
   * ```typescript
   * const matcher = new TagPatternMatcher();
   * const results = matcher.matchBatch({
   *   tags: ['AppStore25.10.5', 'AppStore25.9.0', 'v24.12.1'],
   *   pattern: '^AppStore(\\d{2})\\.(\\d{1,2})\\.(\\d+)$',
   *   groups: { year: 1, month: 2, patch: 3 }
   * });
   *
   * const matched = results.filter(r => r.matched);
   * console.log(`匹配 ${matched.length}/${results.length} 個標籤`);
   * ```
   */
  matchBatch(options: {
    tags: string[];
    pattern: string;
    groups: Record<string, number>;
  }): BatchMatchResult[] {
    const { tags, pattern, groups } = options;

    return tags.map((tag) => {
      const result = this.match({ tag, pattern, groups });
      return {
        tag,
        ...result,
      };
    });
  }

  /**
   * 從正則表達式匹配結果中提取群組資料
   *
   * @param match - RegExp 匹配結果
   * @param groups - 群組映射（欄位名稱 → 群組索引）
   * @returns 提取的欄位物件
   * @private
   *
   * @example
   * ```typescript
   * const match = /^AppStore(\d{2})\.(\d{1,2})\.(\d+)$/.exec('AppStore25.10.5');
   * const fields = extractGroups(match, { year: 1, month: 2, patch: 3 });
   * // fields = { year: 25, month: 10, patch: 5 }
   * ```
   */
  private extractGroups(
    match: RegExpExecArray,
    groups: Record<string, number>
  ): Record<string, string | number> {
    const fields: Record<string, string | number> = {};

    for (const [fieldName, groupIndex] of Object.entries(groups) as [string, number][]) {
      const value = match[groupIndex];

      if (value !== undefined) {
        // 嘗試轉換為數字（若為純數字字串）
        const numValue = Number(value);
        fields[fieldName] = Number.isNaN(numValue) ? value : numValue;
      }
    }

    return fields;
  }

  /**
   * 從配置物件匹配標籤（便利方法）
   *
   * @param tag - 標籤名稱
   * @param tagPattern - 標籤格式配置
   * @returns 匹配結果
   *
   * @example
   * ```typescript
   * const matcher = new TagPatternMatcher();
   * const tagPattern: TagPattern = {
   *   pattern: '^AppStore(\\d{2})\\.(\\d{1,2})\\.(\\d+)$',
   *   groups: { year: 1, month: 2, patch: 3 }
   * };
   *
   * const result = matcher.matchWithConfig('AppStore25.10.5', tagPattern);
   * ```
   */
  matchWithConfig(tag: string, tagPattern: TagPattern): TagMatchResult {
    return this.match({
      tag,
      pattern: tagPattern.pattern,
      groups: tagPattern.groups,
    });
  }

  /**
   * 批次匹配（配置物件版本）
   *
   * @param tags - 標籤名稱陣列
   * @param tagPattern - 標籤格式配置
   * @returns 批次匹配結果
   */
  matchBatchWithConfig(tags: string[], tagPattern: TagPattern): BatchMatchResult[] {
    return this.matchBatch({
      tags,
      pattern: tagPattern.pattern,
      groups: tagPattern.groups,
    });
  }
}

/**
 * 匹配單一標籤（獨立函數版本）
 *
 * @param tag - 標籤名稱
 * @param pattern - 正則表達式 pattern
 * @param groups - 群組映射
 * @returns 匹配結果
 *
 * @example
 * ```typescript
 * const result = matchTag(
 *   'AppStore25.10.5',
 *   '^AppStore(\\d{2})\\.(\\d{1,2})\\.(\\d+)$',
 *   { year: 1, month: 2, patch: 3 }
 * );
 * ```
 */
export function matchTag(
  tag: string,
  pattern: string,
  groups: Record<string, number>
): TagMatchResult {
  const matcher = new TagPatternMatcher();
  return matcher.match({ tag, pattern, groups });
}

/**
 * 從正則表達式匹配結果提取群組（獨立函數版本）
 *
 * @param tag - 標籤名稱
 * @param pattern - 正則表達式 pattern
 * @param groups - 群組映射
 * @returns 提取的欄位物件（null 表示未匹配）
 *
 * @example
 * ```typescript
 * const fields = extractGroups(
 *   'rel-20251026-1',
 *   '^rel-(\\d{4})(\\d{2})(\\d{2})-(\\d+)$',
 *   { year: 1, month: 2, day: 3, sequence: 4 }
 * );
 * // fields = { year: 2025, month: 10, day: 26, sequence: 1 }
 * ```
 */
export function extractGroups(
  tag: string,
  pattern: string,
  groups: Record<string, number>
): Record<string, string | number> | null {
  const matcher = new TagPatternMatcher();
  const result = matcher.match({ tag, pattern, groups });

  return result.matched ? result.fields! : null;
}

/**
 * 計算標籤匹配率
 *
 * @param tags - 標籤陣列
 * @param pattern - 正則表達式 pattern
 * @param groups - 群組映射
 * @returns 匹配率（0-1）
 *
 * @example
 * ```typescript
 * const tags = ['AppStore25.10.5', 'AppStore25.9.0', 'v24.12.1'];
 * const rate = calculateMatchRate(
 *   tags,
 *   '^AppStore(\\d{2})\\.(\\d{1,2})\\.(\\d+)$',
 *   { year: 1, month: 2, patch: 3 }
 * );
 * console.log(`匹配率: ${(rate * 100).toFixed(1)}%`);
 * ```
 */
export function calculateMatchRate(
  tags: string[],
  pattern: string,
  groups: Record<string, number>
): number {
  if (tags.length === 0) {
    return 0;
  }

  const matcher = new TagPatternMatcher();
  const results = matcher.matchBatch({ tags, pattern, groups });
  const matchedCount = results.filter((r) => r.matched).length;

  return matchedCount / tags.length;
}
