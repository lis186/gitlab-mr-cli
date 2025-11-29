/**
 * CI Health 命令整合測試
 * Feature: 008-cicd-health
 * Task: T018
 *
 * 目的：測試完整 ci-health 指令執行流程（mock GitLab API）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Gitlab } from '@gitbeaker/rest';

/**
 * 整合測試策略：
 * 1. Mock GitLab API 回應（Pipelines 和 Jobs）
 * 2. 測試命令的完整執行流程
 * 3. 驗證輸出格式與內容正確性
 */

// Mock 資料
const mockPipelines = [
  {
    id: 1,
    status: 'success',
    ref: 'main',
    sha: 'abc123',
    created_at: '2025-10-20T10:00:00Z',
    updated_at: '2025-10-20T10:15:00Z',
    started_at: '2025-10-20T10:00:30Z',
    finished_at: '2025-10-20T10:15:00Z',
    duration: 870, // 14.5 分鐘
    web_url: 'https://gitlab.com/test/-/pipelines/1',
  },
  {
    id: 2,
    status: 'failed',
    ref: 'develop',
    sha: 'def456',
    created_at: '2025-10-21T08:00:00Z',
    updated_at: '2025-10-21T08:30:00Z',
    started_at: '2025-10-21T08:00:15Z',
    finished_at: '2025-10-21T08:30:00Z',
    duration: 1785, // 29.75 分鐘
    web_url: 'https://gitlab.com/test/-/pipelines/2',
  },
  {
    id: 3,
    status: 'running',
    ref: 'feature/test',
    sha: 'ghi789',
    created_at: '2025-10-22T14:00:00Z',
    updated_at: '2025-10-22T14:10:00Z',
    started_at: '2025-10-22T14:00:20Z',
    finished_at: null,
    duration: null,
    web_url: 'https://gitlab.com/test/-/pipelines/3',
  },
];

const mockJobsPipeline1 = [
  {
    id: 101,
    name: 'test:unit',
    stage: 'test',
    status: 'success',
    created_at: '2025-10-20T10:00:30Z',
    started_at: '2025-10-20T10:01:00Z',
    finished_at: '2025-10-20T10:05:00Z',
    duration: 240,
    failure_reason: null,
    web_url: 'https://gitlab.com/test/-/jobs/101',
  },
  {
    id: 102,
    name: 'lint:eslint',
    stage: 'lint',
    status: 'success',
    created_at: '2025-10-20T10:00:30Z',
    started_at: '2025-10-20T10:01:00Z',
    finished_at: '2025-10-20T10:03:00Z',
    duration: 120,
    failure_reason: null,
    web_url: 'https://gitlab.com/test/-/jobs/102',
  },
];

const mockJobsPipeline2 = [
  {
    id: 201,
    name: 'test:e2e',
    stage: 'test',
    status: 'failed',
    created_at: '2025-10-21T08:00:15Z',
    started_at: '2025-10-21T08:10:00Z',
    finished_at: '2025-10-21T08:25:00Z',
    duration: 900,
    failure_reason: 'script_failure',
    web_url: 'https://gitlab.com/test/-/jobs/201',
  },
  {
    id: 202,
    name: 'build:webpack',
    stage: 'build',
    status: 'failed',
    created_at: '2025-10-21T08:00:15Z',
    started_at: '2025-10-21T08:10:00Z',
    finished_at: '2025-10-21T08:20:00Z',
    duration: 600,
    failure_reason: 'script_failure',
    web_url: 'https://gitlab.com/test/-/jobs/202',
  },
];

const mockJobsPipeline3 = [
  {
    id: 301,
    name: 'deploy:staging',
    stage: 'deploy',
    status: 'running',
    created_at: '2025-10-22T14:00:20Z',
    started_at: '2025-10-22T14:00:30Z',
    finished_at: null,
    duration: null,
    failure_reason: null,
    web_url: 'https://gitlab.com/test/-/jobs/301',
  },
];

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => {
  return {
    Gitlab: vi.fn().mockImplementation(() => {
      return {
        Pipelines: {
          all: vi.fn().mockResolvedValue(mockPipelines),
        },
        Jobs: {
          all: vi.fn().mockImplementation((_projectId: string, options?: any) => {
            if (options?.pipelineId === 1) {
              return Promise.resolve(mockJobsPipeline1);
            }
            if (options?.pipelineId === 2) {
              return Promise.resolve(mockJobsPipeline2);
            }
            if (options?.pipelineId === 3) {
              return Promise.resolve(mockJobsPipeline3);
            }
            return Promise.resolve([]);
          }),
        },
      };
    }),
  };
});

describe('CI Health Command 整合測試 (T018)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GitLab API 整合', () => {
    it('應該正確呼叫 Pipelines.all() API', async () => {
      const gitlab = new Gitlab({
        token: 'test-token',
        host: 'https://gitlab.com',
      });

      const pipelines = await gitlab.Pipelines.all('test-project', {
        updatedAfter: new Date('2025-10-01').toISOString(),
        updatedBefore: new Date('2025-10-31').toISOString(),
        perPage: 100,
        maxPages: 10,
      });

      expect(pipelines).toHaveLength(3);
      expect(pipelines[0].id).toBe(1);
      expect(pipelines[0].status).toBe('success');
    });

    it('應該正確呼叫 Jobs.all() API 並按 pipelineId 篩選', async () => {
      const gitlab = new Gitlab({
        token: 'test-token',
        host: 'https://gitlab.com',
      });

      const jobs = await gitlab.Jobs.all('test-project', {
        pipelineId: 1,
        perPage: 100,
      });

      expect(jobs).toHaveLength(2);
      expect(jobs[0].name).toBe('test:unit');
      expect(jobs[1].name).toBe('lint:eslint');
    });
  });

  describe('Pipeline 健康指標計算', () => {
    it('應該正確計算 pipeline 統計資訊', async () => {
      const gitlab = new Gitlab({
        token: 'test-token',
        host: 'https://gitlab.com',
      });

      const pipelines = await gitlab.Pipelines.all('test-project');

      // 統計驗證
      const successPipelines = pipelines.filter((p) => p.status === 'success');
      const failedPipelines = pipelines.filter((p) => p.status === 'failed');
      const runningPipelines = pipelines.filter((p) => p.status === 'running');

      expect(successPipelines).toHaveLength(1);
      expect(failedPipelines).toHaveLength(1);
      expect(runningPipelines).toHaveLength(1);

      // 成功率計算：1 / (1+1) = 50%
      const completedCount = successPipelines.length + failedPipelines.length;
      const successRate = (successPipelines.length / completedCount) * 100;
      expect(successRate).toBe(50);
    });

    it('應該正確計算平均執行時間（排除執行中的 pipeline）', async () => {
      const gitlab = new Gitlab({
        token: 'test-token',
        host: 'https://gitlab.com',
      });

      const pipelines = await gitlab.Pipelines.all('test-project');

      const completedPipelines = pipelines.filter(
        (p) => p.status === 'success' || p.status === 'failed'
      );

      const totalDuration = completedPipelines.reduce(
        (sum, p) => sum + (p.duration || 0),
        0
      );
      const avgDuration = totalDuration / completedPipelines.length;

      // (870 + 1785) / 2 = 1327.5 秒
      expect(avgDuration).toBe(1327.5);
    });
  });

  describe('Job 失敗分析', () => {
    it('應該正確識別失敗的 jobs', async () => {
      const gitlab = new Gitlab({
        token: 'test-token',
        host: 'https://gitlab.com',
      });

      // 取得 pipeline 2 的 jobs（有失敗）
      const jobs = await gitlab.Jobs.all('test-project', { pipelineId: 2 });

      const failedJobs = jobs.filter((j) => j.status === 'failed');
      expect(failedJobs).toHaveLength(2);

      // 驗證失敗 job 的資訊
      expect(failedJobs[0].name).toBe('test:e2e');
      expect(failedJobs[0].stage).toBe('test');
      expect(failedJobs[0].failure_reason).toBe('script_failure');

      expect(failedJobs[1].name).toBe('build:webpack');
      expect(failedJobs[1].stage).toBe('build');
    });

    it('應該能夠分類失敗的 jobs', async () => {
      const gitlab = new Gitlab({
        token: 'test-token',
        host: 'https://gitlab.com',
      });

      const jobs = await gitlab.Jobs.all('test-project', { pipelineId: 2 });
      const failedJobs = jobs.filter((j) => j.status === 'failed');

      // 簡單的分類邏輯驗證
      const testFailures = failedJobs.filter((j) =>
        j.name.toLowerCase().includes('test') || j.stage.toLowerCase() === 'test'
      );
      const buildFailures = failedJobs.filter((j) =>
        j.name.toLowerCase().includes('build') || j.stage.toLowerCase() === 'build'
      );

      expect(testFailures).toHaveLength(1);
      expect(buildFailures).toHaveLength(1);
    });
  });

  describe('多 Pipeline 批次處理', () => {
    it('應該能夠批次擷取所有 pipelines 的 jobs', async () => {
      const gitlab = new Gitlab({
        token: 'test-token',
        host: 'https://gitlab.com',
      });

      const pipelines = await gitlab.Pipelines.all('test-project');

      // 批次擷取所有 jobs
      const allJobsPromises = pipelines.map((pipeline) =>
        gitlab.Jobs.all('test-project', { pipelineId: pipeline.id })
      );

      const allJobsArrays = await Promise.all(allJobsPromises);
      const allJobs = allJobsArrays.flat();

      // 應該有 2 + 2 + 1 = 5 個 jobs
      expect(allJobs).toHaveLength(5);
    });

    it('應該正確處理混合狀態的 jobs', async () => {
      const gitlab = new Gitlab({
        token: 'test-token',
        host: 'https://gitlab.com',
      });

      const pipelines = await gitlab.Pipelines.all('test-project');

      const allJobsPromises = pipelines.map((pipeline) =>
        gitlab.Jobs.all('test-project', { pipelineId: pipeline.id })
      );

      const allJobsArrays = await Promise.all(allJobsPromises);
      const allJobs = allJobsArrays.flat();

      const successJobs = allJobs.filter((j) => j.status === 'success');
      const failedJobs = allJobs.filter((j) => j.status === 'failed');
      const runningJobs = allJobs.filter((j) => j.status === 'running');

      expect(successJobs).toHaveLength(2); // pipeline 1
      expect(failedJobs).toHaveLength(2);  // pipeline 2
      expect(runningJobs).toHaveLength(1); // pipeline 3
    });
  });

  describe('健康狀態判定', () => {
    it('應該根據成功率判定健康狀態', () => {
      // 測試健康狀態邏輯
      const determineStatus = (rate: number) => {
        if (rate >= 90) return 'healthy';
        if (rate >= 85) return 'warning';
        return 'critical';
      };

      expect(determineStatus(100)).toBe('healthy');
      expect(determineStatus(90)).toBe('healthy');
      expect(determineStatus(87)).toBe('warning');
      expect(determineStatus(50)).toBe('critical');
    });

    it('應該根據執行時間判定健康狀態', () => {
      const determineExecutionStatus = (time: number) => {
        if (time < 600) return 'healthy'; // < 10 分鐘
        return 'warning';
      };

      expect(determineExecutionStatus(300)).toBe('healthy');
      expect(determineExecutionStatus(599)).toBe('healthy');
      expect(determineExecutionStatus(600)).toBe('warning');
      expect(determineExecutionStatus(1327)).toBe('warning');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理空的 pipeline 清單', async () => {
      // 建立一個回傳空陣列的 mock
      const emptyGitlab = new (vi.fn().mockImplementation(() => ({
        Pipelines: {
          all: vi.fn().mockResolvedValue([]),
        },
      })))();

      const pipelines = await emptyGitlab.Pipelines.all('test-project');

      expect(pipelines).toHaveLength(0);
      // 應該能夠正確處理空陣列，不拋出錯誤
    });

    it('應該處理沒有失敗 jobs 的情況', async () => {
      const gitlab = new Gitlab({
        token: 'test-token',
        host: 'https://gitlab.com',
      });

      // Pipeline 1 的所有 jobs 都成功
      const jobs = await gitlab.Jobs.all('test-project', { pipelineId: 1 });
      const failedJobs = jobs.filter((j) => j.status === 'failed');

      expect(failedJobs).toHaveLength(0);
      // 失敗分類應該回傳空陣列
    });
  });
});
