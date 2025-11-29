import { describe, it, expect, vi } from 'vitest';
import { Gitlab } from '@gitbeaker/rest';

/**
 * GitLab Pipelines API 合約測試
 * Feature: 008-cicd-health
 * Task: T009
 *
 * 目的：驗證 /projects/:id/pipelines API 回應格式符合預期
 */

// Mock GitLab API Pipelines 回應
const mockPipelines = [
  {
    id: 12345,
    iid: 1,
    project_id: 278964,
    status: 'success',
    source: 'push',
    ref: 'main',
    sha: 'a1b2c3d4e5f6',
    created_at: '2025-10-20T10:00:00.000Z',
    updated_at: '2025-10-20T10:15:00.000Z',
    started_at: '2025-10-20T10:00:30.000Z',
    finished_at: '2025-10-20T10:15:00.000Z',
    duration: 870, // 14.5 分鐘
    queued_duration: 5,
    web_url: 'https://gitlab.com/org/project/-/pipelines/12345',
    user: {
      id: 1,
      name: 'John Doe',
      username: 'johndoe',
    },
  },
  {
    id: 12346,
    iid: 2,
    project_id: 278964,
    status: 'failed',
    source: 'push',
    ref: 'develop',
    sha: 'b2c3d4e5f6a7',
    created_at: '2025-10-21T08:00:00.000Z',
    updated_at: '2025-10-21T08:30:00.000Z',
    started_at: '2025-10-21T08:00:15.000Z',
    finished_at: '2025-10-21T08:30:00.000Z',
    duration: 1785, // 29.75 分鐘
    queued_duration: 10,
    web_url: 'https://gitlab.com/org/project/-/pipelines/12346',
    user: {
      id: 2,
      name: 'Jane Smith',
      username: 'janesmith',
    },
  },
  {
    id: 12347,
    iid: 3,
    project_id: 278964,
    status: 'running',
    source: 'push',
    ref: 'feature/new-feature',
    sha: 'c3d4e5f6a7b8',
    created_at: '2025-10-22T14:00:00.000Z',
    updated_at: '2025-10-22T14:10:00.000Z',
    started_at: '2025-10-22T14:00:20.000Z',
    finished_at: null, // 執行中，尚未完成
    duration: null,
    queued_duration: 8,
    web_url: 'https://gitlab.com/org/project/-/pipelines/12347',
    user: {
      id: 1,
      name: 'John Doe',
      username: 'johndoe',
    },
  },
];

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => {
  return {
    Gitlab: vi.fn().mockImplementation(() => {
      return {
        Pipelines: {
          all: vi.fn().mockResolvedValue(mockPipelines),
          show: vi.fn().mockImplementation((projectId: string, pipelineId: number) => {
            const pipeline = mockPipelines.find((p) => p.id === pipelineId);
            return Promise.resolve(pipeline || null);
          }),
        },
      };
    }),
  };
});

describe('GitLab Pipelines API 合約測試', () => {
  /**
   * 測試：驗證 Pipelines.all() 回應包含所有必要欄位
   */
  it('應該回傳包含所有必要欄位的 pipeline 清單', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const pipelines = await gitlab.Pipelines.all('test-project');

    // 驗證回應是陣列
    expect(Array.isArray(pipelines)).toBe(true);
    expect(pipelines.length).toBeGreaterThan(0);

    // 驗證第一個 pipeline 的欄位
    const pipeline = pipelines[0];

    // 必要欄位
    expect(pipeline).toHaveProperty('id');
    expect(pipeline).toHaveProperty('status');
    expect(pipeline).toHaveProperty('ref');
    expect(pipeline).toHaveProperty('sha');
    expect(pipeline).toHaveProperty('created_at');
    expect(pipeline).toHaveProperty('updated_at');
    expect(pipeline).toHaveProperty('web_url');

    // 時間相關欄位（可能為 null）
    expect(pipeline).toHaveProperty('started_at');
    expect(pipeline).toHaveProperty('finished_at');
    expect(pipeline).toHaveProperty('duration');

    // 驗證型別
    expect(typeof pipeline.id).toBe('number');
    expect(typeof pipeline.status).toBe('string');
    expect(typeof pipeline.ref).toBe('string');
    expect(typeof pipeline.sha).toBe('string');
    expect(typeof pipeline.created_at).toBe('string');
    expect(typeof pipeline.updated_at).toBe('string');
    expect(typeof pipeline.web_url).toBe('string');
  });

  /**
   * 測試：驗證 pipeline status 值符合預期
   */
  it('應該回傳有效的 pipeline status 值', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const pipelines = await gitlab.Pipelines.all('test-project');

    const validStatuses = [
      'created',
      'waiting_for_resource',
      'preparing',
      'pending',
      'running',
      'success',
      'failed',
      'canceled',
      'skipped',
      'manual',
      'scheduled',
    ];

    pipelines.forEach((pipeline) => {
      expect(validStatuses).toContain(pipeline.status);
    });
  });

  /**
   * 測試：驗證成功 pipeline 的欄位完整性
   */
  it('成功的 pipeline 應該包含完整的時間和 duration 資訊', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const pipelines = await gitlab.Pipelines.all('test-project');
    const successPipeline = pipelines.find((p) => p.status === 'success');

    expect(successPipeline).toBeDefined();
    expect(successPipeline!.started_at).not.toBeNull();
    expect(successPipeline!.finished_at).not.toBeNull();
    expect(successPipeline!.duration).not.toBeNull();
    expect(typeof successPipeline!.duration).toBe('number');
    expect(successPipeline!.duration).toBeGreaterThan(0);
  });

  /**
   * 測試：驗證失敗 pipeline 的欄位完整性
   */
  it('失敗的 pipeline 應該包含完整的時間和 duration 資訊', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const pipelines = await gitlab.Pipelines.all('test-project');
    const failedPipeline = pipelines.find((p) => p.status === 'failed');

    expect(failedPipeline).toBeDefined();
    expect(failedPipeline!.started_at).not.toBeNull();
    expect(failedPipeline!.finished_at).not.toBeNull();
    expect(failedPipeline!.duration).not.toBeNull();
    expect(typeof failedPipeline!.duration).toBe('number');
  });

  /**
   * 測試：驗證執行中 pipeline 的欄位行為
   */
  it('執行中的 pipeline 應該沒有 finished_at 和 duration', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const pipelines = await gitlab.Pipelines.all('test-project');
    const runningPipeline = pipelines.find((p) => p.status === 'running');

    expect(runningPipeline).toBeDefined();
    expect(runningPipeline!.started_at).not.toBeNull();
    expect(runningPipeline!.finished_at).toBeNull();
    expect(runningPipeline!.duration).toBeNull();
  });

  /**
   * 測試：驗證日期格式為 ISO 8601
   */
  it('所有日期欄位應該是有效的 ISO 8601 格式', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const pipelines = await gitlab.Pipelines.all('test-project');

    pipelines.forEach((pipeline) => {
      // created_at 和 updated_at 必定存在
      expect(new Date(pipeline.created_at).toISOString()).toBe(pipeline.created_at);
      expect(new Date(pipeline.updated_at).toISOString()).toBe(pipeline.updated_at);

      // started_at 和 finished_at 可能為 null
      if (pipeline.started_at) {
        expect(new Date(pipeline.started_at).toISOString()).toBe(pipeline.started_at);
      }
      if (pipeline.finished_at) {
        expect(new Date(pipeline.finished_at).toISOString()).toBe(pipeline.finished_at);
      }
    });
  });

  /**
   * 測試：驗證 Pipelines.show() 回應格式
   */
  it('Pipelines.show() 應該回傳單一 pipeline 物件', async () => {
    const gitlab = new Gitlab({
      token: 'test-token',
      host: 'https://gitlab.com',
    });

    const pipeline = await gitlab.Pipelines.show('test-project', 12345);

    expect(pipeline).toBeDefined();
    expect(pipeline).toHaveProperty('id');
    expect(pipeline!.id).toBe(12345);
    expect(pipeline).toHaveProperty('status');
    expect(pipeline).toHaveProperty('ref');
  });
});
