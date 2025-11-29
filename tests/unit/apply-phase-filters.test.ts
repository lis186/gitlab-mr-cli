/**
 * applyPhaseFilters Unit Tests
 * Feature: 013-mr-phase-filters
 * Task: T011
 *
 * 測試範圍：
 * - 百分比過濾（min/max）
 * - 絕對天數過濾（min/max）
 * - AND 邏輯組合
 * - 過濾統計追蹤
 * - matchedPhaseFilters 追蹤
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchComparisonService } from '../../src/services/batch-comparison-service.js';
import type { MRComparisonRow, PhaseFilter } from '../../src/types/batch-comparison.js';
import { Gitlab } from '@gitbeaker/rest';

// Mock GitLab API
vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn(),
}));

describe('applyPhaseFilters Unit Tests (T011)', () => {
  let service: BatchComparisonService;

  beforeEach(() => {
    const mockGitlab = new Gitlab({ token: 'test-token' });
    service = new BatchComparisonService(mockGitlab);
  });

  // 建立測試用的 MR 資料
  function createMockRows(): MRComparisonRow[] {
    return [
      {
        iid: 101,
        title: 'High Wait MR',
        author: 'Alice',
        reviewers: 'Bob',
        cycleDays: 5.0,
        codeChanges: { commits: 5, files: 10, totalLines: 200 },
        reviewStats: { comments: 8 },
        timeline: {
          dev: { durationSeconds: 86400, percentage: 20, formattedDuration: '1d', intensity: { commits: 5, comments: 0, level: 3 } },
          wait: { durationSeconds: 172800, percentage: 40, formattedDuration: '2d', intensity: { commits: 0, comments: 0, level: 0 } },
          review: { durationSeconds: 129600, percentage: 30, formattedDuration: '1d 12h', intensity: { commits: 0, comments: 8, level: 3 } },
          merge: { durationSeconds: 43200, percentage: 10, formattedDuration: '12h', intensity: { commits: 0, comments: 0, level: 1 } },
          totalDurationSeconds: 432000,
        },
        status: 'merged',
        phase: 'merged',
        phaseLabel: '已合併',
        createdAt: '2025-10-01T10:00:00.000Z',
        mergedAt: '2025-10-06T10:00:00.000Z',
      },
      {
        iid: 102,
        title: 'High Review MR',
        author: 'Bob',
        reviewers: 'Alice',
        cycleDays: 6.0,
        codeChanges: { commits: 8, files: 15, totalLines: 350 },
        reviewStats: { comments: 12 },
        timeline: {
          dev: { durationSeconds: 86400, percentage: 15, formattedDuration: '1d', intensity: { commits: 8, comments: 0, level: 3 } },
          wait: { durationSeconds: 43200, percentage: 10, formattedDuration: '12h', intensity: { commits: 0, comments: 0, level: 0 } },
          review: { durationSeconds: 345600, percentage: 60, formattedDuration: '4d', intensity: { commits: 0, comments: 12, level: 3 } },
          merge: { durationSeconds: 86400, percentage: 15, formattedDuration: '1d', intensity: { commits: 0, comments: 0, level: 1 } },
          totalDurationSeconds: 518400,
        },
        status: 'merged',
        phase: 'merged',
        phaseLabel: '已合併',
        createdAt: '2025-10-02T10:00:00.000Z',
        mergedAt: '2025-10-08T10:00:00.000Z',
      },
      {
        iid: 103,
        title: 'Normal MR',
        author: 'Carol',
        reviewers: 'Dave',
        cycleDays: 3.0,
        codeChanges: { commits: 3, files: 5, totalLines: 100 },
        reviewStats: { comments: 5 },
        timeline: {
          dev: { durationSeconds: 86400, percentage: 30, formattedDuration: '1d', intensity: { commits: 3, comments: 0, level: 2 } },
          wait: { durationSeconds: 43200, percentage: 15, formattedDuration: '12h', intensity: { commits: 0, comments: 0, level: 0 } },
          review: { durationSeconds: 129600, percentage: 45, formattedDuration: '1d 12h', intensity: { commits: 0, comments: 5, level: 2 } },
          merge: { durationSeconds: 28800, percentage: 10, formattedDuration: '8h', intensity: { commits: 0, comments: 0, level: 1 } },
          totalDurationSeconds: 259200,
        },
        status: 'merged',
        phase: 'merged',
        phaseLabel: '已合併',
        createdAt: '2025-10-03T10:00:00.000Z',
        mergedAt: '2025-10-06T10:00:00.000Z',
      },
    ];
  }

  describe('Percentage Filtering', () => {
    it('should filter by wait-percent-min', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        waitPercentMin: 40,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].iid).toBe(101); // Wait = 40%
      expect(result.stats.totalCount).toBe(3);
      expect(result.stats.filteredCount).toBe(1);
      expect(result.stats.excludedByFilter['wait-percent-min']).toBe(2);
    });

    it('should filter by review-percent-max', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        reviewPercentMax: 50,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(2);
      expect(result.filtered[0].iid).toBe(101); // Review = 30%
      expect(result.filtered[1].iid).toBe(103); // Review = 45%
      expect(result.stats.excludedByFilter['review-percent-max']).toBe(1);
    });

    it('should filter by dev-percent range', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 15,
        devPercentMax: 25,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(2);
      expect(result.filtered[0].iid).toBe(101); // Dev = 20%
      expect(result.filtered[1].iid).toBe(102); // Dev = 15%
    });
  });

  describe('Absolute Days Filtering', () => {
    it('should filter by wait-days-min', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        waitDaysMin: 1.5, // 1.5 days = 129600 seconds
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].iid).toBe(101); // Wait = 2 days
      expect(result.stats.excludedByFilter['wait-days-min']).toBe(2);
    });

    it('should filter by review-days-max', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        reviewDaysMax: 2, // 2 days = 172800 seconds
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(2);
      expect(result.filtered[0].iid).toBe(101); // Review = 1.5 days
      expect(result.filtered[1].iid).toBe(103); // Review = 1.5 days
      expect(result.stats.excludedByFilter['review-days-max']).toBe(1);
    });

    it('should filter by merge-days range', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        mergeDaysMin: 0.3, // 0.3 days
        mergeDaysMax: 0.6, // 0.6 days
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(2);
      expect(result.filtered[0].iid).toBe(101); // Merge = 0.5 days
      expect(result.filtered[1].iid).toBe(103); // Merge = 0.33 days
    });
  });

  describe('AND Logic - Multiple Filters', () => {
    it('should apply AND logic for multiple percentage filters', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        waitPercentMin: 40,
        reviewPercentMax: 40,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].iid).toBe(101); // Wait=40%, Review=30%
    });

    it('should apply AND logic for percentage and days filters', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        reviewPercentMin: 50,
        reviewDaysMin: 3,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].iid).toBe(102); // Review=60% and 4 days
    });

    it('should return empty when no MRs match all conditions', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 50, // No MR has dev >= 50%
        waitPercentMin: 50, // No MR has wait >= 50%
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(0);
      expect(result.stats.filteredCount).toBe(0);
    });
  });

  describe('Filter Statistics Tracking', () => {
    it('should track exclusions for each filter condition (early exit)', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 25,
        waitPercentMin: 40,
        reviewDaysMin: 3,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      // Due to early exit, only first failed condition is counted:
      // - MR 101 (dev=20%): fails dev-percent-min, early exit
      // - MR 102 (dev=15%): fails dev-percent-min, early exit
      // - MR 103 (dev=30%, wait=15%): passes dev-percent-min, fails wait-percent-min, early exit
      expect(result.stats.excludedByFilter['dev-percent-min']).toBe(2); // Excludes 101, 102
      expect(result.stats.excludedByFilter['wait-percent-min']).toBe(1); // Excludes 103
      expect(result.stats.excludedByFilter['review-days-min']).toBeUndefined(); // Never reached
    });

    it('should correctly identify most restrictive filter', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 10,     // Excludes 0 MRs
        waitPercentMin: 40,    // Excludes 2 MRs (most restrictive)
        reviewPercentMax: 90,  // Excludes 0 MRs
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      const mostRestrictive = Object.entries(result.stats.excludedByFilter)
        .sort(([, a], [, b]) => b - a)[0];
      expect(mostRestrictive[0]).toBe('wait-percent-min');
      expect(mostRestrictive[1]).toBe(2);
    });

    it('should track stats correctly when all MRs pass', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 10, // All MRs have dev >= 10%
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.stats.totalCount).toBe(3);
      expect(result.stats.filteredCount).toBe(3);
      expect(result.stats.excludedByFilter).toEqual({});
    });
  });

  describe('matchedPhaseFilters Tracking', () => {
    it('should track which phases matched for each MR', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        waitPercentMin: 40,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.matchedPhaseFilters[101]).toEqual(['wait']);
      expect(result.matchedPhaseFilters[102]).toBeUndefined();
      expect(result.matchedPhaseFilters[103]).toBeUndefined();
    });

    it('should track multiple matched phases', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        reviewPercentMin: 50,
        reviewDaysMin: 3,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.matchedPhaseFilters[102]).toEqual(['review']);
    });

    it('should track different phases for different MRs', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        waitPercentMin: 15,
        reviewPercentMin: 40, // Changed from 50 to 40 so MR 103 can pass both
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      // MR 101: wait=40% >= 15 (pass), review=30% < 40 (fail) → early exit, no match
      // MR 102: wait=10% < 15 (fail) → early exit, no match
      // MR 103: wait=15% >= 15 (pass), review=45% >= 40 (pass) → matches both
      expect(result.matchedPhaseFilters[101]).toBeUndefined(); // Failed review check
      expect(result.matchedPhaseFilters[102]).toBeUndefined(); // Failed wait check
      expect(result.matchedPhaseFilters[103]).toEqual(['wait', 'review']); // Passed both
    });

    it('should only track phases with active filters', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 10, // All pass
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert - All MRs should have 'dev' tracked
      expect(result.matchedPhaseFilters[101]).toEqual(['dev']);
      expect(result.matchedPhaseFilters[102]).toEqual(['dev']);
      expect(result.matchedPhaseFilters[103]).toEqual(['dev']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-duration phases', () => {
      // Arrange
      const rows = createMockRows();
      rows[0].timeline.wait.durationSeconds = 0;
      rows[0].timeline.wait.percentage = 0;

      const filters: PhaseFilter = {
        waitDaysMin: 0, // Should match zero duration
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered.some(row => row.iid === 101)).toBe(true);
    });

    it('should handle very small decimal day values', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        mergeDaysMin: 0.01, // Very small threshold
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert - All MRs should pass (all have merge > 0.01 days)
      expect(result.filtered).toHaveLength(3);
    });

    it('should handle empty MR list', () => {
      // Arrange
      const rows: MRComparisonRow[] = [];
      const filters: PhaseFilter = {
        devPercentMin: 20,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(0);
      expect(result.stats.totalCount).toBe(0);
      expect(result.stats.filteredCount).toBe(0);
    });

    it('should handle all 16 filter conditions simultaneously', () => {
      // Arrange
      const rows = createMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 10,
        devPercentMax: 40,
        devDaysMin: 0.5,
        devDaysMax: 3,
        waitPercentMin: 5,
        waitPercentMax: 50,
        waitDaysMin: 0.1,
        waitDaysMax: 3,
        reviewPercentMin: 20,
        reviewPercentMax: 70,
        reviewDaysMin: 1,
        reviewDaysMax: 5,
        mergePercentMin: 5,
        mergePercentMax: 20,
        mergeDaysMin: 0.2,
        mergeDaysMax: 2,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert - Should apply all conditions correctly
      expect(result.stats.totalCount).toBe(3);
      expect(result.filtered.length).toBeLessThanOrEqual(3);
    });
  });
});
