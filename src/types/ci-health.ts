/**
 * CI/CD 健康度分析型別定義
 * Feature: 008-cicd-health
 */

// ============================================================================
// Pipeline 相關型別
// ============================================================================

/**
 * Pipeline 狀態
 */
export type PipelineStatus =
  | 'success'
  | 'failed'
  | 'running'
  | 'pending'
  | 'canceled'
  | 'skipped'
  | 'created'
  | 'waiting_for_resource'
  | 'preparing'
  | 'manual'
  | 'scheduled';

/**
 * Pipeline 執行記錄
 * 對應 GitLab API: /projects/:id/pipelines
 */
export interface Pipeline {
  /** Pipeline ID */
  id: number;
  /** Pipeline 狀態 */
  status: PipelineStatus;
  /** 分支或標籤名稱 */
  ref: string;
  /** Commit SHA */
  sha: string;
  /** 建立時間 */
  createdAt: Date;
  /** 更新時間 */
  updatedAt: Date;
  /** 開始時間 (null 表示尚未開始) */
  startedAt: Date | null;
  /** 完成時間 (null 表示尚未完成) */
  finishedAt: Date | null;
  /** 執行時間（秒，null 表示尚未完成或無法計算） */
  duration: number | null;
  /** Pipeline URL */
  webUrl: string;
}

// ============================================================================
// Job 相關型別
// ============================================================================

/**
 * Job 狀態
 */
export type JobStatus =
  | 'success'
  | 'failed'
  | 'running'
  | 'pending'
  | 'canceled'
  | 'skipped'
  | 'manual'
  | 'created';

/**
 * Job（Pipeline 中的個別任務）
 * 對應 GitLab API: /projects/:id/pipelines/:pipeline_id/jobs
 */
export interface Job {
  /** Job ID */
  id: number;
  /** Job 名稱 (如 'test:unit', 'build:production') */
  name: string;
  /** Job 狀態 */
  status: JobStatus;
  /** 階段名稱 (如 'test', 'build', 'deploy') */
  stage: string;
  /** 建立時間 */
  createdAt: Date;
  /** 開始時間 (null 表示尚未開始) */
  startedAt: Date | null;
  /** 完成時間 (null 表示尚未完成) */
  finishedAt: Date | null;
  /** 執行時間（秒，null 表示尚未完成） */
  duration: number | null;
  /** 失敗原因 (僅當 status 為 'failed' 時有值) */
  failureReason: string | null;
  /** Job URL */
  webUrl: string;
  /** 所屬 Pipeline ID */
  pipelineId: number;
}

// ============================================================================
// 失敗分析相關型別
// ============================================================================

/**
 * 失敗類型
 */
export type FailureType =
  | 'Test'      // 測試失敗
  | 'Build'     // 建置失敗
  | 'Linting'   // Linting 錯誤
  | 'Deploy'    // 部署失敗
  | 'Other';    // 其他失敗

/**
 * 失敗類別統計
 */
export interface FailureCategory {
  /** 失敗類型 */
  type: FailureType;
  /** 失敗次數 */
  count: number;
  /** 佔總失敗的百分比 (0-100) */
  percentage: number;
  /** 範例 job 名稱 (最多 3 個) */
  examples: string[];
}

/**
 * Job 失敗摘要
 */
export interface JobFailureSummary {
  /** Job 名稱 */
  jobName: string;
  /** 失敗次數 */
  failureCount: number;
  /** 失敗率百分比 (該 job 失敗次數 / 總執行次數，0-100) */
  failureRate: number;
  /** 失敗類型 (由分類器判定) */
  failureType: FailureType;
  /** 可操作的建議 */
  recommendation: string;
  /** 最後失敗日期 */
  lastFailureDate: Date;
  /** 失敗的 pipeline ID 列表 (最多 5 個) */
  pipelineIds: number[];
}

// ============================================================================
// 健康度指標相關型別
// ============================================================================

/**
 * 健康狀態
 */
export type HealthStatus =
  | 'healthy'   // 健康（綠色）
  | 'warning'   // 警告（黃色）
  | 'critical'; // 危險（紅色）

/**
 * 健康度指標
 */
export interface HealthMetrics {
  // 基本統計
  /** 總 pipeline 數 */
  totalPipelines: number;
  /** 已完成 pipeline 數 (success + failed) */
  completedPipelines: number;
  /** 成功 pipeline 數 */
  successfulPipelines: number;
  /** 失敗 pipeline 數 */
  failedPipelines: number;
  /** 執行中 pipeline 數 */
  runningPipelines: number;

  // 成功率
  /** 成功率百分比 (0-100) */
  successRate: number;
  /** 成功率健康狀態 */
  successRateStatus: HealthStatus;

  // 執行時間
  /** 平均執行時間（秒） */
  avgExecutionTime: number;
  /** 中位數執行時間（秒） */
  medianExecutionTime: number;
  /** 執行時間健康狀態 */
  executionTimeStatus: HealthStatus;

  // 時間範圍
  period: {
    /** 分析天數 */
    days: number;
    /** 開始日期 */
    start: Date;
    /** 結束日期 */
    end: Date;
  };
}

// ============================================================================
// 輔助型別
// ============================================================================

/**
 * 時間區間查詢
 */
export interface PeriodQuery {
  /** 天數 */
  days: number;
  /** 開始日期 */
  start: Date;
  /** 結束日期 */
  end: Date;
}

/**
 * CI/CD 健康度分析結果
 */
export interface CIHealthAnalysisResult {
  /** 健康度指標 */
  metrics: HealthMetrics;
  /** 失敗分類統計 */
  failureBreakdown: FailureCategory[];
  /** 最常失敗的 job (前 5) */
  topFailingJobs: JobFailureSummary[];
}

/**
 * CI Health 指令選項
 */
export interface CIHealthCommandOptions {
  /** 專案識別（ID、路徑、URL） */
  project: string;
  /** GitLab Personal Access Token */
  token?: string;
  /** GitLab 實例 URL */
  host?: string;
  /** 分析時間範圍 (格式: <數字>d，如 7d, 30d) */
  period?: string;
  /** 輸出 JSON 格式 */
  json?: boolean;
  /** 詳細輸出（除錯用） */
  verbose?: boolean;
  /** 最多擷取 pipeline 數 */
  limit?: number;
}
