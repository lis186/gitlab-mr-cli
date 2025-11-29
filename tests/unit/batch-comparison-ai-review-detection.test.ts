/**
 * Batch Comparison AI Review Detection Unit Tests
 *
 * 測試 AI Review 檢測邏輯
 * 對應 Code Review 提出的測試缺口
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchComparisonService } from '../../src/services/batch-comparison-service.js';
import { MRTimelineService } from '../../src/services/mr-timeline-service.js';
import type { MRTimeline } from '../../src/types/timeline.js';

// Mock the MRTimelineService module
vi.mock('../../src/services/mr-timeline-service.js');

describe('Batch Comparison - AI Review Detection', () => {
  let mockGitlabClient: any;
  let service: BatchComparisonService;
  let mockTimelineService: any;

  beforeEach(() => {
    mockGitlabClient = {
      MergeRequests: {
        show: vi.fn().mockResolvedValue({
          iid: 1,
          title: 'Test MR',
          author: { name: 'Test Author', username: 'testauthor' },
          created_at: '2024-01-01T00:00:00Z',
          merged_at: '2024-01-02T00:00:00Z',
          changes_count: 5,
        }),
        changes: vi.fn().mockResolvedValue([]),
        allCommits: vi.fn().mockResolvedValue([]),
        allPipelines: vi.fn().mockResolvedValue([]),
        allDiffs: vi.fn().mockResolvedValue([]),
      },
      MergeRequestNotes: {
        all: vi.fn().mockResolvedValue([]),
      },
      Pipelines: {
        all: vi.fn().mockResolvedValue([]),
      },
    };

    // Create a mock timeline service with an analyze method
    mockTimelineService = {
      analyze: vi.fn(),
    };

    // Mock the MRTimelineService constructor
    vi.mocked(MRTimelineService).mockImplementation(() => mockTimelineService);

    service = new BatchComparisonService(mockGitlabClient);
  });

  /**
   * Helper function to create a minimal MRTimeline object for testing
   */
  function createMockTimeline(
    aiReviews: number | undefined,
    segments: Array<{ from: string; to: string; durationSeconds: number }>
  ): MRTimeline {
    // Convert simple segment objects to full TimeSegment objects with timestamps
    const fullSegments = segments.map((seg, index) => {
      const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
      const fromTime = baseTime + (index * 3600 * 1000);  // Each segment starts 1 hour after previous
      const toTime = fromTime + (seg.durationSeconds * 1000);

      return {
        from: seg.from as any,  // KeyState enum value
        to: seg.to as any,
        fromEvent: {
          sequence: index * 2,
          timestamp: new Date(fromTime),
          actor: { id: 1, username: 'testuser', name: 'Test User', role: 'Author' as any, isAIBot: false },
          eventType: 'MR Created' as any,
        },
        toEvent: {
          sequence: index * 2 + 1,
          timestamp: new Date(toTime),
          actor: { id: 1, username: 'testuser', name: 'Test User', role: 'Author' as any, isAIBot: false },
          eventType: 'MR Created' as any,
        },
        durationSeconds: seg.durationSeconds,
        percentage: (seg.durationSeconds / 86400) * 100,
      };
    });

    return {
      mr: {
        id: 1,
        projectId: 123,
        title: 'Test MR',
        isDraft: false,
        author: {
          id: 1,
          username: 'testauthor',
          name: 'Test Author',
          role: 'Author',
          isAIBot: false,
        },
        createdAt: new Date('2024-01-01T00:00:00Z'),
        mergedAt: new Date('2024-01-02T00:00:00Z'),
        sourceBranch: 'feature-branch',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/test/repo/-/merge_requests/1',
        changesCount: 5,
      },
      summary: {
        commits: 3,
        humanComments: 5,
        aiReviews: aiReviews,
        reviewers: [],
        approvals: 1,
        totalEvents: 3,
        systemEvents: 0,
        contributors: [],
      },
      segments: fullSegments,
      phaseSegments: [],  // Add missing phaseSegments field
      events: [],
      cycleTimeSeconds: 86400,
    };
  }

  describe('detectAIReview - AI Reviews Count', () => {
    it('should detect AI review when aiReviews > 0', async () => {
      const mockTimeline = createMockTimeline(1, []);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      const result = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      const row = result.rows[0];
      expect(row?.reviewStats.hasAIReview).toBe(true);
      expect(row?.reviewStats.aiReviewStatus).toBe('yes');
    });

    it('should not detect AI review when aiReviews = 0 explicitly', async () => {
      const mockTimeline = createMockTimeline(0, []);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      const result = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      const row = result.rows[0];
      expect(row?.reviewStats.hasAIReview).toBe(false);
      expect(row?.reviewStats.aiReviewStatus).toBe('no');
    });

    it('should handle undefined aiReviews (use nullish coalescing)', async () => {
      const mockTimeline = createMockTimeline(undefined, []);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      const result = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      const row = result.rows[0];
      expect(row?.reviewStats.hasAIReview).toBe(false);
      expect(row?.reviewStats.aiReviewStatus).toBe('no');
    });
  });

  describe('detectAIReview - First AI Review Events', () => {
    it('should NOT detect AI review when only "First AI Review" event exists (summary.aiReviews = 0)', async () => {
      // 修改測試：現在只依賴 summary.aiReviews，不再使用 segments 檢查
      // 這個案例代表：AI Review 發生在合併後（已被過濾），但 segment 仍包含該事件
      const mockTimeline = createMockTimeline(0, [
        { from: 'MR Created', to: 'First AI Review', durationSeconds: 3600 },
        { from: 'First AI Review', to: 'First Human Review', durationSeconds: 7200 },
      ]);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      const result = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      const row = result.rows[0];
      // 因為 summary.aiReviews = 0（合併後的 AI Review 已被過濾），所以 hasAIReview = false
      expect(row?.reviewStats.hasAIReview).toBe(false);
      expect(row?.reviewStats.aiReviewStatus).toBe('no');
    });

    it('should not detect AI review when no "First AI Review" event', async () => {
      const mockTimeline = createMockTimeline(0, [
        { from: 'MR Created', to: 'First Human Review', durationSeconds: 3600 },
      ]);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      const result = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      const row = result.rows[0];
      expect(row?.reviewStats.hasAIReview).toBe(false);
      expect(row?.reviewStats.aiReviewStatus).toBe('no');
    });
  });

  describe('detectAIReview - Combined Detection', () => {
    it('should detect AI review with both indicators (aiReviews > 0 AND event)', async () => {
      const mockTimeline = createMockTimeline(2, [
        { from: 'MR Created', to: 'First AI Review', durationSeconds: 3600 },
      ]);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      const result = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      const row = result.rows[0];
      expect(row?.reviewStats.hasAIReview).toBe(true);
      expect(row?.reviewStats.aiReviewStatus).toBe('yes');
    });

    it('should only detect AI review when summary.aiReviews > 0 (不再使用 OR 邏輯)', async () => {
      // Case 1: Only aiReviews → 應該檢測到 AI Review
      const mockTimeline1 = createMockTimeline(1, [
        { from: 'MR Created', to: 'First Human Review', durationSeconds: 3600 },
      ]);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline1);

      const result1 = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      const row1 = result1.rows[0];
      expect(row1?.reviewStats.hasAIReview).toBe(true);
      expect(row1?.reviewStats.aiReviewStatus).toBe('yes');

      // Case 2: Only event (summary.aiReviews = 0) → 不應檢測到 AI Review
      // 這代表 AI Review 發生在合併後，已被過濾
      const mockTimeline2 = createMockTimeline(0, [
        { from: 'MR Created', to: 'First AI Review', durationSeconds: 3600 },
      ]);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline2);

      const result2 = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      const row2 = result2.rows[0];
      // 修改預期：現在不再使用 OR 邏輯，只依賴 summary.aiReviews
      expect(row2?.reviewStats.hasAIReview).toBe(false);
      expect(row2?.reviewStats.aiReviewStatus).toBe('no');
    });

    it('should not detect AI review when neither indicator is present', async () => {
      const mockTimeline = createMockTimeline(0, [
        { from: 'MR Created', to: 'First Human Review', durationSeconds: 3600 },
      ]);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      const result = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      const row = result.rows[0];
      expect(row?.reviewStats.hasAIReview).toBe(false);
      expect(row?.reviewStats.aiReviewStatus).toBe('no');
    });
  });

  describe('detectAIReview - includePostMergeReviews Flag (P1)', () => {
    it('should detect AI review when flag is enabled and only segment event exists', async () => {
      // 測試 includePostMergeReviews = true 時，會使用 OR 邏輯檢查
      // Case: AI Review 發生在合併後（summary.aiReviews = 0），但 segment 包含事件
      const mockTimeline = createMockTimeline(0, [
        { from: 'MR Created', to: 'Merged', durationSeconds: 3600 },
        { from: 'Merged', to: 'First AI Review', durationSeconds: 7200 },
      ]);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      const result = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
        includePostMergeReviews: true,  // 啟用 flag
      });

      const row = result.rows[0];
      expect(row?.reviewStats.hasAIReview).toBe(true);   // 應該檢測到（使用 OR 邏輯）
      expect(row?.reviewStats.aiReviewStatus).toBe('yes');
    });

    it('should NOT detect AI review when flag is disabled (default) and only segment event exists', async () => {
      // 測試 includePostMergeReviews = false（預設）時，只檢查 summary.aiReviews
      const mockTimeline = createMockTimeline(0, [
        { from: 'MR Created', to: 'Merged', durationSeconds: 3600 },
        { from: 'Merged', to: 'First AI Review', durationSeconds: 7200 },
      ]);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      const result = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
        // includePostMergeReviews 預設為 false
      });

      const row = result.rows[0];
      expect(row?.reviewStats.hasAIReview).toBe(false);  // 不應檢測到（預設行為）
      expect(row?.reviewStats.aiReviewStatus).toBe('no');
    });

    it('should always detect AI review when summary.aiReviews > 0 regardless of flag', async () => {
      // 測試當 summary.aiReviews > 0 時，不論 flag 設定都應該檢測到
      const mockTimeline = createMockTimeline(2, [
        { from: 'MR Created', to: 'First AI Review', durationSeconds: 3600 },
      ]);
      mockTimelineService.analyze.mockResolvedValue(mockTimeline);

      // Case 1: flag = false (預設)
      const result1 = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
      });

      expect(result1.rows[0]?.reviewStats.hasAIReview).toBe(true);

      // Case 2: flag = true
      const result2 = await service.analyze({
        projectId: 'test/project',
        mrIids: [1],
        includePostMergeReviews: true,
      });

      expect(result2.rows[0]?.reviewStats.hasAIReview).toBe(true);
    });
  });
});
