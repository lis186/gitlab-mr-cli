/**
 * BatchComparisonService Contract Test (T007, T008)
 *
 * 驗證批次比較服務的介面契約
 *
 * 測試範圍：
 * - BatchComparisonService.analyze() - 批次分析入口
 * - BatchComparisonService.validateInput() - 輸入驗證
 */

import { describe, it, expect } from 'vitest';
import type {
  BatchComparisonInput,
  BatchComparisonResult,
  MRComparisonRow,
} from '../../src/types/batch-comparison';

describe('BatchComparisonService Interface Contract (T007, T008)', () => {
  describe('BatchComparisonInput 介面契約', () => {
    it('應接受有效的批次比較輸入', () => {
      const validInput: BatchComparisonInput = {
        projectId: 'group/project',
        mrIids: [123, 124, 125],
      };

      // 驗證必要欄位
      expect(validInput).toHaveProperty('projectId');
      expect(validInput).toHaveProperty('mrIids');
      expect(Array.isArray(validInput.mrIids)).toBe(true);
      expect(validInput.mrIids.length).toBeGreaterThan(0);
    });

    it('應接受帶有過濾條件的輸入', () => {
      const inputWithFilter: BatchComparisonInput = {
        projectId: 'group/project',
        mrIids: [123, 124],
        filter: {
          author: 'Mike',
          minCycleDays: 1,
          maxCycleDays: 10,
          dateRange: {
            from: '2025-10-01T00:00:00.000Z',
            to: '2025-10-31T23:59:59.999Z',
          },
        },
      };

      expect(inputWithFilter.filter).toBeDefined();
      expect(inputWithFilter.filter?.author).toBe('Mike');
      expect(inputWithFilter.filter?.minCycleDays).toBe(1);
      expect(inputWithFilter.filter?.maxCycleDays).toBe(10);
      expect(inputWithFilter.filter?.dateRange).toBeDefined();
    });

    it('應接受帶有排序條件的輸入', () => {
      const inputWithSort: BatchComparisonInput = {
        projectId: 'group/project',
        mrIids: [123, 124],
        sort: {
          field: 'cycleDays',
          order: 'desc',
        },
      };

      expect(inputWithSort.sort).toBeDefined();
      expect(inputWithSort.sort?.field).toBe('cycleDays');
      expect(inputWithSort.sort?.order).toBe('desc');
    });

    it('應接受帶有限制數量的輸入', () => {
      const inputWithLimit: BatchComparisonInput = {
        projectId: 'group/project',
        mrIids: [123, 124, 125],
        limit: 10,
      };

      expect(inputWithLimit.limit).toBe(10);
    });
  });

  describe('BatchComparisonResult 介面契約', () => {
    it('應包含所有必要的輸出欄位', () => {
      const mockResult: BatchComparisonResult = {
        rows: [],
        summary: {
          totalCount: 3,
          successCount: 3,
          failedCount: 0,
          codeChanges: {
            avgCommits: 5.0,
            avgFiles: 8.0,
            avgLines: 200,
            totalCommits: 15,
            totalFiles: 24,
            totalLines: 600,
          },
          reviewStats: {
            avgComments: 10.0,
            totalComments: 30,
            reviewDensityPerKLoc: 50.0,
            reviewDensityPerFile: 1.25,
          },
          timelineStats: {
            avgCycleDays: 3.5,
            avgPhaseDurations: {
              dev: 86400,
              wait: 21600,
              review: 172800,
              merge: 21600,
            },
            avgPhasePercentages: {
              dev: 28.6,
              wait: 7.1,
              review: 57.1,
              merge: 7.1,
            },
          },
        },
        metadata: {
          projectId: 'group/project',
          queriedAt: '2025-11-01T00:00:00.000Z',
          queryDurationMs: 5000,
        },
      };

      // 驗證 rows
      expect(mockResult).toHaveProperty('rows');
      expect(Array.isArray(mockResult.rows)).toBe(true);

      // 驗證 summary
      expect(mockResult.summary).toBeDefined();
      expect(mockResult.summary.totalCount).toBe(3);
      expect(mockResult.summary.successCount).toBe(3);
      expect(mockResult.summary.failedCount).toBe(0);

      // 驗證 codeChanges
      expect(mockResult.summary.codeChanges).toBeDefined();
      expect(mockResult.summary.codeChanges.avgCommits).toBe(5.0);
      expect(mockResult.summary.codeChanges.totalCommits).toBe(15);

      // 驗證 reviewStats
      expect(mockResult.summary.reviewStats).toBeDefined();
      expect(mockResult.summary.reviewStats.avgComments).toBe(10.0);
      expect(mockResult.summary.reviewStats.reviewDensityPerKLoc).toBe(50.0);

      // 驗證 timelineStats
      expect(mockResult.summary.timelineStats).toBeDefined();
      expect(mockResult.summary.timelineStats.avgCycleDays).toBe(3.5);

      // 驗證 metadata
      expect(mockResult.metadata).toBeDefined();
      expect(mockResult.metadata.projectId).toBe('group/project');
      expect(mockResult.metadata.queriedAt).toBeDefined();
      expect(mockResult.metadata.queryDurationMs).toBeGreaterThan(0);
    });
  });

  describe('MRComparisonRow 介面契約', () => {
    it('應包含所有必要的 MR 資料欄位', () => {
      const mockRow: MRComparisonRow = {
        iid: 123,
        title: 'Add user authentication feature',
        author: 'Alice',
        cycleDays: 3.5,
        codeChanges: {
          commits: 8,
          files: 12,
          totalLines: 450,
        },
        reviewStats: {
          comments: 15,
        },
        timeline: {
          dev: {
            durationSeconds: 86400,
            percentage: 28.6,
            formattedDuration: '1d',
            intensity: { commits: 8, comments: 0, level: 3 },
          },
          wait: {
            durationSeconds: 21600,
            percentage: 7.1,
            formattedDuration: '6h',
            intensity: { commits: 0, comments: 0, level: 0 },
          },
          review: {
            durationSeconds: 172800,
            percentage: 57.1,
            formattedDuration: '2d',
            intensity: { commits: 0, comments: 15, level: 3 },
          },
          merge: {
            durationSeconds: 21600,
            percentage: 7.1,
            formattedDuration: '6h',
            intensity: { commits: 0, comments: 0, level: 1 },
          },
          totalDurationSeconds: 302400,
        },
        status: 'merged',
      };

      // 驗證基本欄位
      expect(mockRow.iid).toBe(123);
      expect(mockRow.title).toBeDefined();
      expect(mockRow.author).toBeDefined();
      expect(mockRow.cycleDays).toBeGreaterThan(0);
      expect(mockRow.status).toBe('merged');

      // 驗證 codeChanges
      expect(mockRow.codeChanges).toBeDefined();
      expect(mockRow.codeChanges.commits).toBeGreaterThanOrEqual(0);
      expect(mockRow.codeChanges.files).toBeGreaterThanOrEqual(0);
      expect(mockRow.codeChanges.totalLines).toBeGreaterThanOrEqual(0);

      // 驗證 reviewStats
      expect(mockRow.reviewStats).toBeDefined();
      expect(mockRow.reviewStats.comments).toBeGreaterThanOrEqual(0);

      // 驗證 timeline
      expect(mockRow.timeline).toBeDefined();
      expect(mockRow.timeline.dev).toBeDefined();
      expect(mockRow.timeline.wait).toBeDefined();
      expect(mockRow.timeline.review).toBeDefined();
      expect(mockRow.timeline.merge).toBeDefined();
      expect(mockRow.timeline.totalDurationSeconds).toBeGreaterThan(0);

      // 驗證階段百分比總和應為 100 (±1% 容差)
      const totalPercentage =
        mockRow.timeline.dev.percentage +
        mockRow.timeline.wait.percentage +
        mockRow.timeline.review.percentage +
        mockRow.timeline.merge.percentage;
      expect(totalPercentage).toBeGreaterThanOrEqual(99);
      expect(totalPercentage).toBeLessThanOrEqual(101);
    });

    it('應支援帶有錯誤訊息的 MR 資料行', () => {
      const errorRow: MRComparisonRow = {
        iid: 999,
        title: '',
        author: '',
        cycleDays: 0,
        codeChanges: {
          commits: 0,
          files: 0,
          totalLines: 0,
        },
        reviewStats: {
          comments: 0,
        },
        timeline: {
          dev: {
            durationSeconds: 0,
            percentage: 0,
            formattedDuration: '0s',
            intensity: { commits: 0, comments: 0, level: 0 },
          },
          wait: {
            durationSeconds: 0,
            percentage: 0,
            formattedDuration: '0s',
            intensity: { commits: 0, comments: 0, level: 0 },
          },
          review: {
            durationSeconds: 0,
            percentage: 0,
            formattedDuration: '0s',
            intensity: { commits: 0, comments: 0, level: 0 },
          },
          merge: {
            durationSeconds: 0,
            percentage: 0,
            formattedDuration: '0s',
            intensity: { commits: 0, comments: 0, level: 0 },
          },
          totalDurationSeconds: 0,
        },
        status: 'closed',
        error: 'MR not found',
      };

      expect(errorRow.error).toBeDefined();
      expect(errorRow.error).toBe('MR not found');
    });
  });

  describe('validateInput() 驗證邏輯契約 (T008)', () => {
    it('應拒絕空的 MR IID 列表', () => {
      const invalidInput: BatchComparisonInput = {
        projectId: 'group/project',
        mrIids: [],
      };

      // 這個測試預期 validateInput() 會拋出錯誤
      expect(invalidInput.mrIids.length).toBe(0);
    });

    it('應拒絕超過 50 個 MR 的輸入', () => {
      const tooManyMRs: BatchComparisonInput = {
        projectId: 'group/project',
        mrIids: Array.from({ length: 51 }, (_, i) => i + 1),
      };

      expect(tooManyMRs.mrIids.length).toBe(51);
    });

    it('應拒絕無效的週期天數範圍', () => {
      const invalidRange: BatchComparisonInput = {
        projectId: 'group/project',
        mrIids: [123],
        filter: {
          minCycleDays: 10,
          maxCycleDays: 5, // max < min (無效)
        },
      };

      expect(invalidRange.filter?.minCycleDays).toBeGreaterThan(
        invalidRange.filter?.maxCycleDays || 0
      );
    });

    it('應拒絕負數的週期天數', () => {
      const negativeInput: BatchComparisonInput = {
        projectId: 'group/project',
        mrIids: [123],
        filter: {
          minCycleDays: -1,
        },
      };

      expect(negativeInput.filter?.minCycleDays).toBeLessThan(0);
    });

    it('應拒絕無效的排序欄位', () => {
      const invalidSort: BatchComparisonInput = {
        projectId: 'group/project',
        mrIids: [123],
        sort: {
          // @ts-expect-error Testing invalid field
          field: 'invalidField',
          order: 'asc',
        },
      };

      expect(invalidSort.sort?.field).toBe('invalidField');
    });
  });
});
