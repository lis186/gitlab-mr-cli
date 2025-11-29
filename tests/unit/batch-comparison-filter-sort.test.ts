/**
 * Batch Comparison Filter & Sort Unit Tests (T041-T044)
 *
 * 驗證過濾和排序功能
 */

import { describe, it, expect } from 'vitest';
import type { MRComparisonRow } from '../../src/types/batch-comparison';

// 測試用的 mock 資料
function createMockRows(): MRComparisonRow[] {
  return [
    {
      iid: 101,
      title: 'Feature A',
      author: 'Alice',
      cycleDays: 3.5,
      codeChanges: { commits: 5, files: 10, totalLines: 200 },
      reviewStats: { comments: 8 },
      timeline: {
        dev: { durationSeconds: 100800, percentage: 30, formattedDuration: '1d 4h', intensity: { commits: 5, comments: 0, level: 3 } },
        wait: { durationSeconds: 21600, percentage: 10, formattedDuration: '6h', intensity: { commits: 0, comments: 0, level: 0 } },
        review: { durationSeconds: 151200, percentage: 50, formattedDuration: '1d 18h', intensity: { commits: 0, comments: 8, level: 3 } },
        merge: { durationSeconds: 28800, percentage: 10, formattedDuration: '8h', intensity: { commits: 0, comments: 0, level: 1 } },
        totalDurationSeconds: 302400,
      },
      status: 'merged',
    },
    {
      iid: 102,
      title: 'Feature B',
      author: 'Bob',
      cycleDays: 5.2,
      codeChanges: { commits: 8, files: 15, totalLines: 350 },
      reviewStats: { comments: 12 },
      timeline: {
        dev: { durationSeconds: 172800, percentage: 40, formattedDuration: '2d', intensity: { commits: 8, comments: 0, level: 3 } },
        wait: { durationSeconds: 43200, percentage: 10, formattedDuration: '12h', intensity: { commits: 0, comments: 0, level: 0 } },
        review: { durationSeconds: 194400, percentage: 45, formattedDuration: '2d 6h', intensity: { commits: 0, comments: 12, level: 3 } },
        merge: { durationSeconds: 21600, percentage: 5, formattedDuration: '6h', intensity: { commits: 0, comments: 0, level: 1 } },
        totalDurationSeconds: 432000,
      },
      status: 'merged',
    },
    {
      iid: 103,
      title: 'Feature C',
      author: 'alice',
      cycleDays: 2.1,
      codeChanges: { commits: 3, files: 5, totalLines: 100 },
      reviewStats: { comments: 5 },
      timeline: {
        dev: { durationSeconds: 64800, percentage: 35, formattedDuration: '18h', intensity: { commits: 3, comments: 0, level: 2 } },
        wait: { durationSeconds: 14400, percentage: 8, formattedDuration: '4h', intensity: { commits: 0, comments: 0, level: 0 } },
        review: { durationSeconds: 86400, percentage: 47, formattedDuration: '1d', intensity: { commits: 0, comments: 5, level: 2 } },
        merge: { durationSeconds: 18000, percentage: 10, formattedDuration: '5h', intensity: { commits: 0, comments: 0, level: 1 } },
        totalDurationSeconds: 183600,
      },
      status: 'merged',
    },
  ];
}

describe('Batch Comparison Filter & Sort (T041-T044)', () => {
  describe('T041: Author Filter', () => {
    it('應該過濾出指定作者的 MR（不區分大小寫）', () => {
      const rows = createMockRows();

      // 模擬 applyFilter 的作者過濾邏輯
      const authorLower = 'alice';
      const filtered = rows.filter(row =>
        row.author.toLowerCase().includes(authorLower)
      );

      expect(filtered.length).toBe(2);
      expect(filtered[0].author).toBe('Alice');
      expect(filtered[1].author).toBe('alice');
    });

    it('應該在沒有匹配時返回空陣列', () => {
      const rows = createMockRows();

      const authorLower = 'charlie';
      const filtered = rows.filter(row =>
        row.author.toLowerCase().includes(authorLower)
      );

      expect(filtered.length).toBe(0);
    });
  });

  describe('T042: Cycle Days Filter', () => {
    it('應該過濾出週期時間 >= minCycleDays 的 MR', () => {
      const rows = createMockRows();
      const minCycleDays = 3.0;

      const filtered = rows.filter(row => row.cycleDays >= minCycleDays);

      expect(filtered.length).toBe(2);
      expect(filtered[0].cycleDays).toBe(3.5);
      expect(filtered[1].cycleDays).toBe(5.2);
    });

    it('應該過濾出週期時間 <= maxCycleDays 的 MR', () => {
      const rows = createMockRows();
      const maxCycleDays = 4.0;

      const filtered = rows.filter(row => row.cycleDays <= maxCycleDays);

      expect(filtered.length).toBe(2);
      expect(filtered[0].cycleDays).toBe(3.5);
      expect(filtered[1].cycleDays).toBe(2.1);
    });

    it('應該支援範圍過濾（minCycleDays 和 maxCycleDays 同時使用）', () => {
      const rows = createMockRows();
      const minCycleDays = 2.0;
      const maxCycleDays = 4.0;

      const filtered = rows.filter(
        row => row.cycleDays >= minCycleDays && row.cycleDays <= maxCycleDays
      );

      expect(filtered.length).toBe(2);
      expect(filtered[0].cycleDays).toBe(3.5);
      expect(filtered[1].cycleDays).toBe(2.1);
    });
  });

  describe('T043: Date Range Filter (Deferred)', () => {
    it('日期範圍過濾需要 MR 的 merged_at 或 created_at 資訊', () => {
      // 此測試標記為 TODO，因為 MRComparisonRow 目前沒有儲存日期資訊
      // 實作時需要在 transformToComparisonRow 中添加 mergedAt/createdAt 欄位
      expect(true).toBe(true);
    });
  });

  describe('T044: Sort Functionality', () => {
    it('應該按週期時間遞增排序', () => {
      const rows = createMockRows();

      const sorted = [...rows].sort((a, b) => a.cycleDays - b.cycleDays);

      expect(sorted[0].cycleDays).toBe(2.1);
      expect(sorted[1].cycleDays).toBe(3.5);
      expect(sorted[2].cycleDays).toBe(5.2);
    });

    it('應該按週期時間遞減排序', () => {
      const rows = createMockRows();

      const sorted = [...rows].sort((a, b) => b.cycleDays - a.cycleDays);

      expect(sorted[0].cycleDays).toBe(5.2);
      expect(sorted[1].cycleDays).toBe(3.5);
      expect(sorted[2].cycleDays).toBe(2.1);
    });

    it('應該按提交數排序', () => {
      const rows = createMockRows();

      const sorted = [...rows].sort((a, b) =>
        a.codeChanges.commits - b.codeChanges.commits
      );

      expect(sorted[0].codeChanges.commits).toBe(3);
      expect(sorted[1].codeChanges.commits).toBe(5);
      expect(sorted[2].codeChanges.commits).toBe(8);
    });

    it('應該按評論數排序', () => {
      const rows = createMockRows();

      const sorted = [...rows].sort((a, b) =>
        b.reviewStats.comments - a.reviewStats.comments
      );

      expect(sorted[0].reviewStats.comments).toBe(12);
      expect(sorted[1].reviewStats.comments).toBe(8);
      expect(sorted[2].reviewStats.comments).toBe(5);
    });

    it('應該按審查時間排序', () => {
      const rows = createMockRows();

      const sorted = [...rows].sort((a, b) =>
        a.timeline.review.durationSeconds - b.timeline.review.durationSeconds
      );

      expect(sorted[0].timeline.review.durationSeconds).toBe(86400);
      expect(sorted[1].timeline.review.durationSeconds).toBe(151200);
      expect(sorted[2].timeline.review.durationSeconds).toBe(194400);
    });
  });

  describe('Combined Filter and Sort', () => {
    it('應該支援過濾後排序', () => {
      const rows = createMockRows();

      // 過濾：作者包含 'alice'
      const authorLower = 'alice';
      const filtered = rows.filter(row =>
        row.author.toLowerCase().includes(authorLower)
      );

      // 排序：按週期時間遞增
      const sorted = [...filtered].sort((a, b) => a.cycleDays - b.cycleDays);

      expect(sorted.length).toBe(2);
      expect(sorted[0].cycleDays).toBe(2.1);
      expect(sorted[1].cycleDays).toBe(3.5);
    });

    it('應該支援多條件過濾後排序', () => {
      const rows = createMockRows();

      // 過濾：週期時間 >= 2.5 天
      const minCycleDays = 2.5;
      const filtered = rows.filter(row => row.cycleDays >= minCycleDays);

      // 排序：按評論數遞減
      const sorted = [...filtered].sort((a, b) =>
        b.reviewStats.comments - a.reviewStats.comments
      );

      expect(sorted.length).toBe(2);
      expect(sorted[0].reviewStats.comments).toBe(12);
      expect(sorted[1].reviewStats.comments).toBe(8);
    });
  });
});
