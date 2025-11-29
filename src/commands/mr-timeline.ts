/**
 * MRTimeline 命令 - MR 時間軸分析
 *
 * 實作功能：010-mr-timeline-analysis
 * User Story 1 (P1): 查看 MR 完整時間軸
 * User Story 5 (P3): 比較多個 MR 的效率
 */

import { Command, Flags } from '@oclif/core';
import { Gitlab } from '@gitbeaker/rest';
import { MRTimelineService } from '../services/mr-timeline-service.js';
import { TimelineTableFormatter } from '../formatters/timeline-table-formatter.js';
import { parseProjectIdentifier } from '../utils/project-parser.js';
import { processBatchItems } from '../utils/batch-processor.js';
import { ProgressBar } from '../utils/progress-bar.js';
import { ErrorClassifier } from '../lib/error-handler.js';
import { ErrorFormatter } from '../formatters/error-formatter.js';
import type { MRTimeline as MRTimelineType } from '../types/timeline.js';
import type { BatchResult } from '../utils/batch-processor.js';

/**
 * MRTimeline 命令類別
 */
export default class MRTimeline extends Command {
  static description = 'MR 時間軸分析 - 顯示 MR 從建立到合併的完整時間軸，包括事件、角色、時間間隔';

  static examples = [
    '<%= config.bin %> <%= command.id %> 123 --project example/mobile-app',
    '<%= config.bin %> <%= command.id %> 456 --project 12345',
    '<%= config.bin %> <%= command.id %> 789 -p gitlab-org/gitlab --json',
    '<%= config.bin %> <%= command.id %> 321 -p example/mobile-app --ai-bots "custom-bot,my-reviewer"',
    '<%= config.bin %> <%= command.id %> 654 -p example/mobile-app --verbose',
    '<%= config.bin %> <%= command.id %> 101 102 103 -p example/mobile-app',
    '<%= config.bin %> <%= command.id %> 201 202 203 204 205 -p example/mobile-app --json',
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
    verbose: Flags.boolean({
      char: 'v',
      description: '顯示詳細除錯資訊（警告：避免在 CI/CD 或共享環境中使用，可能洩漏敏感資訊）',
      default: false,
    }),
    'ai-bots': Flags.string({
      description: '自訂 AI Bot 使用者名稱清單（逗號分隔）',
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(MRTimeline);

    try {
      // T050: 解析 MR IID 清單
      const mrIids = this.parseMRIids(argv as string[]);

      // T051: 驗證批次大小（預設最多 50 個，可透過環境變數 MAX_BATCH_SIZE 調整）
      const maxBatchSize = parseInt(process.env.MAX_BATCH_SIZE || '50', 10);
      if (mrIids.length > maxBatchSize) {
        this.error(`❌ 最多支援分析 ${maxBatchSize} 個 MR。請減少 MR 數量或設定環境變數 MAX_BATCH_SIZE。`, { exit: 3 });
      }

      // 驗證必要參數
      if (!flags.token) {
        this.error('❌ 缺少 GitLab Token。請使用 --token 或設定環境變數 GITLAB_TOKEN');
      }

      if (!flags.project) {
        this.error('❌ 缺少專案識別。請使用 --project 或設定環境變數 GITLAB_PROJECT');
      }

      // 解析專案識別
      const projectInfo = parseProjectIdentifier(flags.project);
      const projectId = projectInfo.identifier;

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

        this.log('📊 開始分析 MR 時間軸...');
        this.log(`   專案: ${flags.project}`);
        this.log(`   MR IID(s): ${mrIids.join(', ')}`);
        this.log(`   GitLab URL: ${flags.url}`);
        this.log(`   分析數量: ${mrIids.length} 個 MR`);
      }

      // 建立 GitLab 客戶端
      const gitlabClient = new Gitlab({
        token: flags.token,
        host: flags.url,
      });

      // 解析 AI Bot 設定
      const aiBotsConfig = flags['ai-bots']
        ? flags['ai-bots'].split(',').map((s) => s.trim())
        : undefined;

      if (flags.verbose && aiBotsConfig) {
        this.log(`   自訂 AI Bots: ${aiBotsConfig.join(', ')}`);
      }

      // 建立時間軸服務
      const timelineService = new MRTimelineService(gitlabClient, aiBotsConfig);

      // 單一 MR vs 批次 MR 處理
      if (mrIids.length === 1) {
        // 單一 MR - 原有邏輯
        const timeline = await timelineService.analyze(projectId, mrIids[0]!, {
          verbose: flags.verbose,
        });

        if (flags.json) {
          this.outputJson([timeline]);
        } else {
          this.outputTable([timeline], flags.verbose);
        }
      } else {
        // T052-T054: 批次 MR 處理
        const timelines = await this.analyzeBatchMRs(
          timelineService,
          projectId,
          mrIids,
          flags.verbose
        );

        // 輸出結果
        if (flags.json) {
          this.outputJson(timelines);
        } else {
          this.outputTable(timelines, flags.verbose);
        }
      }

      if (flags.verbose) {
        this.log('');
        this.log('✅ 分析完成');
      }
    } catch (error) {
      this.handleError(error, flags.verbose, flags.json);
    }
  }

  /**
   * T050: 解析 MR IID 清單
   */
  private parseMRIids(argv: string[]): number[] {
    if (argv.length === 0) {
      this.error('❌ 請提供至少一個 MR IID');
    }

    const mrIids: number[] = [];

    for (const arg of argv) {
      const iid = parseInt(arg, 10);
      if (isNaN(iid) || iid <= 0) {
        this.error(`❌ 無效的 MR IID: ${arg}。MR IID 必須是正整數。`);
      }
      mrIids.push(iid);
    }

    return mrIids;
  }

  /**
   * T052-T054: 批次分析多個 MR
   */
  private async analyzeBatchMRs(
    timelineService: MRTimelineService,
    projectId: string | number,
    mrIids: number[],
    verbose: boolean
  ): Promise<MRTimelineType[]> {
    // T053: 進度顯示
    if (verbose) {
      this.log('');
      this.log(`📦 批次處理 ${mrIids.length} 個 MR（每批次 10 個）...`);
    }

    // 建立進度條（JSON 或 verbose 模式不顯示）
    const skipProgress = verbose;
    const progressBar = new ProgressBar('分析 MR', mrIids.length, skipProgress);
    progressBar.start();

    // T052: 使用 BatchProcessor 並發處理
    const result: BatchResult<MRTimelineType> = await processBatchItems(
      mrIids,
      async (mrIid) => {
        try {
          return await timelineService.analyze(projectId, mrIid, { verbose });
        } catch (error: any) {
          // T054: Fail-fast 錯誤處理
          throw new Error(`MR !${mrIid} 分析失敗: ${error.message}`);
        }
      },
      {
        batchSize: 10,
        errorHandling: 'throw', // T054: fail-fast
        onProgress: (processed) => {
          progressBar.update(processed);
          if (verbose) {
            this.log(`   已處理: ${processed}/${mrIids.length}`);
          }
        },
      }
    );

    // 停止進度條
    progressBar.stop();

    if (verbose) {
      this.log(`✅ 成功分析 ${result.successCount} 個 MR`);
      if (result.failureCount > 0) {
        this.log(`❌ 失敗 ${result.failureCount} 個 MR`);
      }
    }

    return result.successes;
  }

  /**
   * T055-T056: 輸出表格格式（支援單一或多個 MR）
   */
  private outputTable(timelines: MRTimelineType[], _verbose: boolean): void {
    const formatter = new TimelineTableFormatter();

    if (timelines.length === 1) {
      // 單一 MR - 原有格式
      const output = formatter.format(timelines[0]!);
      this.log(output);
    } else {
      // 多個 MR - 批次格式
      this.log('');
      this.log('═'.repeat(80));
      this.log(`📊 批次 MR 時間軸分析 - 共 ${timelines.length} 個 MR`);
      this.log('═'.repeat(80));
      this.log('');

      timelines.forEach((timeline, index) => {
        // T056: MR 分隔線與標題
        this.log('─'.repeat(80));
        this.log(`📋 MR #${index + 1}: !${timeline.mr.id} - ${timeline.mr.title}`);
        this.log(`   🔗 ${timeline.mr.webUrl}`);
        this.log('─'.repeat(80));
        this.log('');

        const output = formatter.format(timeline);
        this.log(output);

        if (index < timelines.length - 1) {
          this.log('');
          this.log('');
        }
      });

      this.log('');
      this.log('═'.repeat(80));
      this.log(`✅ 完成 ${timelines.length} 個 MR 的分析`);
      this.log('═'.repeat(80));
    }
  }

  /**
   * T057-T059: 輸出 JSON 格式（支援批次）
   */
  private outputJson(timelines: MRTimelineType[]): void {
    const output = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      count: timelines.length,
      timelines: timelines.map((timeline) => this.serializeTimeline(timeline)),
    };

    this.log(JSON.stringify(output, null, 2));
  }

  /**
   * 序列化 MRTimeline 為 JSON
   */
  private serializeTimeline(timeline: MRTimelineType): any {
    return {
      mr: {
        id: timeline.mr.id,
        projectId: timeline.mr.projectId,
        title: timeline.mr.title,
        author: timeline.mr.author,
        createdAt: timeline.mr.createdAt.toISOString(),
        mergedAt: timeline.mr.mergedAt ? timeline.mr.mergedAt.toISOString() : null,
        sourceBranch: timeline.mr.sourceBranch,
        targetBranch: timeline.mr.targetBranch,
        webUrl: timeline.mr.webUrl,
      },
      events: timeline.events.map((event) => ({
        sequence: event.sequence,
        timestamp: event.timestamp.toISOString(),
        actor: event.actor,
        eventType: event.eventType,
        details: event.details,
        intervalToNext: event.intervalToNext,
      })),
      segments: timeline.segments,
      summary: timeline.summary,
      cycleTimeSeconds: timeline.cycleTimeSeconds,
    };
  }

  /**
   * T024 + T063-T066: 結構化錯誤處理
   */
  private handleError(error: any, verbose: boolean, json = false): void {
    // 分類錯誤
    const structuredError = ErrorClassifier.classify(error);

    // 格式化錯誤
    const formatter = new ErrorFormatter();
    const formattedError = formatter.format(structuredError, {
      json,
      verbose,
    });

    // 輸出錯誤
    if (json) {
      // JSON 模式：輸出到 stdout
      this.log(formattedError);
      this.exit(1);
    } else {
      // 終端模式：使用 oclif error()
      this.error(formattedError);
    }
  }
}
