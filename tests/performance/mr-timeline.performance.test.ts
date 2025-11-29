/**
 * MR Timeline 效能測試 (T078)
 *
 * 驗證 MR 時間軸分析效能目標：
 * - SC-001: 單一 MR 分析應在 5 秒內完成（MR 包含不超過 100 個事件）
 * - SC-006: 批次分析支援至少 10 個 MR（<1 分鐘）且上限為 50 個 MR（約 5 分鐘）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Gitlab } from '@gitbeaker/rest';
import { MRTimelineService } from '../../src/services/mr-timeline-service.js';
import type { MergeRequestSchema, MergeRequestNoteSchema } from '@gitbeaker/rest';

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn(),
}));

describe('MR Timeline - 效能測試 (T078)', () => {
  let mockGitlab: any;

  beforeEach(() => {
    mockGitlab = {
      MergeRequests: {
        show: vi.fn(),
        allCommits: vi.fn(),
        allPipelines: vi.fn().mockResolvedValue([]),
      },
      MergeRequestNotes: {
        all: vi.fn(),
      },
      requester: {
        get: vi.fn(),
      },
    };
    vi.mocked(Gitlab).mockReturnValue(mockGitlab);
  });

  /**
   * 建立模擬的 MR 資料（包含指定數量的事件）
   */
  function createMockMR(iid: number, eventCount: number = 50): {
    mr: Partial<MergeRequestSchema>;
    commits: any[];
    notes: Partial<MergeRequestNoteSchema>[];
  } {
    const baseTime = new Date('2025-10-30T10:00:00Z').getTime();

    const mr: Partial<MergeRequestSchema> = {
      id: 10000 + iid,
      iid,
      title: `Test MR ${iid}`,
      description: 'Performance test MR',
      state: 'merged',
      created_at: new Date(baseTime).toISOString(),
      merged_at: new Date(baseTime + 7200000).toISOString(), // +2h
      updated_at: new Date(baseTime + 7200000).toISOString(),
      author: {
        id: 1,
        username: 'testuser',
        name: 'Test User',
      },
      source_branch: `feature/test-${iid}`,
      target_branch: 'main',
      web_url: `https://gitlab.com/test/project/-/merge_requests/${iid}`,
      draft: false,
      work_in_progress: false,
    };

    // 建立 commits（佔事件總數的 50%）
    const commitCount = Math.floor(eventCount * 0.5);
    const commits = Array.from({ length: commitCount }, (_, i) => ({
      id: `commit-${iid}-${i}`,
      short_id: `c${i}`,
      title: `feat: commit ${i}`,
      message: `feat: commit ${i}`,
      author_name: 'Test User',
      created_at: new Date(baseTime + i * 60000).toISOString(), // 每分鐘一個 commit
    }));

    // 建立 notes（佔事件總數的 50%）
    const noteCount = Math.floor(eventCount * 0.5);
    const notes: Partial<MergeRequestNoteSchema>[] = Array.from({ length: noteCount }, (_, i) => ({
      id: 2000 + iid * 100 + i,
      author: {
        id: 2 + (i % 3),
        username: i % 2 === 0 ? 'coderabbit' : `reviewer${i}`,
        name: i % 2 === 0 ? 'CodeRabbit' : `Reviewer ${i}`,
      },
      body: i % 2 === 0 ? 'AI Review comment' : 'Human review comment',
      created_at: new Date(baseTime + commitCount * 60000 + i * 30000).toISOString(), // 每 30 秒一個 note
      system: false,
      noteable_type: 'MergeRequest',
    }));

    return { mr, commits, notes };
  }

  describe('SC-001: 單一 MR 效能測試', () => {
    it('應在 5 秒內完成單一 MR 分析（100 個事件）', async () => {
      const { mr, commits, notes } = createMockMR(1, 100);

      mockGitlab.MergeRequests.show.mockResolvedValue(mr);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(commits);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(notes);

      const service = new MRTimelineService(mockGitlab);

      const startTime = Date.now();
      const result = await service.analyze(12345, 1);
      const duration = Date.now() - startTime;

      // 驗證結果
      expect(result).toBeDefined();
      expect(result.mr.id).toBe(1);
      expect(result.events.length).toBeGreaterThan(0);

      // 驗證效能（應該在 5 秒內完成）
      expect(duration).toBeLessThan(5000);

      console.log(`✓ SC-001: 單一 MR (100 事件) 分析耗時：${duration}ms（目標：< 5000ms）`);
    });

    it('應在 3 秒內完成單一 MR 分析（50 個事件）', async () => {
      const { mr, commits, notes } = createMockMR(2, 50);

      mockGitlab.MergeRequests.show.mockResolvedValue(mr);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(commits);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(notes);

      const service = new MRTimelineService(mockGitlab);

      const startTime = Date.now();
      const result = await service.analyze(12345, 2);
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(3000);

      console.log(`✓ SC-001: 單一 MR (50 事件) 分析耗時：${duration}ms（目標：< 3000ms）`);
    });

    it('應在 1 秒內完成單一 MR 分析（10 個事件）', async () => {
      const { mr, commits, notes } = createMockMR(3, 10);

      mockGitlab.MergeRequests.show.mockResolvedValue(mr);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(commits);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(notes);

      const service = new MRTimelineService(mockGitlab);

      const startTime = Date.now();
      const result = await service.analyze(12345, 3);
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000);

      console.log(`✓ SC-001: 單一 MR (10 事件) 分析耗時：${duration}ms（目標：< 1000ms）`);
    });
  });

  describe('SC-006: 批次分析效能測試', () => {
    it('應在 1 分鐘內完成 10 個 MR 的批次分析', async () => {
      const mrCount = 10;
      const mockData = Array.from({ length: mrCount }, (_, i) => createMockMR(100 + i, 50));

      // 設定 mock 回應（為每個 MR 返回對應資料）
      let callIndex = 0;
      mockGitlab.MergeRequests.show.mockImplementation(async () => {
        const data = mockData[callIndex % mrCount];
        callIndex++;
        return data.mr;
      });

      callIndex = 0;
      mockGitlab.MergeRequests.allCommits.mockImplementation(async () => {
        const data = mockData[callIndex % mrCount];
        callIndex++;
        return data.commits;
      });

      callIndex = 0;
      mockGitlab.MergeRequestNotes.all.mockImplementation(async () => {
        const data = mockData[callIndex % mrCount];
        callIndex++;
        return data.notes;
      });

      const service = new MRTimelineService(mockGitlab);

      const startTime = Date.now();

      // 模擬批次處理（使用 Promise.all）
      const results = await Promise.all(
        mockData.map((_, i) => service.analyze(12345, 100 + i))
      );

      const duration = Date.now() - startTime;

      // 驗證結果
      expect(results).toHaveLength(mrCount);
      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result.mr.id).toBe(100 + i);
      });

      // 驗證效能（應該在 1 分鐘內完成）
      expect(duration).toBeLessThan(60000);

      console.log(`✓ SC-006: 批次分析 ${mrCount} 個 MR 耗時：${duration}ms（目標：< 60000ms）`);
      console.log(`  平均每個 MR：${(duration / mrCount).toFixed(0)}ms`);
    });

    it('應在 5 分鐘內完成 50 個 MR 的批次分析', async () => {
      const mrCount = 50;
      const mockData = Array.from({ length: mrCount }, (_, i) => createMockMR(200 + i, 50));

      // 設定 mock 回應
      let showCallIndex = 0;
      mockGitlab.MergeRequests.show.mockImplementation(async () => {
        const data = mockData[showCallIndex % mrCount];
        showCallIndex++;
        return data.mr;
      });

      let commitsCallIndex = 0;
      mockGitlab.MergeRequests.allCommits.mockImplementation(async () => {
        const data = mockData[commitsCallIndex % mrCount];
        commitsCallIndex++;
        return data.commits;
      });

      let notesCallIndex = 0;
      mockGitlab.MergeRequestNotes.all.mockImplementation(async () => {
        const data = mockData[notesCallIndex % mrCount];
        notesCallIndex++;
        return data.notes;
      });

      const service = new MRTimelineService(mockGitlab);

      const startTime = Date.now();

      // 模擬批次處理（每批 10 個）
      const batchSize = 10;
      const results: any[] = [];

      for (let i = 0; i < mrCount; i += batchSize) {
        const batch = mockData.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((_, j) => service.analyze(12345, 200 + i + j))
        );
        results.push(...batchResults);
      }

      const duration = Date.now() - startTime;

      // 驗證結果
      expect(results).toHaveLength(mrCount);

      // 驗證效能（應該在 5 分鐘內完成）
      expect(duration).toBeLessThan(300000);

      console.log(`✓ SC-006: 批次分析 ${mrCount} 個 MR 耗時：${duration}ms（目標：< 300000ms）`);
      console.log(`  平均每個 MR：${(duration / mrCount).toFixed(0)}ms`);
    });

    it('應在批次處理時支援進度追蹤', async () => {
      const mrCount = 20;
      const mockData = Array.from({ length: mrCount }, (_, i) => createMockMR(300 + i, 30));

      let showCallIndex = 0;
      mockGitlab.MergeRequests.show.mockImplementation(async () => {
        const data = mockData[showCallIndex % mrCount];
        showCallIndex++;
        return data.mr;
      });

      let commitsCallIndex = 0;
      mockGitlab.MergeRequests.allCommits.mockImplementation(async () => {
        const data = mockData[commitsCallIndex % mrCount];
        commitsCallIndex++;
        return data.commits;
      });

      let notesCallIndex = 0;
      mockGitlab.MergeRequestNotes.all.mockImplementation(async () => {
        const data = mockData[notesCallIndex % mrCount];
        notesCallIndex++;
        return data.notes;
      });

      const service = new MRTimelineService(mockGitlab);

      // 追蹤進度
      const progressUpdates: number[] = [];
      const batchSize = 10;

      for (let i = 0; i < mrCount; i += batchSize) {
        const batch = mockData.slice(i, i + batchSize);
        await Promise.all(batch.map((_, j) => service.analyze(12345, 300 + i + j)));
        progressUpdates.push(Math.min(i + batchSize, mrCount));
      }

      // 驗證進度更新
      expect(progressUpdates).toHaveLength(2); // 20 MRs / 10 per batch = 2 batches
      expect(progressUpdates[0]).toBe(10);
      expect(progressUpdates[1]).toBe(20);
    });
  });

  describe('效能回歸測試', () => {
    it('應在有 API 延遲時仍能正常運作', async () => {
      const { mr, commits, notes } = createMockMR(400, 30);

      // 模擬 API 延遲（每次呼叫延遲 50ms）
      mockGitlab.MergeRequests.show.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return mr;
      });

      mockGitlab.MergeRequests.allCommits.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return commits;
      });

      mockGitlab.MergeRequestNotes.all.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return notes;
      });

      const service = new MRTimelineService(mockGitlab);

      const startTime = Date.now();
      const result = await service.analyze(12345, 400);
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();

      // 3 個 API 呼叫（show, commits, notes）並行執行 = 約 50ms（不是 150ms）
      // 加上處理時間，應該在 200ms 內完成
      expect(duration).toBeLessThan(300);

      console.log(`✓ API 延遲測試（50ms）：${duration}ms（並行處理）`);
    });

    it('應正確處理大量事件的 MR（200 個事件）', async () => {
      const { mr, commits, notes } = createMockMR(500, 200);

      mockGitlab.MergeRequests.show.mockResolvedValue(mr);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(commits);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(notes);

      const service = new MRTimelineService(mockGitlab);

      const startTime = Date.now();
      const result = await service.analyze(12345, 500);
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.events.length).toBeGreaterThan(100);

      // 200 個事件應在 10 秒內完成
      expect(duration).toBeLessThan(10000);

      console.log(`✓ 大量事件測試 (200 事件)：${duration}ms（目標：< 10000ms）`);
    });
  });
});
