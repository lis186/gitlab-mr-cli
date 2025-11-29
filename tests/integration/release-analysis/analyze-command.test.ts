/**
 * release:analyze 命令整合測試
 *
 * 驗證發布批量分析命令的完整流程（3 個月時間範圍）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReleaseConfiguration } from '../../../src/types/release-config.js';

// 測試配置：模擬 example/mobile-app 的 AppStore 標籤格式
const mockConfig: ReleaseConfiguration = {
    name: 'ios-test',
    description: 'iOS 專案發布配置（測試用）',
    tag: {
      pattern: '^AppStore(\\d{2})\\.(\\d{1,2})\\.(\\d+)$',
      groups: {
        year: 1,
        month: 2,
        patch: 3,
      },
    },
    release_types: {
      major: {
        name: 'major',
        description: '正式月度發布',
        priority: 1,
        evaluate_batch_size: true,  // 評估批量健康度
        rules: [
          {
            field: 'patch',
            operator: 'equals',
            value: 0,
          },
        ],
        color: 'green',
      },
      hotfix: {
        name: 'hotfix',
        description: '緊急修復版本',
        priority: 2,
        evaluate_batch_size: false,  // 不評估批量
        rules: [
          {
            field: 'patch',
            operator: 'ends_with',
            value: 5,
          },
        ],
        color: 'red',
      },
      minor: {
        name: 'minor',
        description: '小版本更新',
        priority: 99,
        evaluate_batch_size: false,  // 不評估批量
        rules: [
          {
            field: 'patch',
            operator: 'greater_than',
            value: 0,
          },
        ],
        color: 'blue',
      },
    },
    analysis: {
      default_branch: 'develop',
      thresholds: {
        mr_count: {
          healthy: 50,
          warning: 100,
          critical: 100,
        },
        loc_changes: {
          healthy: 5000,
          warning: 10000,
          critical: 10000,
        },
        release_interval_days: {
          expected: 30,
          tolerance: 5,
        },
        code_freeze_days: {
          healthy_min: 1,
          healthy_max: 3,
          warning_max: 5,
        },
      },
    },
  };

// 模擬 3 個月內的 6 個發布標籤（2025-07-26 至 2025-10-26）
const mockTags = [
    {
      name: 'AppStore25.10.0',
      commit: {
        id: 'commit-6',
        created_at: '2025-10-15T10:00:00Z',
        committed_date: '2025-10-15T10:00:00Z',
      },
    },
    {
      name: 'AppStore25.10.15',
      commit: {
        id: 'commit-5',
        created_at: '2025-10-10T10:00:00Z',
        committed_date: '2025-10-10T10:00:00Z',
      },
    },
    {
      name: 'AppStore25.9.0',
      commit: {
        id: 'commit-4',
        created_at: '2025-09-15T10:00:00Z',
        committed_date: '2025-09-15T10:00:00Z',
      },
    },
    {
      name: 'AppStore25.9.5',
      commit: {
        id: 'commit-3',
        created_at: '2025-09-10T10:00:00Z',
        committed_date: '2025-09-10T10:00:00Z',
      },
    },
    {
      name: 'AppStore25.8.0',
      commit: {
        id: 'commit-2',
        created_at: '2025-08-15T10:00:00Z',
        committed_date: '2025-08-15T10:00:00Z',
      },
    },
    {
      name: 'AppStore25.8.3',
      commit: {
        id: 'commit-1',
        created_at: '2025-08-05T10:00:00Z',
        committed_date: '2025-08-05T10:00:00Z',
      },
    },
  ];

// 模擬 MR 資料
const mockMRs = [
    {
      iid: 101,
      title: 'Feature: Add new payment method',
      author: { name: 'Alice' },
      merged_at: '2025-10-14T15:00:00Z',
      changes_count: 250,
    },
    {
      iid: 102,
      title: 'Fix: Resolve checkout bug',
      author: { name: 'Bob' },
      merged_at: '2025-10-13T10:00:00Z',
      changes_count: 50,
    },
  ];

// 模擬 commit 比較資料
const mockCompare = {
    commits: [
      { id: 'abc123', created_at: '2025-10-14T15:00:00Z' },
      { id: 'def456', created_at: '2025-10-13T10:00:00Z' },
    ],
    diffs: [
      { old_path: 'file1.ts', new_path: 'file1.ts', diff: '+10 -5' },
      { old_path: 'file2.ts', new_path: 'file2.ts', diff: '+20 -10' },
    ],
  };

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => {
  return {
    Gitlab: vi.fn().mockImplementation(() => {
      return {
        Tags: {
          all: vi.fn().mockResolvedValue(mockTags),
        },
        Repositories: {
          compare: vi.fn().mockResolvedValue(mockCompare),
        },
        MergeRequests: {
          all: vi.fn().mockResolvedValue(mockMRs),
          changes: vi.fn().mockResolvedValue({
            additions: 150,
            deletions: 50,
            changes_count: '200',
          }),
        },
      };
    }),
  };
});

// Mock ConfigLoader
vi.mock('../../../src/services/config/config-loader.js', () => {
  return {
    ConfigLoader: vi.fn().mockImplementation(() => {
      return {
        loadConfig: vi.fn().mockResolvedValue({
          config: mockConfig,
          source: 'test-config',
          source_path: '.gitlab-analysis-test.yml',
        }),
      };
    }),
  };
});

import ReleaseAnalyze from '../../../src/commands/release/analyze.js';

describe('ReleaseAnalyze Command Integration (3-Month Time Range)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本流程測試', () => {
    it('應成功執行 3 個月範圍的分析（不報錯）', async () => {
      const command = new ReleaseAnalyze(
        [
          '--project',
          'example/mobile-app',
          '--since',
          '2025-07-26',
          '--until',
          '2025-10-26',
        ],
        {} as any
      );

      // Mock parse 返回 flags
      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'example/mobile-app',
          token: 'test-token',
          host: 'https://gitlab.com',
          since: '2025-07-26',
          until: '2025-10-26',
          config: undefined,
          output: 'table',
          json: false,
          'include-types': undefined,
          'exclude-types': undefined,
        },
      });

      // Mock log 以抑制輸出
      vi.spyOn(command, 'log').mockImplementation(() => {});
      vi.spyOn(command, 'warn').mockImplementation(() => {});

      // 應該不拋出錯誤
      await expect(command.run()).resolves.not.toThrow();
    });

    it('應在 JSON 模式下成功輸出', async () => {
      const command = new ReleaseAnalyze(
        [
          '--project',
          'example/mobile-app',
          '--since',
          '2025-07-26',
          '--until',
          '2025-10-26',
          '--json',
        ],
        {} as any
      );

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'example/mobile-app',
          token: 'test-token',
          host: 'https://gitlab.com',
          since: '2025-07-26',
          until: '2025-10-26',
          config: undefined,
          output: 'table',
          json: true,
          'include-types': undefined,
          'exclude-types': undefined,
        },
      });

      const logSpy = vi.spyOn(command, 'log').mockImplementation(() => {});

      await expect(command.run()).resolves.not.toThrow();

      // 驗證有輸出 JSON（至少一次 log 調用）
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('配置載入測試', () => {
    it('應正確載入 CLI 指定的配置檔', async () => {
      const command = new ReleaseAnalyze(
        [
          '--project',
          'example/mobile-app',
          '--config',
          '.gitlab-analysis-test.yml',
          '--since',
          '2025-07-26',
          '--until',
          '2025-10-26',
        ],
        {} as any
      );

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'example/mobile-app',
          token: 'test-token',
          host: 'https://gitlab.com',
          since: '2025-07-26',
          until: '2025-10-26',
          config: '.gitlab-analysis-test.yml',
          output: 'table',
          json: false,
          'include-types': undefined,
          'exclude-types': undefined,
        },
      });

      vi.spyOn(command, 'log').mockImplementation(() => {});

      await expect(command.run()).resolves.not.toThrow();
    });
  });

  describe('錯誤處理測試', () => {
    it('應在缺少 token 時報錯', async () => {
      const command = new ReleaseAnalyze(
        ['--project', 'example/mobile-app'],
        {} as any
      );

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'example/mobile-app',
          token: undefined,
          host: 'https://gitlab.com',
          since: undefined,
          until: undefined,
          config: undefined,
          output: 'table',
          json: false,
          'include-types': undefined,
          'exclude-types': undefined,
        },
      });

      const mockError = vi.spyOn(command, 'error').mockImplementation(() => {
        throw new Error('Token required');
      });

      await expect(command.run()).rejects.toThrow('Token required');
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('GitLab Personal Access Token')
      );
    });

    it('應在日期格式錯誤時報錯', async () => {
      const command = new ReleaseAnalyze(
        ['--project', 'example/mobile-app', '--since', 'invalid-date'],
        {} as any
      );

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'example/mobile-app',
          token: 'test-token',
          host: 'https://gitlab.com',
          since: 'invalid-date',
          until: undefined,
          config: undefined,
          output: 'table',
          json: false,
          'include-types': undefined,
          'exclude-types': undefined,
        },
      });

      const mockError = vi.spyOn(command, 'error').mockImplementation(() => {
        throw new Error('Invalid date format');
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('日期格式錯誤')
      );
    });
  });

  describe('類型篩選測試', () => {
    it('應正確處理 include-types 參數', async () => {
      const command = new ReleaseAnalyze(
        [
          '--project',
          'example/mobile-app',
          '--since',
          '2025-07-26',
          '--until',
          '2025-10-26',
          '--include-types',
          'major,minor',
        ],
        {} as any
      );

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'example/mobile-app',
          token: 'test-token',
          host: 'https://gitlab.com',
          since: '2025-07-26',
          until: '2025-10-26',
          config: undefined,
          output: 'table',
          json: false,
          'include-types': 'major,minor',
          'exclude-types': undefined,
        },
      });

      vi.spyOn(command, 'log').mockImplementation(() => {});

      await expect(command.run()).resolves.not.toThrow();
    });

    it('應正確處理 exclude-types 參數', async () => {
      const command = new ReleaseAnalyze(
        [
          '--project',
          'example/mobile-app',
          '--since',
          '2025-07-26',
          '--until',
          '2025-10-26',
          '--exclude-types',
          'hotfix',
        ],
        {} as any
      );

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'example/mobile-app',
          token: 'test-token',
          host: 'https://gitlab.com',
          since: '2025-07-26',
          until: '2025-10-26',
          config: undefined,
          output: 'table',
          json: false,
          'include-types': undefined,
          'exclude-types': 'hotfix',
        },
      });

      vi.spyOn(command, 'log').mockImplementation(() => {});

      await expect(command.run()).resolves.not.toThrow();
    });
  });

  describe('時間範圍驗證', () => {
    it('應正確處理 3 個月的時間範圍', async () => {
      const command = new ReleaseAnalyze(
        [
          '--project',
          'example/mobile-app',
          '--since',
          '2025-07-26',
          '--until',
          '2025-10-26',
        ],
        {} as any
      );

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'example/mobile-app',
          token: 'test-token',
          host: 'https://gitlab.com',
          since: '2025-07-26',
          until: '2025-10-26',
          config: undefined,
          output: 'table',
          json: false,
          'include-types': undefined,
          'exclude-types': undefined,
        },
      });

      vi.spyOn(command, 'log').mockImplementation(() => {});

      await expect(command.run()).resolves.not.toThrow();
    });

    it('應在起始日期晚於結束日期時報錯', async () => {
      const command = new ReleaseAnalyze(
        [
          '--project',
          'example/mobile-app',
          '--since',
          '2025-10-26',
          '--until',
          '2025-07-26',
        ],
        {} as any
      );

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'example/mobile-app',
          token: 'test-token',
          host: 'https://gitlab.com',
          since: '2025-10-26',
          until: '2025-07-26',
          config: undefined,
          output: 'table',
          json: false,
          'include-types': undefined,
          'exclude-types': undefined,
        },
      });

      const mockError = vi.spyOn(command, 'error').mockImplementation(() => {
        throw new Error('Invalid date range');
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('起始日期不可晚於結束日期')
      );
    });
  });
});
