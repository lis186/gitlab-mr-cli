/**
 * Pipeline 健康分析器服務
 * Feature: 008-cicd-health
 *
 * 用途：整合 Pipeline 和 Job 分析
 * - 計算健康指標
 * - 分析失敗原因
 * - 產生完整的健康度報告
 */

import type {
  Pipeline,
  Job,
  CIHealthAnalysisResult,
} from '../types/ci-health.js';
import { PipelineHealthMetrics } from '../models/pipeline-health.js';
import { JobFailureAnalyzer } from '../models/job-failure.js';
import { FailureClassifier } from './failure-classifier.js';

/**
 * Pipeline 健康分析器
 *
 * 整合所有分析邏輯，提供完整的 CI/CD 健康度評估
 */
export class PipelineHealthAnalyzer {
  /**
   * 分析 Pipeline 健康狀態
   *
   * @param pipelines - Pipeline 清單
   * @param jobs - Job 清單
   * @param periodDays - 分析期間（天數）
   * @param periodStart - 期間開始日期
   * @param periodEnd - 期間結束日期
   * @returns CI/CD 健康度分析結果
   */
  static analyze(
    pipelines: Pipeline[],
    jobs: Job[],
    periodDays: number,
    periodStart: Date,
    periodEnd: Date
  ): CIHealthAnalysisResult {
    // 1. 計算健康指標
    const metrics = PipelineHealthMetrics.calculate(
      pipelines,
      periodDays,
      periodStart,
      periodEnd
    );

    // 2. 分析失敗原因（使用 FailureClassifier）
    const { categories, topJobs } = JobFailureAnalyzer.analyzeFailures(
      jobs,
      (job) => FailureClassifier.classify(job)
    );

    // 3. 回傳完整分析結果
    return {
      metrics,
      failureBreakdown: categories,
      topFailingJobs: topJobs,
    };
  }
}
