/**
 * 階段過濾參數驗證器 (Feature: 013-mr-phase-filters)
 *
 * 負責驗證 PhaseFilter 的所有規則：
 * 1. 範圍檢查（百分比 0-100，天數 ≥0）
 * 2. 邊界檢查（min ≤ max）
 * 3. 非空檢查（至少一個條件已定義）
 */

import { PhaseFilter, ValidationResult } from '../types/batch-comparison.js';

export class PhaseFilterValidator {
  /**
   * 驗證 PhaseFilter 配置
   * @param filters 階段過濾配置
   * @returns 驗證結果
   */
  static validate(filters: PhaseFilter): ValidationResult {
    const errors: string[] = [];

    // 1. 範圍檢查 - 百分比（0-100）
    this.validateRange(filters.devPercentMin, 'dev-percent-min', 0, 100, errors);
    this.validateRange(filters.devPercentMax, 'dev-percent-max', 0, 100, errors);
    this.validateRange(filters.waitPercentMin, 'wait-percent-min', 0, 100, errors);
    this.validateRange(filters.waitPercentMax, 'wait-percent-max', 0, 100, errors);
    this.validateRange(filters.reviewPercentMin, 'review-percent-min', 0, 100, errors);
    this.validateRange(filters.reviewPercentMax, 'review-percent-max', 0, 100, errors);
    this.validateRange(filters.mergePercentMin, 'merge-percent-min', 0, 100, errors);
    this.validateRange(filters.mergePercentMax, 'merge-percent-max', 0, 100, errors);

    // 2. 範圍檢查 - 天數（≥0）
    this.validateMin(filters.devDaysMin, 'dev-days-min', 0, errors);
    this.validateMin(filters.devDaysMax, 'dev-days-max', 0, errors);
    this.validateMin(filters.waitDaysMin, 'wait-days-min', 0, errors);
    this.validateMin(filters.waitDaysMax, 'wait-days-max', 0, errors);
    this.validateMin(filters.reviewDaysMin, 'review-days-min', 0, errors);
    this.validateMin(filters.reviewDaysMax, 'review-days-max', 0, errors);
    this.validateMin(filters.mergeDaysMin, 'merge-days-min', 0, errors);
    this.validateMin(filters.mergeDaysMax, 'merge-days-max', 0, errors);

    // 3. 邊界檢查（min ≤ max）
    this.validateBounds(filters.devPercentMin, filters.devPercentMax, 'dev-percent', errors);
    this.validateBounds(filters.devDaysMin, filters.devDaysMax, 'dev-days', errors);
    this.validateBounds(filters.waitPercentMin, filters.waitPercentMax, 'wait-percent', errors);
    this.validateBounds(filters.waitDaysMin, filters.waitDaysMax, 'wait-days', errors);
    this.validateBounds(filters.reviewPercentMin, filters.reviewPercentMax, 'review-percent', errors);
    this.validateBounds(filters.reviewDaysMin, filters.reviewDaysMax, 'review-days', errors);
    this.validateBounds(filters.mergePercentMin, filters.mergePercentMax, 'merge-percent', errors);
    this.validateBounds(filters.mergeDaysMin, filters.mergeDaysMax, 'merge-days', errors);

    // 4. 非空檢查（至少需定義一個過濾條件）
    if (!this.hasAnyFilter(filters)) {
      errors.push('至少需指定一個階段過濾條件');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 驗證數值在指定範圍內
   */
  private static validateRange(
    value: number | undefined,
    field: string,
    min: number,
    max: number,
    errors: string[]
  ): void {
    if (value !== undefined && (value < min || value > max)) {
      errors.push(`${field} (${value}) 必須在 ${min}-${max} 範圍內`);
    }
  }

  /**
   * 驗證數值不小於最小值
   */
  private static validateMin(
    value: number | undefined,
    field: string,
    min: number,
    errors: string[]
  ): void {
    if (value !== undefined && value < min) {
      errors.push(`${field} (${value}) 必須 ≥ ${min}`);
    }
  }

  /**
   * 驗證 min 不大於 max
   */
  private static validateBounds(
    minValue: number | undefined,
    maxValue: number | undefined,
    phase: string,
    errors: string[]
  ): void {
    if (minValue !== undefined && maxValue !== undefined && minValue > maxValue) {
      errors.push(`${phase}-min (${minValue}) 不能大於 ${phase}-max (${maxValue})`);
    }
  }

  /**
   * 檢查是否至少定義了一個過濾條件
   *
   * @param filters - 階段過濾配置
   * @returns true 表示至少有一個條件被定義（值不為 undefined）
   *
   * @remarks
   * 此方法用於驗證過濾器物件是否包含有效的過濾條件。
   * - 空物件 {} 會返回 false（正確行為：沒有任何屬性）
   * - 所有屬性皆為 undefined 的物件也會返回 false（正確行為：無有效條件）
   * - 只要有任一屬性值不為 undefined，即返回 true
   *
   * @example
   * ```typescript
   * hasAnyFilter({})  // false - 沒有任何屬性
   * hasAnyFilter({ devPercentMin: undefined })  // false - 屬性值為 undefined
   * hasAnyFilter({ devPercentMin: 0 })  // true - 有定義的屬性（0 是有效值）
   * hasAnyFilter({ devPercentMin: 30, reviewDaysMax: 2 })  // true - 有多個定義的屬性
   * ```
   *
   * @private
   */
  private static hasAnyFilter(filters: PhaseFilter): boolean {
    return Object.values(filters).some(v => v !== undefined);
  }
}
