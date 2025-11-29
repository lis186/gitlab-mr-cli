/**
 * User Story 3 整合測試：組合多個階段過濾條件
 * Feature: 013-mr-phase-filters
 * Task: T014
 *
 * 測試範圍：
 * - Scenario 1: Fast dev + slow wait 模式
 * - Scenario 2: 百分比 + 天數過濾組合
 * - Scenario 3: 跨四個階段的複雜過濾
 * - Scenario 4: 零結果時顯示最具限制性的過濾器
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchComparisonService } from '../../src/services/batch-comparison-service.js';
import type { MRComparisonRow, PhaseFilter, BatchComparisonInput } from '../../src/types/batch-comparison.js';
import { Gitlab } from '@gitbeaker/rest';

// Mock GitLab API
vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn(),
}));

describe('User Story 3: Combine Multiple Phase Filters', () => {
  let service: BatchComparisonService;

  beforeEach(() => {
    const mockGitlab = new Gitlab({ token: 'test-token' });
    service = new BatchComparisonService(mockGitlab);
  });

  // 建立測試用的 MR 資料集
  function createDiverseMockRows(): MRComparisonRow[] {
    return [
      {
        // Fast dev (15%), slow wait (50%)
        iid: 201,
        title: 'Fast Dev, Slow Wait',
        author: 'Alice',
        reviewers: 'Bob',
        cycleDays: 10.0,
        codeChanges: { commits: 5, files: 10, totalLines: 200 },
        reviewStats: { comments: 8 },
        timeline: {
          dev: { durationSeconds: 129600, percentage: 15, formattedDuration: '1d 12h', intensity: { commits: 5, comments: 0, level: 3 } },
          wait: { durationSeconds: 432000, percentage: 50, formattedDuration: '5d', intensity: { commits: 0, comments: 0, level: 0 } },
          review: { durationSeconds: 259200, percentage: 30, formattedDuration: '3d', intensity: { commits: 0, comments: 8, level: 3 } },
          merge: { durationSeconds: 43200, percentage: 5, formattedDuration: '12h', intensity: { commits: 0, comments: 0, level: 1 } },
          totalDurationSeconds: 864000,
        },
        status: 'merged',
        phase: 'merged',
        phaseLabel: '已合併',
        createdAt: '2025-10-01T10:00:00.000Z',
        mergedAt: '2025-10-11T10:00:00.000Z',
      },
      {
        // Normal distribution
        iid: 202,
        title: 'Normal MR',
        author: 'Bob',
        reviewers: 'Alice',
        cycleDays: 5.0,
        codeChanges: { commits: 8, files: 15, totalLines: 350 },
        reviewStats: { comments: 12 },
        timeline: {
          dev: { durationSeconds: 129600, percentage: 30, formattedDuration: '1d 12h', intensity: { commits: 8, comments: 0, level: 3 } },
          wait: { durationSeconds: 86400, percentage: 20, formattedDuration: '1d', intensity: { commits: 0, comments: 0, level: 0 } },
          review: { durationSeconds: 172800, percentage: 40, formattedDuration: '2d', intensity: { commits: 0, comments: 12, level: 3 } },
          merge: { durationSeconds: 43200, percentage: 10, formattedDuration: '12h', intensity: { commits: 0, comments: 0, level: 1 } },
          totalDurationSeconds: 432000,
        },
        status: 'merged',
        phase: 'merged',
        phaseLabel: '已合併',
        createdAt: '2025-10-05T10:00:00.000Z',
        mergedAt: '2025-10-10T10:00:00.000Z',
      },
      {
        // High wait % (40%) and long review days (4d)
        iid: 203,
        title: 'High Wait + Long Review',
        author: 'Carol',
        reviewers: 'Dave',
        cycleDays: 8.0,
        codeChanges: { commits: 6, files: 12, totalLines: 250 },
        reviewStats: { comments: 10 },
        timeline: {
          dev: { durationSeconds: 86400, percentage: 12.5, formattedDuration: '1d', intensity: { commits: 6, comments: 0, level: 3 } },
          wait: { durationSeconds: 276480, percentage: 40, formattedDuration: '3d 5h', intensity: { commits: 0, comments: 0, level: 0 } },
          review: { durationSeconds: 345600, percentage: 50, formattedDuration: '4d', intensity: { commits: 0, comments: 10, level: 3 } },
          merge: { durationSeconds: 0, percentage: 0, formattedDuration: '0h', intensity: { commits: 0, comments: 0, level: 0 } },
          totalDurationSeconds: 691200,
        },
        status: 'merged',
        phase: 'merged',
        phaseLabel: '已合併',
        createdAt: '2025-10-02T10:00:00.000Z',
        mergedAt: '2025-10-10T10:00:00.000Z',
      },
      {
        // Slow dev (60%), fast everything else
        iid: 204,
        title: 'Slow Dev Only',
        author: 'Dave',
        reviewers: 'Carol',
        cycleDays: 6.0,
        codeChanges: { commits: 15, files: 20, totalLines: 500 },
        reviewStats: { comments: 5 },
        timeline: {
          dev: { durationSeconds: 311040, percentage: 60, formattedDuration: '3d 14h', intensity: { commits: 15, comments: 0, level: 3 } },
          wait: { durationSeconds: 51840, percentage: 10, formattedDuration: '14h', intensity: { commits: 0, comments: 0, level: 0 } },
          review: { durationSeconds: 129600, percentage: 25, formattedDuration: '1d 12h', intensity: { commits: 0, comments: 5, level: 2 } },
          merge: { durationSeconds: 25920, percentage: 5, formattedDuration: '7h', intensity: { commits: 0, comments: 0, level: 1 } },
          totalDurationSeconds: 518400,
        },
        status: 'merged',
        phase: 'merged',
        phaseLabel: '已合併',
        createdAt: '2025-10-03T10:00:00.000Z',
        mergedAt: '2025-10-09T10:00:00.000Z',
      },
    ];
  }

  describe('Scenario 1: Fast dev, slow wait pattern', () => {
    it('should return only MRs with dev ≤20% AND wait ≥50%', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        devPercentMax: 20,
        waitPercentMin: 50,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert - Only MR 201 matches both conditions
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].iid).toBe(201);
      expect(result.filtered[0].timeline.dev.percentage).toBeLessThanOrEqual(20);
      expect(result.filtered[0].timeline.wait.percentage).toBeGreaterThanOrEqual(50);
    });

    it('should track matched phases for fast dev + slow wait pattern', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        devPercentMax: 20,
        waitPercentMin: 50,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert - MR 201 should have both dev and wait tracked
      expect(result.matchedPhaseFilters[201]).toEqual(['dev', 'wait']);
    });
  });

  describe('Scenario 2: Percentage + duration filters', () => {
    it('should return MRs with wait ≥40% AND review ≥3 days', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        waitPercentMin: 40,
        reviewDaysMin: 3,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert - MRs 201 and 203 match
      expect(result.filtered).toHaveLength(2);
      const iids = result.filtered.map(r => r.iid).sort();
      expect(iids).toEqual([201, 203]);

      // Verify conditions
      result.filtered.forEach(row => {
        expect(row.timeline.wait.percentage).toBeGreaterThanOrEqual(40);
        expect(row.timeline.review.durationSeconds / 86400).toBeGreaterThanOrEqual(3);
      });
    });

    it('should track both wait and review phases', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        waitPercentMin: 40,
        reviewDaysMin: 3,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.matchedPhaseFilters[201]).toEqual(['wait', 'review']);
      expect(result.matchedPhaseFilters[203]).toEqual(['wait', 'review']);
    });
  });

  describe('Scenario 3: All 4 phases with 8 conditions', () => {
    it('should correctly apply complex filter across all phases', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 10,
        devPercentMax: 20,
        devDaysMin: 1,
        devDaysMax: 2,
        waitPercentMin: 40,
        waitPercentMax: 60,
        waitDaysMin: 2,
        waitDaysMax: 6,
        reviewPercentMin: 20,
        reviewPercentMax: 40,
        reviewDaysMin: 2,
        reviewDaysMax: 4,
        mergePercentMin: 0,
        mergePercentMax: 10,
        mergeDaysMin: 0,
        mergeDaysMax: 1,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert - Only MR 201 should match all 8 conditions
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].iid).toBe(201);

      const row = result.filtered[0];
      // Verify dev conditions
      expect(row.timeline.dev.percentage).toBeGreaterThanOrEqual(10);
      expect(row.timeline.dev.percentage).toBeLessThanOrEqual(20);
      expect(row.timeline.dev.durationSeconds / 86400).toBeGreaterThanOrEqual(1);
      expect(row.timeline.dev.durationSeconds / 86400).toBeLessThanOrEqual(2);

      // Verify wait conditions
      expect(row.timeline.wait.percentage).toBeGreaterThanOrEqual(40);
      expect(row.timeline.wait.percentage).toBeLessThanOrEqual(60);
      expect(row.timeline.wait.durationSeconds / 86400).toBeGreaterThanOrEqual(2);
      expect(row.timeline.wait.durationSeconds / 86400).toBeLessThanOrEqual(6);

      // Verify review conditions
      expect(row.timeline.review.percentage).toBeGreaterThanOrEqual(20);
      expect(row.timeline.review.percentage).toBeLessThanOrEqual(40);
      expect(row.timeline.review.durationSeconds / 86400).toBeGreaterThanOrEqual(2);
      expect(row.timeline.review.durationSeconds / 86400).toBeLessThanOrEqual(4);

      // Verify merge conditions
      expect(row.timeline.merge.percentage).toBeGreaterThanOrEqual(0);
      expect(row.timeline.merge.percentage).toBeLessThanOrEqual(10);
      expect(row.timeline.merge.durationSeconds / 86400).toBeGreaterThanOrEqual(0);
      expect(row.timeline.merge.durationSeconds / 86400).toBeLessThanOrEqual(1);
    });

    it('should track all 4 phases when all conditions match', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 10,
        devPercentMax: 20,
        waitPercentMin: 40,
        waitPercentMax: 60,
        reviewPercentMin: 20,
        reviewPercentMax: 40,
        mergePercentMin: 0,
        mergePercentMax: 10,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.matchedPhaseFilters[201]).toEqual(['dev', 'wait', 'review', 'merge']);
    });
  });

  describe('Scenario 4: Zero matches showing most restrictive filter', () => {
    it('should identify most restrictive filter when no MRs match', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        devPercentMax: 5,       // Very strict - no MR has dev ≤5%
        waitPercentMin: 80,     // Very strict - no MR has wait ≥80%
        reviewDaysMin: 10,      // Very strict - no MR has review ≥10 days
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert - No matches
      expect(result.filtered).toHaveLength(0);
      expect(result.stats.filteredCount).toBe(0);

      // Find most restrictive filter (early exit means first failed condition)
      const sortedFilters = Object.entries(result.stats.excludedByFilter)
        .sort(([, a], [, b]) => b - a);
      const mostRestrictive = sortedFilters[0];

      // dev-percent-max should be most restrictive (all 4 MRs fail this first)
      expect(mostRestrictive[0]).toBe('dev-percent-max');
      expect(mostRestrictive[1]).toBe(4); // All 4 MRs excluded
    });

    it('should provide useful statistics for zero results', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 70,      // No MR has dev ≥70%
        waitPercentMin: 60,     // No MR has wait ≥60%
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.stats.totalCount).toBe(4);
      expect(result.stats.filteredCount).toBe(0);

      // Due to early exit:
      // - MR 201 (dev=15%): fails dev-percent-min
      // - MR 202 (dev=30%): fails dev-percent-min
      // - MR 203 (dev=12.5%): fails dev-percent-min
      // - MR 204 (dev=60%): fails dev-percent-min
      expect(result.stats.excludedByFilter['dev-percent-min']).toBe(4);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single MR matching all conditions', () => {
      // Arrange - Create a MR that perfectly matches strict criteria
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        devPercentMax: 20,
        waitPercentMin: 45,
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(1);
      expect(result.stats.filteredCount).toBe(1);
    });

    it('should handle no filters defined gracefully', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {};

      // Act & Assert - Should fail validation (tested in PhaseFilterValidator)
      // This test ensures the filter logic doesn't crash with empty filters
      expect(() => {
        (service as any).applyPhaseFilters(rows, filters);
      }).not.toThrow();
    });

    it('should handle all MRs matching all conditions', () => {
      // Arrange
      const rows = createDiverseMockRows();
      const filters: PhaseFilter = {
        devPercentMin: 10,      // All MRs have dev ≥10%
        waitPercentMin: 5,      // All MRs have wait ≥5%
      };

      // Act
      const result = (service as any).applyPhaseFilters(rows, filters);

      // Assert
      expect(result.filtered).toHaveLength(4);
      expect(result.stats.filteredCount).toBe(4);
      expect(Object.keys(result.stats.excludedByFilter)).toHaveLength(0);
    });
  });
});
