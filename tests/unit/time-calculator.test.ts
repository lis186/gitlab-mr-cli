/**
 * TimeCalculator 單元測試
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TimeCalculator } from '../../src/lib/time-calculator.js';

describe('TimeCalculator', () => {
  let calculator: TimeCalculator;

  beforeEach(() => {
    calculator = new TimeCalculator();
  });

  describe('calculateInterval', () => {
    it('應正確計算時間間隔（秒數）', () => {
      const start = new Date('2025-10-30T10:00:00Z');
      const end = new Date('2025-10-30T10:01:30Z');

      const interval = calculator.calculateInterval(start, end);

      expect(interval).toBe(90); // 1 分 30 秒 = 90 秒
    });

    it('應處理跨小時的時間間隔', () => {
      const start = new Date('2025-10-30T10:45:00Z');
      const end = new Date('2025-10-30T11:15:30Z');

      const interval = calculator.calculateInterval(start, end);

      expect(interval).toBe(1830); // 30 分 30 秒 = 1830 秒
    });

    it('應處理跨日的時間間隔', () => {
      const start = new Date('2025-10-30T23:00:00Z');
      const end = new Date('2025-10-31T01:00:00Z');

      const interval = calculator.calculateInterval(start, end);

      expect(interval).toBe(7200); // 2 小時 = 7200 秒
    });

    it('應在時間寬容度內返回 0（處理時鐘同步問題）', () => {
      const start = new Date('2025-10-30T10:00:05Z');
      const end = new Date('2025-10-30T10:00:00Z'); // 早 5 秒

      const interval = calculator.calculateInterval(start, end, 5);

      expect(interval).toBe(0); // 在 5 秒容差內，視為 0
    });

    it('應在超出時間寬容度時拋出錯誤', () => {
      const start = new Date('2025-10-30T10:00:10Z');
      const end = new Date('2025-10-30T10:00:00Z'); // 早 10 秒

      expect(() => calculator.calculateInterval(start, end, 5)).toThrow(
        '結束時間不可早於開始時間'
      );
    });

    it('應拒絕無效的開始時間', () => {
      const start = new Date('invalid');
      const end = new Date('2025-10-30T10:00:00Z');

      expect(() => calculator.calculateInterval(start, end)).toThrow('開始時間無效');
    });

    it('應拒絕無效的結束時間', () => {
      const start = new Date('2025-10-30T10:00:00Z');
      const end = new Date('invalid');

      expect(() => calculator.calculateInterval(start, end)).toThrow('結束時間無效');
    });
  });

  describe('formatDuration', () => {
    it('應格式化 0 秒', () => {
      expect(calculator.formatDuration(0)).toBe('0s');
    });

    it('應格式化小於 60 秒的時長（Xs）', () => {
      expect(calculator.formatDuration(45)).toBe('45s');
      expect(calculator.formatDuration(1)).toBe('1s');
      expect(calculator.formatDuration(59)).toBe('59s');
    });

    it('應格式化小於 60 分鐘的時長（Xm Ys）', () => {
      expect(calculator.formatDuration(872)).toBe('14m 32s');
      expect(calculator.formatDuration(60)).toBe('1m');
      expect(calculator.formatDuration(90)).toBe('1m 30s');
      expect(calculator.formatDuration(3540)).toBe('59m');
    });

    it('應格式化小於 24 小時的時長（Xh Ym）', () => {
      expect(calculator.formatDuration(7440)).toBe('2h 4m');
      expect(calculator.formatDuration(62520)).toBe('17h 22m');
      expect(calculator.formatDuration(3600)).toBe('1h');
      expect(calculator.formatDuration(3660)).toBe('1h 1m');
      expect(calculator.formatDuration(86340)).toBe('23h 59m');
    });

    it('應格式化大於等於 24 小時的時長（Xd Yh）', () => {
      expect(calculator.formatDuration(105240)).toBe('1d 5h');
      expect(calculator.formatDuration(86400)).toBe('1d');
      expect(calculator.formatDuration(90000)).toBe('1d 1h');
      expect(calculator.formatDuration(259200)).toBe('3d');
      expect(calculator.formatDuration(270000)).toBe('3d 3h');
    });

    it('應拒絕負數時長', () => {
      expect(() => calculator.formatDuration(-10)).toThrow('時間長度不可為負值');
    });
  });

  describe('formatDateTime', () => {
    it('應格式化日期時間為 YYYY-MM-DD HH:mm:ss 格式', () => {
      const date = new Date('2025-10-30T14:35:42Z');

      const formatted = calculator.formatDateTime(date);

      expect(formatted).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('應正確補零', () => {
      const date = new Date('2025-01-05T09:08:07Z');

      const formatted = calculator.formatDateTime(date);

      expect(formatted).toContain('2025-01-05');
      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('應拒絕無效的日期', () => {
      const date = new Date('invalid');

      expect(() => calculator.formatDateTime(date)).toThrow('日期無效');
    });
  });

  describe('整合測試：真實場景', () => {
    it('應正確計算並格式化 MR 建立到合併的時間', () => {
      const created = new Date('2025-10-28T10:35:38Z');
      const merged = new Date('2025-10-29T15:50:00Z');

      const intervalSeconds = calculator.calculateInterval(created, merged);
      const formatted = calculator.formatDuration(intervalSeconds);

      expect(intervalSeconds).toBe(105262); // 約 29.24 小時
      expect(formatted).toBe('1d 5h'); // 1 天 5 小時
    });

    it('應正確處理短時間間隔（如 AI 審查回應）', () => {
      const reviewStart = new Date('2025-10-30T10:00:00Z');
      const authorResponse = new Date('2025-10-30T10:14:32Z');

      const intervalSeconds = calculator.calculateInterval(reviewStart, authorResponse);
      const formatted = calculator.formatDuration(intervalSeconds);

      expect(intervalSeconds).toBe(872);
      expect(formatted).toBe('14m 32s');
    });
  });
});
