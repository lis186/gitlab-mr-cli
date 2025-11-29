/**
 * PipelineHealthMetrics 單元測試
 * Feature: 008-cicd-health
 * Tasks: T010, T011
 *
 * 目的：
 * - 測試成功率計算邏輯 (T010)
 * - 測試執行時間計算和健康狀態判定 (T011)
 */

import { describe, it, expect } from 'vitest';
import { PipelineHealthMetrics } from '../../src/models/pipeline-health.js';
import type { Pipeline } from '../../src/types/ci-health.js';

// 測試用的 Pipeline 建構函數
function createPipeline(
  id: number,
  status: 'success' | 'failed' | 'running' | 'pending',
  duration: number | null = 300 // 預設 5 分鐘
): Pipeline {
  return {
    id,
    status,
    ref: 'main',
    sha: `abc${id}`,
    createdAt: new Date('2025-10-20T10:00:00Z'),
    updatedAt: new Date('2025-10-20T10:05:00Z'),
    startedAt: new Date('2025-10-20T10:00:30Z'),
    finishedAt: status === 'success' || status === 'failed'
      ? new Date('2025-10-20T10:05:00Z')
      : null,
    duration,
    webUrl: `https://gitlab.com/test/${id}`,
  };
}

describe('PipelineHealthMetrics', () => {
  describe('calculate() - 成功率計算 (T010)', () => {
    it('應該正確計算成功率', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success'),
        createPipeline(2, 'success'),
        createPipeline(3, 'success'),
        createPipeline(4, 'failed'),
        createPipeline(5, 'failed'),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // 3/5 = 60%
      expect(metrics.successRate).toBe(60);
      expect(metrics.successfulPipelines).toBe(3);
      expect(metrics.failedPipelines).toBe(2);
      expect(metrics.completedPipelines).toBe(5);
    });

    it('應該排除執行中的 pipeline 來計算成功率', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success'),
        createPipeline(2, 'success'),
        createPipeline(3, 'failed'),
        createPipeline(4, 'running', null),
        createPipeline(5, 'pending', null),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // 只計算已完成的：2/3 = 66.7%
      expect(metrics.successRate).toBe(66.7);
      expect(metrics.completedPipelines).toBe(3);
      expect(metrics.runningPipelines).toBe(2);
    });

    it('應該在沒有已完成的 pipeline 時回傳 0% 成功率', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'running', null),
        createPipeline(2, 'pending', null),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(metrics.successRate).toBe(0);
      expect(metrics.completedPipelines).toBe(0);
    });

    it('應該處理空的 pipelines 陣列', () => {
      const metrics = PipelineHealthMetrics.calculate(
        [],
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(metrics.totalPipelines).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.avgExecutionTime).toBe(0);
    });

    it('應該四捨五入成功率到小數點後一位', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success'),
        createPipeline(2, 'success'),
        createPipeline(3, 'failed'),
        createPipeline(4, 'failed'),
        createPipeline(5, 'failed'),
        createPipeline(6, 'failed'),
        createPipeline(7, 'failed'),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // 2/7 = 28.571... => 28.6%
      expect(metrics.successRate).toBe(28.6);
    });
  });

  describe('calculate() - 執行時間計算 (T011)', () => {
    it('應該正確計算平均執行時間', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 300), // 5 分鐘
        createPipeline(2, 'success', 600), // 10 分鐘
        createPipeline(3, 'failed', 900),  // 15 分鐘
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // (300 + 600 + 900) / 3 = 600 秒
      expect(metrics.avgExecutionTime).toBe(600);
    });

    it('應該正確計算中位數執行時間', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 100),
        createPipeline(2, 'success', 200),
        createPipeline(3, 'success', 300),
        createPipeline(4, 'success', 400),
        createPipeline(5, 'success', 500),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // 奇數個：取中間值 300
      expect(metrics.medianExecutionTime).toBe(300);
    });

    it('應該正確計算偶數個元素的中位數（取平均）', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 100),
        createPipeline(2, 'success', 200),
        createPipeline(3, 'success', 300),
        createPipeline(4, 'success', 400),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // 偶數個：(200 + 300) / 2 = 250
      expect(metrics.medianExecutionTime).toBe(250);
    });

    it('應該排除執行中的 pipeline（duration = null）', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 300),
        createPipeline(2, 'success', 600),
        createPipeline(3, 'running', null),
        createPipeline(4, 'pending', null),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // 只計算有 duration 的：(300 + 600) / 2 = 450
      expect(metrics.avgExecutionTime).toBe(450);
    });

    it('應該在沒有已完成的 pipeline 時回傳 0 執行時間', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'running', null),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(metrics.avgExecutionTime).toBe(0);
      expect(metrics.medianExecutionTime).toBe(0);
    });

    it('應該四捨五入平均執行時間到整數', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 100),
        createPipeline(2, 'success', 200),
        createPipeline(3, 'success', 350),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // (100 + 200 + 350) / 3 = 216.666... => 217
      expect(metrics.avgExecutionTime).toBe(217);
    });
  });

  describe('determineSuccessRateStatus() - 成功率健康狀態判定 (T010)', () => {
    it('應該在成功率 >= 90% 時回傳 healthy', () => {
      expect(PipelineHealthMetrics.determineSuccessRateStatus(100)).toBe('healthy');
      expect(PipelineHealthMetrics.determineSuccessRateStatus(95)).toBe('healthy');
      expect(PipelineHealthMetrics.determineSuccessRateStatus(90)).toBe('healthy');
    });

    it('應該在成功率 85-89.9% 時回傳 warning', () => {
      expect(PipelineHealthMetrics.determineSuccessRateStatus(89.9)).toBe('warning');
      expect(PipelineHealthMetrics.determineSuccessRateStatus(87)).toBe('warning');
      expect(PipelineHealthMetrics.determineSuccessRateStatus(85)).toBe('warning');
    });

    it('應該在成功率 < 85% 時回傳 critical', () => {
      expect(PipelineHealthMetrics.determineSuccessRateStatus(84.9)).toBe('critical');
      expect(PipelineHealthMetrics.determineSuccessRateStatus(50)).toBe('critical');
      expect(PipelineHealthMetrics.determineSuccessRateStatus(0)).toBe('critical');
    });

    it('應該處理邊界值', () => {
      expect(PipelineHealthMetrics.determineSuccessRateStatus(90.0)).toBe('healthy');
      expect(PipelineHealthMetrics.determineSuccessRateStatus(89.99)).toBe('warning');
      expect(PipelineHealthMetrics.determineSuccessRateStatus(85.0)).toBe('warning');
      expect(PipelineHealthMetrics.determineSuccessRateStatus(84.99)).toBe('critical');
    });
  });

  describe('determineExecutionTimeStatus() - 執行時間健康狀態判定 (T011)', () => {
    it('應該在執行時間 < 600 秒時回傳 healthy', () => {
      expect(PipelineHealthMetrics.determineExecutionTimeStatus(0)).toBe('healthy');
      expect(PipelineHealthMetrics.determineExecutionTimeStatus(300)).toBe('healthy');
      expect(PipelineHealthMetrics.determineExecutionTimeStatus(599)).toBe('healthy');
    });

    it('應該在執行時間 >= 600 秒時回傳 warning', () => {
      expect(PipelineHealthMetrics.determineExecutionTimeStatus(600)).toBe('warning');
      expect(PipelineHealthMetrics.determineExecutionTimeStatus(900)).toBe('warning');
      expect(PipelineHealthMetrics.determineExecutionTimeStatus(1800)).toBe('warning');
    });

    it('應該處理邊界值（10 分鐘 = 600 秒）', () => {
      expect(PipelineHealthMetrics.determineExecutionTimeStatus(599)).toBe('healthy');
      expect(PipelineHealthMetrics.determineExecutionTimeStatus(600)).toBe('warning');
      expect(PipelineHealthMetrics.determineExecutionTimeStatus(601)).toBe('warning');
    });
  });

  describe('calculate() - 整合測試', () => {
    it('應該回傳完整的健康度指標', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 300),
        createPipeline(2, 'success', 400),
        createPipeline(3, 'success', 500),
        createPipeline(4, 'failed', 600),
        createPipeline(5, 'running', null),
      ];

      const periodStart = new Date('2025-10-01');
      const periodEnd = new Date('2025-10-31');

      const metrics = PipelineHealthMetrics.calculate(pipelines, 30, periodStart, periodEnd);

      // 驗證所有欄位
      expect(metrics.totalPipelines).toBe(5);
      expect(metrics.completedPipelines).toBe(4);
      expect(metrics.successfulPipelines).toBe(3);
      expect(metrics.failedPipelines).toBe(1);
      expect(metrics.runningPipelines).toBe(1);
      expect(metrics.successRate).toBe(75); // 3/4 = 75%
      expect(metrics.successRateStatus).toBe('critical'); // < 85%
      expect(metrics.avgExecutionTime).toBe(450); // (300+400+500+600)/4
      expect(metrics.executionTimeStatus).toBe('healthy'); // < 600
      expect(metrics.period.days).toBe(30);
      expect(metrics.period.start).toEqual(periodStart);
      expect(metrics.period.end).toEqual(periodEnd);
    });

    it('應該正確判定健康狀態組合', () => {
      // 高成功率 + 低執行時間 = 雙 healthy
      const healthyPipelines: Pipeline[] = [
        ...Array.from({ length: 95 }, (_, i) => createPipeline(i, 'success', 300)),
        ...Array.from({ length: 5 }, (_, i) => createPipeline(i + 95, 'failed', 300)),
      ];

      const healthyMetrics = PipelineHealthMetrics.calculate(
        healthyPipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(healthyMetrics.successRate).toBe(95); // 95%
      expect(healthyMetrics.successRateStatus).toBe('healthy');
      expect(healthyMetrics.avgExecutionTime).toBe(300);
      expect(healthyMetrics.executionTimeStatus).toBe('healthy');
    });

    it('應該正確處理警告狀態', () => {
      // 中等成功率 + 高執行時間
      const warningPipelines: Pipeline[] = [
        ...Array.from({ length: 87 }, (_, i) => createPipeline(i, 'success', 700)),
        ...Array.from({ length: 13 }, (_, i) => createPipeline(i + 87, 'failed', 700)),
      ];

      const warningMetrics = PipelineHealthMetrics.calculate(
        warningPipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(warningMetrics.successRate).toBe(87); // 87%
      expect(warningMetrics.successRateStatus).toBe('warning');
      expect(warningMetrics.avgExecutionTime).toBe(700);
      expect(warningMetrics.executionTimeStatus).toBe('warning');
    });
  });

  describe('calculateMedian() - 中位數計算邊界情況', () => {
    it('應該處理單一元素', () => {
      const pipelines: Pipeline[] = [createPipeline(1, 'success', 500)];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(metrics.medianExecutionTime).toBe(500);
    });

    it('應該處理兩個元素', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 400),
        createPipeline(2, 'success', 600),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // (400 + 600) / 2 = 500
      expect(metrics.medianExecutionTime).toBe(500);
    });

    it('應該處理未排序的數值', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 500),
        createPipeline(2, 'success', 100),
        createPipeline(3, 'success', 300),
        createPipeline(4, 'success', 400),
        createPipeline(5, 'success', 200),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      // 排序後：[100, 200, 300, 400, 500]，中位數 = 300
      expect(metrics.medianExecutionTime).toBe(300);
    });
  });

  describe('極端情況處理', () => {
    it('應該處理所有 pipeline 都在執行中的情況', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'running', null),
        createPipeline(2, 'running', null),
        createPipeline(3, 'pending', null),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(metrics.totalPipelines).toBe(3);
      expect(metrics.completedPipelines).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.avgExecutionTime).toBe(0);
      expect(metrics.medianExecutionTime).toBe(0);
      expect(metrics.runningPipelines).toBe(3);
    });

    it('應該處理極短執行時間（< 1 秒）', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 1),
        createPipeline(2, 'success', 2),
        createPipeline(3, 'success', 3),
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(metrics.avgExecutionTime).toBe(2); // (1 + 2 + 3) / 3 = 2
      expect(metrics.medianExecutionTime).toBe(2); // 排序後 [1, 2, 3]，中位數 = 2
      expect(metrics.executionTimeStatus).toBe('healthy'); // < 600s
    });

    it('應該處理極長執行時間（> 24 小時）', () => {
      const pipelines: Pipeline[] = [
        createPipeline(1, 'success', 86400), // 24 小時
        createPipeline(2, 'success', 172800), // 48 小時
      ];

      const metrics = PipelineHealthMetrics.calculate(
        pipelines,
        30,
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(metrics.avgExecutionTime).toBe(129600); // (86400 + 172800) / 2
      expect(metrics.executionTimeStatus).toBe('warning'); // >= 600s
    });
  });
});
