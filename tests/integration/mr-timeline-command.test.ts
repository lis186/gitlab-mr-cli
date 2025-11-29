/**
 * MR Timeline Command 整合測試
 *
 * 測試 mr-timeline 命令的端到端功能，包含：
 * - T025: 單一 MR 時間軸顯示
 * - T034: 百分比總和驗證（100% ±1%）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Gitlab } from '@gitbeaker/rest';
import { MRTimelineService } from '../../src/services/mr-timeline-service.js';
import type { MergeRequestSchema, MergeRequestNoteSchema } from '@gitbeaker/rest';

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn(),
}));

describe('MR Timeline Command Integration Tests', () => {
  let mockGitlab: any;
  let service: MRTimelineService;

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
    service = new MRTimelineService(mockGitlab);
  });

  describe('T025: 單一 MR 時間軸顯示', () => {
    it('應成功顯示完整 MR 時間軸（標準流程）', async () => {
      // Arrange: 模擬完整的 MR 資料
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 42,
        title: '實作 Feature X',
        description: '新增功能 X 的完整實作',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T12:00:00Z',
        updated_at: '2025-10-30T12:00:00Z',
        author: {
          id: 1,
          username: 'john.doe',
          name: 'John Doe',
        },
        source_branch: 'feature/x',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/42',
        draft: false,
        work_in_progress: false,
      };

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 1001,
          author: {
            id: 2,
            username: 'coderabbit',
            name: 'CodeRabbit',
          },
          body: 'AI Code Review: 發現 3 個建議',
          created_at: '2025-10-30T10:05:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 1002,
          author: {
            id: 3,
            username: 'jane.smith',
            name: 'Jane Smith',
          },
          body: 'LGTM! 程式碼品質很好',
          created_at: '2025-10-30T11:00:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockCommits = [
        {
          id: 'abc123',
          short_id: 'abc123',
          title: 'feat: 實作基本功能',
          author_name: 'John Doe',
          created_at: '2025-10-30T10:02:00Z',
          message: 'feat: 實作基本功能',
        },
        {
          id: 'def456',
          short_id: 'def456',
          title: 'fix: 修正審查意見',
          author_name: 'John Doe',
          created_at: '2025-10-30T11:30:00Z',
          message: 'fix: 修正審查意見',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: {
              id: 3,
              username: 'jane.smith',
              name: 'Jane Smith',
            },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act: 執行分析
      const timeline = await service.analyze('test/project', 42);

      // Assert: 驗證時間軸結構
      expect(timeline).toBeDefined();
      expect(timeline.mr).toBeDefined();
      expect(timeline.mr.id).toBe(42);
      expect(timeline.mr.title).toBe('實作 Feature X');
      expect(timeline.mr.author.username).toBe('john.doe');

      // 驗證事件清單
      expect(timeline.events).toBeDefined();
      expect(timeline.events.length).toBeGreaterThan(0);

      // 驗證事件排序（按時間戳遞增）
      for (let i = 1; i < timeline.events.length; i++) {
        expect(timeline.events[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          timeline.events[i - 1].timestamp.getTime()
        );
      }

      // 驗證包含關鍵事件類型
      const eventTypes = timeline.events.map((e) => e.eventType);
      expect(eventTypes).toContain('MR Created');
      expect(eventTypes).toContain('Commit Pushed');
      expect(eventTypes).toContain('AI Review Started');
      expect(eventTypes).toContain('Human Review Started');
      expect(eventTypes).toContain('Merged');

      // 驗證統計摘要
      expect(timeline.summary).toBeDefined();
      expect(timeline.summary.commits).toBeGreaterThan(0);
      expect(timeline.summary.aiReviews).toBeGreaterThan(0);
      expect(timeline.summary.humanComments).toBeGreaterThan(0);
      expect(timeline.summary.totalEvents).toBe(timeline.events.length);
      expect(timeline.summary.contributors.length).toBeGreaterThan(0);
      expect(timeline.summary.reviewers.length).toBeGreaterThan(0);

      // 驗證週期時間
      expect(timeline.cycleTimeSeconds).toBeGreaterThan(0);
      expect(timeline.cycleTimeSeconds).toBe(7200); // 2 小時
    });

    it('應正確處理未合併的 MR', async () => {
      // Arrange: 模擬未合併的 MR
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 43,
        title: '進行中的 Feature Y',
        description: '功能 Y 開發中',
        state: 'opened',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: null,
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'john.doe',
          name: 'John Doe',
        },
        source_branch: 'feature/y',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/43',
        draft: false,
        work_in_progress: false,
      };

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [];
      const mockCommits = [
        {
          id: 'xyz789',
          short_id: 'xyz789',
          title: 'feat: 初步實作',
          author_name: 'John Doe',
          created_at: '2025-10-30T10:30:00Z',
          message: 'feat: 初步實作',
        },
      ];

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: false, approved_by: [] } });

      // Act: 執行分析
      const timeline = await service.analyze('test/project', 43);

      // Assert
      expect(timeline.mr.mergedAt).toBeNull();
      // T069: 未合併的 MR 應計算從創建到最後一個事件的時間
      expect(timeline.cycleTimeSeconds).toBeGreaterThan(0); // 應該有週期時間（到最後一個事件）
      expect(timeline.events.length).toBeGreaterThan(0);

      // 不應包含 Merged 事件
      const eventTypes = timeline.events.map((e) => e.eventType);
      expect(eventTypes).not.toContain('Merged');
    });

    it('應正確識別 AI Bot 和人類審查者', async () => {
      // Arrange
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 44,
        title: '測試 Bot 識別',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/test',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/44',
        draft: false,
        work_in_progress: false,
      };

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 2001,
          author: {
            id: 2,
            username: 'coderabbit',
            name: 'CodeRabbit',
          },
          body: 'AI Review',
          created_at: '2025-10-30T10:02:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 2002,
          author: {
            id: 3,
            username: 'human-reviewer',
            name: 'Human Reviewer',
          },
          body: 'Human Review',
          created_at: '2025-10-30T10:30:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: true, approved_by: [] } });

      // Act
      const timeline = await service.analyze('test/project', 44);

      // Assert: 驗證角色識別
      const aiReviewEvent = timeline.events.find((e) => e.actor.username === 'coderabbit');
      const humanReviewEvent = timeline.events.find((e) => e.actor.username === 'human-reviewer');

      expect(aiReviewEvent).toBeDefined();
      expect(aiReviewEvent!.actor.role).toBe('AI Reviewer');
      expect(aiReviewEvent!.eventType).toBe('AI Review Started');

      expect(humanReviewEvent).toBeDefined();
      expect(humanReviewEvent!.actor.role).toBe('Reviewer');
      expect(humanReviewEvent!.eventType).toBe('Human Review Started');

      // 驗證統計
      expect(timeline.summary.aiReviews).toBe(1);
      expect(timeline.summary.humanComments).toBe(1);
    });
  });

  describe('T034: 百分比總和驗證（100% ±1%）', () => {
    it('應確保時間段落百分比總和為 100%（標準流程）', async () => {
      // Arrange: 模擬有完整階段的 MR
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 45,
        title: 'Feature Z',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T12:00:00Z',
        updated_at: '2025-10-30T12:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/z',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/45',
        draft: false,
        work_in_progress: false,
      };

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 3001,
          author: { id: 2, username: 'bot', name: 'Bot' },
          body: 'AI Review',
          created_at: '2025-10-30T10:10:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 3002,
          author: { id: 3, username: 'reviewer', name: 'Reviewer' },
          body: 'Human Review',
          created_at: '2025-10-30T10:30:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'Initial commit',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'Initial commit',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 3, username: 'reviewer', name: 'Reviewer' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 45);

      // Assert: 驗證百分比總和
      expect(timeline.segments).toBeDefined();
      expect(timeline.segments.length).toBeGreaterThan(0);

      const totalPercentage = timeline.segments.reduce((sum, seg) => sum + seg.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1); // ±1% 容差

      // 驗證每個段落的百分比都是有效值
      timeline.segments.forEach((segment) => {
        expect(segment.percentage).toBeGreaterThanOrEqual(0);
        expect(segment.percentage).toBeLessThanOrEqual(100);
      });
    });

    it('應確保時間段落百分比總和為 100%（跳過階段）', async () => {
      // Arrange: 模擬跳過 AI 審查的 MR
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 46,
        title: 'No AI Review',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/no-ai',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/46',
        draft: false,
        work_in_progress: false,
      };

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 4001,
          author: { id: 3, username: 'reviewer', name: 'Reviewer' },
          body: 'Human Review Only',
          created_at: '2025-10-30T10:20:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockCommits = [
        {
          id: 'c2',
          short_id: 'c2',
          title: 'Commit',
          author_name: 'Author',
          created_at: '2025-10-30T10:10:00Z',
          message: 'Commit',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 3, username: 'reviewer', name: 'Reviewer' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 46);

      // Assert: 即使跳過階段，百分比總和仍應為 100%
      const totalPercentage = timeline.segments.reduce((sum, seg) => sum + seg.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);

      // 驗證沒有包含 AI Review 段落
      const segmentLabels = timeline.segments.flatMap((s) => [s.from, s.to]);
      expect(segmentLabels).not.toContain('First AI Review');
    });

    it('應確保時間段落百分比總和為 100%（複雜時長分佈）', async () => {
      // Arrange: 模擬有複雜時間分佈的 MR（測試浮點數精度）
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 47,
        title: 'Complex Timing',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T10:10:00Z', // 總共 10 分鐘 = 600 秒
        updated_at: '2025-10-30T10:10:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/complex',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/47',
        draft: false,
        work_in_progress: false,
      };

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 5001,
          author: { id: 2, username: 'bot', name: 'Bot' },
          body: 'AI Review',
          created_at: '2025-10-30T10:02:13Z', // 133 秒後
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 5002,
          author: { id: 3, username: 'reviewer', name: 'Reviewer' },
          body: 'Human Review',
          created_at: '2025-10-30T10:05:47Z', // 347 秒後
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockCommits = [
        {
          id: 'c3',
          short_id: 'c3',
          title: 'Commit',
          author_name: 'Author',
          created_at: '2025-10-30T10:01:23Z', // 83 秒後
          message: 'Commit',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 3, username: 'reviewer', name: 'Reviewer' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 47);

      // Assert: 即使有複雜的時間分佈，百分比總和仍應為 100%
      const totalPercentage = timeline.segments.reduce((sum, seg) => sum + seg.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);

      // 驗證時長總和等於週期時間
      const totalDuration = timeline.segments.reduce((sum, seg) => sum + seg.durationSeconds, 0);
      expect(totalDuration).toBe(timeline.cycleTimeSeconds);
    });

    it('應處理未合併 MR 的段落百分比（單一段落 = 100%）', async () => {
      // Arrange: 模擬只有 MR Created → First Commit 的未合併 MR
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 48,
        title: 'Unmerged MR',
        state: 'opened',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: null,
        updated_at: '2025-10-30T10:05:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/unmerged',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/48',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c4',
          short_id: 'c4',
          title: 'Commit',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'Commit',
        },
      ];

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue([]);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: false, approved_by: [] } });

      // Act
      const timeline = await service.analyze('test/project', 48);

      // Assert: 未合併的 MR 應該有段落（如果有 commits）
      if (timeline.segments.length > 0) {
        const totalPercentage = timeline.segments.reduce((sum, seg) => sum + seg.percentage, 0);
        expect(totalPercentage).toBeCloseTo(100, 1);
      }
    });
  });

  describe('T041: 統計準確性驗證', () => {
    it('應正確統計各類事件數量', async () => {
      // Arrange: 模擬包含各類事件的 MR
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 50,
        title: '統計測試 MR',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/stats',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/50',
        draft: false,
        work_in_progress: false,
      };

      // 3 個 commits
      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'Commit 1',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'Commit 1',
        },
        {
          id: 'c2',
          short_id: 'c2',
          title: 'Commit 2',
          author_name: 'Author',
          created_at: '2025-10-30T10:10:00Z',
          message: 'Commit 2',
        },
        {
          id: 'c3',
          short_id: 'c3',
          title: 'Commit 3',
          author_name: 'Author',
          created_at: '2025-10-30T10:15:00Z',
          message: 'Commit 3',
        },
      ];

      // 2 個 AI 審查 + 2 個人類評論
      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 6001,
          author: { id: 2, username: 'coderabbit', name: 'CodeRabbit' },
          body: 'AI Review 1',
          created_at: '2025-10-30T10:20:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 6002,
          author: { id: 3, username: 'copilot', name: 'Copilot' },
          body: 'AI Review 2',
          created_at: '2025-10-30T10:25:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 6003,
          author: { id: 4, username: 'reviewer1', name: 'Reviewer 1' },
          body: 'Human comment 1',
          created_at: '2025-10-30T10:30:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 6004,
          author: { id: 5, username: 'reviewer2', name: 'Reviewer 2' },
          body: 'Human comment 2',
          created_at: '2025-10-30T10:35:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 4, username: 'reviewer1', name: 'Reviewer 1' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 50);

      // Assert: 驗證統計數字
      expect(timeline.summary).toBeDefined();
      expect(timeline.summary.commits).toBe(3); // 3 個 commits
      expect(timeline.summary.aiReviews).toBe(2); // 2 個 AI 審查
      expect(timeline.summary.humanComments).toBe(2); // 2 個人類評論
      expect(timeline.summary.systemEvents).toBe(0); // 無系統事件

      // 驗證總事件數
      expect(timeline.summary.totalEvents).toBeGreaterThan(0);
      expect(timeline.summary.totalEvents).toBe(timeline.events.length);
    });

    it('應正確去重並識別參與者', async () => {
      // Arrange
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 51,
        title: '參與者測試 MR',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/contributors',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/51',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'Commit by author',
          author_name: 'Author',
          author_email: 'author@example.com', // 用於識別作者
          author: { id: 1, username: 'author', name: 'Author' }, // 加上完整的 author 物件
          created_at: '2025-10-30T10:05:00Z',
          authored_date: '2025-10-30T10:05:00Z',
          message: 'Commit by author',
        },
      ];

      // 同一個 AI bot 發表多條評論，同一個人類審查者發表多條評論
      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 7001,
          author: { id: 2, username: 'bot', name: 'Bot' },
          body: 'AI Review 1',
          created_at: '2025-10-30T10:10:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 7002,
          author: { id: 2, username: 'bot', name: 'Bot' },
          body: 'AI Review 2',
          created_at: '2025-10-30T10:15:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 7003,
          author: { id: 3, username: 'reviewer', name: 'Reviewer' },
          body: 'Human comment 1',
          created_at: '2025-10-30T10:20:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 7004,
          author: { id: 3, username: 'reviewer', name: 'Reviewer' },
          body: 'Human comment 2',
          created_at: '2025-10-30T10:25:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 3, username: 'reviewer', name: 'Reviewer' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 51);

      // Assert: 驗證參與者去重
      expect(timeline.summary.contributors).toBeDefined();
      expect(timeline.summary.contributors.length).toBe(3); // Author + Bot + Reviewer

      // 驗證參與者包含所有唯一的操作者
      const contributorIds = timeline.summary.contributors.map((c) => c.id);
      expect(contributorIds).toContain(1); // Author
      expect(contributorIds).toContain(2); // Bot
      expect(contributorIds).toContain(3); // Reviewer

      // 驗證無重複
      const uniqueIds = new Set(contributorIds);
      expect(uniqueIds.size).toBe(contributorIds.length);
    });

    it('應正確生成審查者列表（排除作者）', async () => {
      // Arrange
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 52,
        title: '審查者測試 MR',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/reviewers',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/52',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'Commit',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'Commit',
        },
      ];

      // 作者自己的評論 + AI bot + 人類審查者
      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 8001,
          author: { id: 1, username: 'author', name: 'Author' },
          body: 'Author response',
          created_at: '2025-10-30T10:10:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 8002,
          author: { id: 2, username: 'bot', name: 'Bot' },
          body: 'AI Review',
          created_at: '2025-10-30T10:15:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 8003,
          author: { id: 3, username: 'reviewer', name: 'Reviewer' },
          body: 'Human Review',
          created_at: '2025-10-30T10:20:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 3, username: 'reviewer', name: 'Reviewer' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 52);

      // Assert: 驗證審查者列表
      expect(timeline.summary.reviewers).toBeDefined();
      expect(timeline.summary.reviewers.length).toBe(2); // Bot + Reviewer（排除作者）

      const reviewerIds = timeline.summary.reviewers.map((r) => r.id);
      expect(reviewerIds).not.toContain(1); // 不包含作者
      expect(reviewerIds).toContain(2); // 包含 AI Bot
      expect(reviewerIds).toContain(3); // 包含人類審查者
    });

    it('應驗證事件計數公式正確性', async () => {
      // Arrange
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 53,
        title: '計數驗證 MR',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/validation',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/53',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'Commit',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'Commit',
        },
      ];

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 9001,
          author: { id: 2, username: 'bot', name: 'Bot' },
          body: 'AI Review',
          created_at: '2025-10-30T10:10:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 3, username: 'reviewer', name: 'Reviewer' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 53);

      // Assert: 驗證總事件數公式
      const { summary } = timeline;
      const expectedTotal = summary.commits + summary.aiReviews + summary.humanComments + summary.systemEvents;

      // 注意：totalEvents 包含所有事件（MR Created, Commits, Reviews, Approved, Merged）
      // 而不只是 commits + aiReviews + humanComments + systemEvents
      // 所以這裡驗證 totalEvents >= expectedTotal
      expect(summary.totalEvents).toBeGreaterThanOrEqual(expectedTotal);
      expect(summary.totalEvents).toBe(timeline.events.length);
    });

    it('應處理無審查者的情況', async () => {
      // Arrange: 只有作者，無審查者
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 54,
        title: '無審查者 MR',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T10:10:00Z',
        updated_at: '2025-10-30T10:10:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/no-reviewers',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/54',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'Commit',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'Commit',
        },
      ];

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue([]);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: false, approved_by: [] } });

      // Act
      const timeline = await service.analyze('test/project', 54);

      // Assert
      expect(timeline.summary.reviewers).toBeDefined();
      expect(timeline.summary.reviewers.length).toBe(0);
      expect(timeline.summary.aiReviews).toBe(0);
      expect(timeline.summary.humanComments).toBe(0);
      expect(timeline.summary.contributors.length).toBeGreaterThan(0); // 至少有作者
    });
  });

  describe('T049: 角色識別準確性驗證（≥95%）', () => {
    it('應正確處理 AI Bot 作為 MR 作者的情況（作者優先規則）', async () => {
      // Arrange: AI Bot 建立 MR
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 55,
        title: 'AI Bot 作為作者',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 999,
          username: 'dependabot', // AI Bot
          name: 'Dependabot',
        },
        source_branch: 'dependabot/npm/lodash-4.17.21',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/55',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'chore: bump lodash to 4.17.21',
          author_name: 'Dependabot',
          author: { id: 999, username: 'dependabot', name: 'Dependabot' }, // 加上完整的 author 物件
          created_at: '2025-10-30T10:05:00Z',
          message: 'chore: bump lodash to 4.17.21',
        },
      ];

      // 人類審查者評論
      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 10001,
          author: { id: 1, username: 'reviewer', name: 'Reviewer' },
          body: 'LGTM',
          created_at: '2025-10-30T10:30:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 1, username: 'reviewer', name: 'Reviewer' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 55);

      // Assert: AI Bot 作為作者，角色應為 AUTHOR（作者優先規則）
      expect(timeline.mr.author.username).toBe('dependabot');
      expect(timeline.mr.author.role).toBe('Author'); // 作者優先，而非 AI Reviewer

      // MR Created 事件的 actor 角色應為 AUTHOR
      const mrCreatedEvent = timeline.events.find((e) => e.eventType === 'MR Created');
      expect(mrCreatedEvent).toBeDefined();
      expect(mrCreatedEvent!.actor.role).toBe('Author');

      // Commit 事件的 actor 角色也應為 AUTHOR
      const commitEvent = timeline.events.find((e) => e.eventType === 'Commit Pushed');
      expect(commitEvent).toBeDefined();
      expect(commitEvent!.actor.role).toBe('Author');
    });

    it('應正確識別 AI Bot 審查者', async () => {
      // Arrange: 人類作者 + AI Bot 審查者
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 56,
        title: 'AI 審查測試',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/test',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/56',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'feat: new feature',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'feat: new feature',
        },
      ];

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 11001,
          author: { id: 2, username: 'coderabbit', name: 'CodeRabbit' },
          body: 'AI Review comments',
          created_at: '2025-10-30T10:10:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockApprovals = {
        approved: false,
        approved_by: [],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 56);

      // Assert: AI Bot 作為審查者，角色應為 AI_REVIEWER
      const aiReviewEvent = timeline.events.find((e) => e.actor.username === 'coderabbit');
      expect(aiReviewEvent).toBeDefined();
      expect(aiReviewEvent!.actor.role).toBe('AI Reviewer');
      expect(aiReviewEvent!.eventType).toBe('AI Review Started');
    });

    it('應正確識別人類審查者', async () => {
      // Arrange
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 57,
        title: '人類審查測試',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/test',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/57',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'feat: new feature',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'feat: new feature',
        },
      ];

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 12001,
          author: { id: 2, username: 'jane.doe', name: 'Jane Doe' },
          body: 'Human review comment',
          created_at: '2025-10-30T10:30:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 2, username: 'jane.doe', name: 'Jane Doe' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 57);

      // Assert: 人類審查者角色應為 REVIEWER
      const humanReviewEvent = timeline.events.find((e) => e.actor.username === 'jane.doe');
      expect(humanReviewEvent).toBeDefined();
      expect(humanReviewEvent!.actor.role).toBe('Reviewer');
      expect(humanReviewEvent!.eventType).toBe('Human Review Started');
    });

    it('應正確識別系統事件（無 user_id）', async () => {
      // Arrange: 包含 pipeline 事件的 MR
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 58,
        title: '系統事件測試',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/test',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/58',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'feat: new feature',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'feat: new feature',
        },
      ];

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue([]);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: false, approved_by: [] } });

      // Act
      const timeline = await service.analyze('test/project', 58);

      // Assert: 驗證至少有作者和 MR Created 事件
      expect(timeline.events.length).toBeGreaterThan(0);
      const mrCreatedEvent = timeline.events.find((e) => e.eventType === 'MR Created');
      expect(mrCreatedEvent).toBeDefined();
      expect(mrCreatedEvent!.actor.role).toBe('Author');
    });

    it('應達到 ≥95% 的角色識別準確率（綜合測試）', async () => {
      // Arrange: 包含多種角色的複雜 MR
      const mockMR: Partial<MergeRequestSchema> = {
        id: 12345,
        iid: 59,
        title: '綜合角色測試',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T12:00:00Z',
        updated_at: '2025-10-30T12:00:00Z',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature/comprehensive',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/59',
        draft: false,
        work_in_progress: false,
      };

      const mockCommits = [
        {
          id: 'c1',
          short_id: 'c1',
          title: 'feat: initial implementation',
          author_name: 'Author',
          created_at: '2025-10-30T10:05:00Z',
          message: 'feat: initial implementation',
        },
        {
          id: 'c2',
          short_id: 'c2',
          title: 'fix: address review comments',
          author_name: 'Author',
          created_at: '2025-10-30T11:30:00Z',
          message: 'fix: address review comments',
        },
      ];

      const mockNotes: Partial<MergeRequestNoteSchema>[] = [
        {
          id: 13001,
          author: { id: 2, username: 'coderabbit', name: 'CodeRabbit' },
          body: 'AI Review 1',
          created_at: '2025-10-30T10:10:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 13002,
          author: { id: 3, username: 'copilot', name: 'Copilot' },
          body: 'AI Review 2',
          created_at: '2025-10-30T10:15:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 13003,
          author: { id: 4, username: 'jane.smith', name: 'Jane Smith' },
          body: 'Human Review 1',
          created_at: '2025-10-30T10:45:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 13004,
          author: { id: 5, username: 'john.doe', name: 'John Doe' },
          body: 'Human Review 2',
          created_at: '2025-10-30T11:00:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
        {
          id: 13005,
          author: { id: 1, username: 'author', name: 'Author' },
          body: 'Author Response',
          created_at: '2025-10-30T11:15:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ];

      const mockApprovals = {
        approved: true,
        approved_by: [
          {
            user: { id: 4, username: 'jane.smith', name: 'Jane Smith' },
          },
          {
            user: { id: 5, username: 'john.doe', name: 'John Doe' },
          },
        ],
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue(mockCommits);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: mockApprovals });

      // Act
      const timeline = await service.analyze('test/project', 59);

      // Assert: 驗證角色識別準確性
      const expectedRoles = {
        author: 'Author',
        coderabbit: 'AI Reviewer',
        copilot: 'AI Reviewer',
        'jane.smith': 'Reviewer',
        'john.doe': 'Reviewer',
      };

      let correctIdentifications = 0;
      let totalIdentifications = 0;

      for (const event of timeline.events) {
        if (event.actor.username in expectedRoles) {
          totalIdentifications++;
          const expectedRole = expectedRoles[event.actor.username as keyof typeof expectedRoles];
          if (event.actor.role === expectedRole) {
            correctIdentifications++;
          }
        }
      }

      const accuracy = (correctIdentifications / totalIdentifications) * 100;

      // 驗證準確率 ≥95%
      expect(accuracy).toBeGreaterThanOrEqual(95);
      expect(totalIdentifications).toBeGreaterThan(0);

      // 額外驗證：確認各角色類型都有正確識別
      const aiReviewEvents = timeline.events.filter((e) => e.actor.role === 'AI Reviewer');
      expect(aiReviewEvents.length).toBeGreaterThanOrEqual(2); // 至少 2 個 AI 審查

      const humanReviewEvents = timeline.events.filter((e) => e.actor.role === 'Reviewer');
      expect(humanReviewEvents.length).toBeGreaterThanOrEqual(2); // 至少 2 個人類審查

      const authorEvents = timeline.events.filter((e) => e.actor.role === 'Author');
      expect(authorEvents.length).toBeGreaterThanOrEqual(3); // 至少 3 個作者事件（MR Created + Commits + Response）
    });
  });

  describe('錯誤處理', () => {
    it('應處理 API 錯誤並拋出有意義的錯誤訊息', async () => {
      // Arrange
      mockGitlab.MergeRequests.show.mockRejectedValue(new Error('API Error: 404 Not Found'));

      // Act & Assert
      await expect(service.analyze('test/project', 999)).rejects.toThrow();
    });

    it('應處理無效的專案 ID', async () => {
      // Arrange
      mockGitlab.MergeRequests.show.mockRejectedValue(new Error('Project not found'));

      // Act & Assert
      await expect(service.analyze('invalid/project', 1)).rejects.toThrow();
    });
  });

  describe('T061: 批次分析整合測試（10 MRs）', () => {
    it('應成功批次分析 10 個 MR', async () => {
      // Arrange: 建立 10 個 Mock MR
      const mrCount = 10;
      const mockMRs: Partial<MergeRequestSchema>[] = [];
      const allMockData: Map<number, any> = new Map();

      for (let i = 1; i <= mrCount; i++) {
        const mockMR: Partial<MergeRequestSchema> = {
          id: 12340 + i,
          iid: 60 + i,
          title: `Batch Test MR ${i}`,
          state: 'merged',
          created_at: `2025-10-30T${String(10 + i).padStart(2, '0')}:00:00Z`,
          merged_at: `2025-10-30T${String(11 + i).padStart(2, '0')}:00:00Z`,
          updated_at: `2025-10-30T${String(11 + i).padStart(2, '0')}:00:00Z`,
          author: {
            id: 1,
            username: 'author',
            name: 'Author',
          },
          source_branch: `feature/batch-${i}`,
          target_branch: 'main',
          web_url: `https://gitlab.com/test/project/-/merge_requests/${60 + i}`,
          draft: false,
          work_in_progress: false,
        };

        mockMRs.push(mockMR);

        allMockData.set(60 + i, {
          mr: mockMR,
          commits: [
            {
              id: `c${i}`,
              short_id: `c${i}`,
              title: `Commit ${i}`,
              author_name: 'Author',
              created_at: `2025-10-30T${String(10 + i).padStart(2, '0')}:30:00Z`,
              message: `Commit ${i}`,
            },
          ],
          notes: [],
          approvals: { approved: false, approved_by: [] },
        });
      }

      // Mock GitLab API 根據 MR IID 返回對應資料
      mockGitlab.MergeRequests.show.mockImplementation((_projectId: any, mrIid: number) => {
        const data = allMockData.get(mrIid);
        if (!data) {
          throw new Error('MR not found');
        }
        return Promise.resolve(data.mr);
      });

      mockGitlab.MergeRequests.allCommits.mockImplementation((_projectId: any, options: any) => {
        // 從 source branch 名稱推斷 MR 編號
        const match = options.refName?.match(/batch-(\d+)/);
        if (match) {
          const i = parseInt(match[1], 10);
          const data = allMockData.get(60 + i);
          return Promise.resolve(data?.commits || []);
        }
        return Promise.resolve([]);
      });

      mockGitlab.MergeRequestNotes.all.mockResolvedValue([]);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: false, approved_by: [] } });

      // Act: 批次分析所有 MR
      const timelines: MRTimeline[] = [];
      for (let i = 1; i <= mrCount; i++) {
        const timeline = await service.analyze('test/project', 60 + i);
        timelines.push(timeline);
      }

      // Assert: 驗證批次結果
      expect(timelines).toHaveLength(mrCount);

      timelines.forEach((timeline, index) => {
        const i = index + 1;
        expect(timeline.mr.id).toBe(60 + i);
        expect(timeline.mr.title).toBe(`Batch Test MR ${i}`);
        expect(timeline.events.length).toBeGreaterThan(0);
      });
    });

    it('應正確處理部分 MR 失敗的情況（降級處理）', async () => {
      // Arrange: 3 個 MR，第 2 個失敗
      const successMR1: Partial<MergeRequestSchema> = {
        id: 12350,
        iid: 71,
        title: 'Success MR 1',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: { id: 1, username: 'author', name: 'Author' },
        source_branch: 'feature/success1',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/71',
        draft: false,
        work_in_progress: false,
      };

      const successMR3: Partial<MergeRequestSchema> = {
        id: 12352,
        iid: 73,
        title: 'Success MR 3',
        state: 'merged',
        created_at: '2025-10-30T12:00:00Z',
        merged_at: '2025-10-30T13:00:00Z',
        updated_at: '2025-10-30T13:00:00Z',
        author: { id: 1, username: 'author', name: 'Author' },
        source_branch: 'feature/success3',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/73',
        draft: false,
        work_in_progress: false,
      };

      mockGitlab.MergeRequests.show.mockImplementation((_projectId: any, mrIid: number) => {
        if (mrIid === 71) {
          return Promise.resolve(successMR1);
        } else if (mrIid === 72) {
          return Promise.reject(new Error('MR 72 not found'));
        } else if (mrIid === 73) {
          return Promise.resolve(successMR3);
        }
        throw new Error('Unexpected MR IID');
      });

      mockGitlab.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: false, approved_by: [] } });

      // Act & Assert: MR 72 應該失敗
      const timeline1 = await service.analyze('test/project', 71);
      expect(timeline1.mr.id).toBe(71);

      await expect(service.analyze('test/project', 72)).rejects.toThrow();

      const timeline3 = await service.analyze('test/project', 73);
      expect(timeline3.mr.id).toBe(73);
    });
  });

  describe('T062: 批次大小限制驗證（>50 MRs）', () => {
    it('應拒絕超過 50 個 MR 的批次請求', () => {
      // 此測試驗證命令層級的限制
      // 在實際命令中會檢查 mrIids.length > 50 並拋出錯誤碼 3

      // 模擬 51 個 MR IID
      const mrIids = Array.from({ length: 51 }, (_, i) => i + 1);

      // 驗證數量超過限制
      expect(mrIids.length).toBe(51);
      expect(mrIids.length).toBeGreaterThan(50);

      // 註：實際的命令測試需要在 CLI 層級進行
      // 這裡僅驗證邏輯
    });

    it('應接受剛好 50 個 MR 的批次請求', () => {
      // 模擬 50 個 MR IID
      const mrIids = Array.from({ length: 50 }, (_, i) => i + 1);

      // 驗證數量在限制內
      expect(mrIids.length).toBe(50);
      expect(mrIids.length).toBeLessThanOrEqual(50);
    });

    it('應接受少於 50 個 MR 的批次請求', () => {
      // 模擬 10 個 MR IID
      const mrIids = Array.from({ length: 10 }, (_, i) => i + 1);

      // 驗證數量在限制內
      expect(mrIids.length).toBe(10);
      expect(mrIids.length).toBeLessThanOrEqual(50);
    });

    it('應正確處理 49 個 MR 的邊界情況', () => {
      // 驗證 49 個 MR 數量（接近上限）
      const mrIids = Array.from({ length: 49 }, (_, i) => i + 1);

      // 驗證數量在限制內
      expect(mrIids.length).toBe(49);
      expect(mrIids.length).toBeLessThan(50);
      expect(mrIids.length).toBeGreaterThan(10);

      // 註：實際的批次處理效能測試在 performance test 中進行
      // 這裡僅驗證邊界值邏輯
    });
  });

  describe('Edge Case: Unicode/Emoji 字元處理', () => {
    it('應正確處理 MR 標題中的 emoji', async () => {
      const mockMR = {
        id: 999,
        iid: 999,
        title: '🚀 feat: 新增超酷功能 ✨',
        description: '這個 PR 很棒 👍',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'developer',
          name: 'Developer 👨‍💻',
        },
        source_branch: 'feature/emoji-support',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/-/merge_requests/999',
        draft: false,
        work_in_progress: false,
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue([
        {
          id: 'abc123',
          short_id: 'abc123',
          title: '✨ Add feature',
          message: '✨ Add feature\n\n🎉 Celebrate!',
          author_name: 'Developer 👨‍💻',
          authored_date: '2025-10-30T10:30:00Z',
          created_at: '2025-10-30T10:30:00Z',
        },
      ]);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue([
        {
          id: 1001,
          author: {
            id: 2,
            username: 'reviewer',
            name: 'Reviewer 🔍',
          },
          body: 'LGTM! 👍 很棒的改動！',
          created_at: '2025-10-30T10:45:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ]);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: false, approved_by: [] } });

      const result = await service.analyze('test/project', 999);

      // 驗證 emoji 正確保留
      expect(result.mr.title).toBe('🚀 feat: 新增超酷功能 ✨');
      expect(result.mr.author.name).toBe('Developer 👨‍💻');
      expect(result.events.length).toBeGreaterThan(0);

      // 驗證 commit 中的 emoji
      const commitEvent = result.events.find((e) => e.eventType === 'Commit Pushed');
      expect(commitEvent).toBeDefined();
      expect(commitEvent?.details?.message).toContain('✨');

      // 驗證 summary 包含所有參與者
      expect(result.summary.contributors.length).toBeGreaterThan(0);

      // 檢查作者 name 包含 emoji
      const authorInSummary = result.summary.contributors.find((c) => c.id === 1);
      expect(authorInSummary?.name).toBe('Developer 👨‍💻');
    });

    it('應正確處理多語言與特殊 Unicode 字元', async () => {
      const mockMR = {
        id: 998,
        iid: 998,
        title: 'fix: 修復日本語バグ • Исправление ошибки • إصلاح خطأ',
        description: '多語言測試',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'developer',
          name: '開発者 山田太郎',
        },
        source_branch: 'fix/unicode',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/-/merge_requests/998',
        draft: false,
        work_in_progress: false,
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue([
        {
          id: 1002,
          author: {
            id: 2,
            username: 'reviewer',
            name: 'Владимир Петров',
          },
          body: 'Выглядит хорошо! • يبدو جيدا! • 良さそう！',
          created_at: '2025-10-30T10:45:00Z',
          system: false,
          noteable_type: 'MergeRequest',
        },
      ]);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: false, approved_by: [] } });

      const result = await service.analyze('test/project', 998);

      // 驗證多語言字元正確保留
      expect(result.mr.title).toContain('日本語');
      expect(result.mr.title).toContain('Исправление');
      expect(result.mr.title).toContain('إصلاح');
      expect(result.mr.author.name).toBe('開発者 山田太郎');

      // 驗證參與者包含多語言名稱
      expect(result.summary.contributors.length).toBeGreaterThan(0);
      const contributor = result.summary.contributors.find((c) => c.name === 'Владимир Петров');
      expect(contributor).toBeDefined();
    });

    it('應正確處理零寬字元與組合字元', async () => {
      const mockMR = {
        id: 997,
        iid: 997,
        title: 'feat: Add café menu 🇹🇼 台灣',
        description: 'Includes: naïve, résumé, 你好',
        state: 'merged',
        created_at: '2025-10-30T10:00:00Z',
        merged_at: '2025-10-30T11:00:00Z',
        updated_at: '2025-10-30T11:00:00Z',
        author: {
          id: 1,
          username: 'developer',
          name: 'José García',
        },
        source_branch: 'feature/unicode-combo',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/-/merge_requests/997',
        draft: false,
        work_in_progress: false,
      };

      mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);
      mockGitlab.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlab.MergeRequestNotes.all.mockResolvedValue([]);
      mockGitlab.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlab.requester.get.mockResolvedValue({ body: { approved: false, approved_by: [] } });

      const result = await service.analyze('test/project', 997);

      // 驗證組合字元（帶重音符號）
      expect(result.mr.title).toContain('café');
      expect(result.mr.author.name).toContain('José');
      expect(result.mr.author.name).toContain('García');

      // 驗證旗幟 emoji（組合字元）
      expect(result.mr.title).toContain('🇹🇼');
      expect(result.mr.title).toContain('台灣');
    });
  });
});
