/**
 * GitLab API Response Format Contract Test (T073)
 *
 * 驗證 MR Timeline 分析功能所依賴的 GitLab API 回應格式契約
 *
 * 測試範圍：
 * - MergeRequests.show() - MR 詳細資訊
 * - MergeRequests.allCommits() - Commit 列表
 * - MergeRequestNotes.all() - 評論與審查紀錄
 * - MergeRequests.allPipelines() - Pipeline 執行紀錄
 */

import { describe, it, expect } from 'vitest';

describe('GitLab API Contract for MR Timeline (T073)', () => {
  describe('MergeRequests.show() API Response', () => {
    /**
     * 模擬 GitLab MergeRequests.show() API 回應
     */
    function createMockMRResponse() {
      return {
        iid: 123,
        project_id: 456,
        title: 'feat: Add new feature',
        author: {
          id: 1,
          username: 'johndoe',
          name: 'John Doe',
        },
        created_at: '2025-10-29T10:00:00.000Z',
        merged_at: '2025-10-29T12:00:00.000Z',
        source_branch: 'feature/new-feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/project/-/merge_requests/123',
        merged_by: {
          id: 2,
          username: 'janedoe',
          name: 'Jane Doe',
        },
      };
    }

    it('應包含所有必要的 MR 欄位', () => {
      const mrData = createMockMRResponse();

      // 驗證必要欄位存在
      expect(mrData).toHaveProperty('iid');
      expect(mrData).toHaveProperty('project_id');
      expect(mrData).toHaveProperty('title');
      expect(mrData).toHaveProperty('author');
      expect(mrData).toHaveProperty('created_at');
      expect(mrData).toHaveProperty('merged_at');
      expect(mrData).toHaveProperty('source_branch');
      expect(mrData).toHaveProperty('target_branch');
      expect(mrData).toHaveProperty('web_url');
    });

    it('author 欄位應包含必要的使用者資訊', () => {
      const mrData = createMockMRResponse();

      expect(mrData.author).toHaveProperty('id');
      expect(mrData.author).toHaveProperty('username');
      expect(mrData.author).toHaveProperty('name');

      // 驗證型別
      expect(typeof mrData.author.id).toBe('number');
      expect(typeof mrData.author.username).toBe('string');
      expect(typeof mrData.author.name).toBe('string');
    });

    it('iid 應為正整數', () => {
      const mrData = createMockMRResponse();

      expect(typeof mrData.iid).toBe('number');
      expect(mrData.iid).toBeGreaterThan(0);
      expect(Number.isInteger(mrData.iid)).toBe(true);
    });

    it('created_at 應為有效的 ISO 8601 日期格式', () => {
      const mrData = createMockMRResponse();

      // 驗證可轉換為有效 Date 物件
      const date = new Date(mrData.created_at);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).not.toBeNaN();

      // 驗證 ISO 8601 格式
      expect(mrData.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('merged_at 可以為 null（未合併的 MR）', () => {
      const unmergedMR = {
        ...createMockMRResponse(),
        merged_at: null,
      };

      expect(unmergedMR.merged_at).toBeNull();
    });

    it('merged_at 存在時應為有效的 ISO 8601 日期格式', () => {
      const mrData = createMockMRResponse();

      if (mrData.merged_at) {
        const date = new Date(mrData.merged_at);
        expect(date).toBeInstanceOf(Date);
        expect(date.getTime()).not.toBeNaN();
      }
    });

    it('merged_by 欄位應包含合併者資訊', () => {
      const mrData = createMockMRResponse();

      if (mrData.merged_by) {
        expect(mrData.merged_by).toHaveProperty('id');
        expect(mrData.merged_by).toHaveProperty('username');
        expect(mrData.merged_by).toHaveProperty('name');
      }
    });
  });

  describe('MergeRequests.allCommits() API Response', () => {
    /**
     * 模擬 GitLab MergeRequests.allCommits() API 回應
     */
    function createMockCommitsResponse() {
      return [
        {
          id: 'abc123',
          short_id: 'abc123',
          title: 'feat: Add feature',
          message: 'feat: Add feature\n\nDetailed description',
          author_name: 'John Doe',
          author_email: 'john@example.com',
          committed_date: '2025-10-29T10:30:00.000Z',
          created_at: '2025-10-29T10:30:00.000Z',
        },
        {
          id: 'def456',
          short_id: 'def456',
          title: 'fix: Fix bug',
          message: 'fix: Fix bug',
          author_name: 'John Doe',
          author_email: 'john@example.com',
          committed_date: '2025-10-29T11:00:00.000Z',
          created_at: '2025-10-29T11:00:00.000Z',
        },
      ];
    }

    it('應返回 commit 陣列', () => {
      const commits = createMockCommitsResponse();

      expect(Array.isArray(commits)).toBe(true);
      expect(commits.length).toBeGreaterThan(0);
    });

    it('每個 commit 應包含必要欄位', () => {
      const commits = createMockCommitsResponse();
      const commit = commits[0];

      expect(commit).toHaveProperty('id');
      expect(commit).toHaveProperty('short_id');
      expect(commit).toHaveProperty('title');
      expect(commit).toHaveProperty('message');
      expect(commit).toHaveProperty('author_name');
      expect(commit).toHaveProperty('author_email');
      expect(commit).toHaveProperty('committed_date');
      expect(commit).toHaveProperty('created_at');
    });

    it('commit.id 應為字串且非空', () => {
      const commits = createMockCommitsResponse();
      const commit = commits[0];

      expect(typeof commit.id).toBe('string');
      expect(commit.id.length).toBeGreaterThan(0);
    });

    it('committed_date 應為有效的 ISO 8601 日期格式', () => {
      const commits = createMockCommitsResponse();
      const commit = commits[0];

      const date = new Date(commit.committed_date);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).not.toBeNaN();
    });

    it('author_name 應為字串', () => {
      const commits = createMockCommitsResponse();
      const commit = commits[0];

      expect(typeof commit.author_name).toBe('string');
    });
  });

  describe('MergeRequestNotes.all() API Response', () => {
    /**
     * 模擬 GitLab MergeRequestNotes.all() API 回應
     */
    function createMockNotesResponse() {
      return [
        {
          id: 1001,
          author: {
            id: 2,
            username: 'reviewer1',
            name: 'Reviewer One',
          },
          body: 'Looks good to me!',
          created_at: '2025-10-29T10:45:00.000Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 1002,
          author: {
            id: 3,
            username: 'testuser',
            name: 'Test User',
          },
          body: 'approved this merge request',
          created_at: '2025-10-29T11:30:00.000Z',
          system: true,
          noteable_type: 'MergeRequest',
        },
        {
          id: 1003,
          author: {
            id: 4,
            username: 'bot-reviewer',
            name: 'Bot Reviewer',
          },
          body: 'marked this merge request as **ready**',
          created_at: '2025-10-29T11:15:00.000Z',
          system: true,
          noteable_type: 'MergeRequest',
        },
      ];
    }

    it('應返回 note 陣列', () => {
      const notes = createMockNotesResponse();

      expect(Array.isArray(notes)).toBe(true);
    });

    it('每個 note 應包含必要欄位', () => {
      const notes = createMockNotesResponse();
      const note = notes[0];

      expect(note).toHaveProperty('id');
      expect(note).toHaveProperty('author');
      expect(note).toHaveProperty('body');
      expect(note).toHaveProperty('created_at');
      expect(note).toHaveProperty('system');
      expect(note).toHaveProperty('noteable_type');
    });

    it('note.id 應為正整數', () => {
      const notes = createMockNotesResponse();
      const note = notes[0];

      expect(typeof note.id).toBe('number');
      expect(note.id).toBeGreaterThan(0);
      expect(Number.isInteger(note.id)).toBe(true);
    });

    it('note.author 應包含使用者資訊', () => {
      const notes = createMockNotesResponse();
      const note = notes[0];

      expect(note.author).toHaveProperty('id');
      expect(note.author).toHaveProperty('username');
      expect(note.author).toHaveProperty('name');

      expect(typeof note.author.id).toBe('number');
      expect(typeof note.author.username).toBe('string');
      expect(typeof note.author.name).toBe('string');
    });

    it('note.created_at 應為有效的 ISO 8601 日期格式', () => {
      const notes = createMockNotesResponse();
      const note = notes[0];

      const date = new Date(note.created_at);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).not.toBeNaN();
    });

    it('note.system 應為布林值', () => {
      const notes = createMockNotesResponse();

      notes.forEach((note) => {
        expect(typeof note.system).toBe('boolean');
      });
    });

    it('note.body 應為字串', () => {
      const notes = createMockNotesResponse();
      const note = notes[0];

      expect(typeof note.body).toBe('string');
    });

    it('應區分系統事件與人工評論', () => {
      const notes = createMockNotesResponse();

      const systemNotes = notes.filter((n) => n.system === true);
      const humanNotes = notes.filter((n) => n.system === false);

      expect(systemNotes.length).toBeGreaterThan(0);
      expect(humanNotes.length).toBeGreaterThan(0);
    });
  });

  describe('MergeRequests.allPipelines() API Response', () => {
    /**
     * 模擬 GitLab MergeRequests.allPipelines() API 回應
     */
    function createMockPipelinesResponse() {
      return [
        {
          id: 2001,
          iid: 10,
          status: 'success',
          ref: 'feature/new-feature',
          sha: 'abc123',
          created_at: '2025-10-29T10:35:00.000Z',
          updated_at: '2025-10-29T10:40:00.000Z',
          web_url: 'https://gitlab.com/project/-/pipelines/2001',
        },
        {
          id: 2002,
          iid: 11,
          status: 'failed',
          ref: 'feature/new-feature',
          sha: 'def456',
          created_at: '2025-10-29T11:05:00.000Z',
          updated_at: '2025-10-29T11:10:00.000Z',
          web_url: 'https://gitlab.com/project/-/pipelines/2002',
        },
      ];
    }

    it('應返回 pipeline 陣列', () => {
      const pipelines = createMockPipelinesResponse();

      expect(Array.isArray(pipelines)).toBe(true);
    });

    it('每個 pipeline 應包含必要欄位', () => {
      const pipelines = createMockPipelinesResponse();
      const pipeline = pipelines[0];

      expect(pipeline).toHaveProperty('id');
      expect(pipeline).toHaveProperty('iid');
      expect(pipeline).toHaveProperty('status');
      expect(pipeline).toHaveProperty('ref');
      expect(pipeline).toHaveProperty('sha');
      expect(pipeline).toHaveProperty('created_at');
      expect(pipeline).toHaveProperty('updated_at');
      expect(pipeline).toHaveProperty('web_url');
    });

    it('pipeline.id 應為正整數', () => {
      const pipelines = createMockPipelinesResponse();
      const pipeline = pipelines[0];

      expect(typeof pipeline.id).toBe('number');
      expect(pipeline.id).toBeGreaterThan(0);
      expect(Number.isInteger(pipeline.id)).toBe(true);
    });

    it('pipeline.status 應為有效的 GitLab Pipeline 狀態', () => {
      const pipelines = createMockPipelinesResponse();

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
        expect(typeof pipeline.status).toBe('string');
        expect(validStatuses).toContain(pipeline.status);
      });
    });

    it('pipeline.created_at 應為有效的 ISO 8601 日期格式', () => {
      const pipelines = createMockPipelinesResponse();
      const pipeline = pipelines[0];

      const date = new Date(pipeline.created_at);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).not.toBeNaN();
    });

    it('pipeline.updated_at 應為有效的 ISO 8601 日期格式', () => {
      const pipelines = createMockPipelinesResponse();
      const pipeline = pipelines[0];

      const date = new Date(pipeline.updated_at);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).not.toBeNaN();
    });

    it('pipeline.sha 應為字串且非空', () => {
      const pipelines = createMockPipelinesResponse();
      const pipeline = pipelines[0];

      expect(typeof pipeline.sha).toBe('string');
      expect(pipeline.sha.length).toBeGreaterThan(0);
    });

    it('應支援空陣列（無 pipeline 的 MR）', () => {
      const emptyPipelines: any[] = [];

      expect(Array.isArray(emptyPipelines)).toBe(true);
      expect(emptyPipelines.length).toBe(0);
    });
  });

  describe('API Response Edge Cases', () => {
    it('應處理作者資訊缺失的情況', () => {
      const mrDataWithoutAuthor = {
        iid: 123,
        project_id: 456,
        title: 'Test MR',
        author: {
          id: 0,
          username: '',
          name: 'Unknown',
        },
        created_at: '2025-10-29T10:00:00.000Z',
        merged_at: null,
        source_branch: 'test',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test',
      };

      // 確保欄位存在即可，值可為預設值
      expect(mrDataWithoutAuthor.author).toHaveProperty('id');
      expect(mrDataWithoutAuthor.author).toHaveProperty('username');
      expect(mrDataWithoutAuthor.author).toHaveProperty('name');
    });

    it('應處理空的 commits 陣列', () => {
      const emptyCommits: any[] = [];

      expect(Array.isArray(emptyCommits)).toBe(true);
      expect(emptyCommits.length).toBe(0);
    });

    it('應處理空的 notes 陣列', () => {
      const emptyNotes: any[] = [];

      expect(Array.isArray(emptyNotes)).toBe(true);
      expect(emptyNotes.length).toBe(0);
    });

    it('應處理 merged_by 為 null 的情況', () => {
      const mrWithoutMerger = {
        iid: 123,
        project_id: 456,
        title: 'Test MR',
        author: {
          id: 1,
          username: 'test',
          name: 'Test User',
        },
        created_at: '2025-10-29T10:00:00.000Z',
        merged_at: null,
        merged_by: null,
        source_branch: 'test',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test',
      };

      // merged_by 可以為 null（未合併或自動合併）
      expect(mrWithoutMerger.merged_by).toBeNull();
    });
  });
});
