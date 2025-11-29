/**
 * Commit 分析器服務
 * 功能：004-commit-size-analysis
 *
 * 負責從 GitLab API 檢索 commits 並執行規模分析
 */

import type { GitLabClient } from './gitlab-client.js';
import type { LocalGitClient } from './local-git-client.js';
import type { CommitAnalysis, AggregateStatistics } from '../types/commit-analysis.js';
import { createCommitAnalysis } from '../models/commit-analysis.js';
import { calculateAggregateStatistics } from '../models/aggregate-statistics.js';
import { classifySize } from '../utils/size-classifier.js';
import { assessSeverity } from '../utils/severity-assessor.js';
import { generateRefactorSuggestion } from '../utils/refactor-advisor.js';
import type { DeveloperPattern } from '../models/developer-pattern.js';
import {
  createDeveloperPattern,
  assessDeveloper,
  generateDeveloperSuggestion,
} from '../models/developer-pattern.js';
import type { TrendPeriod, TrendAnalysisResult, TrendGranularity } from '../models/trend-period.js';
import {
  calculateTrendDirection,
  calculateChangePercentage,
  isSignificantChange as checkSignificantChange,
  formatPeriodLabel,
  TrendDirection,
} from '../models/trend-period.js';
import { TrendSplitter } from './trend-splitter.js';
import { DIFF_PARSING_LIMITS, BATCH_SETTINGS } from '../constants/commit-analysis.js';
import { processBatch } from '../utils/batch-processor.js';

/**
 * Commit 分析選項
 */
export interface CommitAnalysisOptions {
  /** 分支名稱（預設：主分支） */
  branch?: string;

  /** 開始日期 */
  since?: Date;

  /** 結束日期 */
  until?: Date;

  /** 限制分析的 commit 數量（預設：1000） */
  limit?: number;

  /** 進度回呼函數（FR-017，用於 >100 commits 的進度顯示） */
  onProgress?: (completed: number, total: number) => void;

  /** 警告訊息回呼（Issue #5: 替代 console.warn） */
  onWarning?: (message: string) => void;
}

/**
 * Commit 分析結果
 */
export interface CommitAnalysisResult {
  /** 分析的 commits 陣列 */
  commits: CommitAnalysis[];

  /** 彙總統計 */
  statistics: AggregateStatistics;
}

/**
 * CommitAnalyzer 服務類別
 *
 * 提供 commit 規模分析功能：
 * - 從 GitLab API 檢索 commits（FR-001）
 * - 從本地 Git repository 檢索 commits（本地加速模式）
 * - 計算每個 commit 的 LOC（FR-002）
 * - 分類和評估 commits（FR-004, FR-006）
 * - 生成彙總統計（FR-005, FR-007, FR-008）
 */
export class CommitAnalyzer {
  constructor(
    private gitlabClient: GitLabClient,
    private localGitClient?: LocalGitClient
  ) {}

  /**
   * 分析專案的 commits
   *
   * @param options - 分析選項
   * @returns 分析結果（commits 和統計）
   */
  async analyzeProject(
    options: CommitAnalysisOptions = {}
  ): Promise<CommitAnalysisResult> {
    // 優先使用本地 Git（如果可用且已驗證）
    if (this.localGitClient?.isValid()) {
      try {
        return await this.analyzeProjectLocal(options);
      } catch (error) {
        // 降級到 API 模式（Issue #5: Use onWarning callback）
        const errorMsg = error instanceof Error ? error.message : String(error);
        options.onWarning?.(`本地 Git 分析失敗，降級使用 API 模式: ${errorMsg}`);
      }
    }

    // API 模式（原有邏輯）
    return await this.analyzeProjectAPI(options);
  }

  /**
   * 使用 API 分析專案的 commits（原有邏輯）
   *
   * @param options - 分析選項
   * @returns 分析結果
   */
  private async analyzeProjectAPI(
    options: CommitAnalysisOptions = {}
  ): Promise<CommitAnalysisResult> {
    // 1. 檢測主分支（Issue #4: 如果未指定 branch，使用型別安全的 detectMainBranch）
    const branch = options.branch || (await this.detectMainBranch());

    // 2. 列出 commits（Issue #4: 已移除 projectId 參數）
    const rawCommits = await this.fetchCommits(branch, options);

    // 3. T034: 使用批次處理並發分析 commits（取得 diffs 並計算 LOC）
    const totalCommits = rawCommits.length;

    // 過濾出需要分析的 commits（排除 merge commits）
    const commitsToAnalyze = rawCommits.filter(commit => !this.isMergeCommit(commit));

    // T035: 並發批次處理，FR-017 進度回報（Issue #4: 已移除 projectId 參數）
    const analyzedCommits = await processBatch(
      commitsToAnalyze,
      async (commit) => {
        return await this.analyzeCommit(commit, options.branch || null);
      },
      {
        batchSize: BATCH_SETTINGS.COMMIT_ANALYSIS_BATCH_SIZE,
        errorHandling: 'skip', // 單一 commit 失敗不影響整體
        onProgress: options.onProgress, // FR-017: 進度回報
      }
    );

    // 排除 0 LOC commits（FR-019）
    const commits = analyzedCommits.filter(analysis => analysis.loc > 0);

    // 4. 計算彙總統計
    const statistics = calculateAggregateStatistics(commits, totalCommits);

    return {
      commits,
      statistics,
    };
  }

  /**
   * 使用本地 Git 分析專案的 commits
   *
   * @param options - 分析選項
   * @returns 分析結果
   */
  private async analyzeProjectLocal(
    options: CommitAnalysisOptions = {}
  ): Promise<CommitAnalysisResult> {
    if (!this.localGitClient) {
      throw new Error('LocalGitClient 未初始化');
    }

    // 1. 從本地 Git 列出 commits
    const rawCommits = await this.localGitClient.getCommitList({
      branch: options.branch,
      since: options.since,
      until: options.until,
      limit: options.limit,
    });

    // 2. 分析每個 commit
    const commits: CommitAnalysis[] = [];
    let totalCommits = rawCommits.length;

    for (const commit of rawCommits) {
      // 排除 merge commits（FR-019）
      if (commit.parentIds.length > 1) {
        continue;
      }

      // 取得 commit diff 統計
      const diffStats = await this.localGitClient.getCommitDiff(commit.sha);

      // 排除 0 LOC commits（FR-019）
      if (diffStats.loc === 0) {
        continue;
      }

      // 分類和評估
      const sizeCategory = classifySize(diffStats.loc);
      const severityLevel = assessSeverity(diffStats.loc);
      const refactorSuggestion = generateRefactorSuggestion(diffStats.loc);

      const analysis = createCommitAnalysis({
        sha: commit.sha,
        author: commit.author,
        authorEmail: commit.authorEmail,
        timestamp: commit.timestamp,
        message: commit.message,
        filesChanged: diffStats.filesChanged,
        loc: diffStats.loc,
        additions: diffStats.additions,
        deletions: diffStats.deletions,
        sizeCategory,
        severityLevel,
        refactorSuggestion,
        isMergeCommit: commit.parentIds.length > 1,
        branch: options.branch || null,
      });

      commits.push(analysis);
    }

    // 3. 計算彙總統計
    const statistics = calculateAggregateStatistics(commits, totalCommits);

    return {
      commits,
      statistics,
    };
  }

  /**
   * 從 GitLab API 檢索 commits
   * Issue #4: 移除 projectId 參數（已由 GitLabClient 內部處理）
   *
   * @param branch - 分支名稱
   * @param options - 分析選項
   * @returns 原始 commit 資料陣列
   */
  private async fetchCommits(
    branch: string,
    options: CommitAnalysisOptions
  ): Promise<any[]> {
    const limit = options.limit || 1000; // FR-016: 預設限制 1000

    // T031: 使用指數退避重試邏輯呼叫 GitLab Commits API（Issue #4: 使用型別安全的 getCommits 方法）
    const commits = await this.gitlabClient.getCommits({
      refName: branch,
      since: options.since?.toISOString(),
      until: options.until?.toISOString(),
      perPage: 100,
      maxPages: Math.ceil(limit / 100),
      onWarning: options.onWarning,
    });

    return commits.slice(0, limit);
  }

  /**
   * 分析單一 commit
   * Issue #4: 移除 projectId 參數並使用型別安全的 getCommitDiff 方法
   *
   * @param commit - GitLab API commit 物件
   * @param branch - 分支名稱（若有指定）
   * @returns CommitAnalysis 物件
   */
  private async analyzeCommit(
    commit: any,
    branch: string | null
  ): Promise<CommitAnalysis> {
    // Issue #4: 使用型別安全的 getCommitDiff 方法
    const diffs = await this.gitlabClient.getCommitDiff(commit.id);

    // 計算 LOC（FR-002）
    let additions = 0;
    let deletions = 0;
    let filesChanged = 0;

    for (const diff of diffs) {
      // 排除二進位檔案
      if (diff.binary) {
        continue;
      }

      filesChanged++;

      // 解析 diff 字串計算新增和刪除行數
      const { add, del } = this.parseDiff(diff.diff || '');
      additions += add;
      deletions += del;
    }

    const loc = additions + deletions; // FR-002: LOC = additions + deletions

    // 分類和評估
    const sizeCategory = classifySize(loc); // FR-004
    const severityLevel = assessSeverity(loc); // FR-006
    const refactorSuggestion = generateRefactorSuggestion(loc); // FR-010

    return createCommitAnalysis({
      sha: commit.id,
      author: commit.author_name,
      authorEmail: commit.author_email,
      timestamp: new Date(commit.authored_date),
      message: commit.message,
      filesChanged,
      loc,
      additions,
      deletions,
      sizeCategory,
      severityLevel,
      refactorSuggestion,
      isMergeCommit: this.isMergeCommit(commit),
      branch,
    });
  }

  /**
   * 解析 diff 字串計算新增和刪除行數
   * Issue #6: 加強輸入驗證防止 ReDoS 與異常輸入
   *
   * @param diffString - Git diff 字串
   * @returns 新增和刪除行數
   */
  private parseDiff(diffString: string): { add: number; del: number } {
    // Issue #6: 輸入驗證
    if (!diffString || typeof diffString !== 'string') {
      return { add: 0, del: 0 };
    }

    // Issue #6: 防止過長輸入（ReDoS 保護）- 限制 10MB
    if (diffString.length > DIFF_PARSING_LIMITS.MAX_DIFF_LENGTH) {
      return { add: 0, del: 0 };
    }

    const lines = diffString.split('\n');
    let add = 0;
    let del = 0;

    // Issue #6: 限制處理的行數（防止記憶體耗盡）
    const linesToProcess = Math.min(lines.length, DIFF_PARSING_LIMITS.MAX_LINES);

    for (let i = 0; i < linesToProcess; i++) {
      const line = lines[i];
      // Issue #6: Skip undefined lines (safety check)
      if (!line) continue;

      // 新增行（以 + 開頭，但不是 +++ 檔案標記）
      if (line.startsWith('+') && !line.startsWith('+++')) {
        add++;
      }
      // 刪除行（以 - 開頭，但不是 --- 檔案標記）
      else if (line.startsWith('-') && !line.startsWith('---')) {
        del++;
      }
    }

    return { add, del };
  }

  /**
   * 判斷是否為 merge commit（FR-019）
   *
   * @param commit - GitLab API commit 物件
   * @returns 是否為 merge commit
   */
  private isMergeCommit(commit: any): boolean {
    return commit.parent_ids && commit.parent_ids.length > 1;
  }

  /**
   * 檢測專案的主分支
   * Issue #4: 移除 projectId 參數並使用型別安全的 getProject 方法
   *
   * @returns 主分支名稱（main 或 master）
   */
  private async detectMainBranch(): Promise<string> {
    try {
      // Issue #4: 使用型別安全的 getProject 方法
      const project = await this.gitlabClient.getProject();
      return project.default_branch || 'main';
    } catch {
      // 降級：預設使用 'main'
      return 'main';
    }
  }

  /**
   * 分析開發者模式（US3）
   *
   * @param commits - Commit 分析結果
   * @returns 開發者模式陣列
   */
  analyzeDeveloperPatterns(commits: CommitAnalysis[]): DeveloperPattern[] {
    // 按 authorEmail 分組
    const groupedByAuthor = new Map<string, CommitAnalysis[]>();

    for (const commit of commits) {
      const key = commit.authorEmail;
      if (!groupedByAuthor.has(key)) {
        groupedByAuthor.set(key, []);
      }
      groupedByAuthor.get(key)!.push(commit);
    }

    // 計算每位開發者的統計
    const patterns: DeveloperPattern[] = [];

    for (const [email, developerCommits] of groupedByAuthor) {
      const totalCommits = developerCommits.length;
      const totalLOC = developerCommits.reduce((sum, c) => sum + c.loc, 0);
      const totalFiles = developerCommits.reduce((sum, c) => sum + c.filesChanged, 0);
      const oversizedCount = developerCommits.filter((c) => c.loc > 200).length;

      const avgLOC = totalLOC / totalCommits;
      const avgFiles = totalFiles / totalCommits;
      const oversizedPercentage = (oversizedCount / totalCommits) * 100;

      const assessment = assessDeveloper(oversizedPercentage);
      const suggestion = generateDeveloperSuggestion(assessment, oversizedPercentage);

      const firstCommit = developerCommits[0];
      if (!firstCommit) continue;

      patterns.push(
        createDeveloperPattern({
          developer: firstCommit.author,
          email,
          totalCommits,
          avgLOC,
          avgFiles,
          oversizedCount,
          oversizedPercentage,
          assessment,
          suggestion,
        })
      );
    }

    // 按 commit 數量降序排列
    return patterns.sort((a, b) => b.totalCommits - a.totalCommits);
  }

  /**
   * 分析趨勢（US4）
   *
   * @param options - 分析選項（必須包含 since 和 until）
   * @param granularity - 時間粒度
   * @returns 趨勢分析結果
   */
  async analyzeTrend(
    options: CommitAnalysisOptions & { since: Date; until: Date },
    granularity: TrendGranularity
  ): Promise<TrendAnalysisResult> {
    // 1. 分割時間範圍
    const splitter = new TrendSplitter();
    const periodInfos = splitter.splitTimeRange(options.since, options.until, granularity);

    // 2. 為每個時間段分析 commits
    const periods: TrendPeriod[] = [];
    let previousPeriod: TrendPeriod | null = null;

    for (const periodInfo of periodInfos) {
      // 分析該時間段的 commits
      const result = await this.analyzeProject({
        ...options,
        since: periodInfo.startDate,
        until: periodInfo.endDate,
      });

      // 計算與前一時間段的比較
      let trendDirection: TrendDirection | null = null;
      let avgLOCChange: number | null = null;
      let oversizedChange: number | null = null;
      let isSignificant = false;

      if (previousPeriod) {
        trendDirection = calculateTrendDirection(
          result.statistics.avgLOCPerCommit,
          previousPeriod.statistics.avgLOCPerCommit
        );

        avgLOCChange = calculateChangePercentage(
          result.statistics.avgLOCPerCommit,
          previousPeriod.statistics.avgLOCPerCommit
        );

        oversizedChange = calculateChangePercentage(
          result.statistics.oversizedPercentage,
          previousPeriod.statistics.oversizedPercentage
        );

        isSignificant = checkSignificantChange(avgLOCChange);
      }

      const period: TrendPeriod = {
        label: formatPeriodLabel(periodInfo.startDate, granularity),
        startDate: periodInfo.startDate,
        endDate: periodInfo.endDate,
        statistics: result.statistics,
        trendDirection,
        avgLOCChange,
        oversizedChange,
        isSignificantChange: isSignificant,
      };

      periods.push(period);
      previousPeriod = period;
    }

    // 3. 計算整體趨勢
    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];

    if (!firstPeriod || !lastPeriod) {
      throw new Error('No periods to analyze');
    }

    const overallTrend = calculateTrendDirection(
      lastPeriod.statistics.avgLOCPerCommit,
      firstPeriod.statistics.avgLOCPerCommit
    );

    const totalAvgLOCChange = calculateChangePercentage(
      lastPeriod.statistics.avgLOCPerCommit,
      firstPeriod.statistics.avgLOCPerCommit
    );

    const totalOversizedChange = calculateChangePercentage(
      lastPeriod.statistics.oversizedPercentage,
      firstPeriod.statistics.oversizedPercentage
    );

    return {
      periods,
      overallTrend,
      totalAvgLOCChange,
      totalOversizedChange,
    };
  }

  /**
   * 篩選問題 commits（FR-009: 識別超過閾值的 commits）
   *
   * T016: 使用者故事 2 - 識別問題 Commits
   *
   * @param commits - 要篩選的 commits 陣列
   * @param severity - 可選的嚴重程度篩選（'warning' 或 'critical'）
   * @returns 按 LOC 降序排序的問題 commits
   */
  filterProblemCommits(
    commits: CommitAnalysis[],
    severity?: 'warning' | 'critical'
  ): CommitAnalysis[] {
    // 步驟 1: 篩選 LOC > 100 的 commits
    let problemCommits = commits.filter(commit => commit.loc > 100);

    // 步驟 2: 根據嚴重程度進一步篩選
    if (severity === 'warning') {
      // WARNING: 100-200 LOC
      problemCommits = problemCommits.filter(
        commit => commit.loc >= 100 && commit.loc <= 200
      );
    } else if (severity === 'critical') {
      // CRITICAL: > 200 LOC
      problemCommits = problemCommits.filter(
        commit => commit.loc > 200
      );
    }

    // 步驟 3: 按 LOC 降序排序（最大的 commits 排在最前面）
    problemCommits.sort((a, b) => b.loc - a.loc);

    return problemCommits;
  }
}
