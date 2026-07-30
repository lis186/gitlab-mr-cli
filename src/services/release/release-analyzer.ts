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
 * 快取資料格式版本
 *
 * 計入快取鍵，因此遞增此值即讓所有舊快取失效。
 * 當 LOC 計算方式或 MergeEvent 結構改變時必須遞增，否則升級後
 * TTL 內仍會沿用舊演算法產生的結果。
 *
 * 2: LOC 改為從實際 diff 計算（先前誤用 changes_count，存的其實是變更檔案數）
 */
const CACHE_SCHEMA_VERSION = 2;

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
    /** 平均 LOC 變更（additions + deletions） */
    average_loc_changes: number;
    /** 平均新增行數；批量健康度優先以此判定 */
    average_loc_additions: number;
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
    // 傳入完整的 matchedTags 作為前序標籤來源：範圍內最舊的發布，
    // 其前一個標籤通常落在 since 之前，若只看範圍內就會誤判成無法測量
    onProgress?.('正在分析發布詳細資訊...');
    const releases = await this.buildReleases(
      filteredByTime,
      matchedTags,
      config,
      projectId,
      useCache,
      onProgress
    );

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
    return (await this.fetchMergeEvents(options)).events;
  }

  /**
   * 取得 MR 列表，並回報列表本身是否取得失敗
   *
   * 呼叫端需要區分「這段區間真的沒有 MR」與「查不到所以不知道」：
   * 兩者都是空陣列，但後者不能用來評健康度或凍結期。
   *
   * @private
   */
  private async fetchMergeEvents(options: {
    fromSha: string;
    toSha: string;
    targetBranch: string;
    projectId?: string;
    useCache?: boolean;
  }): Promise<{ events: MergeEvent[]; listFetchFailed: boolean }> {
    const { fromSha, toSha, targetBranch, projectId, useCache = true } = options;

    const cacheKey = {
      type: 'mr_list',
      schemaVersion: CACHE_SCHEMA_VERSION,
      projectId,
      fromSha,
      toSha,
      targetBranch,
    };

    // 嘗試從快取讀取
    if (useCache && projectId) {
      const cached = await this.cache.get<MergeEvent[]>(cacheKey);
      if (cached) {
        logger.debug(`MR 列表快取命中: ${fromSha.substring(0, 8)}...${toSha.substring(0, 8)}`);
        // 快取是 JSON，Date 會被存成字串；還原回 Date，
        // 否則下游的 calculateFreezeDays 會對字串呼叫 getTime() 而拋錯
        return {
          events: cached.map((mr) => ({ ...mr, merged_at: new Date(mr.merged_at) })),
          listFetchFailed: false,
        };
      }
    }

    // 取得兩個 commit 之間的 MR（帶錯誤處理與重試）
    // 失敗時回空陣列，但提前 return 以跳過下方的快取寫入：
    // 降級結果一旦進了快取，TTL 內的後續查詢都會拿到錯誤的 0 筆
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
        errorStrategy: 'throw',
      }
    ).catch(() => null);

    if (mrs === null) {
      // 空陣列在這裡代表「不知道」而不是「沒有」。回報失敗讓上層把
      // 這個發布標成未評估，否則 0 MR / 0 LOC 會被算成一個有自信的 healthy。
      return { events: [], listFetchFailed: true };
    }

    // 轉換為 MergeEvent 格式
    const mergeEvents: MergeEvent[] = [];
    let anyChangesDegraded = false;

    for (const mr of mrs) {
      // 取得 MR 的變更統計（帶快取）
      const changes = await this.getMRChangesWithCache(mr.iid, projectId, useCache);
      if (changes.degraded) {
        anyChangesDegraded = true;
      }

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
    // 任一 MR 的行數取不到就整包不快取：降級值是 0 行，
    // 快取起來會讓錯誤的 0 在 TTL 內被當成正確結果反覆使用
    if (useCache && projectId && !anyChangesDegraded) {
      await this.cache.set(cacheKey, mergeEvents);
      logger.debug(`MR 列表已快取: ${fromSha.substring(0, 8)}...${toSha.substring(0, 8)}`);
    } else if (anyChangesDegraded) {
      logger.warn(
        `部分 MR 變更統計取得失敗，略過 MR 列表快取 (${fromSha.substring(0, 8)}...${toSha.substring(0, 8)})`
      );
    }

    return { events: mergeEvents, listFetchFailed: false };
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
    locAdditions?: number;
    thresholds: ReleaseConfiguration['analysis']['thresholds'];
  }): HealthLevel {
    const { mrCount, locChanges, locAdditions, thresholds } = options;

    // calculateHealthLevel 是通用的數值分級（參數名為 mrCount，但邏輯與語意無關）
    const levels: HealthLevel[] = [calculateHealthLevel(mrCount, thresholds.mr_count)];

    // 批量優先以新增行數評估；未設定 loc_additions 時退回 loc_changes 以維持既有行為
    if (thresholds.loc_additions) {
      levels.push(calculateHealthLevel(locAdditions ?? locChanges, thresholds.loc_additions));
    } else if (thresholds.loc_changes) {
      levels.push(calculateHealthLevel(locChanges, thresholds.loc_changes));
    }

    // 取最嚴重的等級：任一維度過大都算不健康
    const order: HealthLevel[] = ['healthy', 'warning', 'critical'];
    return levels.reduce(
      (worst, level) => (order.indexOf(level) > order.indexOf(worst) ? level : worst),
      'healthy' as HealthLevel
    );
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
   * @param tags - 要輸出的標籤（已過濾時間範圍）
   * @param predecessorPool - 尋找前一個標籤的來源（未過濾時間範圍的完整集合）。
   *        範圍內最舊的發布，其前序標籤通常在 since 之前，只看 tags 會誤判成無法測量。
   * @param config - 配置
   * @param projectId - 專案 ID
   * @param useCache - 是否使用快取
   * @param onProgress - 進度回調
   * @returns 發布列表
   * @private
   */
  private async buildReleases(
    tags: GitLabTag[],
    predecessorPool: GitLabTag[],
    config: ReleaseConfiguration,
    projectId: string,
    useCache: boolean,
    onProgress?: (message: string) => void
  ): Promise<Release[]> {
    const byDateDesc = (a: GitLabTag, b: GitLabTag): number =>
      new Date(b.commit.committed_date).getTime() - new Date(a.commit.committed_date).getTime();

    // 按日期排序（新到舊）
    const sortedTags = [...tags].sort(byDateDesc);

    // 前序查找用的完整集合；同樣新到舊，並以 tag 名稱建索引
    const sortedPool = [...predecessorPool].sort(byDateDesc);
    const poolIndexByName = new Map(sortedPool.map((tag, index) => [tag.name, index]));

    /** 在完整集合中取比該標籤更舊的下一個標籤 */
    const findPredecessor = (tag: GitLabTag): GitLabTag | undefined => {
      const index = poolIndexByName.get(tag.name);
      return index === undefined ? undefined : sortedPool[index + 1];
    };

    const batchSize = BATCH_PROCESSING_CONSTANTS.SIZE;

    // 使用批次處理器並行處理發布
    const result = await processBatchItems(
      sortedTags,
      async (tag) => {
        const previousTag = findPredecessor(tag);
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

    // 被 skip 策略跳過的發布至少要留下痕跡：
    // 靜默丟棄會讓「發布莫名少了幾筆」這類問題完全無跡可循
    for (const { index, error } of result.failures) {
      logger.warn(`發布 ${sortedTags[index]?.name ?? `#${index}`} 分析失敗，已跳過: ${error.message}`);
    }

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

    // 兩種情況下的 0 MR / 0 LOC 都是「未測量」而不是「批量很小」，
    // 評成 healthy 會謊報健康度並拉低總體平均，因此一律不評估：
    //   1. 沒有前一個標籤，無法界定 MR 區間（例如查詢範圍內最舊的發布）
    //   2. MR 列表查詢失敗，空陣列代表「不知道」而不是「沒有」
    const measurable = Boolean(previousTag) && !mrStats.listFetchFailed;
    const healthLevel = measurable
      ? this.calculateHealthLevelIfNeeded(releaseType, mrStats, config)
      : null;

    if (mrStats.listFetchFailed) {
      logger.warn(`${tag.name} 的 MR 列表取得失敗，該發布標記為未評估`);
    }

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
    listFetchFailed: boolean;
  }> {
    let mrList: string[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let lastMergeDate = tagDate;
    let listFetchFailed = false;

    if (previousTag) {
      const { events: mergeEvents, listFetchFailed: failed } = await this.fetchMergeEvents({
        fromSha: previousTag.commit.id,
        toSha: tag.commit.id,
        targetBranch: config.analysis.default_branch,
        projectId,
        useCache,
      });
      listFetchFailed = failed;

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
      listFetchFailed,
    };
  }

  /**
   * 計算健康度（僅在配置要求時）
   *
   * @private
   */
  private calculateHealthLevelIfNeeded(
    releaseType: string,
    mrStats: { mrList: string[]; totalChanges: number; totalAdditions: number },
    config: ReleaseConfiguration
  ): HealthLevel | null {
    // releaseType 來自 classifyReleaseType，是 release_types 的 key（如 major），
    // 不是 name 欄位（如「正式月度發布」）—— 用 name 比對永遠不會命中
    const releaseTypeConfig = config.release_types[releaseType];

    if (releaseTypeConfig?.evaluate_batch_size === true) {
      return this.calculateReleaseHealth({
        mrCount: mrStats.mrList.length,
        locChanges: mrStats.totalChanges,
        locAdditions: mrStats.totalAdditions,
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
    average_loc_additions: number;
    level: 'healthy' | 'warning' | 'critical';
    recommendation: string;
  } {
    // 僅計算有健康度評估的發布
    const evaluatedReleases = releases.filter((r) => r.health_level !== null);

    if (evaluatedReleases.length === 0) {
      // 沒有可評估的發布有兩種成因，文案不應只講其中一種：
      // 一是所有類型都關閉 evaluate_batch_size，二是有發布但都無法測量
      // （例如範圍內最舊的發布沒有前一個標籤，或分析失敗被跳過）
      const reason =
        releases.length === 0
          ? '查詢範圍內沒有符合條件的發布'
          : '沒有可評估批量的發布（發布類型未啟用 evaluate_batch_size，或缺少前一個標籤而無法界定 MR 區間）';

      return {
        average_mr_count: 0,
        average_loc_changes: 0,
        average_loc_additions: 0,
        level: 'healthy',
        recommendation: reason,
      };
    }

    // 計算平均值
    const totalMRs = evaluatedReleases.reduce((sum, r) => sum + r.mr_count, 0);
    const totalLOC = evaluatedReleases.reduce((sum, r) => sum + r.total_loc_changes, 0);
    const totalAdditions = evaluatedReleases.reduce((sum, r) => sum + r.total_loc_additions, 0);

    const averageMRCount = totalMRs / evaluatedReleases.length;
    const averageLOCChanges = totalLOC / evaluatedReleases.length;
    const averageLOCAdditions = totalAdditions / evaluatedReleases.length;

    // 總體健康度與個別發布走同一套多維度邏輯，
    // 否則低 MR、高新增行數的情況下個別是 critical、總體卻顯示 healthy
    const level = this.calculateReleaseHealth({
      mrCount: averageMRCount,
      locChanges: averageLOCChanges,
      locAdditions: averageLOCAdditions,
      thresholds: config.analysis.thresholds,
    });

    // 產生建議
    const recommendation = this.generateRecommendation(
      level,
      averageMRCount,
      averageLOCChanges,
      averageLOCAdditions,
      config.analysis.thresholds
    );

    return {
      average_mr_count: averageMRCount,
      average_loc_changes: averageLOCChanges,
      average_loc_additions: averageLOCAdditions,
      level,
      recommendation,
    };
  }

  /**
   * 產生建議
   *
   * 必須說明是哪個維度觸發了等級，否則使用者會誤判成因 ——
   * 例如平均 MR 明明在健康範圍內，卻因為平均新增行數超標而顯示 warning。
   *
   * @param level - 健康度等級
   * @param avgMRCount - 平均 MR 數量
   * @param avgLOC - 平均 LOC 變更
   * @param avgAdditions - 平均新增行數
   * @param thresholds - 判定用的閾值
   * @returns 建議文字
   * @private
   */
  private generateRecommendation(
    level: HealthLevel,
    avgMRCount: number,
    avgLOC: number,
    avgAdditions: number,
    thresholds: ReleaseConfiguration['analysis']['thresholds']
  ): string {
    if (level === 'healthy') {
      return '發布批量健康，維持當前節奏';
    }

    // 找出實際觸發此等級的維度（可能同時有多個）
    // 門檻描述要對應實際等級：warning 是「未達 healthy 邊界」，critical 是「超過 warning」
    const boundOf = (t: { healthy: number; warning: number }): string =>
      level === 'critical' ? `> ${t.warning}` : `< ${t.healthy}`;

    const triggers: string[] = [];

    if (calculateHealthLevel(avgMRCount, thresholds.mr_count) === level) {
      triggers.push(
        `平均 ${avgMRCount.toFixed(1)} 個 MR（門檻 ${boundOf(thresholds.mr_count)}）`
      );
    }

    const locThresholds = thresholds.loc_additions ?? thresholds.loc_changes;
    if (locThresholds) {
      const locValue = thresholds.loc_additions ? avgAdditions : avgLOC;
      const locLabel = thresholds.loc_additions ? '平均新增' : '平均變更';
      if (calculateHealthLevel(locValue, locThresholds) === level) {
        triggers.push(
          `${locLabel} ${locValue.toFixed(0)} 行（門檻 ${boundOf(locThresholds)}）`
        );
      }
    }

    const reason = triggers.length > 0 ? triggers.join('、') : `平均 ${avgMRCount.toFixed(1)} 個 MR`;

    if (level === 'warning') {
      return `發布批量偏大 — ${reason}，建議增加發布頻率或減少每次發布的變更量`;
    }

    return `發布批量過大 — ${reason}，強烈建議增加發布頻率，避免月底集中合併大批量`;
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

      // freeze_days 是「最後一次合併」到「打標籤」的天數，而 lastMergeDate
      // 預設就等於 tagDate（見 calculateTimeMetrics），只有查到 MR 才會被覆寫。
      // 所以下面兩種情況拿到的 0 都是合成值，不是實測的當天發布：
      //   1. 沒有前一個標籤，無法界定 MR 區間
      //   2. 區間內沒有任何 MR —— 可能是重打標籤、從同一個 commit 切標籤，
      //      或 MR 列表查詢失敗（失敗時同樣是 0 筆）
      // 兩者都會被 assessFreezePeriod 判成「當天發布，測試時間不足」critical，
      // 對使用者是假警報，因此不評估。
      if (!release.previous_release_tag || release.mr_count === 0) {
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
   * @returns 變更統計；degraded 為 true 表示取得失敗、行數是降級的 0，
   *          呼叫端不應把它寫進任何快取
   * @private
   */
  private async getMRChangesWithCache(
    mrIid: number,
    projectId: string | undefined,
    useCache: boolean
  ): Promise<{ additions: number; deletions: number; degraded?: boolean }> {
    const fallbackValue = { additions: 0, deletions: 0, degraded: true };

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
    // 內層改為拋出，讓 withCache 跳過快取寫入，再由這裡回退到降級值：
    // 降級值（0 行）若進了快取，TTL 內會持續謊報這個 MR 沒有任何變更
    return await this.withCache(
      { type: 'mr_changes', schemaVersion: CACHE_SCHEMA_VERSION, projectId, mrIid },
      async () => {
        return await wrapApiCall(
          () => this.gitlabClient.getMergeRequestChanges(mrIid),
          `取得 MR #${mrIid} 變更統計`,
          {
            retryable: true,
            maxRetries: 2,
            retryDelay: 500,
            errorStrategy: 'throw',
          }
        );
      },
      useCache
    ).catch(() => fallbackValue);
  }
}
