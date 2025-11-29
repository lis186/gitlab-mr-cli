/**
 * 發布批量分析服務
 *
 * 實作使用者故事 1（識別發布批量過大問題）
 * 檢視每次月度發布包含的 MR 數量和程式碼變更量
 *
 * @module services/release/release-analyzer
 */

import type { ReleaseConfiguration } from '../../types/release-config.js';
import type { Release, HealthLevel } from '../../models/release.js';
import type { MergeEvent } from '../../types/release-api.js';
import { TagPatternMatcher } from '../config/tag-pattern-matcher.js';
import { calculateHealthLevel, calculateFreezeDays, calculateIntervalDays } from '../../models/release.js';
import { processBatchItems } from '../../utils/batch-processor.js';
import { CacheService } from '../cache/cache-service.js';
import { logger } from '../../utils/logger.js';
import { wrapApiCall } from './error-handler.js';

/**
 * 批次處理常數
 *
 * SIZE 設定為 5 的原因：
 * 1. 平衡 API 請求效率與記憶體使用：每批次 5 個發布可避免一次性載入過多資料
 * 2. 符合 GitLab API 速率限制：降低單位時間內的請求密度
 * 3. 提供即時進度回饋：批次數量適中，使用者能及時看到處理進度
 * 4. 容錯能力：小批次處理能快速識別並隔離問題發布，不影響整體分析
 */
const BATCH_PROCESSING_CONSTANTS = {
  /** 批次大小（每批次處理的發布數量） */
  SIZE: 5,
} as const;

/**
 * 凍結期評估常數（天數）
 * 用於評估發布準備度的健康程度
 */
const FREEZE_PERIOD_THRESHOLDS = {
  /** 健康範圍最小值：至少需要 1 天測試 */
  HEALTHY_MIN: 1,
  /** 健康範圍最大值：超過 3 天可能流程過長 */
  HEALTHY_MAX: 3,
  /** 警告閾值：超過 5 天表示流程需要改善 */
  WARNING_MAX: 5,
  /** 當天發布：0 天凍結期，風險過高 */
  SAME_DAY_RELEASE: 0,
} as const;

/**
 * 發布批量分析選項
 */
export interface AnalyzeBatchSizeOptions {
  /** 專案 ID */
  projectId: string;
  /** 起始日期（預設 90 天前） */
  since?: Date;
  /** 結束日期（預設今天） */
  until?: Date;
  /** 發布配置 */
  config: ReleaseConfiguration;
  /** 僅包含特定發布類型 */
  includeTypes?: string[];
  /** 排除特定發布類型 */
  excludeTypes?: string[];
  /** 進度回調（用於顯示進度） */
  onProgress?: (message: string) => void;
  /** 是否使用快取（預設 true） */
  useCache?: boolean;
}

/**
 * 批量分析結果
 */
export interface BatchSizeAnalysisResult {
  /** 發布列表 */
  releases: Release[];
  /** 批量指標 */
  metrics: {
    /** 平均 MR 數量 */
    average_mr_count: number;
    /** 平均 LOC 變更 */
    average_loc_changes: number;
    /** 健康度等級 */
    level: 'healthy' | 'warning' | 'critical';
    /** 建議 */
    recommendation: string;
  };
}

/**
 * GitLab Tag 介面
 */
export interface GitLabTag {
  name: string;
  commit: {
    id: string;
    committed_date: string;
  };
  message?: string;
}

/**
 * GitLab MR 介面
 */
export interface GitLabMR {
  iid: number;
  title: string;
  merged_at: string;
  merged_by?: {
    username: string;
  };
  source_branch: string;
  target_branch: string;
  changes_count?: string;
  diff_refs?: {
    base_sha: string;
    head_sha: string;
  };
}

/**
 * GitLab 客戶端介面（最小化依賴）
 */
export interface IGitLabClient {
  /**
   * 取得專案的所有標籤
   */
  getTags(options?: {
    perPage?: number;
    maxPages?: number;
    onWarning?: (message: string) => void;
  }): Promise<GitLabTag[]>;

  /**
   * 取得兩個 commit 之間的 MR 列表
   */
  getMergeRequestsBetweenCommits(options: {
    fromSha: string;
    toSha: string;
    targetBranch: string;
    onWarning?: (message: string) => void;
  }): Promise<GitLabMR[]>;

  /**
   * 取得 MR 的變更統計
   */
  getMergeRequestChanges(mrIid: number, options?: {
    onWarning?: (message: string) => void;
  }): Promise<{
    additions: number;
    deletions: number;
  }>;
}

/**
 * 發布批量分析服務
 */
export class ReleaseAnalyzer {
  private matcher: TagPatternMatcher;
  private cache: CacheService;

  constructor(
    private gitlabClient: IGitLabClient,
    options?: { cacheService?: CacheService }
  ) {
    this.matcher = new TagPatternMatcher();
    this.cache = options?.cacheService || new CacheService();
  }

  /**
   * 分析發布批量
   *
   * @param options - 分析選項
   * @returns 分析結果
   */
  async analyzeBatchSize(options: AnalyzeBatchSizeOptions): Promise<BatchSizeAnalysisResult> {
    const { projectId, config, since, until, includeTypes, excludeTypes, onProgress, useCache = true } = options;

    // 1. 取得所有標籤（帶快取）
    onProgress?.('正在取得標籤列表...');
    const allTags = await this.getTagsWithCache(projectId, useCache);
    onProgress?.(`找到 ${allTags.length} 個標籤`);

    // 2. 過濾符合配置的標籤
    onProgress?.('正在過濾符合配置的標籤...');
    const matchedTags = this.filterMatchingTags(allTags, config);
    onProgress?.(`符合配置的標籤: ${matchedTags.length} 個`);

    // 3. 過濾時間範圍
    const filteredByTime = this.filterByTimeRange(matchedTags, since, until);
    onProgress?.(`時間範圍內的標籤: ${filteredByTime.length} 個`);

    // 4. 建立發布列表
    onProgress?.('正在分析發布詳細資訊...');
    const releases = await this.buildReleases(filteredByTime, config, projectId, useCache, onProgress);

    // 5. 過濾發布類型
    const filteredReleases = this.filterByReleaseTypes(
      releases,
      includeTypes || config.analysis.default_filters?.include_types,
      excludeTypes || config.analysis.default_filters?.exclude_types
    );

    // 6. 計算批量指標
    onProgress?.('正在計算批量指標...');
    const metrics = this.calculateBatchMetrics(filteredReleases, config);

    return {
      releases: filteredReleases,
      metrics,
    };
  }

  /**
   * 取得兩個發布之間的 MR 列表
   *
   * @param options - 查詢選項
   * @returns MR 列表
   */
  async getMergeRequestsBetweenReleases(options: {
    fromTag: string;
    toTag: string;
    fromSha: string;
    toSha: string;
    targetBranch: string;
    projectId?: string;
    useCache?: boolean;
  }): Promise<MergeEvent[]> {
    const { fromSha, toSha, targetBranch, projectId, useCache = true } = options;

    // 嘗試從快取讀取
    if (useCache && projectId) {
      const cacheKey = {
        type: 'mr_list',
        projectId,
        fromSha,
        toSha,
        targetBranch,
      };

      const cached = await this.cache.get<MergeEvent[]>(cacheKey);
      if (cached) {
        logger.debug(`MR 列表快取命中: ${fromSha.substring(0, 8)}...${toSha.substring(0, 8)}`);
        return cached;
      }
    }

    // 取得兩個 commit 之間的 MR（帶錯誤處理與重試）
    const mrs = await wrapApiCall(
      () => this.gitlabClient.getMergeRequestsBetweenCommits({
        fromSha,
        toSha,
        targetBranch,
      }),
      `取得 MR 列表 (${fromSha.substring(0, 8)}...${toSha.substring(0, 8)})`,
      {
        retryable: true,
        maxRetries: 3,
        retryDelay: 1000,
        fallbackValue: [], // 失敗時返回空陣列
        errorStrategy: 'fallback',
      }
    );

    // 轉換為 MergeEvent 格式
    const mergeEvents: MergeEvent[] = [];

    for (const mr of mrs) {
      // 取得 MR 的變更統計（帶快取）
      const changes = await this.getMRChangesWithCache(mr.iid, projectId, useCache);

      mergeEvents.push({
        mr_iid: mr.iid,
        title: mr.title,
        merged_at: new Date(mr.merged_at),
        merged_by: mr.merged_by?.username || 'unknown',
        source_branch: mr.source_branch,
        target_branch: mr.target_branch,
        loc_additions: changes.additions,
        loc_deletions: changes.deletions,
        loc_changes: changes.additions + changes.deletions,
      });
    }

    // 寫入快取
    if (useCache && projectId) {
      const cacheKey = {
        type: 'mr_list',
        projectId,
        fromSha,
        toSha,
        targetBranch,
      };
      await this.cache.set(cacheKey, mergeEvents);
      logger.debug(`MR 列表已快取: ${fromSha.substring(0, 8)}...${toSha.substring(0, 8)}`);
    }

    return mergeEvents;
  }

  /**
   * 計算發布健康度
   *
   * @param options - 計算選項
   * @returns 健康度等級
   */
  calculateReleaseHealth(options: {
    mrCount: number;
    locChanges: number;
    thresholds: ReleaseConfiguration['analysis']['thresholds'];
  }): HealthLevel {
    const { mrCount, thresholds } = options;

    return calculateHealthLevel(mrCount, thresholds.mr_count);
  }

  /**
   * 過濾符合配置的標籤
   *
   * @param tags - 所有標籤
   * @param config - 配置
   * @returns 符合配置的標籤
   * @private
   */
  private filterMatchingTags(tags: GitLabTag[], config: ReleaseConfiguration): GitLabTag[] {
    return tags.filter((tag) => {
      const result = this.matcher.matchWithConfig(tag.name, config.tag);
      return result.matched;
    });
  }

  /**
   * 過濾時間範圍
   *
   * @param tags - 標籤列表
   * @param since - 起始日期
   * @param until - 結束日期
   * @returns 過濾後的標籤
   * @private
   */
  private filterByTimeRange(
    tags: GitLabTag[],
    since?: Date,
    until?: Date
  ): GitLabTag[] {
    if (!since && !until) {
      return tags;
    }

    return tags.filter((tag) => {
      const tagDate = new Date(tag.commit.committed_date);

      if (since && tagDate < since) {
        return false;
      }

      if (until && tagDate > until) {
        return false;
      }

      return true;
    });
  }

  /**
   * 建立發布列表
   *
   * 使用批次並行處理提升效能
   *
   * @param tags - 標籤列表
   * @param config - 配置
   * @param projectId - 專案 ID
   * @param useCache - 是否使用快取
   * @param onProgress - 進度回調
   * @returns 發布列表
   * @private
   */
  private async buildReleases(
    tags: GitLabTag[],
    config: ReleaseConfiguration,
    projectId: string,
    useCache: boolean,
    onProgress?: (message: string) => void
  ): Promise<Release[]> {
    // 按日期排序（新到舊）
    const sortedTags = [...tags].sort((a, b) => {
      const dateA = new Date(a.commit.committed_date);
      const dateB = new Date(b.commit.committed_date);
      return dateB.getTime() - dateA.getTime();
    });

    const batchSize = BATCH_PROCESSING_CONSTANTS.SIZE;

    // 使用批次處理器並行處理發布
    const result = await processBatchItems(
      sortedTags,
      async (tag, index) => {
        const previousTag = sortedTags[index + 1];
        return await this.buildSingleRelease(tag, previousTag, config, projectId, useCache);
      },
      {
        batchSize,
        errorHandling: 'skip',  // 單一發布失敗不影響其他
        onProgress: (processed, totalItems) => {
          // 計算當前批次
          const currentBatch = Math.ceil(processed / batchSize);
          const totalBatches = Math.ceil(totalItems / batchSize);

          // 顯示批次進度（而非逐一進度）
          onProgress?.(`處理中 [批次 ${currentBatch}/${totalBatches}] - 已完成 ${processed}/${totalItems} 個發布`);
        },
      }
    );

    // 返回成功的發布（保持原始順序）
    return result.successes;
  }

  /**
   * 建立單一發布
   *
   * @param tag - 當前標籤
   * @param previousTag - 上一個標籤
   * @param config - 配置
   * @param projectId - 專案 ID
   * @param useCache - 是否使用快取
   * @returns 發布物件
   * @private
   */
  private async buildSingleRelease(
    tag: GitLabTag,
    previousTag: GitLabTag | undefined,
    config: ReleaseConfiguration,
    projectId: string,
    useCache: boolean
  ): Promise<Release> {
    const tagDate = new Date(tag.commit.committed_date);

    // 取得此發布的 MR 統計資訊
    const mrStats = await this.getMergeRequestsStatistics(tag, previousTag, config, projectId, useCache, tagDate);

    // 計算發布類型與健康度
    const releaseType = this.classifyReleaseType(tag, config);
    const healthLevel = this.calculateHealthLevelIfNeeded(releaseType, mrStats, config);

    // 計算時間指標
    const timeMetrics = this.calculateTimeMetrics(tagDate, previousTag, mrStats.lastMergeDate);

    return {
      tag: tag.name,
      commit_sha: tag.commit.id,
      date: tagDate,
      type: releaseType,
      mr_list: mrStats.mrList,
      mr_count: mrStats.mrList.length,
      total_loc_additions: mrStats.totalAdditions,
      total_loc_deletions: mrStats.totalDeletions,
      total_loc_changes: mrStats.totalChanges,
      interval_days: timeMetrics.intervalDays,
      freeze_days: timeMetrics.freezeDays,
      health_level: healthLevel,
      previous_release_tag: previousTag?.name,
    };
  }

  /**
   * 取得 MR 統計資訊
   *
   * @private
   */
  private async getMergeRequestsStatistics(
    tag: GitLabTag,
    previousTag: GitLabTag | undefined,
    config: ReleaseConfiguration,
    projectId: string,
    useCache: boolean,
    tagDate: Date
  ): Promise<{
    mrList: string[];
    totalAdditions: number;
    totalDeletions: number;
    totalChanges: number;
    lastMergeDate: Date;
  }> {
    let mrList: string[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let lastMergeDate = tagDate;

    if (previousTag) {
      const mergeEvents = await this.getMergeRequestsBetweenReleases({
        fromTag: previousTag.name,
        toTag: tag.name,
        fromSha: previousTag.commit.id,
        toSha: tag.commit.id,
        targetBranch: config.analysis.default_branch,
        projectId,
        useCache,
      });

      mrList = mergeEvents.map((mr) => mr.mr_iid.toString());
      totalAdditions = mergeEvents.reduce((sum, mr) => sum + mr.loc_additions, 0);
      totalDeletions = mergeEvents.reduce((sum, mr) => sum + mr.loc_deletions, 0);

      // 找到最後一次合併時間
      if (mergeEvents.length > 0 && mergeEvents[0]) {
        lastMergeDate = mergeEvents.reduce((latest, mr) => {
          return mr.merged_at > latest ? mr.merged_at : latest;
        }, mergeEvents[0].merged_at);
      }
    }

    const totalChanges = totalAdditions + totalDeletions;

    return {
      mrList,
      totalAdditions,
      totalDeletions,
      totalChanges,
      lastMergeDate,
    };
  }

  /**
   * 計算健康度（僅在配置要求時）
   *
   * @private
   */
  private calculateHealthLevelIfNeeded(
    releaseType: string,
    mrStats: { mrList: string[]; totalChanges: number },
    config: ReleaseConfiguration
  ): HealthLevel | null {
    const releaseTypeConfig = Object.values(config.release_types).find((rt) => rt.name === releaseType);

    if (releaseTypeConfig?.evaluate_batch_size === true) {
      return this.calculateReleaseHealth({
        mrCount: mrStats.mrList.length,
        locChanges: mrStats.totalChanges,
        thresholds: config.analysis.thresholds,
      });
    }

    return null;
  }

  /**
   * 計算時間相關指標
   *
   * @private
   */
  private calculateTimeMetrics(
    tagDate: Date,
    previousTag: GitLabTag | undefined,
    lastMergeDate: Date
  ): {
    intervalDays: number | undefined;
    freezeDays: number;
  } {
    const freezeDays = calculateFreezeDays(lastMergeDate, tagDate);

    let intervalDays: number | undefined;
    if (previousTag) {
      const previousDate = new Date(previousTag.commit.committed_date);
      intervalDays = calculateIntervalDays(tagDate, previousDate);
    }

    return { intervalDays, freezeDays };
  }

  /**
   * 分類發布類型
   *
   * @param tag - 標籤
   * @param config - 配置
   * @returns 發布類型名稱
   * @private
   */
  private classifyReleaseType(tag: GitLabTag, config: ReleaseConfiguration): string {
    // 提取標籤欄位
    const matchResult = this.matcher.matchWithConfig(tag.name, config.tag);

    if (!matchResult.matched || !matchResult.fields) {
      return 'unknown';
    }

    const fields = matchResult.fields;

    // 按優先級排序發布類型
    const sortedTypes = Object.entries(config.release_types).sort(
      ([, a], [, b]) => a.priority - b.priority
    );

    // 檢查每個發布類型的規則
    for (const [typeName, typeConfig] of sortedTypes) {
      if (this.matchesReleaseTypeRules(fields, tag, typeConfig.rules)) {
        return typeName;
      }
    }

    return 'unknown';
  }

  /**
   * 檢查是否符合發布類型規則
   *
   * @param fields - 標籤欄位
   * @param tag - 標籤資訊
   * @param rules - 規則列表
   * @returns 是否符合
   * @private
   */
  private matchesReleaseTypeRules(
    fields: Record<string, string | number>,
    tag: GitLabTag,
    rules: Array<{
      field: string;
      operator: string;
      value?: string | number | string[];
    }>
  ): boolean {
    // 所有規則都必須符合
    return rules.every((rule) => {
      const fieldValue = rule.field === 'tag_message' ? tag.message : fields[rule.field];

      switch (rule.operator) {
        case 'equals':
          return fieldValue === rule.value;

        case 'ends_with':
          if (typeof fieldValue === 'number' && typeof rule.value === 'number') {
            return fieldValue.toString().endsWith(rule.value.toString());
          }
          return false;

        case 'contains_any':
          if (typeof fieldValue === 'string' && Array.isArray(rule.value)) {
            return rule.value.some((keyword) => fieldValue.includes(keyword));
          }
          return false;

        case 'greater_than':
          if (typeof fieldValue === 'number' && typeof rule.value === 'number') {
            return fieldValue > rule.value;
          }
          return false;

        default:
          return false;
      }
    });
  }

  /**
   * 過濾發布類型
   *
   * @param releases - 發布列表
   * @param includeTypes - 包含類型
   * @param excludeTypes - 排除類型
   * @returns 過濾後的發布列表
   * @private
   */
  private filterByReleaseTypes(
    releases: Release[],
    includeTypes?: string[],
    excludeTypes?: string[]
  ): Release[] {
    let filtered = releases;

    // 排除優先於包含
    if (excludeTypes && excludeTypes.length > 0) {
      filtered = filtered.filter((release) => !excludeTypes.includes(release.type));
    }

    if (includeTypes && includeTypes.length > 0) {
      filtered = filtered.filter((release) => includeTypes.includes(release.type));
    }

    return filtered;
  }

  /**
   * 計算批量指標
   *
   * 僅計算有健康度評估的發布（evaluate_batch_size = true）
   *
   * @param releases - 發布列表
   * @param config - 配置
   * @returns 批量指標
   * @private
   */
  private calculateBatchMetrics(
    releases: Release[],
    config: ReleaseConfiguration
  ): {
    average_mr_count: number;
    average_loc_changes: number;
    level: 'healthy' | 'warning' | 'critical';
    recommendation: string;
  } {
    // 僅計算有健康度評估的發布
    const evaluatedReleases = releases.filter((r) => r.health_level !== null);

    if (evaluatedReleases.length === 0) {
      return {
        average_mr_count: 0,
        average_loc_changes: 0,
        level: 'healthy',
        recommendation: '無需評估批量的發布記錄（所有發布類型的 evaluate_batch_size 皆為 false）',
      };
    }

    // 計算平均值
    const totalMRs = evaluatedReleases.reduce((sum, r) => sum + r.mr_count, 0);
    const totalLOC = evaluatedReleases.reduce((sum, r) => sum + r.total_loc_changes, 0);

    const averageMRCount = totalMRs / evaluatedReleases.length;
    const averageLOCChanges = totalLOC / evaluatedReleases.length;

    // 計算健康度等級（基於平均 MR 數量）
    const level = calculateHealthLevel(
      averageMRCount,
      config.analysis.thresholds.mr_count
    );

    // 產生建議
    const recommendation = this.generateRecommendation(level, averageMRCount, averageLOCChanges);

    return {
      average_mr_count: averageMRCount,
      average_loc_changes: averageLOCChanges,
      level,
      recommendation,
    };
  }

  /**
   * 產生建議
   *
   * @param level - 健康度等級
   * @param avgMRCount - 平均 MR 數量
   * @param avgLOC - 平均 LOC 變更
   * @returns 建議文字
   * @private
   */
  private generateRecommendation(
    level: HealthLevel,
    avgMRCount: number,
    avgLOC: number
  ): string {
    if (level === 'healthy') {
      return '發布批量健康，維持當前節奏';
    }

    if (level === 'warning') {
      return `發布批量偏大（平均 ${avgMRCount.toFixed(1)} 個 MR），建議增加發布頻率或減少每次發布的變更量`;
    }

    return `發布批量過大（平均 ${avgMRCount.toFixed(1)} 個 MR，${avgLOC.toFixed(0)} LOC），強烈建議增加發布頻率，避免月底集中合併大批量`;
  }

  /**
   * 分析發布節奏
   *
   * 按發布類型統計頻率與間隔，提供洞察而非警告
   *
   * @param releases - 發布列表
   * @param timeRangeDays - 分析的時間範圍（天數）
   * @returns 發布節奏統計
   */
  analyzeReleaseRhythm(
    releases: Release[],
    timeRangeDays: number
  ): Array<{
    type: string;
    count: number;
    averageInterval: number | null;
    frequency: string;
    assessment: string;
  }> {
    // 按類型分組
    const byType = new Map<string, Release[]>();

    for (const release of releases) {
      const existing = byType.get(release.type) || [];
      existing.push(release);
      byType.set(release.type, existing);
    }

    // 計算每種類型的節奏
    const rhythm: Array<{
      type: string;
      count: number;
      averageInterval: number | null;
      frequency: string;
      assessment: string;
    }> = [];

    for (const [type, typeReleases] of byType.entries()) {
      const count = typeReleases.length;

      // 計算平均間隔（僅針對有間隔數據的發布）
      const intervals = typeReleases
        .map((r) => r.interval_days)
        .filter((d): d is number => d !== undefined);

      const averageInterval = intervals.length > 0
        ? intervals.reduce((sum, d) => sum + d, 0) / intervals.length
        : null;

      // 計算頻率描述
      const frequency = this.calculateFrequencyDescription(count, timeRangeDays);

      // 評估
      const assessment = this.assessReleaseRhythm(type, count, timeRangeDays);

      rhythm.push({
        type,
        count,
        averageInterval,
        frequency,
        assessment,
      });
    }

    // 按類型優先級排序（假設 major > hotfix > minor）
    const typePriority: Record<string, number> = {
      major: 1,
      hotfix: 2,
      minor: 3,
    };

    rhythm.sort((a, b) => {
      const priorityA = typePriority[a.type] || 99;
      const priorityB = typePriority[b.type] || 99;
      return priorityA - priorityB;
    });

    return rhythm;
  }

  /**
   * 計算頻率描述
   *
   * @param count - 發布數量
   * @param timeRangeDays - 時間範圍（天數）
   * @returns 頻率描述
   * @private
   */
  private calculateFrequencyDescription(count: number, timeRangeDays: number): string {
    if (count === 0) {
      return '無發布';
    }

    const avgDaysPerRelease = timeRangeDays / count;

    if (avgDaysPerRelease < 7) {
      return `約每 ${avgDaysPerRelease.toFixed(0)} 天 1 次`;
    } else if (avgDaysPerRelease < 30) {
      const weeksPerRelease = avgDaysPerRelease / 7;
      return `約每 ${weeksPerRelease.toFixed(1)} 週 1 次`;
    } else {
      const monthsPerRelease = avgDaysPerRelease / 30;
      return `約每 ${monthsPerRelease.toFixed(1)} 月 1 次`;
    }
  }

  /**
   * 評估發布節奏
   *
   * @param type - 發布類型
   * @param count - 發布數量
   * @param timeRangeDays - 時間範圍
   * @returns 評估文字
   * @private
   */
  private assessReleaseRhythm(
    type: string,
    count: number,
    timeRangeDays: number
  ): string {
    const monthsInRange = timeRangeDays / 30;

    if (type === 'major') {
      // Major 發布評估
      const expectedCount = Math.round(monthsInRange);
      if (count >= expectedCount) {
        return '月度發布節奏穩定';
      } else if (count >= expectedCount * 0.7) {
        return '月度發布略有延遲';
      } else {
        return `發布頻率較低（預期約 ${expectedCount} 次）`;
      }
    } else if (type === 'hotfix') {
      // Hotfix 頻率評估（作為品質指標）
      const hotfixPerMonth = count / monthsInRange;
      if (hotfixPerMonth < 1) {
        return '緊急修復頻率低（品質良好）';
      } else if (hotfixPerMonth < 2) {
        return '緊急修復頻率適中';
      } else {
        return '緊急修復頻率偏高（建議檢視品質流程）';
      }
    } else if (type === 'minor') {
      // Minor 發布評估（回應速度指標）
      const minorPerMonth = count / monthsInRange;
      if (minorPerMonth >= 2) {
        return '客戶需求回應速度快';
      } else if (minorPerMonth >= 1) {
        return '客戶需求回應速度良好';
      } else {
        return '客戶需求回應速度一般';
      }
    }

    // 其他類型
    return '統計資料';
  }

  /**
   * 分析品質指標（Major 發布後首個 hotfix 時間、最長無 hotfix 期間）
   *
   * @param releases - 發布列表（按時間倒序）
   * @returns 品質分析結果
   */
  analyzeQualityMetrics(releases: Release[]): {
    majorReleaseQuality: Array<{
      majorRelease: Release;
      daysUntilFirstHotfix: number | null;
      firstHotfix: Release | null;
      assessment: string;
    }>;
    stabilityPeriods: {
      longest: {
        days: number;
        startRelease: Release;
        endRelease: Release;
        period: string;
      } | null;
      shortest: {
        days: number;
        startRelease: Release;
        endRelease: Release;
        period: string;
      } | null;
    };
  } {
    // 按時間正序排列（從舊到新）
    const chronologicalReleases = [...releases].reverse();

    // 分析 Major 發布品質
    const majorReleaseQuality = this.analyzeMajorReleaseQuality(chronologicalReleases);

    // 分析穩定期
    const stabilityPeriods = this.analyzeStabilityPeriods(chronologicalReleases);

    return {
      majorReleaseQuality,
      stabilityPeriods,
    };
  }

  /**
   * 分析 Major 發布品質（發布後多久出現首個 hotfix）
   *
   * @param releases - 發布列表（按時間正序）
   * @returns Major 發布品質分析
   * @private
   */
  private analyzeMajorReleaseQuality(
    releases: Release[]
  ): Array<{
    majorRelease: Release;
    daysUntilFirstHotfix: number | null;
    firstHotfix: Release | null;
    assessment: string;
  }> {
    const result: Array<{
      majorRelease: Release;
      daysUntilFirstHotfix: number | null;
      firstHotfix: Release | null;
      assessment: string;
    }> = [];

    for (let i = 0; i < releases.length; i++) {
      const release = releases[i];
      if (!release) continue;

      // 只分析 major 發布
      if (release.type !== 'major') {
        continue;
      }

      // 找出該 major 版本後的第一個 hotfix
      let firstHotfix: Release | null = null;
      let daysUntilFirstHotfix: number | null = null;

      // 檢查同版本號的 hotfix（例如 AppStore25.10.0 → AppStore25.10.5）
      const majorVersion = this.extractMajorVersion(release.tag);

      for (let j = i + 1; j < releases.length; j++) {
        const nextRelease = releases[j];
        if (!nextRelease) continue;

        // 檢查是否為 hotfix 且屬於同一 major 版本
        if (
          nextRelease.type === 'hotfix' &&
          this.extractMajorVersion(nextRelease.tag) === majorVersion
        ) {
          firstHotfix = nextRelease;
          daysUntilFirstHotfix = Math.ceil(
            (nextRelease.date.getTime() - release.date.getTime()) / (1000 * 60 * 60 * 24)
          );
          break;
        }

        // 如果遇到下一個 major 版本，停止搜尋
        if (nextRelease.type === 'major') {
          break;
        }
      }

      // 評估品質
      const assessment = this.assessMajorReleaseQuality(daysUntilFirstHotfix);

      result.push({
        majorRelease: release,
        daysUntilFirstHotfix,
        firstHotfix,
        assessment,
      });
    }

    return result;
  }

  /**
   * 提取 major 版本號（例如 AppStore25.10.5 → AppStore25.10）
   *
   * @param tag - 標籤名稱
   * @returns Major 版本字串
   * @private
   */
  private extractMajorVersion(tag: string): string {
    // 移除 hotfix/minor 的 patch 號
    // AppStore25.10.5 → AppStore25.10
    // AppStore25.10.0 → AppStore25.10
    const match = tag.match(/^(.+\.\d+)\.\d+$/);
    return match?.[1] || tag;
  }

  /**
   * 評估 Major 發布品質
   *
   * @param daysUntilFirstHotfix - 發布後多久出現首個 hotfix
   * @returns 評估結果
   * @private
   */
  private assessMajorReleaseQuality(daysUntilFirstHotfix: number | null): string {
    if (daysUntilFirstHotfix === null) {
      return '無 hotfix（品質優良）';
    }

    if (daysUntilFirstHotfix >= 14) {
      return '初期穩定（品質良好）';
    }

    if (daysUntilFirstHotfix >= 7) {
      return '穩定性尚可';
    }

    if (daysUntilFirstHotfix >= 3) {
      return '發現問題較快（建議檢視測試流程）';
    }

    return '立即發現嚴重問題（建議加強發布前測試）';
  }

  /**
   * 分析穩定期（最長/最短無 hotfix 期間）
   *
   * @param releases - 發布列表（按時間正序）
   * @returns 穩定期分析
   * @private
   */
  private analyzeStabilityPeriods(releases: Release[]): {
    longest: {
      days: number;
      startRelease: Release;
      endRelease: Release;
      period: string;
    } | null;
    shortest: {
      days: number;
      startRelease: Release;
      endRelease: Release;
      period: string;
    } | null;
  } {
    const hotfixes = releases.filter((r) => r.type === 'hotfix');

    if (hotfixes.length < 2) {
      return { longest: null, shortest: null };
    }

    let longestPeriod: {
      days: number;
      startRelease: Release;
      endRelease: Release;
      period: string;
    } | null = null;

    let shortestPeriod: {
      days: number;
      startRelease: Release;
      endRelease: Release;
      period: string;
    } | null = null;

    for (let i = 1; i < hotfixes.length; i++) {
      const prevHotfix = hotfixes[i - 1];
      const currentHotfix = hotfixes[i];
      if (!prevHotfix || !currentHotfix) continue;

      const days = Math.ceil(
        (currentHotfix.date.getTime() - prevHotfix.date.getTime()) / (1000 * 60 * 60 * 24)
      );

      const period = `${prevHotfix.date.toISOString().split('T')[0]} ~ ${currentHotfix.date.toISOString().split('T')[0]}`;

      if (!longestPeriod || days > longestPeriod.days) {
        longestPeriod = {
          days,
          startRelease: prevHotfix,
          endRelease: currentHotfix,
          period,
        };
      }

      if (!shortestPeriod || days < shortestPeriod.days) {
        shortestPeriod = {
          days,
          startRelease: prevHotfix,
          endRelease: currentHotfix,
          period,
        };
      }
    }

    return {
      longest: longestPeriod,
      shortest: shortestPeriod,
    };
  }

  /**
   * 分析發布準備度（凍結期健康評估）
   *
   * @param releases - 發布列表
   * @returns 準備度分析結果
   */
  analyzeReadiness(releases: Release[]): {
    freezePeriodAssessment: Array<{
      release: Release;
      freezeDays: number;
      assessment: string;
      healthLevel: 'healthy' | 'warning' | 'critical';
    }>;
    summary: {
      avgFreezeDays: number;
      healthyCount: number;
      warningCount: number;
      criticalCount: number;
      recommendation: string;
    };
  } {
    const assessments: Array<{
      release: Release;
      freezeDays: number;
      assessment: string;
      healthLevel: 'healthy' | 'warning' | 'critical';
    }> = [];

    let totalFreezeDays = 0;
    let healthyCount = 0;
    let warningCount = 0;
    let criticalCount = 0;

    for (const release of releases) {
      // 只評估 major 發布的凍結期
      if (release.type !== 'major') {
        continue;
      }

      const freezeDays = release.freeze_days;
      totalFreezeDays += freezeDays;

      const { assessment, healthLevel } = this.assessFreezePeriod(freezeDays);

      assessments.push({
        release,
        freezeDays,
        assessment,
        healthLevel,
      });

      if (healthLevel === 'healthy') {
        healthyCount++;
      } else if (healthLevel === 'warning') {
        warningCount++;
      } else {
        criticalCount++;
      }
    }

    const avgFreezeDays = assessments.length > 0
      ? totalFreezeDays / assessments.length
      : 0;

    const recommendation = this.getReadinessRecommendation(
      avgFreezeDays,
      healthyCount,
      warningCount,
      criticalCount,
      assessments.length
    );

    return {
      freezePeriodAssessment: assessments,
      summary: {
        avgFreezeDays,
        healthyCount,
        warningCount,
        criticalCount,
        recommendation,
      },
    };
  }

  /**
   * 評估凍結期健康度
   *
   * @param freezeDays - 凍結天數
   * @returns 評估結果與健康等級
   * @private
   */
  private assessFreezePeriod(freezeDays: number): {
    assessment: string;
    healthLevel: 'healthy' | 'warning' | 'critical';
  } {
    const { HEALTHY_MIN, HEALTHY_MAX, WARNING_MAX, SAME_DAY_RELEASE } = FREEZE_PERIOD_THRESHOLDS;

    if (freezeDays >= HEALTHY_MIN && freezeDays <= HEALTHY_MAX) {
      return {
        assessment: `健康範圍（${HEALTHY_MIN}-${HEALTHY_MAX} 天）`,
        healthLevel: 'healthy',
      };
    }

    if (freezeDays === SAME_DAY_RELEASE) {
      return {
        assessment: '風險過高：當天發布，測試時間不足',
        healthLevel: 'critical',
      };
    }

    if (freezeDays > WARNING_MAX) {
      return {
        assessment: '凍結期過長：建議檢討測試自動化程度',
        healthLevel: 'warning',
      };
    }

    // HEALTHY_MAX + 1 到 WARNING_MAX 天（4-5 天）
    return {
      assessment: '凍結期略長：可考慮改善流程',
      healthLevel: 'warning',
    };
  }

  /**
   * 取得準備度建議
   *
   * @param avgFreezeDays - 平均凍結天數
   * @param healthyCount - 健康數量
   * @param warningCount - 警告數量
   * @param criticalCount - 危險數量
   * @param totalCount - 總數量
   * @returns 建議文字
   * @private
   */
  private getReadinessRecommendation(
    avgFreezeDays: number,
    healthyCount: number,
    warningCount: number,
    criticalCount: number,
    totalCount: number
  ): string {
    if (totalCount === 0) {
      return '無足夠資料進行評估';
    }

    const healthyRatio = healthyCount / totalCount;

    if (healthyRatio >= 0.8) {
      return '發布準備流程健康，維持當前實踐';
    }

    if (criticalCount > 0) {
      return '發現當天發布情況，建議增加測試緩衝時間至少 1-2 天';
    }

    if (avgFreezeDays > 5) {
      return `平均凍結期 ${avgFreezeDays.toFixed(1)} 天，建議加強測試自動化以縮短準備時間`;
    }

    if (warningCount > healthyCount) {
      return '凍結期略長，建議檢討測試流程並增加自動化覆蓋率';
    }

    return '發布準備流程基本健康，持續監控改進';
  }

  /**
   * 通用快取包裝函數
   *
   * @param cacheKey - 快取鍵值
   * @param fetcher - 資料取得函數
   * @param useCache - 是否使用快取
   * @param options - 選項
   * @returns 資料
   * @private
   */
  private async withCache<T>(
    cacheKey: object,
    fetcher: () => Promise<T>,
    useCache: boolean,
    options?: {
      logCacheHit?: string;
      logCacheMiss?: string;
      logCacheSet?: string;
    }
  ): Promise<T> {
    // 快取停用，直接調用 fetcher
    if (!useCache) {
      return await fetcher();
    }

    // 嘗試從快取讀取
    const cached = await this.cache.get<T>(cacheKey);
    if (cached) {
      if (options?.logCacheHit) {
        logger.debug(options.logCacheHit);
      }
      return cached;
    }

    // 快取未命中，從 API 取得
    if (options?.logCacheMiss) {
      logger.debug(options.logCacheMiss);
    }

    const data = await fetcher();

    // 寫入快取
    await this.cache.set(cacheKey, data);
    if (options?.logCacheSet) {
      logger.debug(options.logCacheSet);
    }

    return data;
  }

  /**
   * 帶快取的取得標籤列表
   *
   * @param projectId - 專案 ID
   * @param useCache - 是否使用快取
   * @returns 標籤列表
   * @private
   */
  private async getTagsWithCache(projectId: string, useCache: boolean): Promise<GitLabTag[]> {
    return await this.withCache(
      { type: 'tags', projectId },
      async () => {
        return await wrapApiCall(
          () => this.gitlabClient.getTags({
            perPage: 100,
            maxPages: 10,
          }),
          '取得標籤列表',
          {
            retryable: true,
            maxRetries: 3,
            retryDelay: 1000,
          }
        );
      },
      useCache,
      {
        logCacheHit: '標籤列表快取命中',
        logCacheMiss: '標籤列表快取未命中，從 API 取得',
        logCacheSet: '標籤列表已快取',
      }
    );
  }

  /**
   * 帶快取的取得 MR 變更統計
   *
   * @param mrIid - MR IID
   * @param projectId - 專案 ID
   * @param useCache - 是否使用快取
   * @returns 變更統計
   * @private
   */
  private async getMRChangesWithCache(
    mrIid: number,
    projectId: string | undefined,
    useCache: boolean
  ): Promise<{ additions: number; deletions: number }> {
    const fallbackValue = { additions: 0, deletions: 0 };

    // 如果沒有 projectId，無法使用快取
    if (!projectId) {
      return await wrapApiCall(
        () => this.gitlabClient.getMergeRequestChanges(mrIid),
        `取得 MR #${mrIid} 變更統計`,
        {
          retryable: true,
          maxRetries: 2,
          retryDelay: 500,
          fallbackValue,
          errorStrategy: 'fallback',
        }
      );
    }

    // 使用通用快取包裝
    return await this.withCache(
      { type: 'mr_changes', projectId, mrIid },
      async () => {
        return await wrapApiCall(
          () => this.gitlabClient.getMergeRequestChanges(mrIid),
          `取得 MR #${mrIid} 變更統計`,
          {
            retryable: true,
            maxRetries: 2,
            retryDelay: 500,
            fallbackValue,
            errorStrategy: 'fallback',
          }
        );
      },
      useCache
    );
  }
}
