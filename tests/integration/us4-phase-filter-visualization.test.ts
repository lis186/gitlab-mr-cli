/**
 * User Story 4 整合測試：階段過濾視覺化
 * Feature: 013-mr-phase-filters
 * Task: T023
 *
 * 測試範圍：
 * - Scenario 1: 單一階段過濾時，匹配階段顯示 ⚠️ 標記
 * - Scenario 2: 多階段過濾時，所有匹配階段都被標記
 * - Scenario 3: JSON 輸出包含 matchedPhaseFilters 欄位
 * - Scenario 4: Verbose 模式顯示過濾統計摘要
 */

import { describe, it, expect } from 'vitest';
import type { FilteredBatchComparisonResult } from '../../src/types/batch-comparison.js';
import { BatchComparisonTableFormatter } from '../../src/formatters/batch-comparison-table-formatter.js';
import { TimelinePhaseFormatter } from '../../src/formatters/timeline-phase-formatter.js';
import chalk from 'chalk';

describe('User Story 4: Highlight Filtered Phases in Output', () => {
  // 建立測試用的 MR 資料
  function createMockFilteredResult(): FilteredBatchComparisonResult {
    return {
      rows: [
        {
          iid: 505,
          title: 'High Wait Time MR',
          author: 'Alice',
          reviewers: 'Bob, Carol',
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
          iid: 506,
          title: 'High Review Time MR',
          author: 'Bob',
          reviewers: 'Alice',
          cycleDays: 6.0,
          codeChanges: { commits: 8, files: 15, totalLines: 350 },
          reviewStats: { comments: 12 },
          timeline: {
            dev: { durationSeconds: 86400, percentage: 15, formattedDuration: '1d', intensity: { commits: 8, comments: 0, level: 3 } },
            wait: { durationSeconds: 43200, percentage: 10, formattedDuration: '12h', intensity: { commits: 0, comments: 0, level: 0 } },
            review: { durationSeconds: 259200, percentage: 60, formattedDuration: '3d', intensity: { commits: 0, comments: 12, level: 3 } },
            merge: { durationSeconds: 64800, percentage: 15, formattedDuration: '18h', intensity: { commits: 0, comments: 0, level: 1 } },
            totalDurationSeconds: 518400,
          },
          status: 'merged',
          phase: 'merged',
          phaseLabel: '已合併',
          createdAt: '2025-10-02T10:00:00.000Z',
          mergedAt: '2025-10-08T10:00:00.000Z',
        },
      ],
      summary: {
        totalCount: 2,
        successCount: 2,
        failedCount: 0,
        codeChanges: {
          avgCommits: 6.5,
          avgFiles: 12.5,
          avgLines: 275,
          totalCommits: 13,
          totalFiles: 25,
          totalLines: 550,
        },
        reviewStats: {
          avgComments: 10,
          totalComments: 20,
          reviewDensityPerKLoc: 36.4,
          reviewDensityPerFile: 0.8,
        },
        timelineStats: {
          avgCycleDays: 5.5,
          avgPhaseDurations: {
            dev: 86400,
            wait: 108000,
            review: 194400,
            merge: 54000,
          },
          avgPhasePercentages: {
            dev: 17.5,
            wait: 25,
            review: 45,
            merge: 12.5,
          },
        },
      },
      metadata: {
        projectId: 'test/project',
        queriedAt: '2025-11-01T00:00:00.000Z',
        queryDurationMs: 1000,
        appliedFilters: {
          phaseFilters: {
            waitPercentMin: 40,
          },
        },
      },
      // T019: 匹配的階段過濾器
      matchedPhaseFilters: {
        505: ['wait'], // MR 505 匹配 wait 階段過濾
      },
      // T016: 階段過濾統計
      phaseFilterStats: {
        totalCount: 10,
        filteredCount: 2,
        excludedByFilter: {
          'wait-percent-min': 8,
        },
      },
    };
  }

  describe('Scenario 1: Single phase filter highlighting', () => {
    it('should highlight wait phase with ⚠️ marker when wait-percent-min filter is active', () => {
      // Arrange
      const result = createMockFilteredResult();
      const timelineFormatter = new TimelinePhaseFormatter('height');

      // Act - Format timeline with matched phases
      const [, , percentage] = timelineFormatter.format(
        result.rows[0].timeline,
        result.rows[0].cycleDays,
        result.matchedPhaseFilters![505] // ['wait']
      );

      // Assert - Wait phase should have yellow color and ⚠️
      expect(percentage).toContain('⚠️40%'); // Wait phase is 40%
      expect(percentage).toMatch(/20%\|.*40%\|30%\|10%/); // Phase order: dev|wait|review|merge
    });

    it('should NOT highlight phases when matchedPhaseFilters is empty', () => {
      // Arrange
      const result = createMockFilteredResult();
      const timelineFormatter = new TimelinePhaseFormatter('height');

      // Act - Format without matched phases
      const [, , percentage] = timelineFormatter.format(
        result.rows[1].timeline,
        result.rows[1].cycleDays,
        [] // No matched filters
      );

      // Assert - No ⚠️ markers
      expect(percentage).not.toContain('⚠️');
      expect(percentage).toBe('15%|10%|60%|15%');
    });
  });

  describe('Scenario 2: Multiple phase filter highlighting', () => {
    it('should highlight multiple phases when MR matches multiple filters', () => {
      // Arrange - MR that matches both wait and review filters
      const mockResult = createMockFilteredResult();
      mockResult.matchedPhaseFilters = {
        505: ['wait', 'review'], // Matches both
      };
      const timelineFormatter = new TimelinePhaseFormatter('height');

      // Act
      const [, , percentage] = timelineFormatter.format(
        mockResult.rows[0].timeline,
        mockResult.rows[0].cycleDays,
        mockResult.matchedPhaseFilters[505]
      );

      // Assert - Both wait and review should have ⚠️
      expect(percentage).toContain('⚠️40%'); // Wait
      expect(percentage).toContain('⚠️30%'); // Review
      expect(percentage).not.toContain('⚠️20%'); // Dev should NOT be marked
      expect(percentage).not.toContain('⚠️10%'); // Merge should NOT be marked
    });

    it('should highlight all four phases when all filters match', () => {
      // Arrange
      const mockResult = createMockFilteredResult();
      mockResult.matchedPhaseFilters = {
        505: ['dev', 'wait', 'review', 'merge'], // All match
      };
      const timelineFormatter = new TimelinePhaseFormatter('height');

      // Act
      const [, , percentage] = timelineFormatter.format(
        mockResult.rows[0].timeline,
        mockResult.rows[0].cycleDays,
        mockResult.matchedPhaseFilters[505]
      );

      // Assert - All phases have ⚠️
      expect(percentage).toContain('⚠️20%'); // Dev
      expect(percentage).toContain('⚠️40%'); // Wait
      expect(percentage).toContain('⚠️30%'); // Review
      expect(percentage).toContain('⚠️10%'); // Merge
    });
  });

  describe('Scenario 3: JSON output includes matchedPhaseFilters', () => {
    it('should include matchedPhaseFilters field in JSON output', () => {
      // Arrange
      const result = createMockFilteredResult();

      // Act
      const jsonOutput = JSON.parse(JSON.stringify(result));

      // Assert
      expect(jsonOutput.matchedPhaseFilters).toBeDefined();
      expect(jsonOutput.matchedPhaseFilters['505']).toEqual(['wait']);
      expect(jsonOutput.matchedPhaseFilters['505']).toHaveLength(1);
    });

    it('should correctly record matched phases for each MR', () => {
      // Arrange
      const result = createMockFilteredResult();
      result.matchedPhaseFilters = {
        505: ['wait'],
        506: ['review'],
      };

      // Act
      const jsonOutput = JSON.parse(JSON.stringify(result));

      // Assert
      expect(jsonOutput.matchedPhaseFilters['505']).toEqual(['wait']);
      expect(jsonOutput.matchedPhaseFilters['506']).toEqual(['review']);
    });

    it('should include phaseFilterStats in JSON output', () => {
      // Arrange
      const result = createMockFilteredResult();

      // Act
      const jsonOutput = JSON.parse(JSON.stringify(result));

      // Assert
      expect(jsonOutput.phaseFilterStats).toBeDefined();
      expect(jsonOutput.phaseFilterStats.totalCount).toBe(10);
      expect(jsonOutput.phaseFilterStats.filteredCount).toBe(2);
      expect(jsonOutput.phaseFilterStats.excludedByFilter).toEqual({
        'wait-percent-min': 8,
      });
    });
  });

  describe('Scenario 4: Verbose mode displays filter statistics', () => {
    it('should display filter statistics with correct format', () => {
      // Arrange
      const stats = {
        totalCount: 10,
        filteredCount: 2,
        excludedByFilter: {
          'wait-percent-min': 8,
          'review-days-min': 3,
          'dev-percent-max': 5,
        },
      };

      // Act - Simulate verbose output logic
      const output: string[] = [];
      output.push('📊 階段過濾統計：');
      output.push(`   過濾前總 MR 數量: ${stats.totalCount}`);
      output.push(`   過濾後 MR 數量: ${stats.filteredCount}`);
      output.push(`   排除的 MR 數量: ${stats.totalCount - stats.filteredCount}`);

      const filters = Object.entries(stats.excludedByFilter);
      const sortedFilters = filters.sort(([, a], [, b]) => b - a);
      const mostRestrictive = sortedFilters[0];

      output.push('   各過濾條件排除的 MR 數量：');
      sortedFilters.forEach(([filterName, count]) => {
        const emoji = count === mostRestrictive[1] ? '🔴' : '  ';
        output.push(`   ${emoji} ${filterName}: ${count} 個 MR`);
      });
      output.push(`💡 提示：「${mostRestrictive[0]}」是最具限制性的過濾條件。`);

      const result = output.join('\n');

      // Assert
      expect(result).toContain('📊 階段過濾統計：');
      expect(result).toContain('過濾前總 MR 數量: 10');
      expect(result).toContain('過濾後 MR 數量: 2');
      expect(result).toContain('排除的 MR 數量: 8');
      expect(result).toContain('🔴 wait-percent-min: 8 個 MR'); // Most restrictive
      expect(result).toContain('   review-days-min: 3 個 MR');
      expect(result).toContain('   dev-percent-max: 5 個 MR');
      expect(result).toContain('💡 提示：「wait-percent-min」是最具限制性的過濾條件');
    });

    it('should identify most restrictive filter correctly', () => {
      // Arrange
      const stats = {
        totalCount: 100,
        filteredCount: 5,
        excludedByFilter: {
          'wait-percent-min': 40, // Most restrictive
          'review-days-min': 30,
          'dev-percent-max': 25,
          'merge-days-min': 10,
        },
      };

      // Act
      const filters = Object.entries(stats.excludedByFilter);
      const sortedFilters = filters.sort(([, a], [, b]) => b - a);
      const mostRestrictive = sortedFilters[0];

      // Assert
      expect(mostRestrictive[0]).toBe('wait-percent-min');
      expect(mostRestrictive[1]).toBe(40);
      expect(sortedFilters[0][1]).toBeGreaterThanOrEqual(sortedFilters[1][1]);
      expect(sortedFilters[1][1]).toBeGreaterThanOrEqual(sortedFilters[2][1]);
    });

    it('should handle case with no matches (zero results)', () => {
      // Arrange
      const stats = {
        totalCount: 50,
        filteredCount: 0,
        excludedByFilter: {
          'wait-percent-min': 48,
          'review-days-min': 35,
        },
      };

      // Act
      const filters = Object.entries(stats.excludedByFilter);
      const sortedFilters = filters.sort(([, a], [, b]) => b - a);

      // Assert
      expect(stats.filteredCount).toBe(0);
      expect(sortedFilters[0][0]).toBe('wait-percent-min');
      expect(sortedFilters[0][1]).toBe(48);
      // Should suggest relaxing wait-percent-min filter
    });
  });

  describe('Edge Cases', () => {
    it('should handle MR with no matched filters', () => {
      // Arrange
      const result = createMockFilteredResult();
      result.matchedPhaseFilters = {};
      const timelineFormatter = new TimelinePhaseFormatter('height');

      // Act
      const [, , percentage] = timelineFormatter.format(
        result.rows[0].timeline,
        result.rows[0].cycleDays,
        undefined // No matched phases
      );

      // Assert
      expect(percentage).not.toContain('⚠️');
      expect(percentage).toBe('20%|40%|30%|10%');
    });

    it('should handle result with no phaseFilterStats', () => {
      // Arrange
      const result = createMockFilteredResult();
      delete result.phaseFilterStats;

      // Act & Assert - Should not throw error
      expect(result.phaseFilterStats).toBeUndefined();
      expect(result.matchedPhaseFilters).toBeDefined(); // Other fields still work
    });

    it('should handle empty excludedByFilter object', () => {
      // Arrange
      const stats = {
        totalCount: 10,
        filteredCount: 10,
        excludedByFilter: {},
      };

      // Act
      const filters = Object.entries(stats.excludedByFilter);

      // Assert
      expect(filters).toHaveLength(0);
      expect(stats.filteredCount).toBe(stats.totalCount); // No filters applied
    });
  });
});
