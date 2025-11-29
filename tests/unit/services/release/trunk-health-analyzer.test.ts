/**
 * 主幹健康度分析器單元測試
 *
 * 測試 TrunkHealthAnalyzer 的核心邏輯
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrunkHealthAnalyzer } from '../../../../src/services/release/trunk-health-analyzer.js';
import type { PipelineExecution } from '../../../../src/models/pipeline-execution.js';
import type { Gitlab } from '@gitbeaker/rest';

describe('TrunkHealthAnalyzer', () => {
  let analyzer: TrunkHealthAnalyzer;
  let mockGitlabClient: any;

  beforeEach(() => {
    // 模擬 GitLab 客戶端
    mockGitlabClient = {
      Pipelines: {
        all: vi.fn()
      }
    };

    analyzer = new TrunkHealthAnalyzer(mockGitlabClient as unknown as InstanceType<typeof Gitlab>, 'test-project');
  });

  describe('calculateSuccessRate', () => {
    it('應該正確計算成功率', () => {
      const pipelines: PipelineExecution[] = [
        { id: 1, status: 'success', ref: 'main', sha: 'abc', created_at: new Date() },
        { id: 2, status: 'success', ref: 'main', sha: 'def', created_at: new Date() },
        { id: 3, status: 'failed', ref: 'main', sha: 'ghi', created_at: new Date() },
        { id: 4, status: 'success', ref: 'main', sha: 'jkl', created_at: new Date() },
      ];

      const rate = analyzer.calculateSuccessRate(pipelines);
      expect(rate).toBe(0.75); // 3/4
    });

    it('空陣列應該返回 0', () => {
      const rate = analyzer.calculateSuccessRate([]);
      expect(rate).toBe(0);
    });

    it('全部成功應該返回 1', () => {
      const pipelines: PipelineExecution[] = [
        { id: 1, status: 'success', ref: 'main', sha: 'abc', created_at: new Date() },
        { id: 2, status: 'success', ref: 'main', sha: 'def', created_at: new Date() },
      ];

      const rate = analyzer.calculateSuccessRate(pipelines);
      expect(rate).toBe(1);
    });
  });

  describe('detectBrokenPeriods', () => {
    it('應該偵測單一 broken 期間', () => {
      const now = new Date('2025-10-26T10:00:00Z');
      const pipelines: PipelineExecution[] = [
        { id: 1, status: 'success', ref: 'main', sha: 'abc', created_at: new Date('2025-10-26T08:00:00Z'), finished_at: new Date('2025-10-26T08:10:00Z') },
        { id: 2, status: 'failed', ref: 'main', sha: 'def', created_at: new Date('2025-10-26T09:00:00Z'), finished_at: new Date('2025-10-26T09:10:00Z') },
        { id: 3, status: 'success', ref: 'main', sha: 'ghi', created_at: new Date('2025-10-26T10:00:00Z'), finished_at: new Date('2025-10-26T10:10:00Z') },
      ];

      const periods = analyzer.detectBrokenPeriods(pipelines);

      expect(periods).toHaveLength(1);
      expect(periods[0].consecutive_failures).toBe(1);
      expect(periods[0].duration_hours).toBeCloseTo(1.17, 1); // 約 1 小時 10 分鐘
    });

    it('應該偵測多個連續失敗', () => {
      const pipelines: PipelineExecution[] = [
        { id: 1, status: 'failed', ref: 'main', sha: 'abc', created_at: new Date('2025-10-26T08:00:00Z'), finished_at: new Date('2025-10-26T08:10:00Z') },
        { id: 2, status: 'failed', ref: 'main', sha: 'def', created_at: new Date('2025-10-26T09:00:00Z'), finished_at: new Date('2025-10-26T09:10:00Z') },
        { id: 3, status: 'failed', ref: 'main', sha: 'ghi', created_at: new Date('2025-10-26T10:00:00Z'), finished_at: new Date('2025-10-26T10:10:00Z') },
        { id: 4, status: 'success', ref: 'main', sha: 'jkl', created_at: new Date('2025-10-26T11:00:00Z'), finished_at: new Date('2025-10-26T11:10:00Z') },
      ];

      const periods = analyzer.detectBrokenPeriods(pipelines);

      expect(periods).toHaveLength(1);
      expect(periods[0].consecutive_failures).toBe(3);
      expect(periods[0].duration_hours).toBeCloseTo(3.17, 1); // 約 3 小時 10 分鐘
    });

    it('空陣列應該返回空列表', () => {
      const periods = analyzer.detectBrokenPeriods([]);
      expect(periods).toHaveLength(0);
    });

    it('應該忽略 canceled 和 skipped 狀態', () => {
      const pipelines: PipelineExecution[] = [
        { id: 1, status: 'failed', ref: 'main', sha: 'abc', created_at: new Date('2025-10-26T08:00:00Z'), finished_at: new Date('2025-10-26T08:10:00Z') },
        { id: 2, status: 'canceled', ref: 'main', sha: 'def', created_at: new Date('2025-10-26T09:00:00Z'), finished_at: new Date('2025-10-26T09:10:00Z') },
        { id: 3, status: 'success', ref: 'main', sha: 'ghi', created_at: new Date('2025-10-26T10:00:00Z'), finished_at: new Date('2025-10-26T10:10:00Z') },
      ];

      const periods = analyzer.detectBrokenPeriods(pipelines);

      expect(periods).toHaveLength(1);
      expect(periods[0].consecutive_failures).toBe(1);
    });
  });

  describe('calculateMTTR', () => {
    it('應該正確計算平均修復時間', () => {
      const periods = [
        {
          started_at: new Date('2025-10-26T08:00:00Z'),
          fixed_at: new Date('2025-10-26T09:00:00Z'),
          duration_hours: 1,
          consecutive_failures: 1
        },
        {
          started_at: new Date('2025-10-26T10:00:00Z'),
          fixed_at: new Date('2025-10-26T13:00:00Z'),
          duration_hours: 3,
          consecutive_failures: 2
        }
      ];

      const mttr = analyzer.calculateMTTR(periods);
      expect(mttr).toBe(2); // (1 + 3) / 2
    });

    it('空陣列應該返回 0', () => {
      const mttr = analyzer.calculateMTTR([]);
      expect(mttr).toBe(0);
    });
  });

  describe('analyzeTrunkHealth', () => {
    it('應該正確分析主幹健康度（Good 等級）', async () => {
      // 模擬 API 回應 - 91% 成功率，MTTR < 1 小時
      mockGitlabClient.Pipelines.all.mockResolvedValue([
        { id: 1, status: 'success', ref: 'main', sha: 'abc', created_at: '2025-10-26T08:00:00Z', finished_at: '2025-10-26T08:10:00Z', duration: 600 },
        { id: 2, status: 'success', ref: 'main', sha: 'def', created_at: '2025-10-26T09:00:00Z', finished_at: '2025-10-26T09:10:00Z', duration: 600 },
        { id: 3, status: 'success', ref: 'main', sha: 'ghi', created_at: '2025-10-26T09:30:00Z', finished_at: '2025-10-26T09:40:00Z', duration: 600 },
        { id: 4, status: 'success', ref: 'main', sha: 'jkl', created_at: '2025-10-26T10:00:00Z', finished_at: '2025-10-26T10:10:00Z', duration: 600 },
        { id: 5, status: 'success', ref: 'main', sha: 'mno', created_at: '2025-10-26T10:30:00Z', finished_at: '2025-10-26T10:40:00Z', duration: 600 },
        { id: 6, status: 'success', ref: 'main', sha: 'pqr', created_at: '2025-10-26T11:00:00Z', finished_at: '2025-10-26T11:10:00Z', duration: 600 },
        { id: 7, status: 'success', ref: 'main', sha: 'stu', created_at: '2025-10-26T11:30:00Z', finished_at: '2025-10-26T11:40:00Z', duration: 600 },
        { id: 8, status: 'success', ref: 'main', sha: 'vwx', created_at: '2025-10-26T12:00:00Z', finished_at: '2025-10-26T12:10:00Z', duration: 600 },
        { id: 9, status: 'success', ref: 'main', sha: 'yza', created_at: '2025-10-26T12:30:00Z', finished_at: '2025-10-26T12:40:00Z', duration: 600 },
        { id: 10, status: 'failed', ref: 'main', sha: 'bcd', created_at: '2025-10-26T13:00:00Z', finished_at: '2025-10-26T13:10:00Z', duration: 600 },
        { id: 11, status: 'success', ref: 'main', sha: 'efg', created_at: '2025-10-26T13:30:00Z', finished_at: '2025-10-26T13:40:00Z', duration: 600 },
      ]);

      const result = await analyzer.analyzeTrunkHealth('main', 90);

      expect(result.pipeline_success_rate).toBeCloseTo(0.909, 2); // 10/11 = 90.9%
      expect(result.mean_time_to_fix_hours).toBeCloseTo(0.67, 1); // 40 分鐘
      expect(result.consecutive_failures).toBe(1);
      expect(result.level).toBe('good'); // 90-95% 成功率，MTTR < 1 小時
    });

    it('應該處理無 pipeline 歷史的情況', async () => {
      mockGitlabClient.Pipelines.all.mockResolvedValue([]);

      const result = await analyzer.analyzeTrunkHealth('main', 90);

      expect(result.pipeline_success_rate).toBe(0);
      expect(result.mean_time_to_fix_hours).toBe(0);
      expect(result.consecutive_failures).toBe(0);
      expect(result.level).toBe('needs-improvement');
      expect(result.dora_compliance).toBe(false);
    });
  });
});
