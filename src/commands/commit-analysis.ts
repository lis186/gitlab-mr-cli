/**
 * Commit 規模分析命令
 * 功能：004-commit-size-analysis
 *
 * CLI 命令：分析 GitLab 專案的 commit 規模，識別違反小批量原則的過大 commits
 */

import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { GitLabClient } from '../services/gitlab-client.js';
import { CommitAnalyzer } from '../services/commit-analyzer.js';
import { LocalGitClient } from '../services/local-git-client.js';
import { formatBasicAnalysis, formatProblemCommits, formatDeveloperPatterns, formatTrendAnalysis } from '../formatters/commit-analysis-table-formatter.js';
import { formatBasicAnalysisJSON, formatProblemCommitsJSON, formatDeveloperPatternsJSON, formatTrendAnalysisJSON } from '../formatters/commit-analysis-json-formatter.js';
import { AppError, ErrorType } from '../models/error.js';
import type { ProjectConfig } from '../models/project.js';
import { ErrorFormatter } from '../utils/error-formatter.js';
import { createCommitAnalysisProgressBar } from '../utils/progress-bar.js';
import { parseProjectIdentifier } from '../utils/project-parser.js';
import { normalizeDateString, validateDateRange } from '../utils/time-utils.js';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { BATCH_SETTINGS } from '../constants/commit-analysis.js';

export default class CommitAnalysis extends Command {
  static description = 'Commit 規模分析 - 識別違反小批量原則的過大 commits';

  static examples = [
    '<%= config.bin %> <%= command.id %> --project 123 --days 30',
    '<%= config.bin %> <%= command.id %> -p my-group/my-project --since 2025-01-01 --until 2025-10-01',
    '<%= config.bin %> <%= command.id %> -p 456 --branches feature/my-branch',
    '<%= config.bin %> <%= command.id %> -p 789 --days 7 --json',
    '<%= config.bin %> <%= command.id %> -p 123 --days 30 --show-problems',
    '<%= config.bin %> <%= command.id %> -p 123 --days 30 --show-problems --severity critical',
    '<%= config.bin %> <%= command.id %> -p 123 --days 30 --by-developer',
    '<%= config.bin %> <%= command.id %> -p 123 --since 2025-07-01 --until 2025-10-01 --trend',
    '<%= config.bin %> <%= command.id %> -p 123 --days 90 --trend --trend-by weekly',
  ];

  static flags = {
    // 必要參數
    project: Flags.string({
      char: 'p',
      description: '專案 ID 或路徑（例如：123 或 group/project）',
      required: false,
      env: 'GITLAB_PROJECT',
    }),

    // 時間範圍選項（互斥）
    days: Flags.integer({
      char: 'd',
      description: '分析最近 N 天的 commits',
      exclusive: ['since', 'until'],
    }),

    since: Flags.string({
      description: '開始日期（格式：YYYY-MM-DD，UTC 時區，包含當天 00:00:00，例如：2025-01-01）',
      exclusive: ['days'],
    }),

    until: Flags.string({
      description: '結束日期（格式：YYYY-MM-DD，UTC 時區，包含當天 23:59:59，例如：2025-10-01）',
      exclusive: ['days'],
    }),

    // 分支選擇
    branches: Flags.string({
      char: 'b',
      description: '指定分支名稱（預設：主分支）',
    }),

    // 限制
    limit: Flags.integer({
      char: 'l',
      description: 'Commits 數量限制',
      default: 1000,
    }),

    // 輸出格式
    json: Flags.boolean({
      description: '以 JSON 格式輸出',
      default: false,
    }),

    // 顯示問題 commits
    'show-problems': Flags.boolean({
      description: '顯示超過 100 LOC 的問題 commits',
      default: false,
    }),

    // 嚴重程度篩選（需搭配 --show-problems）
    severity: Flags.string({
      description: '嚴重程度篩選（warning: 100-200 LOC, critical: >200 LOC）',
      options: ['warning', 'critical'],
    }),

    // 開發者模式分析（使用者故事 3）
    'by-developer': Flags.boolean({
      description: '按開發者分組顯示 commit 規模模式',
      default: false,
    }),

    // 趨勢分析（使用者故事 4）
    trend: Flags.boolean({
      description: '顯示跨時間段的趨勢分析（需要 --since 和 --until，或使用 --days）',
      default: false,
    }),

    'trend-by': Flags.string({
      description: '趨勢分析粒度（weekly/monthly/quarterly，預設 monthly）',
      options: ['weekly', 'monthly', 'quarterly'],
      default: 'monthly',
    }),

    // 本地 Git 加速
    'local-repo': Flags.string({
      description: '本地 Git repository 路徑（啟用本地加速模式，10-50x 更快）',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CommitAnalysis);

    try {
      // 0. 驗證必要參數
      if (!flags.project) {
        this.error('請提供專案識別（使用 --project 或設定環境變數 GITLAB_PROJECT）');
      }

      // 1. 參數互斥驗證
      this.validateFlagCombinations(flags);

      // 2. 計算時間範圍
      const { since, until } = this.calculateDateRange(flags);

      // 2. 初始化 GitLab 客戶端
      const config = this.getProjectConfig(flags.project);
      const gitlabClient = new GitLabClient(config);

      // 3. 檢測主分支（用於本地 Git）
      const defaultBranch = await this.detectMainBranch(gitlabClient);

      // 4. 初始化本地 Git 客戶端（如果提供了路徑）
      let localGitClient: LocalGitClient | undefined;
      if (flags['local-repo']) {
        localGitClient = await this.initializeLocalGitClient(
          flags['local-repo'],
          flags.project,
          defaultBranch
        );
        if (localGitClient && !flags.json) {
          this.log('✓ 本地 Git 加速模式已啟用');
        }
      }

      // 5. 初始化 Commit 分析器
      const analyzer = new CommitAnalyzer(gitlabClient, localGitClient);

      // 4. 顯示分析開始訊息
      if (!flags.json) {
        this.log(`\n🔍 正在分析專案 ${flags.project}...`);
        if (flags.branches) {
          this.log(`   分支：${flags.branches}`);
        }
        if (flags.days) {
          this.log(`   時間範圍：最近 ${flags.days} 天`);
        } else if (since || until) {
          this.log(`   時間範圍：${since?.toISOString().split('T')[0] || '起始'} 至 ${until?.toISOString().split('T')[0] || '現在'}`);
        }
        this.log('');
      }

      // 5. T035: 設置進度條（FR-017，>PROGRESS_BAR_THRESHOLD commits 時顯示）
      // Issue #1: 修復 race condition - 使用 lazy initialization 但確保只初始化一次
      let progressBar: ReturnType<typeof createCommitAnalysisProgressBar> | undefined;
      let progressInitialized = false;

      const onProgress = (completed: number, total: number) => {
        // 雙重檢查模式防止競態條件（雖然在 Node.js 單執行緒中不太可能發生）
        if (progressBar === undefined && !progressInitialized) {
          progressInitialized = true;  // 立即設置 flag（第一道防護）

          // FR-017: 只有當 commits > PROGRESS_BAR_THRESHOLD 時才顯示進度條
          // 雙重檢查確保只初始化一次（第二道防護）
          if (progressBar === undefined && total > BATCH_SETTINGS.PROGRESS_BAR_THRESHOLD) {
            progressBar = createCommitAnalysisProgressBar(total, flags.json);
            progressBar.start();
          }
        }

        // 使用可選鏈更新進度條
        progressBar?.update(completed);
      };

      // 6. 執行分析
      const result = await analyzer.analyzeProject({
        branch: flags.branches,
        since,
        until,
        limit: flags.limit,
        onProgress, // T035: 傳遞進度回呼
        onWarning: flags.json ? undefined : (msg) => this.log(chalk.yellow(`⚠️  ${msg}`)), // Issue #5: 警告回呼（JSON 模式不顯示）
      });

      // 停止進度條
      if (progressBar) {
        progressBar.stop();
      }

      // 6. 格式化並輸出結果
      if (flags.trend) {
        // 顯示趨勢分析（使用者故事 4）
        if (!since || !until) {
          throw new AppError(
            ErrorType.INVALID_INPUT,
            '趨勢分析需要明確的時間範圍（--since 和 --until，或使用 --days）'
          );
        }

        const granularity = (flags['trend-by'] as 'weekly' | 'monthly' | 'quarterly') || 'monthly';
        const trendResult = await analyzer.analyzeTrend(
          {
            branch: flags.branches,
            since,
            until,
            limit: flags.limit,
            onWarning: flags.json ? undefined : (msg) => this.log(chalk.yellow(`⚠️  ${msg}`)), // Issue #5: 警告回呼
          },
          granularity
        );

        if (flags.json) {
          this.log(formatTrendAnalysisJSON(trendResult));
        } else {
          this.log(formatTrendAnalysis(trendResult));
        }
      } else if (flags['by-developer']) {
        // 顯示開發者模式分析（使用者故事 3）
        const developerPatterns = analyzer.analyzeDeveloperPatterns(result.commits);
        const teamAvg = result.statistics.avgLOCPerCommit;

        if (flags.json) {
          this.log(formatDeveloperPatternsJSON(developerPatterns, teamAvg));
        } else {
          this.log(formatDeveloperPatterns(developerPatterns, teamAvg));
        }
      } else if (flags['show-problems']) {
        // T019: 顯示問題 commits（使用者故事 2）
        // 使用 CommitAnalyzer 的 filterProblemCommits 方法
        const severityFilter = flags.severity as 'warning' | 'critical' | undefined;
        const problemCommits = analyzer.filterProblemCommits(
          result.commits,
          severityFilter
        );

        if (flags.json) {
          this.log(formatProblemCommitsJSON(problemCommits));
        } else {
          this.log(formatProblemCommits(problemCommits));
        }
      } else {
        // 顯示基本分析（使用者故事 1）
        if (flags.json) {
          this.log(formatBasicAnalysisJSON(result.statistics, result.commits));
        } else {
          this.log(formatBasicAnalysis(result.statistics));
        }
      }

      // 7. 空資料情況處理（驗收情境 4）
      if (result.commits.length === 0) {
        if (!flags.json) {
          this.log('\n⚠️  所選時間範圍內無可用資料（無已合併的 commits）\n');
        }
      }
    } catch (error) {
      this.handleError(error, flags.json);
    }
  }

  /**
   * 計算日期範圍
   *
   * @param flags - 命令旗標
   * @returns since 和 until 日期
   */
  private calculateDateRange(flags: any): { since?: Date; until?: Date } {
    if (flags.days) {
      const until = new Date();
      const since = new Date();
      since.setDate(since.getDate() - flags.days);
      return { since, until };
    }

    // 驗證日期範圍（如果兩者都有提供）
    if (flags.since && flags.until) {
      validateDateRange(flags.since, flags.until)
    }

    // 正規化日期字串為完整的 UTC 日期物件
    // normalizeDateString 和 validateDateRange 已內建格式、有效性與範圍驗證
    const since = flags.since ? normalizeDateString(flags.since, 'start') : undefined;
    const until = flags.until ? normalizeDateString(flags.until, 'end') : undefined;

    return { since, until };
  }

  /**
   * 取得專案配置
   *
   * @param projectId - 專案 ID 或路徑
   * @returns 專案配置物件
   */
  private getProjectConfig(projectInput: string): ProjectConfig {
    const token = process.env.GITLAB_TOKEN;
    const defaultHost = process.env.GITLAB_HOST || 'https://gitlab.com';

    if (!token) {
      throw new AppError(
        ErrorType.AUTH_ERROR,
        'GitLab token 未設定。請設定 GITLAB_TOKEN 環境變數。'
      );
    }

    // 解析專案識別（支援專案 ID、路徑、URL）
    const { identifier, host } = parseProjectIdentifier(projectInput);

    return {
      identifier,
      token,
      host: host || defaultHost,
    };
  }

  /**
   * 驗證參數組合的合法性
   *
   * @param flags - 命令旗標
   * @throws AppError - 當參數組合不合法時
   */
  private validateFlagCombinations(flags: any): void {
    // 檢查輸出模式互斥：trend, show-problems, by-developer 只能選一個
    const outputModes = [
      flags.trend,
      flags['show-problems'],
      flags['by-developer'],
    ].filter(Boolean);

    if (outputModes.length > 1) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        '輸出模式互斥：--trend、--show-problems、--by-developer 只能選擇其中一個'
      );
    }

    // 檢查 --severity 必須搭配 --show-problems
    if (flags.severity && !flags['show-problems']) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        '--severity 選項必須與 --show-problems 一起使用'
      );
    }

    // 檢查 --trend-by 必須搭配 --trend
    // 注意：trend-by 有預設值，所以只在用戶明確指定非預設值時才檢查
    const trendByValue = flags['trend-by'] as string;
    const isDefaultTrendBy = trendByValue === 'monthly' || !trendByValue;

    if (!isDefaultTrendBy && !flags.trend) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        '--trend-by 選項必須與 --trend 一起使用'
      );
    }
  }

  /**
   * 檢測專案的主分支
   *
   * @param gitlabClient - GitLab 客戶端
   * @returns 主分支名稱
   */
  private async detectMainBranch(gitlabClient: GitLabClient): Promise<string> {
    try {
      // T031: 使用指數退避重試邏輯取得專案資訊（Issue #4: 使用 type-safe method）
      const project = await gitlabClient.getProject();
      return project.default_branch || 'main';
    } catch (error) {
      // Issue #4: 記錄錯誤而非靜默吞掉
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.warn(`無法檢測主分支，使用預設值 'main': ${errorMsg}`);
      return 'main';
    }
  }

  /**
   * 初始化本地 Git 客戶端
   *
   * @param repoPath - Repository 路徑
   * @param projectId - 專案 ID
   * @param baseBranch - 基準分支名稱
   * @returns LocalGitClient 實例，或 undefined（如果驗證失敗）
   */
  private async initializeLocalGitClient(
    repoPath: string,
    projectId: string,
    baseBranch: string
  ): Promise<LocalGitClient | undefined> {
    try {
      // 解析絕對路徑
      const absolutePath = resolve(repoPath);

      // 檢查路徑是否存在
      if (!existsSync(absolutePath)) {
        this.warn(`本地 repository 路徑不存在：${absolutePath}`);
        this.warn('將使用 API 模式繼續');
        return undefined;
      }

      // 初始化並驗證 LocalGitClient
      const client = new LocalGitClient({
        repoPath: absolutePath,
        expectedProjectId: projectId,
        baseBranch, // 使用從 GitLab API 檢測到的默認分支
      });

      const validation = await client.validateRepo();

      if (!validation.isValid) {
        this.warn(`本地 repository 驗證失敗：${validation.error}`);
        this.warn('將使用 API 模式繼續');
        return undefined;
      }

      // 顯示警告訊息（如果有）
      if (validation.warnings && validation.warnings.length > 0) {
        for (const warning of validation.warnings) {
          this.warn(warning);
        }
      }

      return client;
    } catch (error) {
      this.warn(
        `初始化本地 Git 客戶端失敗：${error instanceof Error ? error.message : String(error)}`
      );
      this.warn('將使用 API 模式繼續');
      return undefined;
    }
  }

  /**
   * 錯誤處理（T032: 結構化錯誤訊息）
   *
   * @param error - 錯誤物件
   * @param jsonMode - 是否為 JSON 模式
   */
  private handleError(error: unknown, jsonMode: boolean): void {
    if (error instanceof AppError) {
      if (jsonMode) {
        // JSON 模式：結構化錯誤（符合 cli-output.md 規範）
        const suggestions = ErrorFormatter.getSuggestedActions(error);
        this.log(
          JSON.stringify(
            {
              error: {
                code: error.type,
                message: ErrorFormatter.getMessage(error),
                details: error.originalError?.message || error.message,
                suggestions,
              },
            },
            null,
            2
          )
        );
      } else {
        // 表格模式：使用 ErrorFormatter 格式化輸出
        const formatted = ErrorFormatter.format(error, false);
        this.error(formatted);
      }
    } else {
      // 未知錯誤
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        this.log(
          JSON.stringify(
            {
              error: {
                code: 'UNKNOWN_ERROR',
                message: '發生未預期的錯誤',
                details: message,
                suggestions: ['請檢查錯誤訊息並重試', '如果問題持續，請聯繫支援團隊'],
              },
            },
            null,
            2
          )
        );
      } else {
        this.error(`\n錯誤: UNKNOWN_ERROR - 發生未預期的錯誤\n\n詳細資訊: ${message}\n`);
      }
    }
  }
}
