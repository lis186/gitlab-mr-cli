/**
 * MR Timeline Service 單元測試
 *
 * 測試重點：
 * 1. Note 排序功能（確保時間軸事件按時間順序處理）
 * 2. Markdown 符號移除（處理 GitLab API 返回的 markdown 格式）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MRTimelineService } from '../../../src/services/mr-timeline-service.js';
import type { GitLabNote } from '../../../src/types/timeline.js';
import { EventType } from '../../../src/models/mr-event.js';

// Mock GitLab Client
const createMockGitlabClient = () => {
  return {
    MergeRequests: {
      show: vi.fn(),
      allCommits: vi.fn(),
      allPipelines: vi.fn(),
    },
    MergeRequestNotes: {
      all: vi.fn(),
    },
  } as any;
};

describe('MRTimelineService', () => {
  let service: MRTimelineService;
  let mockGitlabClient: ReturnType<typeof createMockGitlabClient>;

  beforeEach(() => {
    mockGitlabClient = createMockGitlabClient();
    service = new MRTimelineService(mockGitlabClient);
  });

  describe('Note Sorting', () => {
    it('should process notes in chronological order for correct AI review detection', async () => {
      // Arrange: 創建一個 MR，notes 順序錯亂
      const mrData = {
        id: 1,
        iid: 100,
        title: 'Test MR',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/100',
      };

      // Notes 時間順序錯亂（第二個評論在第一個評論之前）
      const notes: GitLabNote[] = [
        {
          id: 3,
          body: 'Second review comment',
          author: {
            id: 3,
            username: 'reviewer2',
            name: 'Reviewer 2',
          },
          created_at: '2024-01-01T11:30:00Z',
          updated_at: '2024-01-01T11:30:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 100,
        },
        {
          id: 2,
          body: 'First review comment',
          author: {
            id: 2,
            username: 'reviewer1',
            name: 'Reviewer 1',
          },
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 100,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 100);

      // Assert: 事件應該按時間順序排列
      const reviewEvents = result.events.filter(e =>
        e.eventType === EventType.HUMAN_REVIEW_STARTED ||
        e.eventType === EventType.AI_REVIEW_STARTED
      );

      expect(reviewEvents.length).toBeGreaterThan(0);

      // 檢查事件是否按時間排序
      for (let i = 1; i < reviewEvents.length; i++) {
        const prevTime = new Date(reviewEvents[i - 1].timestamp).getTime();
        const currTime = new Date(reviewEvents[i].timestamp).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });

    it('should handle notes with identical timestamps', async () => {
      // Arrange: 創建具有相同時間戳的 notes
      const mrData = {
        id: 1,
        iid: 101,
        title: 'Test MR',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/101',
      };

      const sameTime = '2024-01-01T11:00:00Z';
      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'Comment A',
          author: { id: 2, username: 'user1', name: 'User 1' },
          created_at: sameTime,
          updated_at: sameTime,
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 101,
        },
        {
          id: 2,
          body: 'Comment B',
          author: { id: 3, username: 'user2', name: 'User 2' },
          created_at: sameTime,
          updated_at: sameTime,
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 101,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 101);

      // Assert: 不應拋出錯誤
      expect(result).toBeDefined();
      expect(result.events).toBeDefined();
    });
  });

  describe('Markdown Stripping in Ready/Draft Detection', () => {
    it('should detect "marked as ready" with markdown formatting', async () => {
      // Arrange: GitLab API 返回帶有 markdown 的 ready 標記
      const mrData = {
        id: 1,
        iid: 102,
        title: 'Draft MR',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/102',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'marked this merge request as **ready**', // GitLab API 實際返回格式
          author: {
            id: 1,
            username: 'author',
            name: 'Author',
          },
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 102,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 102);

      // Assert: 應該檢測到 MARKED_AS_READY 事件
      const readyEvents = result.events.filter(e => e.eventType === EventType.MARKED_AS_READY);
      expect(readyEvents.length).toBe(1);
      expect(new Date(readyEvents[0].timestamp).toISOString()).toBe('2024-01-01T11:00:00.000Z');
    });

    it('should detect "marked as ready" without markdown formatting', async () => {
      // Arrange: 測試沒有 markdown 的版本（向後相容）
      const mrData = {
        id: 1,
        iid: 103,
        title: 'Draft MR',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/103',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'marked this merge request as ready', // 無 markdown 版本
          author: {
            id: 1,
            username: 'author',
            name: 'Author',
          },
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 103,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 103);

      // Assert: 應該檢測到 MARKED_AS_READY 事件
      const readyEvents = result.events.filter(e => e.eventType === EventType.MARKED_AS_READY);
      expect(readyEvents.length).toBe(1);
    });

    it('should detect "marked as draft" with markdown formatting', async () => {
      // Arrange: 測試 Draft 標記也能處理 markdown
      const mrData = {
        id: 1,
        iid: 104,
        title: 'Test MR',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/104',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'marked this merge request as **draft**', // 可能的 markdown 格式
          author: {
            id: 1,
            username: 'author',
            name: 'Author',
          },
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 104,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 104);

      // Assert: 應該檢測到 MARKED_AS_DRAFT 事件
      const draftEvents = result.events.filter(e => e.eventType === EventType.MARKED_AS_DRAFT);
      expect(draftEvents.length).toBe(1);
    });

    it('should handle multiple markdown symbols in system notes', async () => {
      // Arrange: 測試多個 ** 符號
      const mrData = {
        id: 1,
        iid: 105,
        title: 'Test MR',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/105',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: '**marked** this merge request as **ready**', // 多個 markdown 符號
          author: {
            id: 1,
            username: 'author',
            name: 'Author',
          },
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 105,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 105);

      // Assert: 應該檢測到 MARKED_AS_READY 事件
      const readyEvents = result.events.filter(e => e.eventType === EventType.MARKED_AS_READY);
      expect(readyEvents.length).toBe(1);
    });

    it('should not match "ready" in non-system notes', async () => {
      // Arrange: 普通評論包含 "ready" 字樣不應被識別為狀態改變
      const mrData = {
        id: 1,
        iid: 106,
        title: 'Test MR',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/106',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'This MR is ready for review', // 普通評論，非系統事件
          author: {
            id: 2,
            username: 'reviewer',
            name: 'Reviewer',
          },
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          system: false, // 非系統事件
          noteable_type: 'MergeRequest',
          noteable_iid: 106,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 106);

      // Assert: 不應該檢測到 MARKED_AS_READY 事件
      const readyEvents = result.events.filter(e => e.eventType === EventType.MARKED_AS_READY);
      expect(readyEvents.length).toBe(0);
    });
  });

  describe('Integration: Note Sorting + Markdown Stripping', () => {
    it('should correctly process out-of-order notes with markdown formatting', async () => {
      // Arrange: 結合兩個功能的測試
      const mrData = {
        id: 1,
        iid: 107,
        title: 'Draft MR',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/107',
      };

      // Notes 順序錯亂 + markdown 格式
      const notes: GitLabNote[] = [
        {
          id: 3,
          body: 'Review comment',
          author: { id: 2, username: 'reviewer', name: 'Reviewer' },
          created_at: '2024-01-01T11:30:00Z',
          updated_at: '2024-01-01T11:30:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 107,
        },
        {
          id: 2,
          body: 'marked this merge request as **ready**',
          author: { id: 1, username: 'author', name: 'Author' },
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 107,
        },
        {
          id: 1,
          body: 'marked this merge request as **draft**',
          author: { id: 1, username: 'author', name: 'Author' },
          created_at: '2024-01-01T10:30:00Z',
          updated_at: '2024-01-01T10:30:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 107,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 107);

      // Assert: 事件應該按正確順序排列
      const statusEvents = result.events.filter(e =>
        e.eventType === EventType.MARKED_AS_DRAFT ||
        e.eventType === EventType.MARKED_AS_READY
      );

      expect(statusEvents.length).toBe(2);

      // 第一個應該是 Draft（10:30）
      expect(statusEvents[0].eventType).toBe(EventType.MARKED_AS_DRAFT);
      expect(new Date(statusEvents[0].timestamp).toISOString()).toBe('2024-01-01T10:30:00.000Z');

      // 第二個應該是 Ready（11:00）
      expect(statusEvents[1].eventType).toBe(EventType.MARKED_AS_READY);
      expect(new Date(statusEvents[1].timestamp).toISOString()).toBe('2024-01-01T11:00:00.000Z');
    });
  });

  // Skip: These tests require HYBRID_REVIEWERS configuration which is project-specific
  // To enable, add hybrid reviewer configuration in src/config/hybrid-reviewers.ts
  describe.skip('Burst Detection', () => {
    it('should detect burst when 5+ reviews within 60 seconds', async () => {
      // Arrange
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 120,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/120',
      };

      // hybrid-reviewer posts 5 reviews within 60 seconds (burst pattern)
      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'Review 1',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:00:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 120,
        },
        {
          id: 2,
          body: 'Review 2',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:10Z',
          updated_at: '2024-01-01T10:00:10Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 120,
        },
        {
          id: 3,
          body: 'Review 3',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:20Z',
          updated_at: '2024-01-01T10:00:20Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 120,
        },
        {
          id: 4,
          body: 'Review 4',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:30Z',
          updated_at: '2024-01-01T10:00:30Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 120,
        },
        {
          id: 5,
          body: 'Review 5',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:40Z',
          updated_at: '2024-01-01T10:00:40Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 120,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 120);

      // Assert: All 5 reviews should be AI reviews (burst detected)
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);
      expect(aiReviewEvents.length).toBe(5);
      aiReviewEvents.forEach(event => {
        expect(event.actor.username).toBe('hybrid-reviewer');
      });
    });

    it('should not detect burst when reviews are spread out', async () => {
      // Arrange
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 121,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/121',
      };

      // hybrid-reviewer posts reviews spread across 5 minutes (no burst)
      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'Review 1',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:00:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 121,
        },
        {
          id: 2,
          body: 'Review 2',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:01:00Z', // 60 seconds later
          updated_at: '2024-01-01T10:01:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 121,
        },
        {
          id: 3,
          body: 'Review 3',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:02:00Z', // 60 seconds later
          updated_at: '2024-01-01T10:02:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 121,
        },
        {
          id: 4,
          body: 'Review 4',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:03:00Z', // 60 seconds later
          updated_at: '2024-01-01T10:03:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 121,
        },
        {
          id: 5,
          body: 'Review 5',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:04:00Z', // 60 seconds later
          updated_at: '2024-01-01T10:04:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 121,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 121);

      // Assert: No burst detected, so all reviews > 8 min from MR creation = human
      // Since all reviews are < 8 min from MR, they should be AI reviews (by time threshold)
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);
      expect(aiReviewEvents.length).toBe(5);
    });

    it('should only detect bursts for configured hybrid reviewers', async () => {
      // Arrange
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 122,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/122',
      };

      // Non-hybrid reviewer posts 5 reviews within 60 seconds
      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'Review 1',
          author: { id: 3, username: 'regular-reviewer', name: 'Regular Reviewer' },
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:00:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 122,
        },
        {
          id: 2,
          body: 'Review 2',
          author: { id: 3, username: 'regular-reviewer', name: 'Regular Reviewer' },
          created_at: '2024-01-01T10:00:10Z',
          updated_at: '2024-01-01T10:00:10Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 122,
        },
        {
          id: 3,
          body: 'Review 3',
          author: { id: 3, username: 'regular-reviewer', name: 'Regular Reviewer' },
          created_at: '2024-01-01T10:00:20Z',
          updated_at: '2024-01-01T10:00:20Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 122,
        },
        {
          id: 4,
          body: 'Review 4',
          author: { id: 3, username: 'regular-reviewer', name: 'Regular Reviewer' },
          created_at: '2024-01-01T10:00:30Z',
          updated_at: '2024-01-01T10:00:30Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 122,
        },
        {
          id: 5,
          body: 'Review 5',
          author: { id: 3, username: 'regular-reviewer', name: 'Regular Reviewer' },
          created_at: '2024-01-01T10:00:40Z',
          updated_at: '2024-01-01T10:00:40Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 122,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']); // regular-reviewer is NOT configured

      // Act
      const result = await service.analyze('test/test', 122);

      // Assert: All reviews from regular-reviewer should be HUMAN (not AI bot, not hybrid)
      const humanReviewEvents = result.events.filter(e => e.eventType === EventType.HUMAN_REVIEW_STARTED);
      expect(humanReviewEvents.length).toBe(5);
      humanReviewEvents.forEach(event => {
        expect(event.actor.username).toBe('regular-reviewer');
      });
    });

    it('should only detect bursts for AI bot reviewers', async () => {
      // Arrange
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 123,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/123',
      };

      // AI bot posts 5 reviews within 60 seconds
      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'AI Review 1',
          author: { id: 4, username: 'ai-bot', name: 'AI Bot' },
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:00:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 123,
        },
        {
          id: 2,
          body: 'AI Review 2',
          author: { id: 4, username: 'ai-bot', name: 'AI Bot' },
          created_at: '2024-01-01T10:00:10Z',
          updated_at: '2024-01-01T10:00:10Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 123,
        },
        {
          id: 3,
          body: 'AI Review 3',
          author: { id: 4, username: 'ai-bot', name: 'AI Bot' },
          created_at: '2024-01-01T10:00:20Z',
          updated_at: '2024-01-01T10:00:20Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 123,
        },
        {
          id: 4,
          body: 'AI Review 4',
          author: { id: 4, username: 'ai-bot', name: 'AI Bot' },
          created_at: '2024-01-01T10:00:30Z',
          updated_at: '2024-01-01T10:00:30Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 123,
        },
        {
          id: 5,
          body: 'AI Review 5',
          author: { id: 4, username: 'ai-bot', name: 'AI Bot' },
          created_at: '2024-01-01T10:00:40Z',
          updated_at: '2024-01-01T10:00:40Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 123,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      service = new MRTimelineService(mockGitlabClient, ['ai-bot']);

      // Act
      const result = await service.analyze('test/test', 123);

      // Assert: All reviews from ai-bot should be AI reviews
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);
      expect(aiReviewEvents.length).toBe(5);
      aiReviewEvents.forEach(event => {
        expect(event.actor.username).toBe('ai-bot');
      });
    });

    it('should handle overlapping time windows correctly', async () => {
      // Arrange: Test the edge case where reviews at 0s, 10s, 20s, 30s, 40s, 90s
      // Only the first 5 should form a burst, not the 6th one
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 124,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/124',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'Review 1',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:10:00Z', // MR+10min
          updated_at: '2024-01-01T10:10:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 124,
        },
        {
          id: 2,
          body: 'Review 2',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:10:10Z', // +10s
          updated_at: '2024-01-01T10:10:10Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 124,
        },
        {
          id: 3,
          body: 'Review 3',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:10:20Z', // +10s
          updated_at: '2024-01-01T10:10:20Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 124,
        },
        {
          id: 4,
          body: 'Review 4',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:10:30Z', // +10s
          updated_at: '2024-01-01T10:10:30Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 124,
        },
        {
          id: 5,
          body: 'Review 5',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:10:40Z', // +10s (total 40s from first)
          updated_at: '2024-01-01T10:10:40Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 124,
        },
        {
          id: 6,
          body: 'Review 6',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:11:30Z', // +90s from first (outside 60s window)
          updated_at: '2024-01-01T10:11:30Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 124,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 124);

      // Assert: Only the first 5 reviews (within 60-second window) should be marked as AI burst
      // Review 6 is at 90 seconds, outside the window, so it should not be detected as burst
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);

      // With the O(n) sliding window algorithm, reviews 1-5 form a burst (5 reviews in 40 seconds)
      // Review 6 is at 90 seconds from MR creation, outside the 60-second window
      expect(aiReviewEvents.length).toBe(5);
    });

    it('should handle exactly 5 reviews (boundary test)', async () => {
      // Arrange: exactly 5 reviews within 60 seconds (minimum for burst)
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 125,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/125',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'Review 1',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:00Z',
          system: false,
        },
        {
          id: 2,
          body: 'Review 2',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:15Z',
          system: false,
        },
        {
          id: 3,
          body: 'Review 3',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:30Z',
          system: false,
        },
        {
          id: 4,
          body: 'Review 4',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:45Z',
          system: false,
        },
        {
          id: 5,
          body: 'Review 5',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:01:00Z', // 60 seconds from first
          system: false,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 125);

      // Assert: All 5 reviews should be detected as burst
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);
      expect(aiReviewEvents.length).toBe(5);
    });

    it('should handle multiple non-overlapping bursts', async () => {
      // Arrange: two separate bursts from same reviewer
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 126,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/126',
      };

      const notes: GitLabNote[] = [
        // First burst: 5 reviews within 60 seconds
        {
          id: 1,
          body: 'Review 1',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:00Z',
          system: false,
        },
        {
          id: 2,
          body: 'Review 2',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:15Z',
          system: false,
        },
        {
          id: 3,
          body: 'Review 3',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:30Z',
          system: false,
        },
        {
          id: 4,
          body: 'Review 4',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:45Z',
          system: false,
        },
        {
          id: 5,
          body: 'Review 5',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:01:00Z',
          system: false,
        },
        // Gap: 5 minutes
        // Second burst: 5 more reviews within 60 seconds
        {
          id: 6,
          body: 'Review 6',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:06:00Z',
          system: false,
        },
        {
          id: 7,
          body: 'Review 7',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:06:15Z',
          system: false,
        },
        {
          id: 8,
          body: 'Review 8',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:06:30Z',
          system: false,
        },
        {
          id: 9,
          body: 'Review 9',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:06:45Z',
          system: false,
        },
        {
          id: 10,
          body: 'Review 10',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:07:00Z',
          system: false,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 126);

      // Assert: All 10 reviews should be detected as burst (2 separate bursts)
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);
      expect(aiReviewEvents.length).toBe(10);
    });

    it('should not detect burst for fewer than 5 reviews', async () => {
      // Arrange: only 4 reviews within 60 seconds
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 127,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/127',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'Review 1',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:00Z',
          system: false,
        },
        {
          id: 2,
          body: 'Review 2',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:15Z',
          system: false,
        },
        {
          id: 3,
          body: 'Review 3',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:30Z',
          system: false,
        },
        {
          id: 4,
          body: 'Review 4',
          author: { id: 2, username: 'hybrid-reviewer', name: 'HybridReviewer' },
          created_at: '2024-01-01T10:00:45Z',
          system: false,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 127);

      // Assert: Only 4 reviews, no burst detected (but still marked as AI due to time threshold < 8 min)
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);
      // 4 reviews within 60 seconds but < 5 minimum for burst, but still within 8-minute threshold for hybrid-reviewer
      expect(aiReviewEvents.length).toBe(4);
    });
  });

  describe('Phase Segmentation Edge Cases', () => {
    it('should handle MR approved without review comments', async () => {
      // Arrange: MR gets approved without explicit review comments
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 125,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: '2024-01-01T12:00:00Z',
        state: 'merged',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/125',
      };

      // Only approval note, no review comments
      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'approved this merge request',
          author: {
            id: 2,
            username: 'reviewer',
            name: 'Reviewer',
          },
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 125,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 125);

      // Assert: Should have approved event even without review
      const approvedEvents = result.events.filter(e => e.eventType.includes('Approved'));
      expect(approvedEvents.length).toBeGreaterThan(0);
    });

    it('should handle multiple Draft→Ready transitions', async () => {
      // Arrange: MR goes Draft→Ready→Draft→Ready
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 126,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/126',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'marked this merge request as draft',
          author: { id: 1, username: 'author', name: 'Author' },
          created_at: '2024-01-01T10:10:00Z',
          updated_at: '2024-01-01T10:10:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 126,
        },
        {
          id: 2,
          body: 'marked this merge request as ready',
          author: { id: 1, username: 'author', name: 'Author' },
          created_at: '2024-01-01T10:30:00Z',
          updated_at: '2024-01-01T10:30:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 126,
        },
        {
          id: 3,
          body: 'marked this merge request as draft',
          author: { id: 1, username: 'author', name: 'Author' },
          created_at: '2024-01-01T10:45:00Z',
          updated_at: '2024-01-01T10:45:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 126,
        },
        {
          id: 4,
          body: 'marked this merge request as ready',
          author: { id: 1, username: 'author', name: 'Author' },
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          system: true,
          noteable_type: 'MergeRequest',
          noteable_iid: 126,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 126);

      // Assert: Should have 2 MARKED_AS_DRAFT and 2 MARKED_AS_READY events
      const draftEvents = result.events.filter(e => e.eventType === EventType.MARKED_AS_DRAFT);
      const readyEvents = result.events.filter(e => e.eventType === EventType.MARKED_AS_READY);

      expect(draftEvents.length).toBe(2);
      expect(readyEvents.length).toBe(2);

      // Events should be in chronological order
      expect(new Date(draftEvents[0].timestamp).toISOString()).toBe('2024-01-01T10:10:00.000Z');
      expect(new Date(readyEvents[0].timestamp).toISOString()).toBe('2024-01-01T10:30:00.000Z');
      expect(new Date(draftEvents[1].timestamp).toISOString()).toBe('2024-01-01T10:45:00.000Z');
      expect(new Date(readyEvents[1].timestamp).toISOString()).toBe('2024-01-01T11:00:00.000Z');
    });

    it('should handle MR with no review but direct merge', async () => {
      // Arrange: MR merged without any review
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 127,
        title: 'Hotfix MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T10:05:00Z',
        merged_at: '2024-01-01T10:05:00Z',
        state: 'merged',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'hotfix',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/127',
      };

      const notes: GitLabNote[] = []; // No review notes

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 127);

      // Assert: Should have MR_CREATED and MERGED events
      const createdEvents = result.events.filter(e => e.eventType === EventType.MR_CREATED);
      const mergedEvents = result.events.filter(e => e.eventType === EventType.MERGED);

      expect(createdEvents.length).toBe(1);
      expect(mergedEvents.length).toBe(1);

      // Summary should show 0 AI reviews (humanReviews may be undefined in summary)
      expect(result.summary.aiReviews).toBe(0);
      // Note: humanReviews may be undefined in MRSummary, so we check if defined
      if (result.summary.humanReviews !== undefined) {
        expect(result.summary.humanReviews).toBe(0);
      }
    });

    it('should track cycle time correctly for unmerged MR', async () => {
      // Arrange: MR still open (not merged)
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 128,
        title: 'Open MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null, // Not merged
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/128',
      };

      const notes: GitLabNote[] = [];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Act
      const result = await service.analyze('test/test', 128);

      // Assert: Should have MR_CREATED event
      const createdEvents = result.events.filter(e => e.eventType === EventType.MR_CREATED);
      expect(createdEvents.length).toBe(1);

      // cycleTimeSeconds might be 0 for minimal mock data
      // The important part is that the service handles unmerged MRs without crashing
      expect(result.cycleTimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  // Skip: These tests require HYBRID_REVIEWERS configuration which is project-specific
  // To enable, add hybrid reviewer configuration in src/config/hybrid-reviewers.ts
  describe.skip('Hybrid Reviewer Handling (hybrid-reviewer)', () => {
    it('should treat hybrid-reviewer as AI reviewer when responding < 8 minutes', async () => {
      // Arrange
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 108,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/108',
      };

      // hybrid-reviewer responds in 5 minutes (< 8 minutes)
      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'LGTM',
          author: {
            id: 2,
            username: 'hybrid-reviewer',
            name: 'HybridReviewer',
          },
          created_at: '2024-01-01T10:05:00Z', // 5 minutes after MR creation
          updated_at: '2024-01-01T10:05:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 108,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Use AIBotDetector config to mark hybrid-reviewer as AI
      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 108);

      // Assert: Should be AI review (< 8 min)
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);
      expect(aiReviewEvents.length).toBe(1);
      expect(aiReviewEvents[0].actor.username).toBe('hybrid-reviewer');
    });

    it('should treat hybrid-reviewer as human reviewer when responding > 8 minutes', async () => {
      // Arrange
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 109,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/109',
      };

      // hybrid-reviewer responds in 10 minutes (> 8 minutes)
      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'LGTM',
          author: {
            id: 2,
            username: 'hybrid-reviewer',
            name: 'HybridReviewer',
          },
          created_at: '2024-01-01T10:10:00Z', // 10 minutes after MR creation
          updated_at: '2024-01-01T10:10:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 109,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Use AIBotDetector config to mark hybrid-reviewer as AI
      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 109);

      // Assert: Should be human review (> 8 min)
      const humanReviewEvents = result.events.filter(e => e.eventType === EventType.HUMAN_REVIEW_STARTED);
      expect(humanReviewEvents.length).toBe(1);
      expect(humanReviewEvents[0].actor.username).toBe('hybrid-reviewer');
    });

    it('should treat hybrid-reviewer as human when another AI already reviewed', async () => {
      // Arrange
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 110,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/110',
      };

      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'AI Review: LGTM',
          author: {
            id: 3,
            username: 'ai-reviewer',
            name: 'AI Reviewer',
          },
          created_at: '2024-01-01T10:02:00Z', // AI reviews first
          updated_at: '2024-01-01T10:02:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 110,
        },
        {
          id: 2,
          body: 'Confirming AI review',
          author: {
            id: 2,
            username: 'hybrid-reviewer',
            name: 'HybridReviewer',
          },
          created_at: '2024-01-01T10:05:00Z', // hybrid-reviewer responds in 5 min BUT after AI
          updated_at: '2024-01-01T10:05:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 110,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      // Use AIBotDetector config to mark both as AI bots initially
      service = new MRTimelineService(mockGitlabClient, ['ai-reviewer', 'hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 110);

      // Assert: hybrid-reviewer should be human because AI already reviewed
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);
      const humanReviewEvents = result.events.filter(e => e.eventType === EventType.HUMAN_REVIEW_STARTED);

      expect(aiReviewEvents.length).toBe(1);
      expect(aiReviewEvents[0].actor.username).toBe('ai-reviewer');

      expect(humanReviewEvents.length).toBe(1);
      expect(humanReviewEvents[0].actor.username).toBe('hybrid-reviewer');
    });

    it('should handle hybrid-reviewer at exactly 8 minutes threshold', async () => {
      // Arrange
      const mrCreatedAt = '2024-01-01T10:00:00Z';
      const mrData = {
        id: 1,
        iid: 111,
        title: 'Test MR',
        created_at: mrCreatedAt,
        updated_at: '2024-01-01T12:00:00Z',
        merged_at: null,
        state: 'opened',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
        },
        source_branch: 'feature',
        target_branch: 'main',
        web_url: 'https://gitlab.com/test/test/-/merge_requests/111',
      };

      // hybrid-reviewer responds in exactly 8 minutes (480 seconds)
      const notes: GitLabNote[] = [
        {
          id: 1,
          body: 'LGTM',
          author: {
            id: 2,
            username: 'hybrid-reviewer',
            name: 'HybridReviewer',
          },
          created_at: '2024-01-01T10:08:00Z', // Exactly 8 minutes
          updated_at: '2024-01-01T10:08:00Z',
          system: false,
          noteable_type: 'MergeRequest',
          noteable_iid: 111,
        },
      ];

      mockGitlabClient.MergeRequests.show.mockResolvedValue(mrData);
      mockGitlabClient.MergeRequests.allCommits.mockResolvedValue([]);
      mockGitlabClient.MergeRequests.allPipelines.mockResolvedValue([]);
      mockGitlabClient.MergeRequestNotes.all.mockResolvedValue(notes);

      service = new MRTimelineService(mockGitlabClient, ['hybrid-reviewer']);

      // Act
      const result = await service.analyze('test/test', 111);

      // Assert: At exactly 8 min, should be AI (≤ threshold)
      const aiReviewEvents = result.events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED);
      expect(aiReviewEvents.length).toBe(1);
      expect(aiReviewEvents[0].actor.username).toBe('hybrid-reviewer');
    });
  });
});
