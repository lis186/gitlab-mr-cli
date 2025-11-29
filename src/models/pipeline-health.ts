/**
 * Pipeline 健康度模型
 * Feature: 008-cicd-health
 *
 * 用途：計算 Pipeline 健康指標
 * - 成功率計算
 * - 執行時間統計
 * - 健康狀態判定
 */

import type { Pipeline, HealthMetrics, HealthStatus } from '../types/ci-health.js';

/**
 * Pipeline 健康度指標計算器
 */
export class PipelineHealthMetrics {
  /**
   * 計算 Pipeline 健康指標
   *
   * @param pipelines - Pipeline 清單
   * @param periodDays - 分析期間（天數）
   * @param periodStart - 期間開始日期
   * @param periodEnd - 期間結束日期
   * @returns 健康度指標
   */
  static calculate(
    pipelines: Pipeline[],
    periodDays: number,
    periodStart: Date,
    periodEnd: Date
  ): HealthMetrics {
    const totalPipelines = pipelines.length;

    // 1. 統計各狀態 pipeline 數量
    const successfulPipelines = pipelines.filter(p => p.status === 'success').length;
    const failedPipelines = pipelines.filter(p => p.status === 'failed').length;
    const runningPipelines = pipelines.filter(p =>
      p.status === 'running' || p.status === 'pending'
    ).length;
    const completedPipelines = successfulPipelines + failedPipelines;

    // 2. 計算成功率（排除執行中的 pipeline）
    const successRate = completedPipelines > 0
      ? (successfulPipelines / completedPipelines) * 100
      : 0;

    // 3. 計算平均執行時間（只計算已完成且有 duration 的 pipeline）
    const completedPipelinesWithDuration = pipelines.filter(
      p => (p.status === 'success' || p.status === 'failed') && p.duration !== null
    );

    const avgExecutionTime = completedPipelinesWithDuration.length > 0
      ? completedPipelinesWithDuration.reduce((sum, p) => sum + (p.duration || 0), 0) /
        completedPipelinesWithDuration.length
      : 0;

    // 4. 計算中位數執行時間
    const medianExecutionTime = this.calculateMedian(
      completedPipelinesWithDuration
        .map(p => p.duration || 0)
        .filter(d => d > 0)
    );

    // 5. 判定健康狀態
    const successRateStatus = this.determineSuccessRateStatus(successRate);
    const executionTimeStatus = this.determineExecutionTimeStatus(avgExecutionTime);

    return {
      totalPipelines,
      completedPipelines,
      successfulPipelines,
      failedPipelines,
      runningPipelines,
      successRate: Math.round(successRate * 10) / 10, // 四捨五入到小數點後一位
      successRateStatus,
      avgExecutionTime: Math.round(avgExecutionTime),
      medianExecutionTime: Math.round(medianExecutionTime),
      executionTimeStatus,
      period: {
        days: periodDays,
        start: periodStart,
        end: periodEnd,
      },
    };
  }

  /**
   * 計算中位數
   *
   * @param values - 數值陣列
   * @returns 中位數
   */
  private static calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      // 偶數個元素：取中間兩個的平均
      return ((sorted[mid - 1] || 0) + (sorted[mid] || 0)) / 2;
    } else {
      // 奇數個元素：取中間的
      return sorted[mid] || 0;
    }
  }

  /**
   * 判定成功率健康狀態
   *
   * 閾值：
   * - ≥ 90%: healthy（健康）
   * - 85-89.9%: warning（警告）
   * - < 85%: critical（危險）
   *
   * @param rate - 成功率 (0-100)
   * @returns 健康狀態
   */
  static determineSuccessRateStatus(rate: number): HealthStatus {
    if (rate >= 90) return 'healthy';
    if (rate >= 85) return 'warning';
    return 'critical';
  }

  /**
   * 判定執行時間健康狀態
   *
   * 閾值：
   * - < 600 秒 (10 分鐘): healthy（健康）
   * - ≥ 600 秒: warning（警告）
   *
   * @param time - 平均執行時間（秒）
   * @returns 健康狀態
   */
  static determineExecutionTimeStatus(time: number): HealthStatus {
    if (time < 600) return 'healthy';
    return 'warning';
  }
}
