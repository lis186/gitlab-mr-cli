/**
 * JobFailureAnalyzer 單元測試
 * Feature: 008-cicd-health
 * Task: T021
 *
 * 目的：測試 analyzeFailures() 方法和百分比計算
 */

import { describe, it, expect } from 'vitest';
import { JobFailureAnalyzer } from '../../src/models/job-failure.js';
import type { Job, FailureType } from '../../src/types/ci-health.js';

// Mock 分類函數
const mockClassifier = (job: Job): FailureType => {
  if (job.name.includes('test')) return 'Test';
  if (job.name.includes('lint')) return 'Linting';
  if (job.name.includes('build')) return 'Build';
  if (job.name.includes('deploy')) return 'Deploy';
  return 'Other';
};

// 測試用的 Job 建構函數
function createJob(
  id: number,
  name: string,
  status: 'success' | 'failed',
  createdAt: Date = new Date('2025-10-20T10:00:00Z'),
  finishedAt: Date = new Date('2025-10-20T10:05:00Z')
): Job {
  return {
    id,
    name,
    stage: 'test',
    status,
    createdAt,
    startedAt: new Date('2025-10-20T10:01:00Z'),
    finishedAt,
    duration: 240,
    failureReason: status === 'failed' ? 'script_failure' : null,
    webUrl: `https://gitlab.com/test/${id}`,
    pipelineId: 1,
  };
}

describe('JobFailureAnalyzer', () => {
  describe('analyzeFailures() - 基本功能', () => {
    it('應該正確分析失敗的 jobs', () => {
      const jobs: Job[] = [
        createJob(1, 'test-unit', 'failed'),
        createJob(2, 'test-integration', 'failed'),
        createJob(3, 'lint-eslint', 'failed'),
        createJob(4, 'build-webpack', 'success'),
        createJob(5, 'deploy-staging', 'success'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      // 驗證失敗分類
      expect(result.categories).toHaveLength(2);

      // Test 類別（2 個失敗）
      const testCategory = result.categories.find((c) => c.type === 'Test');
      expect(testCategory).toBeDefined();
      expect(testCategory!.count).toBe(2);
      expect(testCategory!.percentage).toBe(66.7); // 2/3 * 100
      expect(testCategory!.examples).toContain('test-unit');
      expect(testCategory!.examples).toContain('test-integration');

      // Linting 類別（1 個失敗）
      const lintCategory = result.categories.find((c) => c.type === 'Linting');
      expect(lintCategory).toBeDefined();
      expect(lintCategory!.count).toBe(1);
      expect(lintCategory!.percentage).toBe(33.3); // 1/3 * 100
    });

    it('應該在沒有失敗 job 時回傳空結果', () => {
      const jobs: Job[] = [
        createJob(1, 'test-unit', 'success'),
        createJob(2, 'build-webpack', 'success'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      expect(result.categories).toHaveLength(0);
      expect(result.topJobs).toHaveLength(0);
    });

    it('應該處理空的 jobs 陣列', () => {
      const result = JobFailureAnalyzer.analyzeFailures([], mockClassifier);

      expect(result.categories).toHaveLength(0);
      expect(result.topJobs).toHaveLength(0);
    });
  });

  describe('analyzeFailures() - 百分比計算', () => {
    it('應該正確計算百分比並四捨五入到小數點後一位', () => {
      const jobs: Job[] = [
        createJob(1, 'test-1', 'failed'),
        createJob(2, 'test-2', 'failed'),
        createJob(3, 'test-3', 'failed'),
        createJob(4, 'lint-1', 'failed'),
        createJob(5, 'build-1', 'failed'),
        createJob(6, 'build-2', 'failed'),
        createJob(7, 'build-3', 'failed'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      // Test: 3/7 = 42.857... => 42.9%
      const testCategory = result.categories.find((c) => c.type === 'Test');
      expect(testCategory!.percentage).toBe(42.9);

      // Build: 3/7 = 42.857... => 42.9%
      const buildCategory = result.categories.find((c) => c.type === 'Build');
      expect(buildCategory!.percentage).toBe(42.9);

      // Linting: 1/7 = 14.285... => 14.3%
      const lintCategory = result.categories.find((c) => c.type === 'Linting');
      expect(lintCategory!.percentage).toBe(14.3);
    });

    it('應該處理 100% 單一類別的情況', () => {
      const jobs: Job[] = [
        createJob(1, 'test-1', 'failed'),
        createJob(2, 'test-2', 'failed'),
        createJob(3, 'test-3', 'failed'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].percentage).toBe(100);
    });
  });

  describe('analyzeFailures() - 失敗分類排序', () => {
    it('應該按失敗次數降序排列', () => {
      const jobs: Job[] = [
        createJob(1, 'lint-1', 'failed'),
        createJob(2, 'test-1', 'failed'),
        createJob(3, 'test-2', 'failed'),
        createJob(4, 'test-3', 'failed'),
        createJob(5, 'build-1', 'failed'),
        createJob(6, 'build-2', 'failed'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      // 應該按照 Test (3) > Build (2) > Linting (1) 排序
      expect(result.categories[0].type).toBe('Test');
      expect(result.categories[0].count).toBe(3);
      expect(result.categories[1].type).toBe('Build');
      expect(result.categories[1].count).toBe(2);
      expect(result.categories[2].type).toBe('Linting');
      expect(result.categories[2].count).toBe(1);
    });
  });

  describe('analyzeFailures() - examples 範例', () => {
    it('應該為每個類別提供最多 3 個範例', () => {
      const jobs: Job[] = [
        createJob(1, 'test-unit', 'failed'),
        createJob(2, 'test-integration', 'failed'),
        createJob(3, 'test-e2e', 'failed'),
        createJob(4, 'test-acceptance', 'failed'),
        createJob(5, 'test-smoke', 'failed'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      const testCategory = result.categories[0];
      expect(testCategory.examples).toHaveLength(3);
      // 應該包含前 3 個 job 的名稱
      expect(testCategory.examples).toContain('test-unit');
      expect(testCategory.examples).toContain('test-integration');
      expect(testCategory.examples).toContain('test-e2e');
    });

    it('應該在少於 3 個失敗時顯示所有範例', () => {
      const jobs: Job[] = [
        createJob(1, 'test-unit', 'failed'),
        createJob(2, 'test-integration', 'failed'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      const testCategory = result.categories[0];
      expect(testCategory.examples).toHaveLength(2);
    });
  });

  describe('identifyTopFailingJobs() - Top 5 failing jobs', () => {
    it('應該識別最常失敗的 5 個 jobs', () => {
      const jobs: Job[] = [
        // test-unit: 3 次失敗 / 3 次總執行 = 100%
        createJob(1, 'test-unit', 'failed'),
        createJob(2, 'test-unit', 'failed'),
        createJob(3, 'test-unit', 'failed'),

        // lint-eslint: 2 次失敗 / 3 次總執行 = 66.7%
        createJob(4, 'lint-eslint', 'failed'),
        createJob(5, 'lint-eslint', 'failed'),
        createJob(6, 'lint-eslint', 'success'),

        // build-webpack: 1 次失敗 / 2 次總執行 = 50%
        createJob(7, 'build-webpack', 'failed'),
        createJob(8, 'build-webpack', 'success'),

        // deploy-staging: 1 次失敗 / 1 次總執行 = 100%
        createJob(9, 'deploy-staging', 'failed'),

        // test-e2e: 1 次失敗 / 4 次總執行 = 25%
        createJob(10, 'test-e2e', 'failed'),
        createJob(11, 'test-e2e', 'success'),
        createJob(12, 'test-e2e', 'success'),
        createJob(13, 'test-e2e', 'success'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      // 應該按失敗次數排序：test-unit (3) > lint-eslint (2) > 其他 (1)
      expect(result.topJobs).toHaveLength(5);
      expect(result.topJobs[0].jobName).toBe('test-unit');
      expect(result.topJobs[0].failureCount).toBe(3);
      expect(result.topJobs[0].failureRate).toBe(100);

      expect(result.topJobs[1].jobName).toBe('lint-eslint');
      expect(result.topJobs[1].failureCount).toBe(2);
      expect(result.topJobs[1].failureRate).toBe(66.7);
    });

    it('應該在少於 5 個失敗 job 時顯示所有', () => {
      const jobs: Job[] = [
        createJob(1, 'test-unit', 'failed'),
        createJob(2, 'lint-eslint', 'failed'),
        createJob(3, 'build-webpack', 'success'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      expect(result.topJobs).toHaveLength(2);
    });

    it('應該正確計算失敗率（四捨五入到小數點後一位）', () => {
      const jobs: Job[] = [
        // test-unit: 2 次失敗 / 7 次總執行 = 28.571... => 28.6%
        createJob(1, 'test-unit', 'failed'),
        createJob(2, 'test-unit', 'failed'),
        createJob(3, 'test-unit', 'success'),
        createJob(4, 'test-unit', 'success'),
        createJob(5, 'test-unit', 'success'),
        createJob(6, 'test-unit', 'success'),
        createJob(7, 'test-unit', 'success'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      expect(result.topJobs[0].failureRate).toBe(28.6);
    });

    it('應該包含失敗類型', () => {
      const jobs: Job[] = [
        createJob(1, 'test-unit', 'failed'),
        createJob(2, 'lint-eslint', 'failed'),
        createJob(3, 'build-webpack', 'failed'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      expect(result.topJobs[0].failureType).toBe('Test');
      expect(result.topJobs[1].failureType).toBe('Linting');
      expect(result.topJobs[2].failureType).toBe('Build');
    });

    it('應該記錄最後失敗日期', () => {
      const oldDate = new Date('2025-10-20T10:00:00Z');
      const newDate = new Date('2025-10-25T15:00:00Z');

      const jobs: Job[] = [
        createJob(1, 'test-unit', 'failed', oldDate, oldDate),
        createJob(2, 'test-unit', 'failed', newDate, newDate),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      expect(result.topJobs[0].lastFailureDate).toEqual(newDate);
    });

    it('應該記錄相關的 pipeline IDs（最多 5 個）', () => {
      const jobs: Job[] = [
        { ...createJob(1, 'test-unit', 'failed'), pipelineId: 101 },
        { ...createJob(2, 'test-unit', 'failed'), pipelineId: 102 },
        { ...createJob(3, 'test-unit', 'failed'), pipelineId: 103 },
        { ...createJob(4, 'test-unit', 'failed'), pipelineId: 104 },
        { ...createJob(5, 'test-unit', 'failed'), pipelineId: 105 },
        { ...createJob(6, 'test-unit', 'failed'), pipelineId: 106 }, // 應該被忽略
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      expect(result.topJobs[0].pipelineIds).toHaveLength(5);
      expect(result.topJobs[0].pipelineIds).toContain(101);
      expect(result.topJobs[0].pipelineIds).toContain(105);
      expect(result.topJobs[0].pipelineIds).not.toContain(106);
    });
  });

  describe('generateRecommendation() - 建議產生', () => {
    it('應該為 Test 類型產生正確建議', () => {
      // 少量失敗
      expect(JobFailureAnalyzer.generateRecommendation('Test', 3)).toContain(
        '建議檢視測試日誌'
      );

      // 大量失敗 (> 5)
      expect(JobFailureAnalyzer.generateRecommendation('Test', 6)).toContain(
        '建議檢查測試穩定性'
      );
    });

    it('應該為 Build 類型產生正確建議', () => {
      // 少量失敗
      expect(JobFailureAnalyzer.generateRecommendation('Build', 2)).toContain(
        '建議檢視建置日誌'
      );

      // 大量失敗 (> 3)
      expect(JobFailureAnalyzer.generateRecommendation('Build', 4)).toContain(
        '建議檢查建置配置'
      );
    });

    it('應該為 Linting 類型產生正確建議', () => {
      // 少量失敗
      expect(JobFailureAnalyzer.generateRecommendation('Linting', 2)).toContain(
        '建議檢視 linting 規則'
      );

      // 大量失敗 (> 3)
      expect(JobFailureAnalyzer.generateRecommendation('Linting', 4)).toContain(
        '建議統一程式碼風格規範'
      );
    });

    it('應該為 Deploy 類型產生正確建議', () => {
      // 少量失敗
      expect(JobFailureAnalyzer.generateRecommendation('Deploy', 1)).toContain(
        '建議檢查部署日誌'
      );

      // 大量失敗 (> 2)
      expect(JobFailureAnalyzer.generateRecommendation('Deploy', 3)).toContain(
        '建議檢視部署腳本與環境配置'
      );
    });

    it('應該為 Other 類型產生通用建議', () => {
      expect(JobFailureAnalyzer.generateRecommendation('Other', 5)).toContain(
        '建議檢視 job 日誌以識別根本原因'
      );
    });
  });

  describe('整合場景測試', () => {
    it('應該正確處理混合成功和失敗的 jobs', () => {
      const jobs: Job[] = [
        createJob(1, 'test-unit', 'failed'),
        createJob(2, 'test-unit', 'success'),
        createJob(3, 'test-integration', 'failed'),
        createJob(4, 'lint-eslint', 'success'),
        createJob(5, 'build-webpack', 'failed'),
        createJob(6, 'build-webpack', 'failed'),
        createJob(7, 'deploy-staging', 'success'),
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      // 失敗分類：Build (2), Test (2)
      expect(result.categories).toHaveLength(2);

      // Top jobs 應該按失敗次數排序
      expect(result.topJobs).toHaveLength(3);
      expect(result.topJobs[0].jobName).toBe('build-webpack'); // 2 次失敗
      expect(result.topJobs[0].failureCount).toBe(2);
    });

    it('應該處理相同 job 名稱在不同 pipeline 中的失敗', () => {
      const jobs: Job[] = [
        { ...createJob(1, 'test-e2e', 'failed'), pipelineId: 1 },
        { ...createJob(2, 'test-e2e', 'failed'), pipelineId: 2 },
        { ...createJob(3, 'test-e2e', 'failed'), pipelineId: 3 },
        { ...createJob(4, 'test-e2e', 'success'), pipelineId: 4 },
      ];

      const result = JobFailureAnalyzer.analyzeFailures(jobs, mockClassifier);

      expect(result.topJobs[0].failureCount).toBe(3);
      expect(result.topJobs[0].failureRate).toBe(75); // 3/4 = 75%
      expect(result.topJobs[0].pipelineIds).toEqual([1, 2, 3]);
    });
  });
});
