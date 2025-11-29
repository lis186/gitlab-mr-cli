/**
 * 發布配置模型
 *
 * 定義發布標籤識別規則、發布類型分類邏輯、分析閾值
 */

/**
 * 標籤格式定義
 */
export interface TagPattern {
  /** Regex pattern，如 "^AppStore(\d{2})\.(\d{1,2})\.(\d+)$" */
  pattern: string;

  /** 擷取群組對應，如 { year: 1, month: 2, patch: 3 } */
  groups: Record<string, number>;

  /** 是否為日期格式（如 rel-20251002-1） */
  date_based?: boolean;
}

/**
 * 分析相關設定
 */
export interface AnalysisConfig {
  /** 分析模式：'standard' (預設，標籤+整合頻率) | 'integration_only' (僅整合頻率) */
  mode?: 'standard' | 'integration_only';

  /** 主幹分支名稱，如 "develop" */
  default_branch: string;

  /** 分析閾值設定 */
  thresholds: {
    /** MR 數量閾值 */
    mr_count: {
      healthy: number;
      warning: number;
      critical: number;
    };
    /** 發布間隔天數閾值 */
    release_interval_days: {
      expected: number;
      tolerance: number;
    };
    /** 代碼凍結期天數閾值 */
    code_freeze_days: {
      healthy_min: number;
      healthy_max: number;
      warning_max: number;
    };
  };

  /** 預設過濾條件 */
  default_filters: {
    include_types: string[];
    exclude_types: string[];
  };
}

/**
 * 發布配置
 *
 * 定義發布標籤識別規則、發布類型分類邏輯、分析閾值
 *
 * @example
 * ```typescript
 * const config: ReleaseConfiguration = {
 *   name: "acme-corp-ios",
 *   description: "Acme Corp iOS 行動應用程式",
 *   tag: {
 *     pattern: "^AppStore(\d{2})\.(\d{1,2})\.(\d+)$",
 *     groups: { year: 1, month: 2, patch: 3 }
 *   },
 *   release_types: {
 *     major: {
 *       name: "major",
 *       description: "正式月度發布",
 *       priority: 1,
 *       rules: [
 *         { field: "patch", operator: "equals", value: 0 }
 *       ]
 *     }
 *   },
 *   analysis: {
 *     default_branch: "develop",
 *     thresholds: {
 *       mr_count: { healthy: 50, warning: 100, critical: 150 },
 *       release_interval_days: { expected: 30, tolerance: 7 },
 *       code_freeze_days: { healthy_min: 1, healthy_max: 3, warning_max: 7 }
 *     },
 *     default_filters: {
 *       include_types: ["major", "minor"],
 *       exclude_types: ["rc"]
 *     }
 *   }
 * };
 * ```
 */
export interface ReleaseConfiguration {
  /** 配置名稱 */
  name: string;

  /** 配置說明 */
  description: string;

  /** 標籤格式定義 */
  tag: TagPattern;

  /** 發布類型定義 */
  release_types: Record<string, import('./release-type.js').ReleaseType>;

  /** 分析相關設定 */
  analysis: AnalysisConfig;

  /** 備註說明 */
  notes?: string;
}

/**
 * 驗證發布配置
 *
 * @param config - 發布配置物件
 * @returns 驗證錯誤訊息陣列，若為空陣列則驗證通過
 */
export function validateReleaseConfiguration(config: ReleaseConfiguration): string[] {
  const errors: string[] = [];

  // 驗證 pattern 是否為有效的 Regex
  try {
    new RegExp(config.tag.pattern);
  } catch (error) {
    errors.push(`Invalid regex pattern: ${config.tag.pattern}`);
  }

  // 驗證 groups 對應
  const patternGroupCount = (config.tag.pattern.match(/\(/g) || []).length;
  const maxGroupIndex = Math.max(...Object.values(config.tag.groups));
  if (maxGroupIndex > patternGroupCount) {
    errors.push(`Group index ${maxGroupIndex} exceeds pattern group count ${patternGroupCount}`);
  }

  // 驗證 thresholds 數值合理性
  const { mr_count, code_freeze_days } = config.analysis.thresholds;
  if (mr_count.healthy >= mr_count.warning) {
    errors.push('mr_count.healthy must be less than mr_count.warning');
  }
  if (mr_count.warning >= mr_count.critical) {
    errors.push('mr_count.warning must be less than mr_count.critical');
  }
  if (code_freeze_days.healthy_min > code_freeze_days.healthy_max) {
    errors.push('code_freeze_days.healthy_min must be less than or equal to healthy_max');
  }
  if (code_freeze_days.healthy_max > code_freeze_days.warning_max) {
    errors.push('code_freeze_days.healthy_max must be less than or equal to warning_max');
  }

  return errors;
}
