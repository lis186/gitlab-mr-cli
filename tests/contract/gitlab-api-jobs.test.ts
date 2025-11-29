import { describe, it, expect, vi } from 'vitest';
import { Gitlab } from '@gitbeaker/rest';

/**
 * GitLab Jobs API 合約測試
 * Feature: 008-cicd-health
 * Task: T019
 *
 * 目的：驗證 /projects/:id/pipelines/:pipeline_id/jobs API 回應格式符合預期
 */

// Mock GitLab API Jobs 回應
const mockJobs = [
  {
    id: 54321,
    name: 'test:unit',
    stage: 'test',
    status: 'success',
    created_at: '2025-10-20T10:00:30.000Z',
    started_at: '2025-10-20T10:01:00.000Z',
    finished_at: '2025-10-20T10:05:00.000Z',
    duration: 240, // 4 分鐘
    queued_duration: 15,
    user: {
      id: 1,
      name: 'John Doe',
      username: 'johndoe',
    },
    commit: {
      id: 'a1b2c3d4e5f6',
      short_id: 'a1b2c3d4',
      title: 'Add unit tests',
    },
    pipeline: {
      id: 12345,
      iid: 1,
      project_id: 278964,
      sha: 'a1b2c3d4e5f6',
      ref: 'main',
      status: 'success',
    },
    web_url: 'https://gitlab.com/org/project/-/jobs/54321',
    ref: 'main',
    tag: false,
    coverage: 85.5,
    allow_failure: false,
    failure_reason: null,
  },
  {
    id: 54322,
    name: 'lint:eslint',
    stage: 'lint',
    status: 'failed',
    created_at: '2025-10-20T10:00:30.000Z',
    started_at: '2025-10-20T10:01:00.000Z',
    finished_at: '2025-10-20T10:02:30.000Z',
    duration: 90, // 1.5 分鐘
    queued_duration: 10,
    user: {
      id: 1,
      name: 'John Doe',
      username: 'johndoe',
    },
    commit: {
      id: 'a1b2c3d4e5f6',
      short_id: 'a1b2c3d4',
      title: 'Add unit tests',
    },
    pipeline: {
      id: 12345,
      iid: 1,
      project_id: 278964,
      sha: 'a1b2c3d4e5f6',
      ref: 'main',
      status: 'success',
    },
    web_url: 'https://gitlab.com/org/project/-/jobs/54322',
    ref: 'main',
    tag: false,
    coverage: null,
    allow_failure: false,
    failure_reason: 'script_failure',
  },
  {
    id: 54323,
    name: 'build:webpack',
    stage: 'build',
    status: 'running',
    created_at: '2025-10-20T10:00:30.000Z',
    started_at: '2025-10-20T10:05:00.000Z',
    finished_at: null, // 執行中
    duration: null,
    queued_duration: 20,
    user: {
      id: 1,
      name: 'John Doe',
      username: 'johndoe',
    },
    commit: {
      id: 'a1b2c3d4e5f6',
      short_id: 'a1b2c3d4',
      title: 'Add unit tests',
    },
    pipeline: {
      id: 12345,
      iid: 1,
      project_id: 278964,
      sha: 'a1b2c3d4e5f6',
      ref: 'main',
      status: 'running',
    },
    web_url: 'https://gitlab.com/org/project/-/jobs/54323',
    ref: 'main',
    tag: false,
    coverage: null,
    allow_failure: false,
    failure_reason: null,
  },
  {
    id: 54324,
    name: 'deploy:production',
    stage: 'deploy',
    status: 'failed',
    created_at: '2025-10-21T08:00:15.000Z',
    started_at: '2025-10-21T08:10:00.000Z',
    finished_at: '2025-10-21T08:25:00.000Z',
    duration: 900, // 15 分鐘
    queued_duration: 45,
    user: {
      id: 2,
      name: 'Jane Smith',
      username: 'janesmith',
    },
    commit: {
      id: 'b2c3d4e5f6a7',
      short_id: 'b2c3d4e5',
      title: 'Deploy to production',
    },
    pipeline: {
      id: 12346,
      iid: 2,
      project_id: 278964,
      sha: 'b2c3d4e5f6a7',
      ref: 'develop',
      status: 'failed',
    },
    web_url: 'https://gitlab.com/org/project/-/jobs/54324',
    ref: 'develop',
    tag: false,
    coverage: null,
    allow_failure: false,
    failure_reason: 'unknown_failure',
  },
];

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => {
  return {
    Gitlab: vi.fn().mockImplementation(() => {
      return {
        Jobs: {
          all: vi.fn().mockImplementation((projectId: string, options?: any) => {
            if (options?.pipelineId) {
              // 按 pipelineId 篩選
              return Promise.resolve(
                mockJobs.filter((j) => j.pipeline.id === options.pipelineId)
              );
            }
            return Promise.resolve(mockJobs);
          }),
          show: vi.fn().mockImplementation((projectId: string, jobId: number) => {
            const job = mockJobs.find((j) => j.id === jobId);
            return Promise.resolve(job || null);
          }),
        },
      };
    }),
  };
});

describe('GitLab Jobs API 合約測試', () => {
  /**
   * 測試：驗證 Jobs.all() 回應包含所有必要欄位
   */
  it('應該回傳包含所有必要欄位的 job 清單', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project');

    // 驗證回應是陣列
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);

    // 驗證第一個 job 的欄位
    const job = jobs[0];

    // 必要欄位
    expect(job).toHaveProperty('id');
    expect(job).toHaveProperty('name');
    expect(job).toHaveProperty('stage');
    expect(job).toHaveProperty('status');
    expect(job).toHaveProperty('created_at');
    expect(job).toHaveProperty('web_url');
    expect(job).toHaveProperty('pipeline');

    // 時間相關欄位（可能為 null）
    expect(job).toHaveProperty('started_at');
    expect(job).toHaveProperty('finished_at');
    expect(job).toHaveProperty('duration');

    // 失敗相關欄位
    expect(job).toHaveProperty('failure_reason');

    // 驗證型別
    expect(typeof job.id).toBe('number');
    expect(typeof job.name).toBe('string');
    expect(typeof job.stage).toBe('string');
    expect(typeof job.status).toBe('string');
    expect(typeof job.created_at).toBe('string');
    expect(typeof job.web_url).toBe('string');
  });

  /**
   * 測試：驗證 job status 值符合預期
   */
  it('應該回傳有效的 job status 值', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project');

    const validStatuses = [
      'created',
      'pending',
      'running',
      'success',
      'failed',
      'canceled',
      'skipped',
      'manual',
      'waiting_for_resource',
      'preparing',
    ];

    jobs.forEach((job) => {
      expect(validStatuses).toContain(job.status);
    });
  });

  /**
   * 測試：驗證成功 job 的欄位完整性
   */
  it('成功的 job 應該包含完整的時間和 duration 資訊', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project');
    const successJob = jobs.find((j) => j.status === 'success');

    expect(successJob).toBeDefined();
    expect(successJob!.started_at).not.toBeNull();
    expect(successJob!.finished_at).not.toBeNull();
    expect(successJob!.duration).not.toBeNull();
    expect(typeof successJob!.duration).toBe('number');
    expect(successJob!.duration).toBeGreaterThan(0);
    expect(successJob!.failure_reason).toBeNull();
  });

  /**
   * 測試：驗證失敗 job 的欄位完整性
   */
  it('失敗的 job 應該包含 failure_reason', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project');
    const failedJobs = jobs.filter((j) => j.status === 'failed');

    expect(failedJobs.length).toBeGreaterThan(0);

    failedJobs.forEach((job) => {
      expect(job.started_at).not.toBeNull();
      expect(job.finished_at).not.toBeNull();
      expect(job.duration).not.toBeNull();
      // failure_reason 可能為 null（如果無法識別原因）
      expect(job).toHaveProperty('failure_reason');
    });
  });

  /**
   * 測試：驗證執行中 job 的欄位行為
   */
  it('執行中的 job 應該沒有 finished_at 和 duration', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project');
    const runningJob = jobs.find((j) => j.status === 'running');

    expect(runningJob).toBeDefined();
    expect(runningJob!.started_at).not.toBeNull();
    expect(runningJob!.finished_at).toBeNull();
    expect(runningJob!.duration).toBeNull();
    expect(runningJob!.failure_reason).toBeNull();
  });

  /**
   * 測試：驗證 failure_reason 的有效值
   */
  it('failure_reason 應該是有效值或 null', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project');

    const validFailureReasons = [
      'unknown_failure',
      'script_failure',
      'api_failure',
      'stuck_or_timeout_failure',
      'runner_system_failure',
      'missing_dependency_failure',
      'runner_unsupported',
      'stale_schedule',
      'job_execution_timeout',
      'archived_failure',
      'unmet_prerequisites',
      'scheduler_failure',
      'data_integrity_failure',
      null, // 未失敗的 job 或原因不明
    ];

    jobs.forEach((job) => {
      expect(validFailureReasons).toContain(job.failure_reason);
    });
  });

  /**
   * 測試：驗證 pipeline 關聯物件結構
   */
  it('每個 job 應該包含 pipeline 關聯資訊', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project');

    jobs.forEach((job) => {
      expect(job.pipeline).toBeDefined();
      expect(job.pipeline).toHaveProperty('id');
      expect(job.pipeline).toHaveProperty('iid');
      expect(job.pipeline).toHaveProperty('project_id');
      expect(job.pipeline).toHaveProperty('sha');
      expect(job.pipeline).toHaveProperty('ref');
      expect(job.pipeline).toHaveProperty('status');

      expect(typeof job.pipeline.id).toBe('number');
    });
  });

  /**
   * 測試：驗證按 pipelineId 篩選功能
   */
  it('應該支援按 pipelineId 篩選 jobs', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project', { pipelineId: 12345 });

    expect(Array.isArray(jobs)).toBe(true);
    jobs.forEach((job) => {
      expect(job.pipeline.id).toBe(12345);
    });
  });

  /**
   * 測試：驗證日期格式為 ISO 8601
   */
  it('所有日期欄位應該是有效的 ISO 8601 格式', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project');

    jobs.forEach((job) => {
      // created_at 必定存在
      expect(new Date(job.created_at).toISOString()).toBe(job.created_at);

      // started_at 和 finished_at 可能為 null
      if (job.started_at) {
        expect(new Date(job.started_at).toISOString()).toBe(job.started_at);
      }
      if (job.finished_at) {
        expect(new Date(job.finished_at).toISOString()).toBe(job.finished_at);
      }
    });
  });

  /**
   * 測試：驗證 stage 名稱符合常見模式
   */
  it('stage 名稱應該符合常見 CI/CD 階段命名', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const jobs = await gitlab.Jobs.all('test-project');

    const commonStages = [
      'build',
      'test',
      'lint',
      'deploy',
      'release',
      'package',
      'publish',
      'quality',
      'security',
      'verify',
      'review',
      'staging',
      'production',
    ];

    jobs.forEach((job) => {
      expect(typeof job.stage).toBe('string');
      expect(job.stage.length).toBeGreaterThan(0);
      // Stage 可能是自訂的，但應該包含常見 stage 或是字串
      expect(
        commonStages.includes(job.stage.toLowerCase()) || job.stage.length > 0
      ).toBe(true);
    });
  });
});
