/**
 * Configuration Schema Definitions
 *
 * 使用 Zod 定義配置檔案的驗證 schema，確保型別安全與執行時驗證。
 *
 * @module contracts/config-schema
 */

import { z } from 'zod';

/**
 * 規則運算子定義
 */
export const RuleOperatorSchema = z.enum([
  'equals',       // 完全相等
  'ends_with',    // 結尾匹配
  'contains_any', // 包含任一關鍵字
  'greater_than', // 大於（數值比較）
  'is_empty',     // 欄位為空
  'is_not_empty', // 欄位不為空
  'changed'       // 相對於前一版本有變更
]);

export type RuleOperator = z.infer<typeof RuleOperatorSchema>;

/**
 * 發布類型判定規則
 */
export const ReleaseTypeRuleSchema = z.object({
  field: z.string().describe('判定欄位名稱（如 patch, tag_message）'),
  operator: RuleOperatorSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string())
  ]).optional().describe('比較值（依據 operator 類型，is_empty/is_not_empty 不需要）'),
  match_mode: z.enum(['all', 'any']).optional().describe('匹配模式（當 value 為陣列時使用）')
});

export type ReleaseTypeRule = z.infer<typeof ReleaseTypeRuleSchema>;

/**
 * 發布類型定義
 */
export const ReleaseTypeSchema = z.object({
  name: z.string()
    .min(1)
    .describe('發布類型名稱（如 major, hotfix, custom）'),

  description: z.string()
    .describe('類型說明'),

  priority: z.number()
    .int()
    .min(1)
    .describe('優先級（數字越小優先級越高，用於解決衝突）'),

  rules: z.array(ReleaseTypeRuleSchema)
    .describe('判定規則列表（所有規則需同時滿足，空陣列表示接受所有未分類的發布）'),

  evaluate_batch_size: z.boolean()
    .optional()
    .default(false)
    .describe('是否評估批量健康度（true = 評估 MR 數量和 LOC 變更，通常用於月度發布；false = 不評估，僅統計）')
});

export type ReleaseType = z.infer<typeof ReleaseTypeSchema>;

/**
 * 標籤格式定義
 */
export const TagPatternSchema = z.object({
  pattern: z.string()
    .regex(/^.*$/) // 驗證為有效的正則表達式字串
    .describe('標籤匹配的正則表達式（需包含命名擷取群組）'),

  groups: z.record(z.string(), z.number().int().min(0))
    .describe('擷取群組映射（欄位名稱 → 群組索引）')
    .refine(
      (groups) => {
        const indices = Object.values(groups);
        return new Set(indices).size === indices.length;
      },
      { message: '擷取群組索引不可重複' }
    )
});

export type TagPattern = z.infer<typeof TagPatternSchema>;

/**
 * 健康度閾值定義
 */
export const ThresholdsSchema = z.object({
  mr_count: z.object({
    healthy: z.number().int().min(0).describe('健康上限（<= 此值為健康）'),
    warning: z.number().int().min(0).describe('警告上限（健康 < 值 <= 警告為注意）'),
    critical: z.number().int().min(0).describe('警戒值（> 警告值為警戒）')
  }).refine(
    (thresholds) => thresholds.healthy <= thresholds.warning,
    { message: 'healthy 必須 <= warning' }
  ).refine(
    (thresholds) => thresholds.warning <= thresholds.critical,
    { message: 'warning 必須 <= critical' }
  ),

  loc_changes: z.object({
    healthy: z.number().int().min(0),
    warning: z.number().int().min(0),
    critical: z.number().int().min(0)
  }).optional(),

  pipeline_success_rate: z.object({
    elite: z.number().min(0).max(1).describe('Elite 標準（如 0.95 = 95%）'),
    needs_improvement: z.number().min(0).max(1).describe('需改善標準（如 0.90 = 90%）')
  }).optional(),

  mean_time_to_fix_hours: z.object({
    elite: z.number().min(0).describe('Elite 標準（小時）'),
    needs_improvement: z.number().min(0).describe('需改善標準（小時）')
  }).optional()
});

export type Thresholds = z.infer<typeof ThresholdsSchema>;

/**
 * 預設過濾規則
 */
export const DefaultFiltersSchema = z.object({
  include_types: z.array(z.string()).optional()
    .describe('僅包含的發布類型（空陣列 = 包含所有）'),

  exclude_types: z.array(z.string()).optional()
    .describe('排除的發布類型（優先於 include_types）'),

  exclude_tags: z.array(z.string()).optional()
    .describe('排除特定標籤的正則表達式列表')
});

export type DefaultFilters = z.infer<typeof DefaultFiltersSchema>;

/**
 * 分析設定
 */
export const AnalysisConfigSchema = z.object({
  mode: z.enum(['standard', 'integration_only'])
    .optional()
    .describe('分析模式：standard = 標籤+整合頻率（預設）, integration_only = 僅整合頻率'),

  default_branch: z.string()
    .min(1)
    .default('main')
    .describe('主幹分支名稱'),

  thresholds: ThresholdsSchema
    .describe('健康度閾值設定'),

  default_filters: DefaultFiltersSchema
    .optional()
    .describe('預設過濾規則（可被命令列參數覆蓋）'),

  pipeline_history_days: z.number()
    .int()
    .min(1)
    .max(365)
    .default(90)
    .describe('Pipeline 歷史查詢天數')
});

export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;

/**
 * 發布配置（Preset）完整定義
 */
export const ReleaseConfigurationSchema = z.object({
  name: z.string()
    .min(1)
    .describe('配置名稱（如 acme-corp-ios, mobile-app）'),

  description: z.string()
    .optional()
    .describe('配置說明'),

  tag: TagPatternSchema
    .describe('標籤格式定義'),

  release_types: z.record(z.string(), ReleaseTypeSchema)
    .refine(
      (types) => {
        const priorities = Object.values(types).map((t: ReleaseType) => t.priority);
        return new Set(priorities).size === priorities.length;
      },
      { message: '發布類型的 priority 不可重複' }
    )
    .describe('發布類型定義（key 為類型名稱）'),

  analysis: AnalysisConfigSchema
    .describe('分析相關設定')
});

export type ReleaseConfiguration = z.infer<typeof ReleaseConfigurationSchema>;

/**
 * 全域配置檔案定義（~/.gitlab-analysis/config.yml）
 */
export const GlobalConfigSchema = z.object({
  project_presets: z.record(z.string(), z.string())
    .describe('專案路徑到 preset 名稱的映射')
    .optional(),

  defaults: z.object({
    auto_detect: z.boolean()
      .default(true)
      .describe('啟用標籤格式自動偵測'),

    output_format: z.enum(['table', 'json', 'markdown'])
      .default('table')
      .describe('預設輸出格式'),

    verbose: z.boolean()
      .default(false)
      .describe('預設顯示詳細訊息')
  }).optional(),

  cache: z.object({
    enabled: z.boolean()
      .default(true)
      .describe('啟用快取'),

    ttl_minutes: z.number()
      .int()
      .min(1)
      .max(1440)
      .default(30)
      .describe('快取有效時間（分鐘）'),

    directory: z.string()
      .optional()
      .describe('快取目錄路徑（預設為 ~/.gitlab-analysis/cache）')
  }).optional()
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

/**
 * 標籤格式自動偵測結果
 */
export const DetectionResultSchema = z.object({
  pattern: z.string()
    .describe('偵測到的正則表達式'),

  confidence: z.number()
    .min(0)
    .max(100)
    .describe('信心度（百分比）'),

  matched_count: z.number()
    .int()
    .min(0)
    .describe('匹配的標籤數量'),

  total_count: z.number()
    .int()
    .min(0)
    .describe('樣本總數'),

  suggested_preset: z.enum(['mobile-app', 'date-based', 'semver'])
    .nullable()
    .describe('建議使用的 preset（null = 無法偵測）'),

  sample_tags: z.array(z.string())
    .optional()
    .describe('匹配的樣本標籤（用於驗證）')
});

export type DetectionResult = z.infer<typeof DetectionResultSchema>;

/**
 * 配置驗證結果
 */
export const ConfigValidationResultSchema = z.object({
  valid: z.boolean()
    .describe('驗證是否通過'),

  errors: z.array(z.object({
    path: z.string().describe('錯誤路徑（如 tag.pattern）'),
    message: z.string().describe('錯誤訊息'),
    code: z.string().describe('錯誤代碼（如 invalid_type, too_small）')
  })).describe('驗證錯誤列表（valid=false 時）'),

  warnings: z.array(z.object({
    path: z.string(),
    message: z.string()
  })).optional().describe('警告訊息（不影響驗證通過）')
});

export type ConfigValidationResult = z.infer<typeof ConfigValidationResultSchema>;

/**
 * 配置載入優先順序定義
 */
export enum ConfigLoadPriority {
  AutoDetect = 1,     // 自動偵測（最低優先級）
  GlobalConfig = 2,   // 全域配置（~/.gitlab-analysis/config.yml）
  ProjectConfig = 3,  // 專案配置（專案根目錄 .gitlab-analysis.yml）
  CliParameter = 4    // 命令列參數（最高優先級）
}

/**
 * 配置來源追蹤
 */
export const ConfigSourceSchema = z.object({
  priority: z.nativeEnum(ConfigLoadPriority),
  path: z.string().optional().describe('配置檔案路徑（auto-detect 時為 null）'),
  preset_name: z.string().optional().describe('Preset 名稱（使用 preset 時）')
});

export type ConfigSource = z.infer<typeof ConfigSourceSchema>;
