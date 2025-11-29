/**
 * 發布類型模型
 *
 * 定義單一發布類型的判斷規則與顯示資訊
 */

/**
 * 分類規則操作符
 */
export type RuleOperator =
  | 'equals'
  | 'ends_with'
  | 'contains_any'
  | 'greater_than'
  | 'is_empty'
  | 'is_not_empty'
  | 'changed';

/**
 * 分類規則欄位
 */
export type RuleField =
  | 'patch'
  | 'minor'
  | 'major'
  | 'sequence'
  | 'tag_message'
  | 'suffix';

/**
 * 分類規則
 */
export interface ClassificationRule {
  /** 判斷欄位 */
  field: RuleField;

  /** 比較操作符 */
  operator: RuleOperator;

  /** 比較值 */
  value?: string | number | string[];

  /** 匹配模式（當 value 為陣列時），all=所有符合，any=任一符合 */
  match_mode?: 'all' | 'any';
}

/**
 * 發布類型定義
 *
 * 定義單一發布類型的判斷規則與顯示資訊
 *
 * @example
 * ```typescript
 * const hotfixType: ReleaseType = {
 *   name: "hotfix",
 *   description: "緊急修復",
 *   priority: 2,
 *   rules: [
 *     { field: "patch", operator: "ends_with", value: 5 },
 *     { field: "tag_message", operator: "contains_any", value: ["[fix]", "修復"], match_mode: "any" }
 *   ],
 *   color: "red"
 * };
 * ```
 */
export interface ReleaseType {
  /** 類型名稱（識別用） */
  name: string;

  /** 類型說明（使用者友善） */
  description: string;

  /** 優先級（數字越小優先級越高） */
  priority: number;

  /** 判斷規則陣列 */
  rules: ClassificationRule[];

  /** 顯示顏色（終端輸出） */
  color?: string;
}

/**
 * 驗證發布類型定義
 *
 * @param releaseType - 發布類型物件
 * @returns 驗證錯誤訊息陣列，若為空陣列則驗證通過
 */
export function validateReleaseType(releaseType: ReleaseType): string[] {
  const errors: string[] = [];

  // 驗證 priority 為正整數
  if (!Number.isInteger(releaseType.priority) || releaseType.priority <= 0) {
    errors.push(`Priority must be a positive integer, got ${releaseType.priority}`);
  }

  // 空 rules 陣列合法（表示 fallback 類型，接受所有未分類的發布）
  // 因此不需要驗證 rules.length > 0

  // 驗證 rules 的 operator 與 value 型別匹配
  for (const rule of releaseType.rules) {
    if (rule.operator === 'contains_any' && !Array.isArray(rule.value)) {
      errors.push(`Rule with operator 'contains_any' requires value to be an array`);
    }

    if (rule.operator === 'contains_any' && Array.isArray(rule.value) && !rule.match_mode) {
      errors.push(`Rule with operator 'contains_any' and array value requires match_mode`);
    }

    if (
      ['is_empty', 'is_not_empty'].includes(rule.operator) &&
      rule.value !== undefined
    ) {
      errors.push(`Rule with operator '${rule.operator}' should not have a value`);
    }

    if (
      !['is_empty', 'is_not_empty'].includes(rule.operator) &&
      rule.value === undefined
    ) {
      errors.push(`Rule with operator '${rule.operator}' requires a value`);
    }
  }

  return errors;
}
