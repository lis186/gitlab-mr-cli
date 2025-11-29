/**
 * Release Analysis API Contracts
 *
 * 定義發布分析服務的介面契約，確保各模組間的互動一致性。
 *
 * @module contracts/release-api
 */

import type { ReleaseConfiguration } from './release-config.js';

/**
 * ============================================
 * 核心實體介面
 * ============================================
 */

/**
 * 發布實體
 */
export interface Release {
  tag: string;
  commit_sha: string;
  date: Date;
  type: string;
  mr_list: string[];
  mr_count: number;
  total_loc_additions: number;
  total_loc_deletions: number;
  total_loc_changes: number;
  interval_days?: number;
  freeze_days: number;
  health_level: 'healthy' | 'warning' | 'critical';
  previous_release_tag?: string;
}

/**
 * Pipeline 執行記錄
 */
export interface PipelineExecution {
  id: number;
  ref: string;
  status: 'success' | 'failed' | 'canceled' | 'skipped' | 'running' | 'pending';
  created_at: Date;
  finished_at?: Date;
  duration_seconds?: number;
}

/**
 * 合併事件
 */
export interface MergeEvent {
  mr_iid: number;
  title: string;
  merged_at: Date;
  merged_by: string;
  source_branch: string;
  target_branch: string;
  loc_additions: number;
  loc_deletions: number;
  loc_changes: number;
}

/**
 * 健康度指標
 */
export interface HealthMetrics {
  batch_size: {
    average_mr_count: number;
    average_loc_changes: number;
    level: 'healthy' | 'warning' | 'critical';
    recommendation: string;
  };
  trunk_health: {
    pipeline_success_rate: number;
    mean_time_to_fix_hours: number;
    level: 'elite' | 'good' | 'needs-improvement';
    broken_periods: Array<{
      start: Date;
      end: Date;
      duration_hours: number;
    }>;
  };
  integration_frequency: {
    daily_average: number;
    dora_level: 'elite' | 'high' | 'medium' | 'low';
    has_end_of_month_pattern: boolean;
  };
}

/**
 * ============================================
 * 服務介面定義
 * ============================================
 */

/**
 * 發布批量分析服務介面
 */
export interface IReleaseAnalyzer {
  /**
   * 分析指定時間範圍內的發布批量
   */
  analyzeBatchSize(options: {
    projectId: string;
    since?: Date;
    until?: Date;
    config: ReleaseConfiguration;
  }): Promise<{
    releases: Release[];
    metrics: HealthMetrics['batch_size'];
  }>;

  /**
   * 取得兩個發布間的 MR 列表
   */
  getMergeRequestsBetweenReleases(options: {
    projectId: string;
    fromTag: string;
    toTag: string;
    targetBranch: string;
  }): Promise<MergeEvent[]>;

  /**
   * 計算發布健康度
   */
  calculateReleaseHealth(options: {
    mrCount: number;
    locChanges: number;
    thresholds: ReleaseConfiguration['analysis']['thresholds'];
  }): 'healthy' | 'warning' | 'critical';
}

/**
 * 主幹可部署性分析服務介面
 */
export interface ITrunkHealthAnalyzer {
  /**
   * 分析主幹 pipeline 健康度
   */
  analyzeTrunkHealth(options: {
    projectId: string;
    branch: string;
    since?: Date;
    until?: Date;
    historyDays?: number;
  }): Promise<HealthMetrics['trunk_health']>;

  /**
   * 偵測主幹 broken 期間
   */
  detectBrokenPeriods(options: {
    executions: PipelineExecution[];
  }): Array<{
    start: Date;
    end: Date;
    duration_hours: number;
  }>;

  /**
   * 計算 MTTR（Mean Time To Recover）
   */
  calculateMTTR(options: {
    brokenPeriods: Array<{ start: Date; end: Date; duration_hours: number }>;
  }): number;
}

/**
 * 整合頻率分析服務介面
 */
export interface IIntegrationAnalyzer {
  /**
   * 分析整合頻率（DORA Deployment Frequency）
   */
  analyzeIntegrationFrequency(options: {
    projectId: string;
    targetBranch: string;
    since?: Date;
    until?: Date;
  }): Promise<HealthMetrics['integration_frequency']>;

  /**
   * 偵測「月底集中合併」反模式
   */
  detectEndOfMonthPattern(options: {
    mergeEvents: MergeEvent[];
  }): boolean;

  /**
   * 計算 DORA 整合頻率等級
   */
  calculateDoraLevel(options: {
    dailyAverage: number;
  }): 'elite' | 'high' | 'medium' | 'low';
}

/**
 * 發布準備度分析服務介面
 */
export interface IReadinessAnalyzer {
  /**
   * 分析當前發布準備度
   */
  analyzeReadiness(options: {
    projectId: string;
    targetBranch: string;
    config: ReleaseConfiguration;
    plannedReleaseDate?: Date;
  }): Promise<{
    is_ready: boolean;
    readiness_score: number;
    blocking_issues: Array<{
      type: 'pipeline_broken' | 'large_pending_batch' | 'high_risk_changes';
      severity: 'critical' | 'warning';
      description: string;
      recommendation: string;
    }>;
    metrics: {
      pending_mr_count: number;
      pending_loc_changes: number;
      pipeline_status: 'passing' | 'failing';
      days_until_release?: number;
    };
  }>;

  /**
   * 計算準備度評分（0-100）
   */
  calculateReadinessScore(options: {
    pipelineStatus: 'passing' | 'failing';
    pendingMrCount: number;
    pendingLocChanges: number;
    thresholds: ReleaseConfiguration['analysis']['thresholds'];
  }): number;
}

/**
 * 趨勢分析服務介面
 */
export interface ITrendAnalyzer {
  /**
   * 分析多個發布的趨勢變化
   */
  analyzeTrends(options: {
    releases: Release[];
    metrics: HealthMetrics;
  }): Promise<{
    batch_size_trend: TrendAnalysis;
    integration_frequency_trend: TrendAnalysis;
    trunk_health_trend: TrendAnalysis;
    overall_assessment: 'improving' | 'stable' | 'degrading';
  }>;

  /**
   * 計算單一指標的趨勢
   */
  calculateTrend(options: {
    values: number[];
    timestamps: Date[];
  }): TrendAnalysis;
}

/**
 * 趨勢分析結果
 */
export interface TrendAnalysis {
  direction: 'improving' | 'stable' | 'degrading';
  change_percentage: number;
  values: number[];
  timestamps: Date[];
  slope?: number;
  confidence?: number;
}

/**
 * ============================================
 * 配置管理服務介面
 * ============================================
 */

/**
 * 配置載入服務介面
 */
export interface IConfigLoader {
  /**
   * 載入配置（依優先順序）
   */
  loadConfig(options: {
    projectId: string;
    cliConfigPath?: string;
  }): Promise<{
    config: ReleaseConfiguration;
    source: 'auto-detect' | 'global' | 'project' | 'cli';
    source_path?: string;
  }>;

  /**
   * 取得全域配置
   */
  getGlobalConfig(): Promise<import('./release-config.js').GlobalConfig | null>;

  /**
   * 取得專案配置
   */
  getProjectConfig(options: {
    projectPath: string;
  }): Promise<ReleaseConfiguration | null>;
}

/**
 * 配置驗證服務介面
 */
export interface IConfigValidator {
  /**
   * 驗證配置檔案
   */
  validate(config: unknown): Promise<import('./release-config.js').ConfigValidationResult>;

  /**
   * 驗證標籤格式正則表達式
   */
  validateTagPattern(pattern: string): {
    valid: boolean;
    error?: string;
    sample_matches?: string[];
  };
}

/**
 * 標籤格式自動偵測服務介面
 */
export interface IPresetDetector {
  /**
   * 偵測標籤格式
   */
  detect(options: {
    projectId: string;
    sampleSize?: number;
  }): Promise<import('./release-config.js').DetectionResult>;

  /**
   * 根據偵測結果建議 preset
   */
  suggestPreset(options: {
    detectionResult: import('./release-config.js').DetectionResult;
  }): ReleaseConfiguration | null;
}

/**
 * 標籤格式匹配服務介面
 */
export interface ITagPatternMatcher {
  /**
   * 匹配標籤並提取欄位
   */
  match(options: {
    tag: string;
    pattern: string;
    groups: Record<string, number>;
  }): {
    matched: boolean;
    fields?: Record<string, string | number>;
  };

  /**
   * 批次匹配標籤
   */
  matchBatch(options: {
    tags: string[];
    pattern: string;
    groups: Record<string, number>;
  }): Array<{
    tag: string;
    matched: boolean;
    fields?: Record<string, string | number>;
  }>;
}

/**
 * ============================================
 * 輸出格式化介面
 * ============================================
 */

/**
 * 分析輸出完整結構
 */
export interface AnalysisOutput {
  metadata: {
    analyzed_at: string;
    project: string;
    time_range: {
      since: string;
      until: string;
    };
    config_source: string;
    config_name?: string;
  };
  releases: Array<{
    tag: string;
    date: string;
    type: string;
    mr_count: number;
    total_loc: number;
    interval_days: number | null;
    freeze_days: number;
    health_level: 'healthy' | 'warning' | 'critical';
  }>;
  metrics: {
    batch_size: {
      level: string;
      average_mr_count: number;
      average_loc_changes: number;
      recommendation: string;
    };
    trunk_health: {
      success_rate: number;
      mttr_hours: number;
      level: string;
      broken_count: number;
    };
    integration_frequency: {
      daily_average: number;
      dora_level: string;
      has_end_of_month_pattern: boolean;
    };
  };
  trends?: {
    batch_size: {
      direction: string;
      change_percentage: number;
    };
    integration_frequency: {
      direction: string;
      change_percentage: number;
    };
  };
}

/**
 * 輸出格式化器介面
 */
export interface IOutputFormatter {
  /**
   * 格式化輸出
   */
  format(output: AnalysisOutput): string;
}

/**
 * 進度回報介面
 */
export interface IProgressReporter {
  /**
   * 開始進度追蹤
   */
  start(options: {
    total: number;
    message: string;
  }): void;

  /**
   * 更新進度
   */
  update(current: number): void;

  /**
   * 完成進度
   */
  stop(): void;
}

/**
 * ============================================
 * 錯誤定義
 * ============================================
 */

export class ConfigNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigNotFoundError';
  }
}

export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export class TagPatternMismatchError extends Error {
  constructor(
    message: string,
    public readonly tag: string,
    public readonly pattern: string
  ) {
    super(message);
    this.name = 'TagPatternMismatchError';
  }
}

export class InsufficientDataError extends Error {
  constructor(
    message: string,
    public readonly required: number,
    public readonly actual: number
  ) {
    super(message);
    this.name = 'InsufficientDataError';
  }
}
