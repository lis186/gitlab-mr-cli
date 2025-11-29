/**
 * 主幹可部署性健康度分析服務
 *
 * 追蹤 main/develop branch 的 CI/CD pipeline 成功率和失敗修復時間，
 * 確保主幹維持「隨時可部署」狀態。
 */

import { Gitlab } from '@gitbeaker/rest';
import { PipelineExecution, PipelineStatus, isPipelineFailed, isPipelineSuccess } from '../../models/pipeline-execution.js';
import { TrunkHealthMetric } from '../../models/health-metrics.js';
import { wrapApiCall } from './error-handler.js';

/**
 * GitLab Pipeline API 回應介面
 */
export interface GitLabPipelineResponse {
  id: number;
  status: string;
  ref: string;
  sha: string;
  created_at: string;
  finished_at?: string;
  duration?: number;
}

/**
 * Pipeline 查詢選項
 */
export interface PipelineQueryOptions {
  /** 分支名稱 */
  branch: string;
  /** 開始日期 */
  since: Date;
  /** 結束日期 */
  until: Date;
}

/**
 * 主幹 Broken 期間
 */
export interface BrokenPeriod {
  /** 失敗開始時間 */
  started_at: Date;
  /** 修復完成時間 */
  fixed_at: Date;
  /** 修復時長（小時） */
  duration_hours: number;
  /** 連續失敗次數 */
  consecutive_failures: number;
}

/**
 * DORA Trunk-based Development 標準
 */
const DORA_TRUNK_STANDARDS = {
  elite: {
    pipelineSuccessRate: 0.95,  // >95%
    meanTimeToFixHours: 1        // <1 小時
  },
  needsImprovement: {
    pipelineSuccessRate: 0.90,  // <90%
    meanTimeToFixHours: 4        // >4 小時
  }
} as const;

/**
 * 主幹健康度分析器
 *
 * 分析主幹分支的 CI/CD pipeline 健康度
 */
export class TrunkHealthAnalyzer {
  /**
   * 建立 TrunkHealthAnalyzer 實例
   *
   * @param gitlabClient - GitLab API 客戶端
   * @param projectId - 專案 ID
   */
  constructor(
    private gitlabClient: InstanceType<typeof Gitlab>,
    private projectId: string | number
  ) {}

  /**
   * 分析主幹健康度
   *
   * @param branch - 分支名稱（如 main, develop）
   * @param days - 分析最近 N 天（預設 90 天）
   * @returns 主幹健康度指標
   */
  async analyzeTrunkHealth(
    branch: string,
    days: number = 90
  ): Promise<TrunkHealthMetric> {
    const until = new Date();
    const since = new Date(until);
    since.setDate(since.getDate() - days);

    // 取得 pipeline 執行歷史
    const pipelines = await this.fetchPipelineExecutions({
      branch,
      since,
      until
    });

    // 處理不足 pipeline 歷史的情況
    if (pipelines.length === 0) {
      return {
        pipeline_success_rate: 0,
        mean_time_to_fix_hours: 0,
        consecutive_failures: 0,
        level: 'needs-improvement',
        dora_compliance: false
      };
    }

    // 計算 pipeline 成功率
    const successRate = this.calculateSuccessRate(pipelines);

    // 偵測主幹 broken 期間
    const brokenPeriods = this.detectBrokenPeriods(pipelines);

    // 計算平均修復時間（MTTR）
    const mttr = this.calculateMTTR(brokenPeriods);

    // 計算最大連續失敗次數
    const consecutiveFailures = this.calculateMaxConsecutiveFailures(pipelines);

    // 評估健康度等級
    const level = this.evaluateHealthLevel(successRate, mttr);

    // 判斷是否符合 DORA Elite 標準
    const doraCompliance = this.checkDoraCompliance(successRate, mttr);

    return {
      pipeline_success_rate: successRate,
      mean_time_to_fix_hours: mttr,
      consecutive_failures: consecutiveFailures,
      level,
      dora_compliance: doraCompliance
    };
  }

  /**
   * 取得 pipeline 執行歷史
   *
   * @param options - 查詢選項
   * @returns Pipeline 執行列表
   */
  async fetchPipelineExecutions(
    options: PipelineQueryOptions
  ): Promise<PipelineExecution[]> {
    // 使用統一的錯誤處理與重試機制
    const response = await wrapApiCall(
      async () => {
        const result = await this.gitlabClient.Pipelines.all(this.projectId, {
          ref: options.branch,
          updatedAfter: options.since.toISOString(),
          updatedBefore: options.until.toISOString(),
          orderBy: 'id',
          sort: 'asc',
          perPage: 100
        });
        // 確保返回的是陣列並符合型別
        return (result as unknown as GitLabPipelineResponse[]);
      },
      `取得 Pipeline 執行歷史 (${options.branch})`,
      {
        retryable: true,
        maxRetries: 3,
        retryDelay: 1000,
        fallbackValue: [],
        errorStrategy: 'fallback',
      }
    );

    // 轉換為應用程式模型
    return response.map((pipeline) => this.mapGitLabPipeline(pipeline));
  }

  /**
   * 將 GitLab API 回應轉換為 PipelineExecution 模型
   *
   * @param pipeline - GitLab API 回應
   * @returns PipelineExecution 物件
   */
  private mapGitLabPipeline(pipeline: GitLabPipelineResponse): PipelineExecution {
    // 映射 GitLab pipeline status 到我們的 PipelineStatus 類型
    let status: PipelineStatus;
    switch (pipeline.status) {
      case 'success':
        status = 'success';
        break;
      case 'failed':
        status = 'failed';
        break;
      case 'canceled':
      case 'cancelled':
        status = 'canceled';
        break;
      case 'skipped':
        status = 'skipped';
        break;
      default:
        // 預設處理 running, pending 等狀態
        status = 'skipped';
    }

    return {
      id: pipeline.id,
      status,
      ref: pipeline.ref,
      sha: pipeline.sha,
      created_at: new Date(pipeline.created_at),
      finished_at: pipeline.finished_at ? new Date(pipeline.finished_at) : undefined,
      duration_seconds: pipeline.duration
    };
  }

  /**
   * 計算 pipeline 成功率
   *
   * @param pipelines - Pipeline 執行列表
   * @returns 成功率（0-1）
   */
  calculateSuccessRate(pipelines: PipelineExecution[]): number {
    if (pipelines.length === 0) {
      return 0;
    }

    const successCount = pipelines.filter(p => isPipelineSuccess(p)).length;
    return successCount / pipelines.length;
  }

  /**
   * 偵測主幹 broken 期間
   *
   * 找出所有失敗的 pipeline，並計算從失敗到下一次成功的時間差
   *
   * @param pipelines - Pipeline 執行列表（按時間順序排序）
   * @returns Broken 期間列表
   */
  detectBrokenPeriods(pipelines: PipelineExecution[]): BrokenPeriod[] {
    const periods: BrokenPeriod[] = [];
    let currentFailureStart: Date | null = null;
    let consecutiveFailures = 0;

    for (let i = 0; i < pipelines.length; i++) {
      const pipeline = pipelines[i];
      if (!pipeline) continue;

      if (isPipelineFailed(pipeline)) {
        // 記錄失敗開始時間
        if (currentFailureStart === null) {
          currentFailureStart = pipeline.created_at;
        }
        consecutiveFailures++;
      } else if (isPipelineSuccess(pipeline)) {
        // 如果之前有失敗，記錄 broken 期間
        if (currentFailureStart !== null) {
          const fixedAt = pipeline.finished_at || pipeline.created_at;
          const durationMs = fixedAt.getTime() - currentFailureStart.getTime();
          const durationHours = durationMs / (1000 * 60 * 60);

          periods.push({
            started_at: currentFailureStart,
            fixed_at: fixedAt,
            duration_hours: durationHours,
            consecutive_failures: consecutiveFailures
          });

          // 重置狀態
          currentFailureStart = null;
          consecutiveFailures = 0;
        }
      }
      // canceled 或 skipped 狀態不影響 broken 期間計算
    }

    // 如果最後仍然處於失敗狀態，使用最後一個 pipeline 的時間
    if (currentFailureStart !== null && pipelines.length > 0) {
      const lastPipeline = pipelines[pipelines.length - 1];
      if (lastPipeline) {
        const fixedAt = lastPipeline.finished_at || lastPipeline.created_at;
        const durationMs = fixedAt.getTime() - currentFailureStart.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);

        periods.push({
          started_at: currentFailureStart,
          fixed_at: fixedAt,
          duration_hours: durationHours,
          consecutive_failures: consecutiveFailures
        });
      }
    }

    return periods;
  }

  /**
   * 計算平均修復時間（Mean Time To Restore, MTTR）
   *
   * @param brokenPeriods - Broken 期間列表
   * @returns 平均修復時間（小時）
   */
  calculateMTTR(brokenPeriods: BrokenPeriod[]): number {
    if (brokenPeriods.length === 0) {
      return 0;
    }

    const totalDuration = brokenPeriods.reduce(
      (sum, period) => sum + period.duration_hours,
      0
    );

    return totalDuration / brokenPeriods.length;
  }

  /**
   * 計算最大連續失敗次數
   *
   * @param pipelines - Pipeline 執行列表
   * @returns 最大連續失敗次數
   */
  private calculateMaxConsecutiveFailures(pipelines: PipelineExecution[]): number {
    let maxConsecutive = 0;
    let currentConsecutive = 0;

    for (const pipeline of pipelines) {
      if (isPipelineFailed(pipeline)) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else if (isPipelineSuccess(pipeline)) {
        currentConsecutive = 0;
      }
    }

    return maxConsecutive;
  }

  /**
   * 評估健康度等級
   *
   * @param successRate - 成功率（0-1）
   * @param mttrHours - 平均修復時間（小時）
   * @returns 健康度等級
   */
  private evaluateHealthLevel(
    successRate: number,
    mttrHours: number
  ): TrunkHealthMetric['level'] {
    // Elite: >95% 成功率 + <1 小時 MTTR
    if (successRate > DORA_TRUNK_STANDARDS.elite.pipelineSuccessRate &&
        mttrHours < DORA_TRUNK_STANDARDS.elite.meanTimeToFixHours) {
      return 'elite';
    }

    // Needs Improvement: <90% 成功率或 >4 小時 MTTR
    if (successRate < DORA_TRUNK_STANDARDS.needsImprovement.pipelineSuccessRate ||
        mttrHours > DORA_TRUNK_STANDARDS.needsImprovement.meanTimeToFixHours) {
      return 'needs-improvement';
    }

    // Good: 介於兩者之間
    return 'good';
  }

  /**
   * 判斷是否符合 DORA Elite 標準
   *
   * @param successRate - 成功率（0-1）
   * @param mttrHours - 平均修復時間（小時）
   * @returns 是否符合 DORA Elite 標準
   */
  private checkDoraCompliance(successRate: number, mttrHours: number): boolean {
    return successRate > DORA_TRUNK_STANDARDS.elite.pipelineSuccessRate &&
           mttrHours < DORA_TRUNK_STANDARDS.elite.meanTimeToFixHours;
  }
}
