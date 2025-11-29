/**
 * Release Analysis Output Format Types
 *
 * 定義發布品質分析的輸出格式型別
 *
 * @module types/release-output
 */

/**
 * 輸出格式列舉
 */
export type OutputFormat = 'table' | 'json' | 'markdown'

/**
 * JSON 輸出完整結構（Machine-readable）
 */
export interface JsonOutput {
  metadata: JsonMetadata
  releases: JsonRelease[]
  metrics: JsonMetrics
  trends?: JsonTrends
}

export interface JsonMetadata {
  analyzed_at: string // ISO 8601 format
  project: string
  time_range: {
    since: string // ISO 8601 format
    until: string // ISO 8601 format
  }
  config_source: 'auto-detect' | 'global' | 'project' | 'cli'
  config_name?: string
  tool_version?: string
}

export interface JsonRelease {
  tag: string
  commit_sha: string
  date: string // ISO 8601 format
  type: string
  mr_count: number
  loc_additions: number
  loc_deletions: number
  loc_changes: number
  interval_days: number | null
  freeze_days: number
  health_level: 'healthy' | 'warning' | 'critical'
  previous_release_tag?: string
}

export interface JsonMetrics {
  batch_size: {
    average_mr_count: number
    average_loc_changes: number
    level: 'healthy' | 'warning' | 'critical'
    recommendation: string
  }
  trunk_health: {
    pipeline_success_rate: number // 0.0 - 1.0
    mean_time_to_fix_hours: number
    level: 'elite' | 'good' | 'needs-improvement'
    broken_periods_count: number
    total_broken_hours: number
  }
  integration_frequency: {
    total_merges: number
    daily_average: number
    dora_level: 'elite' | 'high' | 'medium' | 'low'
    has_end_of_month_pattern: boolean
  }
  release_readiness?: {
    is_ready: boolean
    readiness_score: number // 0-100
    pending_mr_count: number
    pending_loc_changes: number
    pipeline_status: 'passing' | 'failing'
    blocking_issues_count: number
  }
}

export interface JsonTrends {
  batch_size: JsonTrendDetail
  integration_frequency: JsonTrendDetail
  trunk_health?: JsonTrendDetail
  overall_assessment: 'improving' | 'stable' | 'degrading'
}

export interface JsonTrendDetail {
  direction: 'improving' | 'stable' | 'degrading'
  change_percentage: number
  values: number[]
  timestamps: string[] // ISO 8601 format
  slope?: number
}

/**
 * Markdown 表格定義
 */
export interface MarkdownTable {
  headers: string[]
  rows: string[][]
  alignment?: Array<'left' | 'center' | 'right'>
}

/**
 * 格式化器輸入資料
 */
export interface FormatterInput {
  metadata: JsonMetadata
  releases: JsonRelease[]
  metrics: JsonMetrics
  trends?: JsonTrends
}

/**
 * 輸出格式化器基礎介面
 */
export interface IOutputFormatter {
  /**
   * 格式化完整分析輸出
   */
  format(data: FormatterInput): string

  /**
   * 格式化發布列表
   */
  formatReleases(releases: JsonRelease[]): string

  /**
   * 格式化指標摘要
   */
  formatMetrics(metrics: JsonMetrics): string

  /**
   * 格式化趨勢分析
   */
  formatTrends(trends: JsonTrends | undefined): string
}
