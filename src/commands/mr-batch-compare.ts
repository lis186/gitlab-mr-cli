/**
 * MR Batch Compare 命令 - MR 批次比較分析
 *
 * 實作功能：011-mr-batch-comparison
 * User Story 1 (P1): 比較多個 MR 的批次視圖
 */

import { Command, Flags } from '@oclif/core';
import { Gitlab } from '@gitbeaker/rest';
import { BatchComparisonService, CONFIG } from '../services/batch-comparison-service.js';
import { BatchComparisonTableFormatter } from '../formatters/batch-comparison-table-formatter.js';
import { CSVExporter } from '../formatters/csv-exporter.js';
import { RoundsDetailFormatter } from '../formatters/rounds-detail-formatter.js';
import { TerminalWidthDetector } from '../utils/terminal-width-detector.js';
import { parseProjectIdentifier } from '../utils/project-parser.js';
import { PhaseFilterValidator } from '../utils/phase-filter-validator.js';
import { normalizeStartOfDay, normalizeEndOfDay } from '../utils/date-utils.js';
import { writeFileSync } from 'fs';
import type { BatchComparisonInput, PhaseFilter } from '../types/batch-comparison.js';

/**
 * MR Batch Compare 命令類別
 */
export default class MrBatchCompare extends Command {
  static description = 'MR 批次比較 - 同時比較多個 MR 的關鍵指標與時間軸，快速識別流程瓶頸';

  static examples = [
    '<%= config.bin %> <%= command.id %> 123 124 125 --project example/mobile-app',
    '<%= config.bin %> <%= command.id %> 101 102 103 104 105 -p 12345',
    '<%= config.bin %> <%= command.id %> 201 202 203 -p gitlab-org/gitlab --json',
    '<%= config.bin %> <%= command.id %> 301 302 303 -p mygroup/project --min-days 3 --max-days 10',
    '<%= config.bin %> <%= command.id %> 401 402 403 -p mygroup/project --sort cycleDays --order desc',
    '<%= config.bin %> <%= command.id %> 501 502 503 -p mygroup/project --author Mike',
    '<%= config.bin %> <%= command.id %> 601 602 603 -p mygroup/project --limit 10 --verbose',
    '<%= config.bin %> <%= command.id %> 1 2 3 4 5 -p mygroup/project --status merged',
    '<%= config.bin %> <%= command.id %> -p mygroup/project --author "Bob Jones" --since 2025-09-01 --until 2025-10-31',
  ];

  static strict = false;

  static args = {};

  static flags = {
    project: Flags.string({
      char: 'p',
      description:
        'GitLab 專案識別（或使用環境變數 GITLAB_PROJECT）（專案 ID、路徑 namespace/project、或完整 URL）',
      required: false,
      env: 'GITLAB_PROJECT',
    }),
    token: Flags.string({
      char: 't',
      description: 'GitLab Personal Access Token（或透過環境變數 GITLAB_TOKEN 設定）',
      env: 'GITLAB_TOKEN',
    }),
    url: Flags.string({
      char: 'u',
      description: 'GitLab 實例 URL（或使用環境變數 GITLAB_HOST，預設為 https://gitlab.com）',
      env: 'GITLAB_HOST',
      default: 'https://gitlab.com',
    }),
    json: Flags.boolean({
      char: 'j',
      description: '以 JSON 格式輸出',
      default: false,
    }),
    csv: Flags.boolean({
      description: '以 CSV 格式輸出',
      default: false,
    }),
    output: Flags.string({
      char: 'o',
      description: '輸出檔案路徑（搭配 --json 或 --csv 使用）',
      required: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: '顯示詳細除錯資訊（警告：避免在 CI/CD 或共享環境中使用，可能洩漏敏感資訊）',
      default: false,
    }),
    'ai-bots': Flags.string({
      description: '自訂 AI Bot 使用者名稱清單（逗號分隔）',
      required: false,
    }),
    'min-days': Flags.integer({
      description: '過濾週期時間 ≥ N 天的 MR',
      required: false,
    }),
    'max-days': Flags.integer({
      description: '過濾週期時間 ≤ N 天的 MR',
      required: false,
    }),
    author: Flags.string({
      description: '過濾特定作者的 MR（不區分大小寫）',
      required: false,
    }),
    authors: Flags.string({
      description: '過濾多位作者的 MR（逗號分隔，例如：alice.smith,bob.jones）',
      required: false,
      exclusive: ['author'],
    }),
    status: Flags.string({
      description: '過濾 MR 狀態（merged: 已合併, open: 未合併, closed: 已關閉, all: 全部）',
      options: ['merged', 'open', 'closed', 'all'],
      required: false,
    }),
    labels: Flags.string({
      description: '過濾特定 labels 的 MR（逗號分隔，例如：frontend,backend）',
      required: false,
    }),
    sort: Flags.string({
      description: '排序欄位',
      options: ['cycleDays', 'commits', 'files', 'lines', 'comments', 'devTime', 'waitTime', 'reviewTime', 'mergeTime', 'createdAt', 'mergedAt'],
      required: false,
    }),
    order: Flags.string({
      description: '排序方向',
      options: ['asc', 'desc'],
      default: 'asc',
      required: false,
    }),
    limit: Flags.integer({
      description: `限制結果數量（預設 ${CONFIG.MAX_MR_LIMIT_DEFAULT}，建議不超過 ${CONFIG.PERFORMANCE_WARNING_THRESHOLD} 以避免效能問題）`,
      required: false,
      default: CONFIG.MAX_MR_LIMIT_DEFAULT,
    }),
    'intensity-mode': Flags.string({
      description: '活動強度視覺化模式（height: 高度變化, shade: 濃淡變化）',
      options: ['height', 'shade'],
      default: 'height',
      env: 'TIMELINE_INTENSITY_MODE',
    }),
    'timeline-scale': Flags.string({
      description: '時間軸縮放模式（absolute: 絕對時間 1天=1字符, relative: 相對比例縮放）',
      options: ['absolute', 'relative'],
      default: 'absolute',
      env: 'TIMELINE_SCALE_MODE',
    }),
    since: Flags.string({
      description: '開始日期（格式：YYYY-MM-DD，UTC 時區，包含當天 00:00:00）',
      required: false,
    }),
    until: Flags.string({
      description: '結束日期（格式：YYYY-MM-DD，UTC 時區，包含當天 23:59:59）',
      required: false,
    }),
    // ========== 階段過濾參數 (Feature: 013-mr-phase-filters) ==========
    // 開發階段過濾
    'dev-percent-min': Flags.integer({
      description: '過濾開發階段佔比 ≥ N% 的 MR（範圍 0-100）',
      required: false,
    }),
    'dev-percent-max': Flags.integer({
      description: '過濾開發階段佔比 ≤ N% 的 MR（範圍 0-100）',
      required: false,
    }),
    'dev-days-min': Flags.string({
      description: '過濾開發階段 ≥ N 天的 MR（支援小數，例如 0.5）',
      required: false,
    }),
    'dev-days-max': Flags.string({
      description: '過濾開發階段 ≤ N 天的 MR（支援小數）',
      required: false,
    }),
    // 等待階段過濾
    'wait-percent-min': Flags.integer({
      description: '過濾等待審查階段佔比 ≥ N% 的 MR（範圍 0-100）',
      required: false,
    }),
    'wait-percent-max': Flags.integer({
      description: '過濾等待審查階段佔比 ≤ N% 的 MR（範圍 0-100）',
      required: false,
    }),
    'wait-days-min': Flags.string({
      description: '過濾等待審查階段 ≥ N 天的 MR（支援小數）',
      required: false,
    }),
    'wait-days-max': Flags.string({
      description: '過濾等待審查階段 ≤ N 天的 MR（支援小數）',
      required: false,
    }),
    // 審查階段過濾
    'review-percent-min': Flags.integer({
      description: '過濾審查階段佔比 ≥ N% 的 MR（範圍 0-100）',
      required: false,
    }),
    'review-percent-max': Flags.integer({
      description: '過濾審查階段佔比 ≤ N% 的 MR（範圍 0-100）',
      required: false,
    }),
    'review-days-min': Flags.string({
      description: '過濾審查階段 ≥ N 天的 MR（支援小數）',
      required: false,
    }),
    'review-days-max': Flags.string({
      description: '過濾審查階段 ≤ N 天的 MR（支援小數）',
      required: false,
    }),
    // 合併階段過濾
    'merge-percent-min': Flags.integer({
      description: '過濾合併階段佔比 ≥ N% 的 MR（範圍 0-100）。注意：僅適用於已合併的 MR',
      required: false,
    }),
    'merge-percent-max': Flags.integer({
      description: '過濾合併階段佔比 ≤ N% 的 MR（範圍 0-100）。注意：僅適用於已合併的 MR',
      required: false,
    }),
    'merge-days-min': Flags.string({
      description: '過濾合併階段 ≥ N 天的 MR（支援小數）。注意：僅適用於已合併的 MR',
      required: false,
    }),
    'merge-days-max': Flags.string({
      description: '過濾合併階段 ≤ N 天的 MR（支援小數）。注意：僅適用於已合併的 MR',
      required: false,
    }),
    'rounds-detail': Flags.boolean({
      description: '顯示 Review Rounds 詳細分析（每輪時間間隔、最慢輪次、MR 連結）',
      default: false,
      required: false,
    }),
    'include-events': Flags.boolean({
      description: '在 JSON 輸出中包含詳細事件時間軸（會增加 5-10 倍輸出大小）/ Include detailed event timeline in JSON output (increases output size 5-10x)',
      default: false,
      required: false,
    }),
    'ai-review-only': Flags.boolean({
      description: '僅顯示有 AI Code Review 的 MR（排除沒有 AI Review 的 MR）',
      default: false,
      required: false,
      exclusive: ['human-review-only'],
    }),
    'human-review-only': Flags.boolean({
      description: '僅顯示只有 Human Review 的 MR（排除有 AI Review 的 MR）',
      default: false,
      required: false,
      exclusive: ['ai-review-only'],
    }),
    'exclude-no-review': Flags.boolean({
      description: '排除沒有審查的 MR（評論數 = 0 的 MR）',
      default: false,
      required: false,
    }),
    format: Flags.string({
      description: '表格顯示格式：minimal（精簡）、standard（標準，預設）、full（完整含時間軸）',
      options: ['minimal', 'standard', 'full'],
      default: 'standard',
      required: false,
    }),
    // ========== MR Type Classification (Feature: 2025-11-15) ==========
    'classify-by-type': Flags.boolean({
      description: '啟用 MR 類型分類 (Standard/Draft/Active Development)',
      default: false,
      required: false,
    }),
    'threshold-hours': Flags.integer({
      description: 'Active Development MR 的閾值（小時，範圍 1-168），預設 2',
      default: 2,
      required: false,
      dependsOn: ['classify-by-type'],
      min: 1,
      max: 168,
    }),
    'include-post-merge-reviews': Flags.boolean({
      description: '包含合併後的 AI Review（預設：只計算合併前的 AI Review）',
      default: false,
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(MrBatchCompare);

    try {
      // 解析 MR IID 清單
      const mrIids = this.parseMRIids(argv as string[]);

      // 驗證批次大小（最多 50 個）
      // 如果沒有提供 MR IID，檢查是否提供了日期範圍
      if (mrIids.length === 0 && !flags.since && !flags.until) {
        this.error('❌ 請至少提供一個 MR IID 或使用 --since 和 --until 指定日期範圍', { exit: 3 });
      }

      if (mrIids.length > CONFIG.MAX_BATCH_COMPARE_LIMIT) {
        this.error(`❌ 最多支援比較 ${CONFIG.MAX_BATCH_COMPARE_LIMIT} 個 MR。請減少 MR 數量。`, { exit: 3 });
      }

      // 驗證必要參數
      if (!flags.token) {
        this.error('❌ 缺少 GitLab Token。請使用 --token 或設定環境變數 GITLAB_TOKEN');
      }

      if (!flags.project) {
        this.error('❌ 缺少專案識別。請使用 --project 或設定環境變數 GITLAB_PROJECT');
      }

      // 驗證 threshold-hours 範圍
      if (flags['threshold-hours'] !== undefined) {
        const thresholdHours = flags['threshold-hours'];
        if (thresholdHours < 1 || thresholdHours > 168) {
          this.error('❌ threshold-hours 必須介於 1-168 小時之間（1 小時至 1 週）', { exit: 3 });
        }
      }

      // 檢查終端寬度
      if (!flags.json) {
        const widthWarning = TerminalWidthDetector.getWidthWarning(120);
        if (widthWarning) {
          this.warn(widthWarning);
        }
      }

      // 解析專案識別
      const projectInfo = parseProjectIdentifier(flags.project);
      const projectId = typeof projectInfo.identifier === 'number'
        ? projectInfo.identifier.toString()
        : projectInfo.identifier;

      if (flags.verbose) {
        // CI 環境檢測與警告
        const isCI = process.env.CI === 'true' ||
                     process.env.GITHUB_ACTIONS === 'true' ||
                     process.env.GITLAB_CI === 'true' ||
                     process.env.CIRCLECI === 'true' ||
                     process.env.TRAVIS === 'true' ||
                     process.env.JENKINS_URL !== undefined;

        if (isCI) {
          this.warn('⚠️  警告：正在 CI 環境中使用 verbose 模式，可能洩漏敏感資訊到日誌中');
        }

        this.log('📊 開始批次比較 MR...');
        this.log(`   專案: ${flags.project}`);
        this.log(`   MR IID(s): ${mrIids.join(', ')}`);
        this.log(`   GitLab URL: ${flags.url}`);
        this.log(`   比較數量: ${mrIids.length} 個 MR`);
      }

      // 建立 GitLab 客戶端
      const gitlabClient = new Gitlab({
        host: flags.url,
        token: flags.token,
      });

      // 使用 --limit 參數或預設值 (100) 來控制記憶體使用
      const maxLimit = flags.limit || 100;

      // 如果沒有提供 MR IID，但提供了日期範圍，則自動查詢
      let finalMrIids = mrIids;
      if (mrIids.length === 0 && (flags.since || flags.until)) {
        if (flags.verbose) {
          this.log('🔍 根據日期範圍查詢 MR...');
        }

        const baseQueryOptions: any = {
          state: 'merged',
          order_by: 'created_at',
          sort: 'desc',
          per_page: Math.min(maxLimit, 100), // 限制單次請求大小
          maxPages: Math.ceil(maxLimit / 100), // 限制最大頁數
        };

        if (flags.since) {
          // 設定為當天開始時間（UTC 00:00:00）
          baseQueryOptions.created_after = normalizeStartOfDay(flags.since).toISOString();
        }
        if (flags.until) {
          // 設定為當天結束時間（UTC 23:59:59.999）
          baseQueryOptions.created_before = normalizeEndOfDay(flags.until).toISOString();
        }

        if (flags.labels) {
          // 清理與驗證 labels 輸入
          const labels = flags.labels
            .split(',')
            .map(l => l.trim())
            .filter(l => l.length > 0);

          if (labels.length === 0) {
            this.error('❌ labels 參數不能為空。請提供至少一個有效的 label（例如：--labels "frontend,backend"）', { exit: 3 });
          }

          baseQueryOptions.labels = labels.join(',');

          if (flags.verbose) {
            this.log(`🏷️  過濾 labels: ${labels.join(', ')}`);
          }
        }

        // 驗證日期範圍大小，警告過大的範圍
        if (flags.since && flags.until) {
          const sinceDate = new Date(flags.since);
          const untilDate = new Date(flags.until);

          // 驗證日期有效性
          if (isNaN(sinceDate.getTime())) {
            this.error('❌ 無效的開始日期格式。請使用 YYYY-MM-DD 格式（例如：2025-01-01）', { exit: 3 });
          }
          if (isNaN(untilDate.getTime())) {
            this.error('❌ 無效的結束日期格式。請使用 YYYY-MM-DD 格式（例如：2025-12-31）', { exit: 3 });
          }

          const daysDiff = (untilDate.getTime() - sinceDate.getTime()) / (1000 * 60 * 60 * 24);

          // 檢查日期範圍合理性
          if (daysDiff < 0) {
            this.error('❌ 開始日期不能晚於結束日期', { exit: 3 });
          }

          if (daysDiff > 365) {
            this.warn(`⚠️  日期範圍超過 1 年（${Math.round(daysDiff)} 天），查詢可能需要較長時間...`);
          } else if (daysDiff > 180) {
            if (flags.verbose) {
              this.log(`   日期範圍: ${Math.round(daysDiff)} 天`);
            }
          }
        }

        // ✨ Layer 2: 多作者並行查詢策略
        if (flags.authors) {
          const authorList = flags.authors.split(',').map(a => a.trim()).filter(a => a.length > 0);

          if (flags.verbose) {
            this.log(`   多作者並行查詢: ${authorList.join(', ')}（${authorList.length} 位作者）`);
          }

          try {
            // 並行查詢每位作者的 MR
            const allMrResults = await Promise.all(
              authorList.map(async (author) => {
                const queryOptions = { ...baseQueryOptions };

                // 檢測是否像 username
                const looksLikeUsername = /^[a-z0-9._-]+$/.test(author);

                if (looksLikeUsername) {
                  queryOptions.author_username = author;
                  if (flags.verbose) {
                    this.log(`     查詢 ${author}（API 過濾）`);
                  }
                } else {
                  if (flags.verbose) {
                    this.log(`     查詢 ${author}（客戶端過濾）`);
                  }
                }

                const mrs = await gitlabClient.MergeRequests.all({
                  projectId,
                  ...queryOptions,
                });

                // 如果不是 API 過濾，需要客戶端過濾
                if (!looksLikeUsername) {
                  const authorLower = author.toLowerCase();
                  return mrs.filter((mr: any) =>
                    mr.author?.name?.toLowerCase().includes(authorLower) ||
                    mr.author?.username?.toLowerCase().includes(authorLower)
                  );
                }

                return mrs;
              })
            );

            // 合併所有結果並去重
            const allMrs = allMrResults.flat();
            const uniqueMrIids = [...new Set(allMrs.map((mr: any) => mr.iid))];

            if (flags.verbose) {
              this.log(`   合併結果: ${uniqueMrIids.length} 個不重複的 MR`);
            }

            finalMrIids = uniqueMrIids;
          } catch (error: any) {
            this.error(`❌ 多作者查詢失敗: ${error.message}`, { exit: 1 });
          }
        }
        // ✨ Layer 1: 單一作者智慧過濾策略
        else if (flags.author) {
          const queryOptions = { ...baseQueryOptions };
          let useAPIFilter = false;
          const authorFilter = flags.author;

          // 檢測是否像 username（小寫、無空格、可能含點號或底線）
          const looksLikeUsername = /^[a-z0-9._-]+$/.test(authorFilter);

          if (looksLikeUsername) {
            // 情境 1: 使用 API 過濾（最高效）
            queryOptions.author_username = authorFilter;
            useAPIFilter = true;
            if (flags.verbose) {
              this.log(`   使用作者過濾: ${authorFilter}（API 層級 - 精確 username）`);
            }
          } else {
            // 情境 2: 客戶端過濾但提升 per_page（支援模糊匹配）
            queryOptions.per_page = 100;  // 提升配額以增加查到目標的機率
            if (flags.verbose) {
              this.log(`   使用作者過濾: ${authorFilter}（客戶端層級 - 支援顯示名稱模糊搜尋）`);
            }
          }

          try {
            const mrs = await gitlabClient.MergeRequests.all({
              projectId,
              ...queryOptions,
            });

            // 根據策略決定是否需要客戶端過濾
            let filteredMrs = mrs;
            if (authorFilter && !useAPIFilter) {
              // 客戶端過濾：支援顯示名稱或 username 的模糊匹配
              const authorLower = authorFilter.toLowerCase();
              filteredMrs = mrs.filter((mr: any) =>
                mr.author?.name?.toLowerCase().includes(authorLower) ||
                mr.author?.username?.toLowerCase().includes(authorLower)
              );

              if (flags.verbose) {
                this.log(`   過濾結果: ${filteredMrs.length}/${mrs.length} 個 MR 符合作者條件`);
              }
            }

            finalMrIids = filteredMrs.map((mr: any) => mr.iid);
          } catch (error: any) {
            this.error(`❌ 查詢 MR 失敗: ${error.message}`, { exit: 1 });
          }
        }
        // 一般查詢（無作者過濾）
        else {
          try {
            const mrs = await gitlabClient.MergeRequests.all({
              projectId,
              ...baseQueryOptions,
            });

            finalMrIids = mrs.map((mr: any) => mr.iid);
          } catch (error: any) {
            this.error(`❌ 查詢 MR 失敗: ${error.message}`, { exit: 1 });
          }
        }

        // 統一檢查結果
        if (finalMrIids.length === 0) {
          this.error('❌ 在指定的日期範圍內找不到任何 MR', { exit: 3 });
        }

        if (finalMrIids.length > maxLimit) {
          if (!flags.json) {
            this.warn(`⚠️  找到 ${finalMrIids.length} 個 MR，超過 ${maxLimit} 個上限。將只分析最近的 ${maxLimit} 個。`);
          }
          finalMrIids = finalMrIids.slice(0, maxLimit);
        }

        // 效能警告：超過閾值時提醒（JSON 模式下輸出到 stderr）
        if (maxLimit > CONFIG.PERFORMANCE_WARNING_THRESHOLD && !flags.json) {
          this.warn(`⚠️  分析 ${maxLimit} 個 MR 可能需要較長時間（預估 ${Math.ceil(maxLimit / CONFIG.BATCH_SIZE * 2.5)}秒），請耐心等待...`);
        }

        if (flags.verbose) {
          this.log(`   找到 ${finalMrIids.length} 個 MR: ${finalMrIids.join(', ')}`);
        }
      }

      // 解析 AI Bots 配置
      const aiBotsConfig = flags['ai-bots']?.split(',').map(s => s.trim());

      // 建立批次比較服務
      const batchComparisonService = new BatchComparisonService(gitlabClient, aiBotsConfig);

      // 準備輸入參數
      const input: BatchComparisonInput = {
        projectId,
        mrIids: finalMrIids,
      };

      // 添加過濾條件
      const hasBasicFilters = flags['min-days'] || flags['max-days'] || flags.author || flags.status || flags.since || flags.until;
      const hasPhaseFilters = flags['dev-percent-min'] || flags['dev-percent-max'] || flags['dev-days-min'] || flags['dev-days-max'] ||
                               flags['wait-percent-min'] || flags['wait-percent-max'] || flags['wait-days-min'] || flags['wait-days-max'] ||
                               flags['review-percent-min'] || flags['review-percent-max'] || flags['review-days-min'] || flags['review-days-max'] ||
                               flags['merge-percent-min'] || flags['merge-percent-max'] || flags['merge-days-min'] || flags['merge-days-max'];

      if (hasBasicFilters || hasPhaseFilters) {
        input.filter = {};

        // 基礎過濾條件
        if (flags['min-days'] !== undefined) input.filter.minCycleDays = flags['min-days'];
        if (flags['max-days'] !== undefined) input.filter.maxCycleDays = flags['max-days'];
        if (flags.author) input.filter.author = flags.author;
        if (flags.status) input.filter.status = flags.status as 'merged' | 'open' | 'closed' | 'all';
        if (flags.since || flags.until) {
          input.filter.dateRange = {
            since: flags.since || '',
            until: flags.until || '',
          };
        }

        // 階段過濾條件 (Feature: 013-mr-phase-filters)
        if (hasPhaseFilters) {
          const phaseFilter: PhaseFilter = {};

          // 開發階段
          if (flags['dev-percent-min'] !== undefined) phaseFilter.devPercentMin = flags['dev-percent-min'];
          if (flags['dev-percent-max'] !== undefined) phaseFilter.devPercentMax = flags['dev-percent-max'];
          if (flags['dev-days-min']) phaseFilter.devDaysMin = parseFloat(flags['dev-days-min']);
          if (flags['dev-days-max']) phaseFilter.devDaysMax = parseFloat(flags['dev-days-max']);

          // 等待階段
          if (flags['wait-percent-min'] !== undefined) phaseFilter.waitPercentMin = flags['wait-percent-min'];
          if (flags['wait-percent-max'] !== undefined) phaseFilter.waitPercentMax = flags['wait-percent-max'];
          if (flags['wait-days-min']) phaseFilter.waitDaysMin = parseFloat(flags['wait-days-min']);
          if (flags['wait-days-max']) phaseFilter.waitDaysMax = parseFloat(flags['wait-days-max']);

          // 審查階段
          if (flags['review-percent-min'] !== undefined) phaseFilter.reviewPercentMin = flags['review-percent-min'];
          if (flags['review-percent-max'] !== undefined) phaseFilter.reviewPercentMax = flags['review-percent-max'];
          if (flags['review-days-min']) phaseFilter.reviewDaysMin = parseFloat(flags['review-days-min']);
          if (flags['review-days-max']) phaseFilter.reviewDaysMax = parseFloat(flags['review-days-max']);

          // 合併階段
          if (flags['merge-percent-min'] !== undefined) phaseFilter.mergePercentMin = flags['merge-percent-min'];
          if (flags['merge-percent-max'] !== undefined) phaseFilter.mergePercentMax = flags['merge-percent-max'];
          if (flags['merge-days-min']) phaseFilter.mergeDaysMin = parseFloat(flags['merge-days-min']);
          if (flags['merge-days-max']) phaseFilter.mergeDaysMax = parseFloat(flags['merge-days-max']);

          // 驗證階段過濾參數 (T009)
          const validationResult = PhaseFilterValidator.validate(phaseFilter);
          if (!validationResult.isValid) {
            this.error(
              `❌ 過濾參數驗證失敗：\n  - ${validationResult.errors.join('\n  - ')}\n\n請修正上述問題後重試。`,
              { exit: 3 }
            );
          }

          input.filter.phaseFilters = phaseFilter;
        }
      }

      // 添加排序條件
      if (flags.sort) {
        input.sort = {
          field: flags.sort as any,
          order: (flags.order as 'asc' | 'desc') || 'asc',
        };
      }

      // 添加限制
      if (flags.limit) {
        input.limit = flags.limit;
      }

      // 添加事件包含選項
      if (flags['include-events']) {
        input.includeEvents = true;
      }

      // 添加合併後 AI Review 選項 (Feature: investigation-1 P1)
      if (flags['include-post-merge-reviews']) {
        input.includePostMergeReviews = true;
      }

      if (flags.verbose) {
        this.log('   輸入參數:');
        this.log(JSON.stringify(input, null, 2));
      }

      // 執行批次比較分析（帶進度回報）
      let result = await batchComparisonService.analyze(
        input,
        flags.verbose
          ? (current: number, total: number, elapsedMs: number) => {
              const percentage = Math.round((current / total) * 100);
              const elapsedSec = (elapsedMs / 1000).toFixed(1);
              this.log(`   進度: ${current}/${total} MRs (${percentage}%) - 已耗時 ${elapsedSec}s`);
            }
          : undefined
      );

      // 應用 AI Review Only 過濾
      if (flags['ai-review-only']) {
        const originalRowCount = result.rows.length;
        result.rows = result.rows.filter(row => row.reviewStats.hasAIReview);

        if (flags.verbose) {
          this.log(`   AI Review Only 過濾: ${originalRowCount} → ${result.rows.length} MRs`);
        }

        // 重新計算 summary 統計（基於過濾後的 rows）
        if (result.rows.length > 0) {
          const summaryCalculator = new BatchComparisonService(gitlabClient, aiBotsConfig);
          const recalculatedSummary = (summaryCalculator as any).calculateSummary(result.rows);
          result.summary = recalculatedSummary;
        }
      }

      // 應用 Human Review Only 過濾
      if (flags['human-review-only']) {
        const originalRowCount = result.rows.length;
        result.rows = result.rows.filter(row => !row.reviewStats.hasAIReview);

        if (flags.verbose) {
          this.log(`   Human Review Only 過濾: ${originalRowCount} → ${result.rows.length} MRs`);
        }

        // 重新計算 summary 統計（基於過濾後的 rows）
        if (result.rows.length > 0) {
          const summaryCalculator = new BatchComparisonService(gitlabClient, aiBotsConfig);
          const recalculatedSummary = (summaryCalculator as any).calculateSummary(result.rows);
          result.summary = recalculatedSummary;
        }
      }

      // 應用 Exclude No Review 過濾
      if (flags['exclude-no-review']) {
        const originalRowCount = result.rows.length;
        result.rows = result.rows.filter(row =>
          row.reviewStats.comments > 0
        );

        if (flags.verbose) {
          this.log(`   Exclude No Review 過濾: ${originalRowCount} → ${result.rows.length} MRs`);
        }

        // 重新計算 summary 統計（基於過濾後的 rows）
        if (result.rows.length > 0) {
          const summaryCalculator = new BatchComparisonService(gitlabClient, aiBotsConfig);
          const recalculatedSummary = (summaryCalculator as any).calculateSummary(result.rows);
          result.summary = recalculatedSummary;
        }
      }

      if (flags.verbose) {
        this.log(`✅ 批次比較完成 (${result.metadata.queryDurationMs}ms)`);
        this.log(`   成功: ${result.summary.successCount}/${result.summary.totalCount}`);
        if (result.summary.failedCount > 0) {
          this.log(`   失敗: ${result.summary.failedCount}`);
        }
      }

      // ========== MR Type Classification (Feature: 2025-11-15) ==========
      let classifications: import('../types/batch-comparison.js').MRClassification[] | undefined;
      let typeStats: import('../types/batch-comparison.js').MRTypeStatsSummary | undefined;

      if (flags['classify-by-type']) {
        if (flags.verbose) {
          this.log('\n🔍 正在分析 MR 類型...');
        }

        // Get cached timelines from the service
        const allTimelines = batchComparisonService.getCachedTimelines();

        // Filter timelines to match the filtered rows (important for --exclude-no-review)
        const filteredIids = new Set(result.rows.map(r => r.iid));
        const timelines = allTimelines.filter(t => filteredIids.has(t.mr.id));

        // Classify each MR
        classifications = timelines.map(timeline =>
          batchComparisonService.detectMRType(timeline, flags['threshold-hours'] || 2)
        );

        // Generate statistics
        typeStats = batchComparisonService.generateMRTypeStats(classifications);

        // Enrich result with classification-based statistics
        result = batchComparisonService.enrichWithClassifications(result, classifications);

        if (flags.verbose) {
          this.log(`✅ 分類完成: Standard ${typeStats.Standard?.count || 0}, ` +
                   `Draft ${typeStats.Draft?.count || 0}, ` +
                   `Active Dev ${typeStats['Active Development']?.count || 0}`);
        }

        // Clear cache to free memory
        batchComparisonService.clearCachedTimelines();
      }

      // T017: 零結果友善訊息（顯示最具限制性的過濾器）
      if (result.rows.length === 0 && (result as any).phaseFilterStats) {
        const stats = (result as any).phaseFilterStats as import('../types/batch-comparison.js').PhaseFilterStats;
        this.log('\n⚠️  沒有找到符合過濾條件的 MR\n');
        this.log('📊 過濾統計：\n');
        this.log(`   總 MR 數量: ${stats.totalCount}`);
        this.log(`   過濾後數量: ${stats.filteredCount}\n`);

        // 找出最具限制性的過濾器（排除最多 MR 的）
        const filters = Object.entries(stats.excludedByFilter);
        if (filters.length > 0) {
          const sortedFilters = filters.sort(([, a], [, b]) => b - a);
          const mostRestrictive = sortedFilters[0];
          if (mostRestrictive) {
            const mostRestrictiveCount = mostRestrictive[1];
            this.log('   各過濾器排除的 MR 數量：');
            sortedFilters.forEach(([filterName, count]) => {
              const emoji = count === mostRestrictiveCount ? '🔴' : '  ';
              this.log(`   ${emoji} ${filterName}: ${count} 個 MR`);
            });
            this.log(`\n💡 建議：「${mostRestrictive[0]}」過濾器排除了最多 MR，請考慮放寬此條件。\n`);
          }
        }
      }

      // 驗證互斥的輸出格式
      const outputFormats = [flags.json, flags.csv].filter(Boolean).length;
      if (outputFormats > 1) {
        this.error('❌ 只能選擇一種輸出格式：--json 或 --csv', { exit: 3 });
      }

      // 準備輸出內容
      let outputContent: string;
      let outputFormat: 'json' | 'csv' | 'table';

      if (flags.json) {
        // Build JSON output with optional classification data
        const jsonOutput: any = {
          metadata: {
            ...result.metadata,
            ...(flags['classify-by-type'] && {
              classification: {
                enabled: true,
                thresholdHours: flags['threshold-hours'] || 2
              }
            })
          },
          rows: result.rows.map((row, index) => {
            const baseRow: any = { ...row };

            // Add classification if available
            if (classifications && classifications[index]) {
              baseRow.classification = classifications[index];
            }

            return baseRow;
          }),
          summary: {
            ...result.summary,
            ...(typeStats && {
              byMRType: typeStats
            })
          }
        };

        outputContent = JSON.stringify(jsonOutput, null, 2);
        outputFormat = 'json';
      } else if (flags.csv) {
        const csvExporter = new CSVExporter();
        outputContent = csvExporter.export(result);
        outputFormat = 'csv';
      } else {
        const intensityMode = (flags['intensity-mode'] as 'height' | 'shade') || 'height';
        const scaleMode = (flags['timeline-scale'] as 'absolute' | 'relative') || 'absolute';
        const tableFormat = (flags.format as 'minimal' | 'standard' | 'full') || 'standard';
        const formatter = new BatchComparisonTableFormatter(intensityMode, scaleMode, tableFormat);
        outputContent = formatter.formatTable(result);
        outputFormat = 'table';
      }

      // 輸出到檔案或終端
      if (flags.output) {
        // 驗證輸出路徑安全性
        this.validateOutputPath(flags.output);

        try {
          writeFileSync(flags.output, outputContent, 'utf-8');
          if (!flags.json) {
            this.log(`✅ 結果已儲存至: ${flags.output}`);
          }

          // 如果是 verbose 模式，額外顯示摘要
          if (flags.verbose && !flags.json) {
            this.log(`   格式: ${outputFormat}`);
            this.log(`   大小: ${outputContent.length} bytes`);
          }
        } catch (error: any) {
          this.error(`❌ 無法寫入檔案: ${error.message}`, { exit: 4 });
        }
      } else {
        this.log(outputContent);
      }

      // Review Rounds 詳細分析（Feature: Phase 2）
      if (flags['rounds-detail'] && !flags.json && !flags.csv && !flags.output) {
        // 取得有輪數的 MR（diffVersions > 0）
        const mrsWithRounds = result.rows.filter(row =>
          !row.error && row.reviewStats.diffVersions && row.reviewStats.diffVersions > 0
        );

        if (mrsWithRounds.length > 0) {
          // 並行查詢所有 MR 的輪數詳細信息
          const roundsDetailPromises = mrsWithRounds.map(row =>
            batchComparisonService.fetchRoundsDetail(
              projectId,
              row.iid,
              row.title,
              flags.url || 'https://gitlab.com'
            )
          );

          const roundsDetails = await Promise.all(roundsDetailPromises);

          // 過濾掉失敗的查詢
          const validRoundsDetails = roundsDetails.filter((detail): detail is import('../types/batch-comparison.js').MRRoundsDetail => detail !== undefined);

          if (validRoundsDetails.length > 0) {
            const roundsFormatter = new RoundsDetailFormatter();
            this.log(roundsFormatter.format(validRoundsDetails));
          }
        }
      }

      // MR Type Classification Table Output (Feature: 2025-11-15)
      // Enhanced: AI Review × MR Type Cross-tabulation (2025-11-15)
      if (flags['classify-by-type'] && typeStats && !flags.json && !flags.csv) {
        const aiStats = result.summary.aiReviewGroupStats;

        // Check if we have enhanced stats (with byMRType subdivision)
        const hasEnhancedStats = aiStats?.withAI?.byMRType || aiStats?.withoutAI?.byMRType;

        if (hasEnhancedStats) {
          // Display enhanced cross-tabulation statistics
          this.log('\n' + '═'.repeat(80));
          this.log('📊 AI Review × MR 類型 交叉統計');
          this.log('═'.repeat(80));

          // WithAI group
          if (aiStats!.withAI.count > 0) {
            this.log('\n✅ 有 AI Review 的 MRs');
            this.log('─'.repeat(80));
            this.log(`總數: ${aiStats!.withAI.count} 個\n`);

            if (aiStats!.withAI.overallTimeStats) {
              this.log('⏱️  整體時間統計:');
              const ts = aiStats!.withAI.overallTimeStats;
              this.log(`  Dev Time:         P50=${this.formatDuration(ts.dev.p50)}, P75=${this.formatDuration(ts.dev.p75)}, P90=${this.formatDuration(ts.dev.p90)}, Avg=${this.formatDuration(ts.dev.avg)}`);
              this.log(`  Wait Time:        P50=${this.formatDuration(ts.wait.p50)}, P75=${this.formatDuration(ts.wait.p75)}, P90=${this.formatDuration(ts.wait.p90)}, Avg=${this.formatDuration(ts.wait.avg)}`);
              this.log(`  Review Time:      P50=${this.formatDuration(ts.review.p50)}, P75=${this.formatDuration(ts.review.p75)}, P90=${this.formatDuration(ts.review.p90)}, Avg=${this.formatDuration(ts.review.avg)}`);
              this.log(`  Merge Time:       P50=${this.formatDuration(ts.merge.p50)}, P75=${this.formatDuration(ts.merge.p75)}, P90=${this.formatDuration(ts.merge.p90)}, Avg=${this.formatDuration(ts.merge.avg)}`);
              this.log(`  Lead Review Time: P50=${this.formatDuration(ts.leadReview.p50)}, P75=${this.formatDuration(ts.leadReview.p75)}, P90=${this.formatDuration(ts.leadReview.p90)}, Avg=${this.formatDuration(ts.leadReview.avg)}`);
              this.log(`  Cycle Time:       P50=${this.formatDuration(ts.cycle.p50)}, P75=${this.formatDuration(ts.cycle.p75)}, P90=${this.formatDuration(ts.cycle.p90)}, Avg=${this.formatDuration(ts.cycle.avg)}\n`);
            }

            if (aiStats!.withAI.byMRType) {
              this.log('按 MR 類型細分:');
              this.log('─'.repeat(80));

              for (const [mrType, typeStats] of Object.entries(aiStats!.withAI.byMRType)) {
                this.log(`\n  ${mrType}: ${typeStats.count} 個 (${typeStats.percentage.toFixed(1)}%)`);

                // Display MR IDs
                if (typeStats.mrIds && typeStats.mrIds.length > 0) {
                  // Wrap at ~80 chars
                  const lines: string[] = [];
                  let currentLine = '    📋 MR IDs: ';
                  const ids = typeStats.mrIds.map(String);

                  for (let i = 0; i < ids.length; i++) {
                    const id = ids[i]!;
                    const separator = i < ids.length - 1 ? ', ' : '';

                    if ((currentLine + id + separator).length > 80 && currentLine !== '    📋 MR IDs: ') {
                      lines.push(currentLine);
                      currentLine = '               ' + id + separator;
                    } else {
                      currentLine += id + separator;
                    }
                  }

                  if (currentLine.trim().length > 0) {
                    lines.push(currentLine);
                  }

                  lines.forEach(line => this.log(line));
                  this.log('');
                }

                // Display code changes stats
                if (typeStats.codeChanges) {
                  this.log('    📝 程式碼變更:');
                  const cc = typeStats.codeChanges;
                  this.log(`       Commits: P50=${cc.commits.p50}, P75=${cc.commits.p75}, P90=${cc.commits.p90}, Avg=${cc.commits.avg.toFixed(1)}`);
                  this.log(`       Files:   P50=${cc.files.p50}, P75=${cc.files.p75}, P90=${cc.files.p90}, Avg=${cc.files.avg.toFixed(1)}`);
                  this.log(`       Lines:   P50=${cc.lines.p50}, P75=${cc.lines.p75}, P90=${cc.lines.p90}, Avg=${cc.lines.avg.toFixed(1)}\n`);
                }

                // Display review stats breakdown
                if (typeStats.reviewStats) {
                  this.log('    💬 審查統計:');
                  const rs = typeStats.reviewStats;
                  this.log(`       Total Comments:    P50=${rs.totalComments.p50}, P75=${rs.totalComments.p75}, P90=${rs.totalComments.p90}, Avg=${rs.totalComments.avg.toFixed(1)}`);
                  this.log(`       ├─ Human Reviews:  P50=${rs.humanReviews.p50}, P75=${rs.humanReviews.p75}, P90=${rs.humanReviews.p90}, Avg=${rs.humanReviews.avg.toFixed(1)}`);
                  this.log(`       ├─ AI Reviews:     P50=${rs.aiReviews.p50}, P75=${rs.aiReviews.p75}, P90=${rs.aiReviews.p90}, Avg=${rs.aiReviews.avg.toFixed(1)}`);
                  this.log(`       └─ Author Replies: P50=${rs.authorResponses.p50}, P75=${rs.authorResponses.p75}, P90=${rs.authorResponses.p90}, Avg=${rs.authorResponses.avg.toFixed(1)}`);
                  this.log(`       Diff Versions:     P50=${rs.diffVersions.p50}, P75=${rs.diffVersions.p75}, P90=${rs.diffVersions.p90}, Avg=${rs.diffVersions.avg.toFixed(1)}\n`);
                }

                const tm = typeStats.timeMetrics;
                this.log(`    ⏱️  時間指標:`);
                this.log(`       Dev Time:         P50=${this.formatDuration(tm.dev.p50)}, P75=${this.formatDuration(tm.dev.p75)}, P90=${this.formatDuration(tm.dev.p90)}, Avg=${this.formatDuration(tm.dev.avg)}`);
                this.log(`       Wait Time:        P50=${this.formatDuration(tm.wait.p50)}, P75=${this.formatDuration(tm.wait.p75)}, P90=${this.formatDuration(tm.wait.p90)}, Avg=${this.formatDuration(tm.wait.avg)}`);
                this.log(`       Review Time:      P50=${this.formatDuration(tm.review.p50)}, P75=${this.formatDuration(tm.review.p75)}, P90=${this.formatDuration(tm.review.p90)}, Avg=${this.formatDuration(tm.review.avg)}`);
                this.log(`       Merge Time:       P50=${this.formatDuration(tm.merge.p50)}, P75=${this.formatDuration(tm.merge.p75)}, P90=${this.formatDuration(tm.merge.p90)}, Avg=${this.formatDuration(tm.merge.avg)}`);
                this.log(`       Lead Review Time: P50=${this.formatDuration(tm.leadReview.p50)}, P75=${this.formatDuration(tm.leadReview.p75)}, P90=${this.formatDuration(tm.leadReview.p90)}, Avg=${this.formatDuration(tm.leadReview.avg)}`);
                this.log(`       Cycle Time:       P50=${this.formatDuration(tm.cycle.p50)}, P75=${this.formatDuration(tm.cycle.p75)}, P90=${this.formatDuration(tm.cycle.p90)}, Avg=${this.formatDuration(tm.cycle.avg)}`);

                const rrt = typeStats.reviewResponseTime;
                this.log(`       Review Response:  P50=${this.formatDuration(rrt.p50)}, P75=${this.formatDuration(rrt.p75)}, P90=${this.formatDuration(rrt.p90)}, Avg=${this.formatDuration(rrt.avg)}`);

                if (typeStats.draftDuration) {
                  const dd = typeStats.draftDuration;
                  this.log(`       Draft Duration:   P50=${this.formatDuration(dd.p50)}, P75=${this.formatDuration(dd.p75)}, P90=${this.formatDuration(dd.p90)}, Avg=${this.formatDuration(dd.avg)}`);
                }

                if (typeStats.devDuration) {
                  const dd = typeStats.devDuration;
                  this.log(`       Dev Duration:     P50=${this.formatDuration(dd.p50)}, P75=${this.formatDuration(dd.p75)}, P90=${this.formatDuration(dd.p90)}, Avg=${this.formatDuration(dd.avg)}`);
                }
              }
            }
          }

          // WithoutAI group
          if (aiStats!.withoutAI.count > 0) {
            this.log('\n\n❌ 沒有 AI Review 的 MRs');
            this.log('─'.repeat(80));
            this.log(`總數: ${aiStats!.withoutAI.count} 個\n`);

            if (aiStats!.withoutAI.overallTimeStats) {
              this.log('⏱️  整體時間統計:');
              const ts = aiStats!.withoutAI.overallTimeStats;
              this.log(`  Dev Time:         P50=${this.formatDuration(ts.dev.p50)}, P75=${this.formatDuration(ts.dev.p75)}, P90=${this.formatDuration(ts.dev.p90)}, Avg=${this.formatDuration(ts.dev.avg)}`);
              this.log(`  Wait Time:        P50=${this.formatDuration(ts.wait.p50)}, P75=${this.formatDuration(ts.wait.p75)}, P90=${this.formatDuration(ts.wait.p90)}, Avg=${this.formatDuration(ts.wait.avg)}`);
              this.log(`  Review Time:      P50=${this.formatDuration(ts.review.p50)}, P75=${this.formatDuration(ts.review.p75)}, P90=${this.formatDuration(ts.review.p90)}, Avg=${this.formatDuration(ts.review.avg)}`);
              this.log(`  Merge Time:       P50=${this.formatDuration(ts.merge.p50)}, P75=${this.formatDuration(ts.merge.p75)}, P90=${this.formatDuration(ts.merge.p90)}, Avg=${this.formatDuration(ts.merge.avg)}`);
              this.log(`  Lead Review Time: P50=${this.formatDuration(ts.leadReview.p50)}, P75=${this.formatDuration(ts.leadReview.p75)}, P90=${this.formatDuration(ts.leadReview.p90)}, Avg=${this.formatDuration(ts.leadReview.avg)}`);
              this.log(`  Cycle Time:       P50=${this.formatDuration(ts.cycle.p50)}, P75=${this.formatDuration(ts.cycle.p75)}, P90=${this.formatDuration(ts.cycle.p90)}, Avg=${this.formatDuration(ts.cycle.avg)}\n`);
            }

            if (aiStats!.withoutAI.byMRType) {
              this.log('按 MR 類型細分:');
              this.log('─'.repeat(80));

              for (const [mrType, typeStats] of Object.entries(aiStats!.withoutAI.byMRType)) {
                this.log(`\n  ${mrType}: ${typeStats.count} 個 (${typeStats.percentage.toFixed(1)}%)`);

                // Display MR IDs
                if (typeStats.mrIds && typeStats.mrIds.length > 0) {
                  // Wrap at ~80 chars
                  const lines: string[] = [];
                  let currentLine = '    📋 MR IDs: ';
                  const ids = typeStats.mrIds.map(String);

                  for (let i = 0; i < ids.length; i++) {
                    const id = ids[i]!;
                    const separator = i < ids.length - 1 ? ', ' : '';

                    if ((currentLine + id + separator).length > 80 && currentLine !== '    📋 MR IDs: ') {
                      lines.push(currentLine);
                      currentLine = '               ' + id + separator;
                    } else {
                      currentLine += id + separator;
                    }
                  }

                  if (currentLine.trim().length > 0) {
                    lines.push(currentLine);
                  }

                  lines.forEach(line => this.log(line));
                  this.log('');
                }

                // Display code changes stats
                if (typeStats.codeChanges) {
                  this.log('    📝 程式碼變更:');
                  const cc = typeStats.codeChanges;
                  this.log(`       Commits: P50=${cc.commits.p50}, P75=${cc.commits.p75}, P90=${cc.commits.p90}, Avg=${cc.commits.avg.toFixed(1)}`);
                  this.log(`       Files:   P50=${cc.files.p50}, P75=${cc.files.p75}, P90=${cc.files.p90}, Avg=${cc.files.avg.toFixed(1)}`);
                  this.log(`       Lines:   P50=${cc.lines.p50}, P75=${cc.lines.p75}, P90=${cc.lines.p90}, Avg=${cc.lines.avg.toFixed(1)}\n`);
                }

                // Display review stats breakdown
                if (typeStats.reviewStats) {
                  this.log('    💬 審查統計:');
                  const rs = typeStats.reviewStats;
                  this.log(`       Total Comments:    P50=${rs.totalComments.p50}, P75=${rs.totalComments.p75}, P90=${rs.totalComments.p90}, Avg=${rs.totalComments.avg.toFixed(1)}`);
                  this.log(`       ├─ Human Reviews:  P50=${rs.humanReviews.p50}, P75=${rs.humanReviews.p75}, P90=${rs.humanReviews.p90}, Avg=${rs.humanReviews.avg.toFixed(1)}`);
                  this.log(`       ├─ AI Reviews:     P50=${rs.aiReviews.p50}, P75=${rs.aiReviews.p75}, P90=${rs.aiReviews.p90}, Avg=${rs.aiReviews.avg.toFixed(1)}`);
                  this.log(`       └─ Author Replies: P50=${rs.authorResponses.p50}, P75=${rs.authorResponses.p75}, P90=${rs.authorResponses.p90}, Avg=${rs.authorResponses.avg.toFixed(1)}`);
                  this.log(`       Diff Versions:     P50=${rs.diffVersions.p50}, P75=${rs.diffVersions.p75}, P90=${rs.diffVersions.p90}, Avg=${rs.diffVersions.avg.toFixed(1)}\n`);
                }

                const tm = typeStats.timeMetrics;
                this.log(`    ⏱️  時間指標:`);
                this.log(`       Dev Time:         P50=${this.formatDuration(tm.dev.p50)}, P75=${this.formatDuration(tm.dev.p75)}, P90=${this.formatDuration(tm.dev.p90)}, Avg=${this.formatDuration(tm.dev.avg)}`);
                this.log(`       Wait Time:        P50=${this.formatDuration(tm.wait.p50)}, P75=${this.formatDuration(tm.wait.p75)}, P90=${this.formatDuration(tm.wait.p90)}, Avg=${this.formatDuration(tm.wait.avg)}`);
                this.log(`       Review Time:      P50=${this.formatDuration(tm.review.p50)}, P75=${this.formatDuration(tm.review.p75)}, P90=${this.formatDuration(tm.review.p90)}, Avg=${this.formatDuration(tm.review.avg)}`);
                this.log(`       Merge Time:       P50=${this.formatDuration(tm.merge.p50)}, P75=${this.formatDuration(tm.merge.p75)}, P90=${this.formatDuration(tm.merge.p90)}, Avg=${this.formatDuration(tm.merge.avg)}`);
                this.log(`       Lead Review Time: P50=${this.formatDuration(tm.leadReview.p50)}, P75=${this.formatDuration(tm.leadReview.p75)}, P90=${this.formatDuration(tm.leadReview.p90)}, Avg=${this.formatDuration(tm.leadReview.avg)}`);
                this.log(`       Cycle Time:       P50=${this.formatDuration(tm.cycle.p50)}, P75=${this.formatDuration(tm.cycle.p75)}, P90=${this.formatDuration(tm.cycle.p90)}, Avg=${this.formatDuration(tm.cycle.avg)}`);

                const rrt = typeStats.reviewResponseTime;
                this.log(`       Review Response:  P50=${this.formatDuration(rrt.p50)}, P75=${this.formatDuration(rrt.p75)}, P90=${this.formatDuration(rrt.p90)}, Avg=${this.formatDuration(rrt.avg)}`);

                if (typeStats.draftDuration) {
                  const dd = typeStats.draftDuration;
                  this.log(`       Draft Duration:   P50=${this.formatDuration(dd.p50)}, P75=${this.formatDuration(dd.p75)}, P90=${this.formatDuration(dd.p90)}, Avg=${this.formatDuration(dd.avg)}`);
                }

                if (typeStats.devDuration) {
                  const dd = typeStats.devDuration;
                  this.log(`       Dev Duration:     P50=${this.formatDuration(dd.p50)}, P75=${this.formatDuration(dd.p75)}, P90=${this.formatDuration(dd.p90)}, Avg=${this.formatDuration(dd.avg)}`);
                }
              }
            }
          }

          this.log('\n' + '═'.repeat(80));
        } else {
          // Fallback to old format if no enhanced stats
          this.log('\n' + '═'.repeat(80));
          this.log('📊 MR 類型分類統計');
          this.log('═'.repeat(80));

          for (const [typeName, stats] of Object.entries(typeStats)) {
            if (!stats) continue;

            this.log(`\n### ${typeName} MRs (${stats.count} 個, ${stats.percentage.toFixed(1)}%)`);
            this.log(`  Review Response Time:`);
            this.log(`    P50: ${this.formatDuration(stats.reviewResponseTime.p50)}`);
            this.log(`    P75: ${this.formatDuration(stats.reviewResponseTime.p75)}`);
            this.log(`    P90: ${this.formatDuration(stats.reviewResponseTime.p90)}`);
            this.log(`    Avg: ${this.formatDuration(stats.reviewResponseTime.avg)}`);
            this.log(`    Min: ${this.formatDuration(stats.reviewResponseTime.min)}`);
            this.log(`    Max: ${this.formatDuration(stats.reviewResponseTime.max)}`);

            if (typeName === 'Draft' && stats.draftDuration) {
              this.log(`  Draft Duration Avg: ${this.formatDuration(stats.draftDuration.avg)}`);
            }

            if (typeName === 'Active Development' && stats.totalPickupTime) {
              this.log(`  Total Pickup Time:`);
              this.log(`    P50: ${this.formatDuration(stats.totalPickupTime.p50)}`);
              this.log(`    P75: ${this.formatDuration(stats.totalPickupTime.p75)}`);
              this.log(`    P90: ${this.formatDuration(stats.totalPickupTime.p90)}`);
              this.log(`    Avg: ${this.formatDuration(stats.totalPickupTime.avg)}`);
            }
          }

          this.log('═'.repeat(80));
        }
      }

      // T022: Verbose 模式顯示階段過濾統計
      if (flags.verbose && (result as any).phaseFilterStats) {
        const stats = (result as any).phaseFilterStats as import('../types/batch-comparison.js').PhaseFilterStats;
        this.log('\n📊 階段過濾統計：\n');
        this.log(`   過濾前總 MR 數量: ${stats.totalCount}`);
        this.log(`   過濾後 MR 數量: ${stats.filteredCount}`);
        this.log(`   排除的 MR 數量: ${stats.totalCount - stats.filteredCount}\n`);

        const filters = Object.entries(stats.excludedByFilter);
        if (filters.length > 0) {
          const sortedFilters = filters.sort(([, a], [, b]) => b - a);
          const mostRestrictive = sortedFilters[0];
          if (mostRestrictive) {
            const mostRestrictiveCount = mostRestrictive[1];
            this.log('   各過濾條件排除的 MR 數量：');
            sortedFilters.forEach(([filterName, count]) => {
              const emoji = count === mostRestrictiveCount ? '🔴' : '  ';
              this.log(`   ${emoji} ${filterName}: ${count} 個 MR`);
            });
            if (stats.filteredCount > 0) {
              this.log(`\n💡 提示：「${mostRestrictive[0]}」是最具限制性的過濾條件。\n`);
            }
          }
        }
      }
    } catch (error: any) {
      if (flags.verbose) {
        this.error(error.stack || error.message, { exit: 1 });
      } else {
        // 友善的錯誤訊息
        if (error.format && typeof error.format === 'function') {
          this.error(error.format(false), { exit: 1 });
        } else {
          this.error(`❌ ${error.message}`, { exit: 1 });
        }
      }
    }
  }

  /**
   * 驗證輸出路徑安全性
   * 防止目錄遍歷攻擊和不安全的路徑操作
   */
  private validateOutputPath(outputPath: string): void {
    // 檢查路徑中是否包含目錄遍歷模式
    if (outputPath.includes('..')) {
      this.error('❌ 輸出路徑不可包含 ".."（目錄遍歷）', { exit: 4 });
    }

    // 檢查是否為絕對路徑（可選的額外安全檢查）
    // 允許相對路徑，但確保它們不包含危險模式
    const dangerousPatterns = [
      /^\/etc\//,       // 系統配置目錄
      /^\/usr\//,       // 系統程式目錄
      /^\/bin\//,       // 系統二進位檔案
      /^\/sbin\//,      // 系統管理程式
      /^\/var\/log\//,  // 系統日誌
      /^\/root\//,      // root 使用者目錄
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(outputPath)) {
        this.error('❌ 不允許寫入系統目錄', { exit: 4 });
      }
    }

    // 檢查檔案副檔名是否合法
    const validExtensions = ['.json', '.csv', '.txt', '.md'];
    const hasValidExtension = validExtensions.some(ext => outputPath.toLowerCase().endsWith(ext));
    if (!hasValidExtension) {
      this.warn(`⚠️  輸出檔案副檔名不常見，建議使用: ${validExtensions.join(', ')}`);
    }
  }

  /**
   * 解析 MR IID 清單
   * 支援空陣列（用於日期範圍查詢）
   */
  private parseMRIids(argv: string[]): number[] {
    const mrIids: number[] = [];

    // 過濾掉空字串（oclif 有時會傳入空字串）
    const validArgs = argv.filter(arg => arg && arg.trim().length > 0);

    // 允許空陣列（用於日期範圍查詢，如 --from/--to）
    if (validArgs.length === 0) {
      return mrIids;
    }

    for (const arg of validArgs) {
      const iid = parseInt(arg, 10);
      if (isNaN(iid) || iid <= 0) {
        this.error(`❌ 無效的 MR IID: ${arg}（必須是正整數）`, { exit: 2 });
      }
      mrIids.push(iid);
    }

    return mrIids;
  }

  /**
   * 格式化時間（秒 → 人類可讀格式）
   * Feature: MR Type Classification (2025-11-15)
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
  }
}
