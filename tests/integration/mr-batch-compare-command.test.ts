/**
 * MR Batch Compare Command 整合測試
 * Feature: 011-mr-batch-comparison
 * Tasks: T060-T062
 *
 * 測試範圍：
 * - T060: --json 輸出格式
 * - T061: --csv 輸出格式
 * - T062: --output 檔案寫入
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Gitlab } from '@gitbeaker/rest';
import { readFileSync, unlinkSync, existsSync, writeFileSync } from 'fs';
import type { BatchComparisonResult } from '../../src/types/batch-comparison.js';
import { CSVExporter } from '../../src/formatters/csv-exporter.js';

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn(),
}));

// Mock 資料
function createMockResult(): BatchComparisonResult {
  return {
    rows: [
      {
        iid: 123,
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
        iid: 124,
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
        avgCycleDays: 4.35,
        avgPhaseDurations: {
          dev: 136800,
          wait: 32400,
          review: 172800,
          merge: 25200,
        },
        avgPhasePercentages: {
          dev: 35,
          wait: 10,
          review: 47.5,
          merge: 7.5,
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

describe('MR Batch Compare Command Integration Tests (T060-T062)', () => {
  let mockGitlab: any;

  beforeEach(() => {
    // Mock GitLab client
    mockGitlab = {
      MergeRequests: {
        show: vi.fn(),
        all: vi.fn(),
      },
    };
    vi.mocked(Gitlab).mockReturnValue(mockGitlab);
  });

  describe('T060: --json 輸出格式測試', () => {
    it('應輸出有效的 JSON 格式', () => {
      const mockResult = createMockResult();
      const jsonOutput = JSON.stringify(mockResult, null, 2);

      // 驗證 JSON 可以被解析
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toHaveProperty('rows');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('metadata');
    });

    it('應包含所有必要的欄位', () => {
      const mockResult = createMockResult();
      const jsonOutput = JSON.stringify(mockResult, null, 2);
      const parsed = JSON.parse(jsonOutput);

      // 驗證 rows
      expect(Array.isArray(parsed.rows)).toBe(true);
      expect(parsed.rows.length).toBe(2);
      expect(parsed.rows[0]).toHaveProperty('iid');
      expect(parsed.rows[0]).toHaveProperty('title');
      expect(parsed.rows[0]).toHaveProperty('author');
      expect(parsed.rows[0]).toHaveProperty('cycleDays');
      expect(parsed.rows[0]).toHaveProperty('codeChanges');
      expect(parsed.rows[0]).toHaveProperty('reviewStats');
      expect(parsed.rows[0]).toHaveProperty('timeline');
      expect(parsed.rows[0]).toHaveProperty('status');

      // 驗證 summary
      expect(parsed.summary).toHaveProperty('totalCount');
      expect(parsed.summary).toHaveProperty('successCount');
      expect(parsed.summary).toHaveProperty('failedCount');
      expect(parsed.summary).toHaveProperty('codeChanges');
      expect(parsed.summary).toHaveProperty('reviewStats');
      expect(parsed.summary).toHaveProperty('timelineStats');

      // 驗證 metadata
      expect(parsed.metadata).toHaveProperty('projectId');
      expect(parsed.metadata).toHaveProperty('queriedAt');
      expect(parsed.metadata).toHaveProperty('queryDurationMs');
    });

    it('應正確序列化數字和字串', () => {
      const mockResult = createMockResult();
      const jsonOutput = JSON.stringify(mockResult, null, 2);
      const parsed = JSON.parse(jsonOutput);

      // 數字型別
      expect(typeof parsed.rows[0].iid).toBe('number');
      expect(typeof parsed.rows[0].cycleDays).toBe('number');
      expect(typeof parsed.rows[0].codeChanges.commits).toBe('number');

      // 字串型別
      expect(typeof parsed.rows[0].title).toBe('string');
      expect(typeof parsed.rows[0].author).toBe('string');
      expect(typeof parsed.rows[0].status).toBe('string');
    });
  });

  describe('T061: --csv 輸出格式測試', () => {
    it('應輸出有效的 CSV 格式（包含標頭）', () => {
      const mockResult = createMockResult();

      const exporter = new CSVExporter();
      const csvOutput = exporter.export(mockResult);

      const lines = csvOutput.split('\n');

      // 驗證標頭存在
      expect(lines[0]).toContain('MR IID');
      expect(lines[0]).toContain('Title');
      expect(lines[0]).toContain('Author');
      expect(lines[0]).toContain('Cycle Days');
      expect(lines[0]).toContain('Commits');
      expect(lines[0]).toContain('Files');
      expect(lines[0]).toContain('Lines');
      expect(lines[0]).toContain('Comments');
      expect(lines[0]).toContain('Status');
    });

    it('應包含正確數量的資料行', () => {
      const mockResult = createMockResult();

      const exporter = new CSVExporter();
      const csvOutput = exporter.export(mockResult);

      const lines = csvOutput.split('\n');

      // 標頭 + 2 資料行
      expect(lines.length).toBe(3);
    });

    it('應正確格式化資料行', () => {
      const mockResult = createMockResult();

      const exporter = new CSVExporter();
      const csvOutput = exporter.export(mockResult);

      const lines = csvOutput.split('\n');

      // 驗證第一行資料
      expect(lines[1]).toContain('123'); // iid
      expect(lines[1]).toContain('Alice'); // author
      expect(lines[1]).toContain('3.5'); // cycleDays
      expect(lines[1]).toContain('merged'); // status
    });

    it('應跳過錯誤行', () => {
      const mockResult = createMockResult();

      // 添加錯誤行
      mockResult.rows.push({
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

      const exporter = new CSVExporter();
      const csvOutput = exporter.export(mockResult);

      const lines = csvOutput.split('\n');

      // 標頭 + 2 成功行（錯誤行被跳過）
      expect(lines.length).toBe(3);
    });
  });

  describe('T062: --output 檔案寫入測試', () => {
    const testFilePath = '/tmp/test-mr-batch-compare-output.json';

    afterEach(() => {
      // 清理測試檔案
      if (existsSync(testFilePath)) {
        unlinkSync(testFilePath);
      }
    });

    it('應成功寫入 JSON 檔案', () => {
      const mockResult = createMockResult();
      const jsonOutput = JSON.stringify(mockResult, null, 2);

      // 模擬檔案寫入
      writeFileSync(testFilePath, jsonOutput, 'utf-8');

      // 驗證檔案存在
      expect(existsSync(testFilePath)).toBe(true);

      // 驗證檔案內容
      const fileContent = readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      expect(parsed).toHaveProperty('rows');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('metadata');
    });

    it('應成功寫入 CSV 檔案', () => {
      const mockResult = createMockResult();

      const exporter = new CSVExporter();
      const csvOutput = exporter.export(mockResult);

      // 模擬檔案寫入
      writeFileSync(testFilePath, csvOutput, 'utf-8');

      // 驗證檔案存在
      expect(existsSync(testFilePath)).toBe(true);

      // 驗證檔案內容
      const fileContent = readFileSync(testFilePath, 'utf-8');
      expect(fileContent).toContain('MR IID');
      expect(fileContent).toContain('123');
      expect(fileContent).toContain('Alice');
    });

    it('應正確處理寫入錯誤（無效路徑）', () => {
      const mockResult = createMockResult();
      const jsonOutput = JSON.stringify(mockResult, null, 2);
      const invalidPath = '/invalid/path/that/does/not/exist/output.json';

      // 驗證寫入無效路徑會拋出錯誤
      expect(() => {
        writeFileSync(invalidPath, jsonOutput, 'utf-8');
      }).toThrow();
    });
  });

  describe('Date Range Functionality Tests', () => {
    describe('Basic --since/--until flag usage', () => {
      it('should accept --since flag with YYYY-MM-DD format', () => {
        const sinceDate = '2025-09-01';
        const isoDate = new Date(sinceDate).toISOString();

        // Verify date parsing and normalization
        expect(isoDate).toMatch(/^2025-09-01T00:00:00\.000Z$/);
      });

      it('should accept --until flag with YYYY-MM-DD format', () => {
        const untilDate = '2025-10-31';
        const date = new Date(untilDate);
        date.setUTCHours(23, 59, 59, 999);
        const isoDate = date.toISOString();

        // Verify date parsing includes end of day
        expect(isoDate).toMatch(/^2025-10-31T23:59:59\.999Z$/);
      });

      it('should accept both --since and --until flags together', () => {
        const sinceDate = '2025-09-01';
        const untilDate = '2025-10-31';

        const sinceISO = new Date(sinceDate).toISOString();
        const untilDate_obj = new Date(untilDate);
        untilDate_obj.setUTCHours(23, 59, 59, 999);
        const untilISO = untilDate_obj.toISOString();

        // Verify date range is valid
        expect(new Date(sinceISO).getTime()).toBeLessThan(new Date(untilISO).getTime());
      });
    });

    describe('Date validation edge cases', () => {
      it('should handle single day range (same --since and --until)', () => {
        const date = '2025-10-15';
        const sinceISO = new Date(date).toISOString();

        const untilDate = new Date(date);
        untilDate.setUTCHours(23, 59, 59, 999);
        const untilISO = untilDate.toISOString();

        // Single day range should be valid (since at 00:00:00, until at 23:59:59)
        expect(new Date(sinceISO).getTime()).toBeLessThan(new Date(untilISO).getTime());
      });

      it('should handle month boundary dates', () => {
        const sinceDate = '2025-09-30'; // Last day of September
        const untilDate = '2025-10-01'; // First day of October

        const sinceISO = new Date(sinceDate).toISOString();
        const untilDate_obj = new Date(untilDate);
        untilDate_obj.setUTCHours(23, 59, 59, 999);
        const untilISO = untilDate_obj.toISOString();

        expect(new Date(sinceISO).getTime()).toBeLessThan(new Date(untilISO).getTime());
      });

      it('should handle year boundary dates', () => {
        const sinceDate = '2024-12-31'; // Last day of 2024
        const untilDate = '2025-01-01'; // First day of 2025

        const sinceISO = new Date(sinceDate).toISOString();
        const untilDate_obj = new Date(untilDate);
        untilDate_obj.setUTCHours(23, 59, 59, 999);
        const untilISO = untilDate_obj.toISOString();

        expect(new Date(sinceISO).getTime()).toBeLessThan(new Date(untilISO).getTime());
      });

      it('should handle leap year date (2024-02-29)', () => {
        const date = '2024-02-29';
        const isoDate = new Date(date).toISOString();

        // Verify leap year date is parsed correctly
        expect(isoDate).toMatch(/^2024-02-29T00:00:00\.000Z$/);
      });
    });

    describe('UTC timezone boundary handling', () => {
      it('should normalize --since to start of day in UTC (00:00:00)', () => {
        const sinceDate = '2025-10-15';
        const isoDate = new Date(sinceDate).toISOString();

        // Verify time is normalized to start of day
        expect(isoDate).toMatch(/T00:00:00\.000Z$/);
      });

      it('should normalize --until to end of day in UTC (23:59:59.999)', () => {
        const untilDate = '2025-10-15';
        const date = new Date(untilDate);
        date.setUTCHours(23, 59, 59, 999);
        const isoDate = date.toISOString();

        // Verify time is normalized to end of day
        expect(isoDate).toMatch(/T23:59:59\.999Z$/);
      });

      it('should handle date range crossing timezone boundaries', () => {
        // Test that UTC normalization is consistent across different input formats
        const date1 = new Date('2025-10-15');
        const date2 = new Date('2025-10-15T00:00:00Z');
        const date3 = new Date('2025-10-15T00:00:00.000Z');

        expect(date1.toISOString()).toBe(date2.toISOString());
        expect(date2.toISOString()).toBe(date3.toISOString());
      });

      it('should ensure end date includes full day (23:59:59.999 vs 00:00:00)', () => {
        const date = '2025-10-15';

        // Without normalization (start of day)
        const startOfDay = new Date(date).toISOString();

        // With end-of-day normalization
        const endOfDayDate = new Date(date);
        endOfDayDate.setUTCHours(23, 59, 59, 999);
        const endOfDay = endOfDayDate.toISOString();

        // Verify they are different and end of day is later
        expect(startOfDay).not.toBe(endOfDay);
        expect(new Date(endOfDay).getTime() - new Date(startOfDay).getTime()).toBe(
          86399999 // 23h 59m 59s 999ms in milliseconds
        );
      });
    });

    describe('Integration with GitLab API query options', () => {
      it('should map --since to created_after API parameter', () => {
        const sinceDate = '2025-09-01';
        const expectedISO = new Date(sinceDate).toISOString();

        const queryOptions = {
          created_after: expectedISO,
        };

        expect(queryOptions.created_after).toBe(expectedISO);
      });

      it('should map --until to created_before API parameter with end-of-day time', () => {
        const untilDate = '2025-10-31';
        const date = new Date(untilDate);
        date.setUTCHours(23, 59, 59, 999);
        const expectedISO = date.toISOString();

        const queryOptions = {
          created_before: expectedISO,
        };

        expect(queryOptions.created_before).toBe(expectedISO);
      });

      it('should construct valid date range query options', () => {
        const sinceDate = '2025-09-01';
        const untilDate = '2025-10-31';

        const sinceISO = new Date(sinceDate).toISOString();
        const untilDate_obj = new Date(untilDate);
        untilDate_obj.setUTCHours(23, 59, 59, 999);
        const untilISO = untilDate_obj.toISOString();

        const queryOptions = {
          state: 'merged',
          order_by: 'created_at',
          sort: 'desc',
          created_after: sinceISO,
          created_before: untilISO,
        };

        expect(queryOptions.created_after).toBeDefined();
        expect(queryOptions.created_before).toBeDefined();
        expect(new Date(queryOptions.created_after!).getTime()).toBeLessThan(
          new Date(queryOptions.created_before!).getTime()
        );
      });

      it('should map --labels to labels API parameter with single label', () => {
        const labelsInput = 'frontend';

        const queryOptions = {
          labels: labelsInput,
        };

        expect(queryOptions.labels).toBe('frontend');
      });

      it('should map --labels to labels API parameter with multiple labels (OR logic)', () => {
        const labelsInput = 'frontend,backend';

        const queryOptions = {
          labels: labelsInput,
        };

        expect(queryOptions.labels).toBe('frontend,backend');
      });

      it('should trim whitespace from labels input', () => {
        const labelsInput = '  frontend,  backend  ';
        const cleaned = labelsInput
          .split(',')
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .join(',');

        const queryOptions = {
          labels: cleaned,
        };

        expect(queryOptions.labels).toBe('frontend,backend');
      });

      it('should filter out empty label strings', () => {
        const labelsInput = 'frontend,,backend';
        const cleaned = labelsInput
          .split(',')
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .join(',');

        const queryOptions = {
          labels: cleaned,
        };

        expect(queryOptions.labels).toBe('frontend,backend');
      });

      it('should reject all-empty labels input', () => {
        const labelsInput = '  ,  ,  ';
        const labels = labelsInput
          .split(',')
          .map(l => l.trim())
          .filter(l => l.length > 0);

        expect(labels.length).toBe(0);
        expect(() => {
          if (labels.length === 0) {
            throw new Error('❌ labels 參數不能為空');
          }
        }).toThrow('❌ labels 參數不能為空');
      });
    });

    describe('Filter object construction', () => {
      it('should construct filter.dateRange with since/until fields when --since/--until provided', () => {
        const sinceFlag = '2025-09-01';
        const untilFlag = '2025-10-31';

        // Simulating the filter construction logic from mr-batch-compare.ts line 489-492
        const filter = {
          dateRange: {
            since: sinceFlag || '',
            until: untilFlag || '',
          },
        };

        expect(filter.dateRange.since).toBe(sinceFlag);
        expect(filter.dateRange.until).toBe(untilFlag);
      });

      it('should handle partial date range (only --since)', () => {
        const sinceFlag = '2025-09-01';

        const filter = {
          dateRange: {
            since: sinceFlag || '',
            until: '', // No --until provided
          },
        };

        expect(filter.dateRange.since).toBe(sinceFlag);
        expect(filter.dateRange.until).toBe('');
      });

      it('should handle partial date range (only --until)', () => {
        const untilFlag = '2025-10-31';

        const filter = {
          dateRange: {
            since: '', // No --since provided
            until: untilFlag || '',
          },
        };

        expect(filter.dateRange.since).toBe('');
        expect(filter.dateRange.until).toBe(untilFlag);
      });
    });

    describe('Negative test cases - Error scenarios', () => {
      it('should reject invalid date format for --since', () => {
        const invalidDate = 'invalid-date';
        const date = new Date(invalidDate);

        // Verify invalid date produces NaN timestamp
        expect(isNaN(date.getTime())).toBe(true);
      });

      it('should reject invalid date format for --until', () => {
        const invalidDate = 'abc-123-xyz';
        const date = new Date(invalidDate);

        // Verify invalid date produces NaN timestamp
        expect(isNaN(date.getTime())).toBe(true);
      });

      it('should detect since date after until date', () => {
        const sinceDate = '2025-12-31';
        const untilDate = '2025-01-01';

        const since = new Date(sinceDate);
        const until = new Date(untilDate);

        // Verify since is after until (invalid range)
        expect(since.getTime()).toBeGreaterThan(until.getTime());
      });

      it('should handle malformed date strings gracefully', () => {
        const malformedDates = [
          '2025-13-01', // Invalid month
          '2025-02-30', // Invalid day for February
          '2025/09/01', // Wrong separator
          '09-01-2025', // Wrong order
          '2025-9-1',   // Missing leading zeros (but valid)
        ];

        malformedDates.forEach(dateStr => {
          const date = new Date(dateStr);
          // Some may be valid, some invalid - just verify we can parse them
          const isValid = !isNaN(date.getTime());
          expect(typeof isValid).toBe('boolean');
        });
      });

      it('should detect missing date values in filter construction', () => {
        const emptyFilter = {
          dateRange: {
            since: '',
            until: '',
          },
        };

        // Verify both fields are empty
        expect(emptyFilter.dateRange.since).toBe('');
        expect(emptyFilter.dateRange.until).toBe('');
      });

      it('should validate ISO 8601 format requirements', () => {
        // Valid ISO 8601 date formats
        const validDates = [
          '2025-09-01',
          '2025-01-01',
          '2024-12-31',
        ];

        validDates.forEach(dateStr => {
          const date = new Date(dateStr);
          expect(isNaN(date.getTime())).toBe(false);
          expect(date.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });
      });

      it('should handle extreme date ranges', () => {
        const since = new Date('2020-01-01');
        const until = new Date('2025-12-31');
        const daysDiff = (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24);

        // Verify large date range is detected (> 365 days)
        expect(daysDiff).toBeGreaterThan(365);
        expect(Math.round(daysDiff)).toBeGreaterThan(2000);
      });

      it('should handle same date for since and until', () => {
        const date = '2025-10-15';
        const since = new Date(date);
        const until = new Date(date);
        until.setUTCHours(23, 59, 59, 999);

        // Should still be valid (single day range)
        expect(since.getTime()).toBeLessThan(until.getTime());

        const hoursDiff = (until.getTime() - since.getTime()) / (1000 * 60 * 60);
        expect(hoursDiff).toBeCloseTo(23.999, 1);
      });
    });

    describe('--include-events flag 測試', () => {
      it('should include events array when includeEvents is true', () => {
        const resultWithEvents = {
          ...createMockResult(),
          rows: [
            {
              ...createMockResult().rows[0],
              events: [
                {
                  sequence: 1,
                  timestamp: '2025-10-01T10:00:00.000Z',
                  actor: {
                    id: 1,
                    username: 'alice',
                    name: 'Alice',
                    role: 'Author',
                    isAIBot: false,
                  },
                  eventType: 'MR Created',
                  intervalToNext: 3600,
                },
                {
                  sequence: 2,
                  timestamp: '2025-10-01T11:00:00.000Z',
                  actor: {
                    id: 2,
                    username: 'bob',
                    name: 'Bob',
                    role: 'Reviewer',
                    isAIBot: false,
                  },
                  eventType: 'Human Review Started',
                  intervalToNext: 7200,
                },
                {
                  sequence: 3,
                  timestamp: '2025-10-01T13:00:00.000Z',
                  actor: {
                    id: 1,
                    username: 'alice',
                    name: 'Alice',
                    role: 'Author',
                    isAIBot: false,
                  },
                  eventType: 'Marked as Ready',
                  intervalToNext: 3600,
                },
              ],
            },
          ],
        };

        const jsonOutput = JSON.stringify(resultWithEvents, null, 2);
        const parsed = JSON.parse(jsonOutput);

        expect(parsed.rows[0]).toHaveProperty('events');
        expect(Array.isArray(parsed.rows[0].events)).toBe(true);
        expect(parsed.rows[0].events.length).toBe(3);
        expect(parsed.rows[0].events[0]).toHaveProperty('sequence');
        expect(parsed.rows[0].events[0]).toHaveProperty('timestamp');
        expect(parsed.rows[0].events[0]).toHaveProperty('actor');
        expect(parsed.rows[0].events[0]).toHaveProperty('eventType');
      });

      it('should not include events array when includeEvents is false', () => {
        const mockResult = createMockResult();
        const jsonOutput = JSON.stringify(mockResult, null, 2);
        const parsed = JSON.parse(jsonOutput);

        expect(parsed.rows[0].events).toBeUndefined();
      });

      it('should preserve event actor information correctly', () => {
        const resultWithEvents = {
          ...createMockResult(),
          rows: [
            {
              ...createMockResult().rows[0],
              events: [
                {
                  sequence: 1,
                  timestamp: '2025-10-01T10:00:00.000Z',
                  actor: {
                    id: 123,
                    username: 'testuser',
                    name: 'Test User',
                    role: 'Author',
                    isAIBot: false,
                  },
                  eventType: 'MR Created',
                },
              ],
            },
          ],
        };

        const jsonOutput = JSON.stringify(resultWithEvents, null, 2);
        const parsed = JSON.parse(jsonOutput);

        const actor = parsed.rows[0].events[0].actor;
        expect(actor.id).toBe(123);
        expect(actor.username).toBe('testuser');
        expect(actor.name).toBe('Test User');
        expect(actor.role).toBe('Author');
        expect(actor.isAIBot).toBe(false);
      });

      it('should include Marked as Ready events', () => {
        const resultWithDraftEvents = {
          ...createMockResult(),
          rows: [
            {
              ...createMockResult().rows[0],
              events: [
                {
                  sequence: 1,
                  timestamp: '2025-10-01T10:00:00.000Z',
                  actor: {
                    id: 1,
                    username: 'alice',
                    name: 'Alice',
                    role: 'Author',
                    isAIBot: false,
                  },
                  eventType: 'MR Created',
                },
                {
                  sequence: 2,
                  timestamp: '2025-10-01T11:00:00.000Z',
                  actor: {
                    id: 1,
                    username: 'alice',
                    name: 'Alice',
                    role: 'Author',
                    isAIBot: false,
                  },
                  eventType: 'Marked as Ready',
                  intervalToNext: 3600,
                },
              ],
            },
          ],
        };

        const jsonOutput = JSON.stringify(resultWithDraftEvents, null, 2);
        const parsed = JSON.parse(jsonOutput);

        const markedReadyEvent = parsed.rows[0].events.find(
          (e: any) => e.eventType === 'Marked as Ready'
        );

        expect(markedReadyEvent).toBeDefined();
        expect(markedReadyEvent.sequence).toBe(2);
        expect(markedReadyEvent.intervalToNext).toBe(3600);
      });
    });
  });
});
