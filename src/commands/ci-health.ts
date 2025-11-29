/**
 * CI/CD 健康度分析指令
 * Feature: 008-cicd-health
 *
 * 用途：分析專案的 CI/CD pipeline 健康狀態
 * - Pipeline 成功率（目標 >90%）
 * - 平均執行時間（目標 <10 分鐘）
 * - 失敗原因分類（Test/Build/Linting）
 * - 最常失敗的 job 識別
 */

import { Command, Flags } from '@oclif/core';
import { Gitlab } from '@gitbeaker/rest';
import type { Pipeline, Job } from '../types/ci-health.js';
import { parsePeriod, getDaysDifference } from '../utils/date-utils.js';
import { processBatch } from '../utils/batch-processor.js';
import { PipelineHealthAnalyzer } from '../services/pipeline-health-analyzer.js';
import { formatCIHealthReport } from '../formatters/ci-health-table-formatter.js';
import { AppError, ErrorType } from '../models/error.js';

export default class CIHealth extends Command {
  static override description = 'CI/CD 健康度分析：評估 pipeline 成功率、執行時間、失敗原因';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --project my-namespace/my-project',
    '<%= config.bin %> <%= command.id %> --project 12345 --period 7d',
    '<%= config.bin %> <%= command.id %> --project my-project --json',
    '<%= config.bin %> <%= command.id %> --project my-project --host https://gitlab.example.com',
  ];

  static override flags = {
    project: Flags.string({
      char: 'p',
      description: '專案識別（ID、路徑、或 URL）（或使用環境變數 GITLAB_PROJECT）',
      required: false,
      env: 'GITLAB_PROJECT',
    }),
    token: Flags.string({
      char: 't',
      description: 'GitLab Personal Access Token（或使用環境變數 GITLAB_TOKEN）',
      env: 'GITLAB_TOKEN',
    }),
    host: Flags.string({
      char: 'h',
      description: 'GitLab 實例 URL（或使用環境變數 GITLAB_HOST）',
      default: 'https://gitlab.com',
      env: 'GITLAB_HOST',
    }),
    period: Flags.string({
      description: '分析時間範圍（格式：<數字>d，如 7d, 30d, 90d）',
      default: '30d',
    }),
    json: Flags.boolean({
      description: '輸出 JSON 格式（用於整合）',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: '詳細輸出（除錯用）',
      default: false,
    }),
    limit: Flags.integer({
      description: '最多擷取 pipeline 數（效能優化）',
    }),
  };

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(CIHealth);

      // 1. 驗證 project
      if (!flags.project) {
        throw new AppError(
          ErrorType.INVALID_INPUT,
          '專案未指定。請使用 --project 或設定 GITLAB_PROJECT 環境變數'
        );
      }

      // 2. 驗證 token
      if (!flags.token) {
        throw new AppError(
          ErrorType.AUTH_ERROR,
          'GitLab token 未提供。請使用 --token 或設定 GITLAB_TOKEN 環境變數'
        );
      }

      // 2. 解析期間
      const { startDate, endDate } = parsePeriod(flags.period);
      const periodDays = getDaysDifference(startDate, endDate);

      if (flags.verbose) {
        this.log(`期間: ${flags.period} (${startDate.toISOString()} - ${endDate.toISOString()})`);
      }

      // 3. 初始化 GitLab 客戶端
      const gitlab = new Gitlab({
        token: flags.token,
        host: flags.host,
      });

      if (flags.verbose) {
        this.log(`連接到 GitLab: ${flags.host}`);
        this.log(`專案: ${flags.project}`);
      }

      // 4. 擷取 pipeline 資料
      this.log('正在擷取 pipeline 資料...');
      const pipelines = await this.fetchPipelines(gitlab, flags.project, startDate, endDate, flags.limit);

      if (pipelines.length === 0) {
        this.log('指定期間內無 Pipeline 記錄');
        return;
      }

      if (flags.verbose) {
        this.log(`找到 ${pipelines.length} 個 pipeline`);
      }

      // 5. 批次擷取 job 資料
      this.log('正在分析 job 資料...');
      const allJobs = await this.fetchJobs(gitlab, flags.project, pipelines, flags.verbose);

      if (flags.verbose) {
        this.log(`找到 ${allJobs.length} 個 job`);
      }

      // 6. 分析健康指標
      const analysisResult = PipelineHealthAnalyzer.analyze(
        pipelines,
        allJobs,
        periodDays,
        startDate,
        endDate
      );

      // 7. 輸出結果
      if (flags.json) {
        this.log(JSON.stringify(analysisResult, null, 2));
      } else {
        const report = formatCIHealthReport(
          analysisResult.metrics,
          analysisResult.failureBreakdown,
          analysisResult.topFailingJobs
        );
        this.log(report);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * 擷取 pipeline 資料
   */
  private async fetchPipelines(
    gitlab: InstanceType<typeof Gitlab>,
    projectId: string,
    startDate: Date,
    endDate: Date,
    limit?: number
  ): Promise<Pipeline[]> {
    try {
      const response: any[] = await gitlab.Pipelines.all(projectId, {
        updatedAfter: startDate.toISOString(),
        updatedBefore: endDate.toISOString(),
        perPage: limit && limit < 100 ? limit : 100,
        maxPages: limit ? Math.ceil(limit / 100) : 10,
      });

      // 轉換為 Pipeline 型別
      const pipelines: Pipeline[] = response.map((p: any) => ({
        id: p.id,
        status: p.status,
        ref: p.ref,
        sha: p.sha,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
        startedAt: p.started_at ? new Date(p.started_at) : null,
        finishedAt: p.finished_at ? new Date(p.finished_at) : null,
        duration: p.duration,
        webUrl: p.web_url,
      }));

      // 應用 limit（如果有設定）
      return limit ? pipelines.slice(0, limit) : pipelines;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new AppError(ErrorType.PROJECT_NOT_FOUND, '找不到指定的專案');
      }
      if (error.response?.status === 403) {
        throw new AppError(ErrorType.PROJECT_NOT_FOUND, '沒有存取此專案的權限');
      }
      throw error;
    }
  }

  /**
   * 批次擷取 job 資料
   */
  private async fetchJobs(
    gitlab: InstanceType<typeof Gitlab>,
    projectId: string,
    pipelines: Pipeline[],
    verbose: boolean
  ): Promise<Job[]> {
    // 批次處理 pipeline，每批 10 個
    const jobsArrays = await processBatch(
      pipelines,
      async (pipeline) => {
        try {
          // 使用 Jobs API 來取得 pipeline 的 job 清單
          const response: any[] = await gitlab.Jobs.all(projectId, {
            pipelineId: pipeline.id,
            perPage: 100,
          });

          return response.map((j: any) => ({
            id: j.id,
            name: j.name,
            status: j.status,
            stage: j.stage,
            createdAt: new Date(j.created_at),
            startedAt: j.started_at ? new Date(j.started_at) : null,
            finishedAt: j.finished_at ? new Date(j.finished_at) : null,
            duration: j.duration,
            failureReason: j.failure_reason || null,
            webUrl: j.web_url,
            pipelineId: pipeline.id,
          }));
        } catch (error) {
          if (verbose) {
            this.warn(`無法擷取 pipeline ${pipeline.id} 的 jobs: ${error}`);
          }
          return [];
        }
      },
      {
        batchSize: 10,
        onProgress: verbose ? (processed, total) => {
          this.log(`進度: ${processed}/${total} pipelines`);
        } : undefined,
      }
    );

    // 合併所有 job
    return jobsArrays.flat();
  }

  /**
   * 錯誤處理
   */
  private handleError(error: unknown): void {
    if (error instanceof AppError) {
      switch (error.type) {
        case ErrorType.AUTH_ERROR:
          this.error('❌ 身份驗證失敗\n' + error.message);
          break;
        case ErrorType.PROJECT_NOT_FOUND:
          this.error('❌ 專案錯誤\n' + error.message);
          break;
        case ErrorType.RATE_LIMIT_ERROR:
          this.error('❌ API 速率限制\n請稍後重試（建議等待 60 秒）');
          break;
        case ErrorType.NETWORK_ERROR:
          this.error('❌ 網路錯誤\n無法連接到 GitLab，請檢查網路連線');
          break;
        default:
          this.error('❌ 錯誤\n' + error.message);
      }
    } else if (error instanceof Error) {
      this.error('❌ 錯誤\n' + error.message);
    } else {
      this.error('❌ 未知錯誤');
    }
  }
}
