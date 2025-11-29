/**
 * CSV Exporter Unit Tests (T058-T059)
 *
 * 驗證 CSV 匯出功能
 */

import { describe, it, expect } from 'vitest';
import { CSVExporter } from '../../src/formatters/csv-exporter';
import type { BatchComparisonResult, MRComparisonRow } from '../../src/types/batch-comparison';

function createMockResult(): BatchComparisonResult {
  const row: MRComparisonRow = {
    iid: 123,
    title: 'Test MR Simple',
    author: 'Alice',
    cycleDays: 3.5,
    codeChanges: { commits: 5, files: 10, totalLines: 200 },
    reviewStats: { comments: 8, hasAIReview: true, aiReviewStatus: 'yes' },
    timeline: {
      dev: { durationSeconds: 100800, percentage: 30, formattedDuration: '1d 4h', intensity: { commits: 5, comments: 0, level: 3 } },
      wait: { durationSeconds: 21600, percentage: 10, formattedDuration: '6h', intensity: { commits: 0, comments: 0, level: 0 } },
      review: { durationSeconds: 151200, percentage: 50, formattedDuration: '1d 18h', intensity: { commits: 0, comments: 8, level: 3 } },
      merge: { durationSeconds: 28800, percentage: 10, formattedDuration: '8h', intensity: { commits: 0, comments: 0, level: 1 } },
      totalDurationSeconds: 302400,
    },
    status: 'merged',
  };

  return {
    rows: [row],
    summary: {
      totalCount: 1,
      successCount: 1,
      failedCount: 0,
      codeChanges: {
        avgCommits: 5,
        avgFiles: 10,
        avgLines: 200,
        totalCommits: 5,
        totalFiles: 10,
        totalLines: 200,
      },
      reviewStats: {
        avgComments: 8,
        totalComments: 8,
        reviewDensityPerKLoc: 40,
        reviewDensityPerFile: 0.8,
      },
      timelineStats: {
        avgCycleDays: 3.5,
        avgPhaseDurations: {
          dev: 100800,
          wait: 21600,
          review: 151200,
          merge: 28800,
        },
        avgPhasePercentages: {
          dev: 30,
          wait: 10,
          review: 50,
          merge: 10,
        },
      },
    },
    metadata: {
      projectId: 'test/project',
      queriedAt: '2025-11-01T00:00:00.000Z',
      queryDurationMs: 1000,
    },
  };
}

describe('CSV Exporter (T058-T059)', () => {
  describe('T058: export() method', () => {
    it('應該生成包含標頭的 CSV 輸出', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();

      const csv = exporter.export(result);

      expect(csv).toContain('MR IID,Title,Author');
      expect(csv).toContain('Cycle Days,Commits,Files');
    });

    it('應該包含資料行', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();

      const csv = exporter.export(result);
      const lines = csv.split('\n');

      expect(lines.length).toBe(2); // 標頭 + 1 資料行
      expect(lines[1]).toContain('123');
      expect(lines[1]).toContain('Alice');
    });

    it('應該跳過錯誤行', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();

      // 添加錯誤行
      result.rows.push({
        iid: 999,
        title: '',
        author: '',
        cycleDays: 0,
        codeChanges: { commits: 0, files: 0, totalLines: 0 },
        reviewStats: { comments: 0 },
        timeline: {
          dev: { durationSeconds: 0, percentage: 0, formattedDuration: '0s', intensity: { commits: 0, comments: 0, level: 0 } },
          wait: { durationSeconds: 0, percentage: 0, formattedDuration: '0s', intensity: { commits: 0, comments: 0, level: 0 } },
          review: { durationSeconds: 0, percentage: 0, formattedDuration: '0s', intensity: { commits: 0, comments: 0, level: 0 } },
          merge: { durationSeconds: 0, percentage: 0, formattedDuration: '0s', intensity: { commits: 0, comments: 0, level: 0 } },
          totalDurationSeconds: 0,
        },
        status: 'closed',
        error: 'MR not found',
      });

      const csv = exporter.export(result);
      const lines = csv.split('\n');

      expect(lines.length).toBe(2); // 標頭 + 1 成功行（錯誤行被跳過）
    });
  });

  describe('T059: rowToCSV() field mapping', () => {
    it('應該正確映射所有欄位', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();
      const row = result.rows[0];

      const csvRow = exporter.rowToCSV(row);
      const fields = csvRow.split(',');

      expect(fields[0]).toBe('123'); // MR IID
      expect(fields[2]).toBe('Alice'); // Author
      expect(fields[3]).toBe('3.5'); // Cycle Days
      expect(fields[4]).toBe('5'); // Commits
      expect(fields[5]).toBe('10'); // Files
      expect(fields[6]).toBe('200'); // Lines
      expect(fields[7]).toBe('8'); // Comments
      expect(fields[8]).toBe('Yes'); // AI Review
      expect(fields[17]).toBe('merged'); // Status (moved from 16 to 17)
    });

    it('應該正確處理 CSV 特殊字符（逗號）', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();
      result.rows[0].title = 'Test MR with, comma';

      const csvRow = exporter.rowToCSV(result.rows[0]);

      // 標題包含逗號，應該被引號包裹
      expect(csvRow).toContain('"Test MR with, comma"');
    });

    it('應該正確處理雙引號', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();
      result.rows[0].title = 'Test "quoted" title';

      const csvRow = exporter.rowToCSV(result.rows[0]);

      // 雙引號應該被轉義為兩個雙引號
      expect(csvRow).toContain('"Test ""quoted"" title"');
    });

    it('應該正確格式化時間軸資料', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();
      const row = result.rows[0];

      const csvRow = exporter.rowToCSV(row);
      const fields = csvRow.split(',');

      expect(fields[9]).toBe('100800'); // Dev Time (s)
      expect(fields[10]).toBe('21600'); // Wait Time (s)
      expect(fields[11]).toBe('151200'); // Review Time (s)
      expect(fields[12]).toBe('28800'); // Merge Time (s)
      expect(fields[13]).toBe('30.0'); // Dev %
      expect(fields[14]).toBe('10.0'); // Wait %
      expect(fields[15]).toBe('50.0'); // Review %
      expect(fields[16]).toBe('10.0'); // Merge %
    });
  });

  describe('AI Review Column Tests', () => {
    it('應該在 CSV 標頭中包含 AI Review 欄位', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();

      const csv = exporter.export(result);

      expect(csv).toContain('AI Review');
    });

    it('應該正確格式化 AI Review 狀態為 "Yes"', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();
      result.rows[0].reviewStats.aiReviewStatus = 'yes';

      const csvRow = exporter.rowToCSV(result.rows[0]);
      const fields = csvRow.split(',');

      expect(fields[8]).toBe('Yes'); // AI Review column
    });

    it('應該正確格式化 AI Review 狀態為 "No"', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();
      result.rows[0].reviewStats.aiReviewStatus = 'no';

      const csvRow = exporter.rowToCSV(result.rows[0]);
      const fields = csvRow.split(',');

      expect(fields[8]).toBe('No'); // AI Review column
    });

    it('應該正確格式化 AI Review 狀態為 "Unknown"', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();
      result.rows[0].reviewStats.aiReviewStatus = 'unknown';

      const csvRow = exporter.rowToCSV(result.rows[0]);
      const fields = csvRow.split(',');

      expect(fields[8]).toBe('Unknown'); // AI Review column
    });

    it('應該處理 undefined AI Review 狀態為 "Unknown"', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();
      result.rows[0].reviewStats.aiReviewStatus = undefined;

      const csvRow = exporter.rowToCSV(result.rows[0]);
      const fields = csvRow.split(',');

      expect(fields[8]).toBe('Unknown'); // AI Review column
    });

    it('應該確保 AI Review 欄位在正確的位置（Comments 之後）', () => {
      const exporter = new CSVExporter();
      const result = createMockResult();
      const row = result.rows[0];

      const csvRow = exporter.rowToCSV(row);
      const fields = csvRow.split(',');

      expect(fields[7]).toBe('8'); // Comments
      expect(fields[8]).toBe('Yes'); // AI Review (right after Comments)
      expect(fields[9]).toBe('100800'); // Dev Time (s) - moved to index 9
    });
  });
});
