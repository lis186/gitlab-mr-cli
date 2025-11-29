/**
 * release:analyze 命令 - 發布批量分析
 *
 * 實作功能：006-release-readiness
 * User Story 1: 識別發布批量過大問題
 */

import { Command, Flags, ux } from '@oclif/core';
import { parseISO, isValid, subDays } from 'date-fns';
import { GitLabClient } from '../../services/gitlab-client.js';
import { ReleaseAnalyzer } from '../../services/release/release-analyzer.js';
import { IntegrationAnalyzer } from '../../services/release/integration-analyzer.js';
import { TrendAnalyzer } from '../../services/release/trend-analyzer.js';
import { ConfigLoader } from '../../services/config/config-loader.js';
import { parseProjectIdentifier } from '../../utils/project-parser.js';
import { formatReleaseAnalysis } from '../../formatters/release-analysis-formatter.js';
import { formatReleaseAnalysisJson } from '../../formatters/release-analysis-json-formatter.js';
import type { ReleaseConfiguration } from '../../types/release-config.js';
import { logger } from '../../utils/logger.js';

/**
 * release:analyze 命令類別
 */
export default class ReleaseAnalyze extends Command {
  static description =
    '發布批量分析 - 檢視每次月度發布包含的 MR 數量和程式碼變更量，識別「月底集中合併大批量」反模式';

  static examples = [
    '<%= config.bin %> <%= command.id %> --project example/mobile-app',
    '<%= config.bin %> <%= command.id %> --project 12345 --since 2025-01-01',
    '<%= config.bin %> <%= command.id %> -p example/mobile-app --config ./release-config.yml',
    '<%= config.bin %> <%= command.id %> -p example/mobile-app --json',
    '<%= config.bin %> <%= command.id %> -p example/mobile-app --include-types major,minor',
    '<%= config.bin %> <%= command.id %> -p example/mobile-app --exclude-types hotfix',
  ];

  static flags = {
    project: Flags.string({
      char: 'p',
      description: 'GitLab 專案識別（專案 ID、路徑 namespace/project、或完整 URL）',
      required: true,
    }),
    token: Flags.string({
      char: 't',
      description:
        'GitLab Personal Access Token（或透過環境變數 GITLAB_TOKEN 設定）',
      env: 'GITLAB_TOKEN',
    }),
    host: Flags.string({
      char: 'h',
      description: 'GitLab 伺服器 URL（預設: https://gitlab.com）',
      env: 'GITLAB_HOST',
      default: 'https://gitlab.com',
    }),
    since: Flags.string({
      description: '起始日期（格式：YYYY-MM-DD，預設 90 天前）',
    }),
    until: Flags.string({
      description: '結束日期（格式：YYYY-MM-DD，預設今天）',
    }),
    config: Flags.string({
      char: 'c',
      description: '配置檔案路徑（.yml 或 .yaml）',
    }),
    output: Flags.string({
      char: 'o',
      description: '輸出格式',
      options: ['table', 'json', 'markdown'],
      default: 'table',
    }),
    json: Flags.boolean({
      char: 'j',
      description: '以 JSON 格式輸出結果（等同於 --output json）',
      default: false,
    }),
    'include-types': Flags.string({
      description: '僅包含特定發布類型（逗號分隔，例如：major,minor）',
    }),
    'exclude-types': Flags.string({
      description: '排除特定發布類型（逗號分隔，例如：hotfix）',
    }),
    'with-integration-frequency': Flags.boolean({
      description: '包含整合頻率分析（分析團隊合併到主幹的頻率）',
      default: false,
    }),
    'target-branch': Flags.string({
      description: '目標分支名稱（用於整合頻率分析，預設：main）',
      default: 'main',
    }),
    'with-trend': Flags.boolean({
      description: '包含趨勢分析（分析跨月份的指標變化趨勢）',
      default: false,
    }),
    'trend-months': Flags.integer({
      description: '趨勢分析的月數（預設：自動根據資料範圍計算，上限 12 個月）',
      default: 3,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: '顯示詳細的執行日誌與除錯訊息',
      default: false,
    }),
    'show-config': Flags.boolean({
      description: '顯示當前生效的配置來源與內容（不執行分析）',
      default: false,
    }),
    'no-cache': Flags.boolean({
      description: '停用快取機制，強制重新從 API 取得所有資料',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ReleaseAnalyze);

    // 設定 logger
    logger.setOptions({
      verbose: flags.verbose,
      showTimestamp: flags.verbose,
    });

    logger.debug('開始執行 release:analyze 命令');
    logger.debug('參數:', JSON.stringify(flags, null, 2));

    // 驗證 token 存在
    if (!flags.token) {
      logger.error('缺少 GitLab Token');
      this.error(
        '請提供 GitLab Personal Access Token（使用 --token 或設定環境變數 GITLAB_TOKEN）'
      );
    }

    try {
      // 解析專案識別
      logger.debug(`解析專案識別: ${flags.project}`);
      const { identifier, host } = parseProjectIdentifier(flags.project);
      logger.debug(`專案 ID: ${identifier}, Host: ${host || flags.host}`);

      // 建立 GitLab 客戶端
      logger.debug('建立 GitLab 客戶端');
      const client = new GitLabClient({
        identifier,
        host: host || flags.host,
        token: flags.token,
      });

      // 載入配置
      logger.debug('載入配置');
      const configLoader = new ConfigLoader();
      let config: ReleaseConfiguration;

      try {
        const configResult = await configLoader.loadConfig({
          projectId: String(identifier),
          cliConfigPath: flags.config,
          projectPath: process.cwd(),
          autoDetect: true,
        });

        config = configResult.config;
        logger.debug(`配置載入成功: ${configResult.source}`);

        // 如果指定 --show-config，顯示配置後結束
        if (flags['show-config']) {
          this.log('\n═══════════════════════════════════════════════');
          this.log('  配置資訊');
          this.log('═══════════════════════════════════════════════\n');
          this.log(`配置來源: ${configResult.source}`);
          if (configResult.source_path) {
            this.log(`配置路徑: ${configResult.source_path}`);
          }
          this.log(`配置名稱: ${config.name}`);
          if (config.description) {
            this.log(`說明: ${config.description}`);
          }
          this.log('\n標籤模式配置:');
          this.log('───────────────────────────────────────────────');
          this.log(`  正則表達式: ${config.tag.pattern}`);
          this.log(`  擷取群組:`);
          Object.entries(config.tag.groups).forEach(([key, index]) => {
            this.log(`    ${key}: 群組 ${index}`);
          });

          this.log('\n發布類型配置:');
          this.log('───────────────────────────────────────────────');
          Object.entries(config.release_types).forEach(([key, type]) => {
            this.log(`\n${type.name} (${key}):`);
            this.log(`  說明: ${type.description}`);
            this.log(`  優先級: ${type.priority}`);
            this.log(`  評估批量: ${type.evaluate_batch_size ? '是' : '否'}`);
            if (type.rules.length > 0) {
              this.log(`  規則:`);
              type.rules.forEach((rule, idx) => {
                this.log(`    ${idx + 1}. ${rule.field} ${rule.operator} ${rule.value || ''}`);
              });
            }
          });

          this.log('\n分析配置:');
          this.log('───────────────────────────────────────────────');
          this.log(`分析模式: ${config.analysis.mode || 'standard'}`);
          this.log(`目標分支: ${config.analysis.default_branch}`);
          this.log(`Pipeline 歷史天數: ${config.analysis.pipeline_history_days}`);
          this.log(`\n閾值設定:`);
          this.log(`  MR 數量:`);
          this.log(`    健康: <= ${config.analysis.thresholds.mr_count.healthy}`);
          this.log(`    警告: <= ${config.analysis.thresholds.mr_count.warning}`);
          this.log(`    危險: > ${config.analysis.thresholds.mr_count.warning}`);
          if (config.analysis.thresholds.loc_changes) {
            this.log(`  \nLOC 變更:`);
            this.log(`    健康: <= ${config.analysis.thresholds.loc_changes.healthy}`);
            this.log(`    警告: <= ${config.analysis.thresholds.loc_changes.warning}`);
            this.log(`    危險: > ${config.analysis.thresholds.loc_changes.warning}`);
          }

          if (config.analysis.default_filters) {
            this.log(`\n預設過濾器:`);
            if (config.analysis.default_filters.include_types) {
              this.log(`  僅包含: ${config.analysis.default_filters.include_types.join(', ')}`);
            }
            if (config.analysis.default_filters.exclude_types) {
              this.log(`  排除: ${config.analysis.default_filters.exclude_types.join(', ')}`);
            }
          }

          this.log('\n═══════════════════════════════════════════════\n');
          return;
        }

        // 顯示配置來源（非 JSON 模式）
        if (!flags.json && flags.output !== 'json') {
          this.log(`\n使用配置: ${configResult.source}`);
          if (configResult.source_path) {
            this.log(`配置路徑: ${configResult.source_path}`);
          }
          this.log(`配置名稱: ${config.name}`);
          if (config.description) {
            this.log(`說明: ${config.description}\n`);
          }
        }
      } catch (error) {
        logger.error('配置載入失敗', error);
        if (error instanceof Error) {
          this.error(
            `配置載入失敗: ${error.message}\n\n` +
              '建議：\n' +
              '  1. 執行 `release init` 建立配置檔\n' +
              '  2. 使用 --config 參數指定配置檔路徑\n' +
              '  3. 確認標籤格式是否符合預設模式'
          );
        }
        throw error;
      }

      // 解析日期範圍
      logger.debug(`解析日期範圍: since=${flags.since}, until=${flags.until}`);
      const { since, until } = this.parseDateRange(flags.since, flags.until);
      logger.debug(`日期範圍: ${since.toISOString()} - ${until.toISOString()}`);

      // 解析包含/排除類型
      const includeTypes = flags['include-types']
        ? flags['include-types'].split(',').map((t) => t.trim())
        : undefined;

      const excludeTypes = flags['exclude-types']
        ? flags['exclude-types'].split(',').map((t) => t.trim())
        : undefined;

      // 顯示分析參數（非 JSON 模式）
      if (!flags.json && flags.output !== 'json') {
        this.log(`分析時間範圍: ${since.toISOString().split('T')[0]} 至 ${until.toISOString().split('T')[0]}`);
        if (includeTypes) {
          this.log(`包含類型: ${includeTypes.join(', ')}`);
        }
        if (excludeTypes) {
          this.log(`排除類型: ${excludeTypes.join(', ')}`);
        }
        this.log('');
      }

      // 執行分析（帶進度指示器）
      logger.debug('開始分析發布批量');
      const analyzer = new ReleaseAnalyzer(client);

      // 非 JSON 模式下顯示進度
      const isJsonMode = flags.json || flags.output === 'json';
      if (!isJsonMode) {
        ux.action.start('🔍 正在分析發布批量', '', { stdout: true });
      }

      const result = await analyzer.analyzeBatchSize({
        projectId: String(identifier),
        since,
        until,
        config,
        includeTypes,
        excludeTypes,
        useCache: !flags['no-cache'],
        onProgress: isJsonMode ? undefined : (message: string) => {
          ux.action.status = message;
        },
      });

      if (!isJsonMode) {
        ux.action.stop('✓');
        this.log(`📊 分析完成：找到 ${result.releases.length} 個發布\n`);
      }

      logger.debug(`發布批量分析完成: ${result.releases.length} 個發布`);

      // 分析發布節奏
      logger.debug('分析發布節奏');
      const timeRangeDays = Math.ceil((until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));
      const releaseRhythm = analyzer.analyzeReleaseRhythm(result.releases, timeRangeDays);
      logger.debug(`發布節奏分析完成: ${releaseRhythm.length} 個類型`);

      // 分析品質指標
      logger.debug('分析品質指標');
      const qualityMetrics = analyzer.analyzeQualityMetrics(result.releases);

      // 分析發布準備度（凍結期健康評估）
      logger.debug('分析發布準備度');
      const readiness = analyzer.analyzeReadiness(result.releases);

      // 整合頻率分析（如果啟用）
      let integrationFrequency;
      if (flags['with-integration-frequency']) {
        logger.debug('開始分析整合頻率');
        if (!isJsonMode) {
          ux.action.start('🔍 正在分析整合頻率', '', { stdout: true });
        }

        const integrationAnalyzer = new IntegrationAnalyzer(client);
        integrationFrequency = await integrationAnalyzer.analyzeIntegrationFrequency({
          projectId: String(identifier),
          since,
          until,
          targetBranch: flags['target-branch'],
          onProgress: isJsonMode ? undefined : (message: string) => {
            ux.action.status = message;
          },
        });

        if (!isJsonMode) {
          ux.action.stop('✓');
          this.log(`📈 整合頻率分析完成：${integrationFrequency.total_merges} 次合併\n`);
        }

        logger.debug(`整合頻率分析完成: ${integrationFrequency.total_merges} 次合併`);
      }

      // 趨勢分析（如果啟用）
      let trendAnalysis;
      if (flags['with-trend']) {
        logger.debug('開始趨勢分析');
        const trendAnalyzer = new TrendAnalyzer();

        // 計算趨勢分析月數
        let trendMonths = flags['trend-months'];

        // 如果使用者沒有明確指定 --trend-months，自動計算
        if (!this.argv.includes('--trend-months')) {
          // 計算資料中有多少個不同的月份
          const uniqueMonths = new Set(
            result.releases.map((r) => {
              const year = r.date.getFullYear();
              const month = String(r.date.getMonth() + 1).padStart(2, '0');
              return `${year}-${month}`;
            })
          );

          // 取全部月份數，但上限為 12 個月
          trendMonths = Math.min(uniqueMonths.size, 12);

          if (!isJsonMode) {
            this.log(`ℹ️  自動設定趨勢分析月數：${trendMonths} 個月（資料範圍內共 ${uniqueMonths.size} 個月）\n`);
          }
        }

        trendAnalysis = trendAnalyzer.analyzeTrends(result.releases, trendMonths);

        if (!isJsonMode) {
          this.log(`📊 趨勢分析完成：分析 ${trendAnalysis.monthlyStats.length} 個月數據\n`);
        }

        logger.debug(`趨勢分析完成: ${trendAnalysis.monthlyStats.length} 個月數據`);
      }

      // 輸出結果
      logger.debug(`輸出格式: ${flags.output}`);
      const outputFormat = flags.json ? 'json' : flags.output;

      if (outputFormat === 'json') {
        const jsonOutput = formatReleaseAnalysisJson({
          project: {
            path: flags.project,
            name: this.getProjectName(flags.project),
          },
          analysisDate: new Date().toISOString(),
          timeRange: {
            since: since.toISOString().split('T')[0] as string,
            until: until.toISOString().split('T')[0] as string,
          },
          configSource: 'project', // TODO: 從 configResult 取得
          configName: config.name,
          analysisMode: config.analysis.mode,
          releases: result.releases,
          metrics: result.metrics,
          releaseRhythm: releaseRhythm.length > 0 ? releaseRhythm : undefined,
          qualityMetrics,
          readiness,
          integrationFrequency,
          trendAnalysis,
        });
        this.log(jsonOutput);
      } else {
        const tableOutput = formatReleaseAnalysis({
          project: {
            path: flags.project,
            name: this.getProjectName(flags.project),
          },
          analysisDate: new Date().toISOString(),
          timeRange: {
            since: since.toISOString().split('T')[0] as string,
            until: until.toISOString().split('T')[0] as string,
          },
          configSource: 'project',
          configName: config.name,
          analysisMode: config.analysis.mode,
          releases: result.releases,
          metrics: result.metrics,
          releaseRhythm: releaseRhythm.length > 0 ? releaseRhythm : undefined,
          qualityMetrics,
          readiness,
          integrationFrequency,
          trendAnalysis,
        });
        this.log(tableOutput);
      }

      logger.debug('release:analyze 命令執行完成');
    } catch (error) {
      logger.error('命令執行失敗', error);
      if (error instanceof Error) {
        this.error(`分析失敗: ${error.message}`);
      } else {
        this.error('發生未知錯誤');
      }
    }
  }

  /**
   * 解析日期範圍
   *
   * @param sinceStr - since 參數
   * @param untilStr - until 參數
   * @returns 日期範圍
   * @private
   */
  private parseDateRange(
    sinceStr?: string,
    untilStr?: string
  ): { since: Date; until: Date } {
    const today = new Date();
    const defaultSince = subDays(today, 90);

    let since: Date;
    let until: Date;

    // 解析 since
    if (sinceStr) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(sinceStr)) {
        this.error('日期格式錯誤，請使用 YYYY-MM-DD 格式');
      }

      const sinceParsed = parseISO(sinceStr);
      if (!isValid(sinceParsed)) {
        this.error(`起始日期無效：${sinceStr}（請確認日期正確，例如：避免 2024-02-30）`);
      }

      since = sinceParsed;
    } else {
      since = defaultSince;
    }

    // 解析 until
    if (untilStr) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(untilStr)) {
        this.error('日期格式錯誤，請使用 YYYY-MM-DD 格式');
      }

      const untilParsed = parseISO(untilStr);
      if (!isValid(untilParsed)) {
        this.error(`結束日期無效：${untilStr}（請確認日期正確，例如：避免 2024-02-30）`);
      }

      until = untilParsed;
    } else {
      until = today;
    }

    // 驗證日期邏輯
    if (since > until) {
      this.error('起始日期不可晚於結束日期');
    }

    if (until > today) {
      this.error('結束日期不可晚於今天');
    }

    return { since, until };
  }

  /**
   * 從專案路徑提取專案名稱
   *
   * @param projectPath - 專案路徑
   * @returns 專案名稱
   * @private
   */
  private getProjectName(projectPath: string): string {
    return projectPath.split('/').pop() || projectPath;
  }
}
