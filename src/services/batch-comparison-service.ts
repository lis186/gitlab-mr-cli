/**
 * 批次比較服務
 * Feature: 011-mr-batch-comparison
 *
 * 負責批次查詢多個 MR 並生成比較結果
 */

import type { Gitlab } from '@gitbeaker/rest';
import type {
  BatchComparisonInput,
  FilteredBatchComparisonResult,
  MRComparisonRow,
  MRPhase,
  BatchComparisonSummary,
  TimelinePhases,
  PhaseData,
  PhaseIntensity,
  TimeSegmentIntensity,
  PhaseFilter,
  PhaseFilterStats,
  MRVersion,
  MRRound,
  MRRoundsDetail,
  MRClassification,
  MRTypeStats,
  MRTypeStatsSummary,
} from '../types/batch-comparison.js';
import { ValidationError, ErrorType, ServiceError, MRType } from '../types/batch-comparison.js';
import { normalizeEndOfDay } from '../utils/date-utils.js';
import { MRTimelineService } from './mr-timeline-service.js';
import type { MRTimeline } from '../types/timeline.js';
import { EventType } from '../models/mr-event.js';
import { TIME_CONSTANTS } from '../constants/time-constants.js';
import { Logger } from '../utils/logger.js';
import { DEFAULT_AI_RESPONSE_THRESHOLD_SECONDS } from '../config/hybrid-reviewers.js';

/**
 * 批次比較服務配置常數
 */
export const CONFIG = {
  /** 批次處理大小（每批次處理的 MR 數量） */
  BATCH_SIZE: 10,
  /** 時間分段持續時間（秒）- 12 小時 */
  SEGMENT_DURATION_SECONDS: 12 * 3600,
  /** 預設 MR 數量上限 */
  MAX_MR_LIMIT_DEFAULT: 100,
  /** 絕對 MR 數量上限 */
  MAX_MR_LIMIT_ABSOLUTE: 500,
  /** 效能警告閾值 */
  PERFORMANCE_WARNING_THRESHOLD: 200,
  /** 最大批次上限（用於批次比較） */
  MAX_BATCH_COMPARE_LIMIT: 50,
} as const;

/**
 * AI Review 事件標記常數
 *
 * 注意：此常數目前未使用。
 * 之前用於檢查 segments 中是否有 "First AI Review" 事件，但這會誤判合併後的 AI Review。
 * 未來可用於 --include-post-merge-reviews flag 實作（P1）。
 */
export const AI_REVIEW_EVENT_MARKERS = ['First AI Review'] as const;

/**
 * 批次比較服務類別
 */
export class BatchComparisonService {
  private readonly timelineService: MRTimelineService;
  private readonly gitlabClient: InstanceType<typeof Gitlab>;
  private readonly logger: Logger;
  private cachedTimelines: Map<number, MRTimeline> = new Map(); // Feature: MR Type Classification (2025-11-15)

  /**
   * 建立 BatchComparisonService 實例
   *
   * @param gitlabClient - GitLab API 客戶端
   * @param aiBotsConfig - 可選的自訂 AI Bot 使用者名稱清單
   */
  constructor(gitlabClient: InstanceType<typeof Gitlab>, aiBotsConfig?: string[]) {
    this.logger = new Logger({ prefix: '[BatchComparison]' });
    this.gitlabClient = gitlabClient;
    this.timelineService = new MRTimelineService(gitlabClient, aiBotsConfig);
  }

  /**
   * 執行批次 MR 比較分析
   *
   * @param input - 批次比較輸入參數
   * @param onProgress - 可選的進度回調函數
   * @returns 批次比較結果（包含階段過濾統計和匹配追蹤）
   * @throws ServiceError - 當 API 查詢失敗或驗證失敗時
   */
  async analyze(
    input: BatchComparisonInput,
    onProgress?: (current: number, total: number, elapsedMs: number) => void
  ): Promise<FilteredBatchComparisonResult> {
    // Clear timeline cache to prevent stale data between analysis runs
    this.cachedTimelines.clear();

    const startTime = Date.now();

    // 1. 驗證輸入
    this.validateInput(input);

    // 2. 批次查詢 MR 資料
    const rows = await this.fetchMRData(
      input.projectId,
      input.mrIids,
      onProgress,
      startTime,
      input.includeEvents,
      input.includePostMergeReviews
    );

    // 3. 應用過濾和排序（T016: 提取階段過濾統計，T019: 提取匹配追蹤）
    const filterResult = this.applyFilter(rows, input.filter);
    let processedRows = filterResult.filtered;
    const phaseFilterStats = filterResult.phaseFilterStats;
    const matchedPhaseFilters = filterResult.matchedPhaseFilters;
    processedRows = this.applySort(processedRows, input.sort);

    // 4. 應用限制
    if (input.limit && input.limit < processedRows.length) {
      processedRows = processedRows.slice(0, input.limit);
    }

    // 5. 計算彙總統計
    const summary = this.calculateSummary(processedRows);

    // 6. 建立結果
    const queryDurationMs = Date.now() - startTime;

    const result: FilteredBatchComparisonResult = {
      rows: processedRows,
      summary,
      metadata: {
        projectId: input.projectId,
        queriedAt: new Date().toISOString(),
        queryDurationMs,
        appliedFilters: input.filter,
        appliedSort: input.sort,
      },
    };

    // T016: 添加階段過濾統計（如果有的話）
    if (phaseFilterStats) {
      result.phaseFilterStats = phaseFilterStats;
    }

    // T019: 添加匹配階段追蹤（如果有的話）
    if (matchedPhaseFilters && Object.keys(matchedPhaseFilters).length > 0) {
      result.matchedPhaseFilters = matchedPhaseFilters;
    }

    return result;
  }

  /**
   * 使用 MR 類型分類重新計算彙總統計
   *
   * 此方法可在已有分析結果後，使用 MR 類型分類資訊重新計算彙總統計，
   * 以生成包含 AI Review × MR Type 交叉統計的增強版統計數據。
   *
   * @param result - 批次比較結果
   * @param classifications - MR 類型分類結果
   * @returns 更新後的批次比較結果（包含增強版統計）
   */
  public enrichWithClassifications(
    result: FilteredBatchComparisonResult,
    classifications: MRClassification[]
  ): FilteredBatchComparisonResult {
    // 重新計算彙總統計（包含分類資訊）
    const enhancedSummary = this.calculateSummary(result.rows, classifications);

    // 返回更新後的結果
    return {
      ...result,
      summary: enhancedSummary
    };
  }

  /**
   * 驗證輸入參數
   *
   * @param input - 批次比較輸入參數
   * @throws ValidationError - 當參數無效時
   */
  validateInput(input: BatchComparisonInput): void {
    // 驗證 MR IIDs 數量
    if (!input.mrIids || input.mrIids.length === 0) {
      throw new ValidationError(
        'MR IID 列表不能為空',
        'mrIids',
        'length > 0'
      );
    }

    // 使用動態上限（預設 100，最大建議 500）
    const maxLimit = input.limit || 100;
    const absoluteMax = 500;  // 絕對上限，防止記憶體問題

    if (input.mrIids.length > absoluteMax) {
      throw new ValidationError(
        `MR IID 列表不能超過 ${absoluteMax} 個（系統限制）`,
        'mrIids',
        `length <= ${absoluteMax}`
      );
    }

    if (input.mrIids.length > maxLimit) {
      throw new ValidationError(
        `MR IID 列表不能超過 ${maxLimit} 個`,
        'mrIids',
        `length <= ${maxLimit}`
      );
    }

    // 驗證 MR IIDs 有效性
    for (const iid of input.mrIids) {
      if (!Number.isInteger(iid) || iid <= 0) {
        throw new ValidationError(
          `MR IID 必須是正整數: ${iid}`,
          'mrIids',
          'positive integer'
        );
      }
    }

    // 驗證過濾條件
    if (input.filter) {
      if (input.filter.minCycleDays !== undefined && input.filter.minCycleDays < 0) {
        throw new ValidationError(
          '最小週期天數不能為負數',
          'filter.minCycleDays',
          '>= 0'
        );
      }

      if (
        input.filter.minCycleDays !== undefined &&
        input.filter.maxCycleDays !== undefined &&
        input.filter.minCycleDays > input.filter.maxCycleDays
      ) {
        throw new ValidationError(
          '最小週期天數不能大於最大週期天數',
          'filter.minCycleDays',
          '<= maxCycleDays'
        );
      }

      if (input.filter.dateRange) {
        // 驗證至少提供一個日期
        if (!input.filter.dateRange.since && !input.filter.dateRange.until) {
          throw new ValidationError(
            '日期範圍至少需要提供 since 或 until',
            'filter.dateRange',
            'since 或 until 必須提供其中之一'
          );
        }

        // 如果提供了 since，驗證格式
        if (input.filter.dateRange.since) {
          const since = new Date(input.filter.dateRange.since);
          if (isNaN(since.getTime())) {
            throw new ValidationError(
              '無效的開始日期格式',
              'filter.dateRange.since',
              'ISO 8601 格式（例如：2024-10-01）'
            );
          }
        }

        // 如果提供了 until，驗證格式
        if (input.filter.dateRange.until) {
          const until = new Date(input.filter.dateRange.until);
          if (isNaN(until.getTime())) {
            throw new ValidationError(
              '無效的結束日期格式',
              'filter.dateRange.until',
              'ISO 8601 格式（例如：2024-10-31）'
            );
          }
        }

        // 如果兩者都提供，檢查日期範圍合理性
        if (input.filter.dateRange.since && input.filter.dateRange.until) {
          const since = new Date(input.filter.dateRange.since);
          const normalizedUntil = normalizeEndOfDay(input.filter.dateRange.until);

          if (since >= normalizedUntil) {
            throw new ValidationError(
              '開始日期不能晚於結束日期（支援單日查詢：--since 2025-10-15 --until 2025-10-15）',
              'filter.dateRange.since',
              '<= until'
            );
          }
        }
      }
    }

    // 驗證排序條件
    if (input.sort) {
      const validFields = [
        'cycleDays', 'commits', 'files', 'lines', 'comments',
        'devTime', 'waitTime', 'reviewTime', 'mergeTime',
        'createdAt', 'mergedAt'
      ];

      if (!validFields.includes(input.sort.field)) {
        throw new ValidationError(
          `無效的排序欄位: ${input.sort.field}`,
          'sort.field',
          `must be one of: ${validFields.join(', ')}`
        );
      }

      if (input.sort.order !== 'asc' && input.sort.order !== 'desc') {
        throw new ValidationError(
          `無效的排序方向: ${input.sort.order}`,
          'sort.order',
          'must be "asc" or "desc"'
        );
      }
    }

    // 驗證限制數量
    if (input.limit !== undefined) {
      const absoluteMaxLimit = 500;  // 與上面的 absoluteMax 一致
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > absoluteMaxLimit) {
        throw new ValidationError(
          `限制數量必須在 1-${absoluteMaxLimit} 之間`,
          'limit',
          `1 <= limit <= ${absoluteMaxLimit}`
        );
      }
    }
  }

  /**
   * 批次查詢 MR 資料
   *
   * 使用批次處理策略（每批次 10 個 MR）並行查詢多個 MR 的完整資料，
   * 包括時間軸、diff 統計、審查資訊等。使用 Promise.allSettled
   * 確保單一 MR 失敗不影響整體流程。
   *
   * @param projectId - GitLab 專案 ID 或路徑
   * @param mrIids - MR IID 列表
   * @param onProgress - 可選的進度回調函數，參數為 (當前數量, 總數量, 已耗時毫秒)
   * @param startTime - 可選的查詢開始時間（用於精確計時）
   * @param includeEvents - 是否包含事件列表（可選）
   * @param includePostMergeReviews - 是否包含合併後的 AI Review（可選，預設 false）
   * @returns MR 比較資料行列表（失敗的 MR 會轉為錯誤行）
   */
  private async fetchMRData(
    projectId: string,
    mrIids: number[],
    onProgress?: (current: number, total: number, elapsedMs: number) => void,
    startTime?: number,
    includeEvents?: boolean,
    includePostMergeReviews?: boolean
  ): Promise<MRComparisonRow[]> {
    const rows: MRComparisonRow[] = [];
    const total = mrIids.length;
    const queryStartTime = startTime || Date.now();

    // 批次處理（每次處理 10 個）
    const batchSize = CONFIG.BATCH_SIZE;
    for (let i = 0; i < mrIids.length; i += batchSize) {
      const batch = mrIids.slice(i, i + batchSize);

      // 並行查詢此批次的 MR
      const batchResults = await Promise.allSettled(
        batch.map(iid => this.fetchSingleMR(projectId, iid, includeEvents, includePostMergeReviews))
      );

      // 收集結果
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          rows.push(result.value);
        }
        // 失敗的 MR 已經在 fetchSingleMR 中處理並返回錯誤行
      }

      // 回報進度
      if (onProgress) {
        const current = Math.min(i + batchSize, total);
        const elapsedMs = Date.now() - queryStartTime;
        onProgress(current, total, elapsedMs);
      }
    }

    // 檢查是否至少有一個成功
    const successCount = rows.filter(row => !row.error).length;
    if (successCount === 0) {
      // 收集錯誤訊息
      const errorSamples = rows.slice(0, 3).map(row => `MR ${row.iid}: ${row.error}`).join('; ');

      throw new ServiceError(
        ErrorType.PARTIAL_FAILURE,
        '所有 MR 查詢都失敗',
        `無法從 GitLab API 取得任何有效的 MR 資料。範例錯誤: ${errorSamples}`,
        '請檢查 MR IID 是否正確、是否已合併、或稍後重試',
        {
          totalMRs: mrIids.length,
          failedMRs: rows.length,
          errors: rows.map(row => ({ iid: row.iid, error: row.error })),
        }
      );
    }

    return rows;
  }

  /**
   * 查詢單一 MR 資料
   */
  private async fetchSingleMR(
    projectId: string,
    mrIid: number,
    includeEvents?: boolean,
    includePostMergeReviews?: boolean
  ): Promise<MRComparisonRow> {
    try {
      // 並行執行 timeline 分析、diff 查詢和 versions 查詢以提升效能
      const [timelineData, diffResult, diffVersions] = await Promise.all([
        this.timelineService.analyze(projectId, mrIid),
        this.gitlabClient.MergeRequests.allDiffs(projectId, mrIid).catch(() => null),
        this.fetchDiffVersions(projectId, mrIid).catch(() => undefined),
      ]);

      // Cache timeline data for MR type classification (Feature: 2025-11-15)
      this.cachedTimelines.set(mrIid, timelineData);

      // 從 timelineData 取得檔案數（避免重複 API 呼叫）
      const changesCount = timelineData.mr.changesCount || 0;

      // 計算實際行數變化
      let totalLines = 0;
      if (diffResult && Array.isArray(diffResult) && diffResult.length > 0) {
        // 使用實際 diff 資料計算行數
        totalLines = diffResult.reduce((sum: number, file: any) => {
          // 安全檢查：避免 ReDoS 攻擊，跳過超大的 diff（> 100KB）
          const MAX_DIFF_SIZE = 100 * 1024; // 100KB
          if (!file.diff || file.diff.length > MAX_DIFF_SIZE) {
            // 對於超大 diff，使用估算值（每個檔案約 100 行變更）
            return sum + 100;
          }

          // 使用安全的行計數方法（避免複雜的 regex）
          const additions = (file.diff.match(/^\+(?!\+)/gm) || []).length;
          const deletions = (file.diff.match(/^-(?!-)/gm) || []).length;
          return sum + additions + deletions;
        }, 0);
      } else {
        // 如果沒有 diff 資料，使用估算值
        totalLines = changesCount * 50;
      }

      // 轉換為 MRComparisonRow，傳入實際的統計資料
      return this.transformToComparisonRow(
        timelineData,
        changesCount,
        totalLines,
        diffVersions,
        includeEvents,
        includePostMergeReviews
      );
    } catch (error: any) {
      // 查詢失敗時返回錯誤行
      return this.createErrorRow(mrIid, error);
    }
  }

  /**
   * 將 MRTimeline 轉換為 MRComparisonRow
   *
   * @param timelineData - MR 時間軸資料
   * @param files - 變更檔案數
   * @param totalLines - 總行數變更
   * @param diffVersions - MR Diff 版本數（GitLab versions API，可選）
   * @param includeEvents - 是否包含完整事件列表（可選）
   * @param includePostMergeReviews - 是否包含合併後的 AI Review（可選，預設 false）
   *
   * @remarks
   * **效能考量**：
   * - 事件序列化會為每個事件建立新物件（使用 `.map()`）
   * - 測試驗證：50 個事件可正常處理
   * - 實際限制：建議單一 MR 不超過 100 個事件
   * - 大量事件可能增加記憶體使用與序列化時間
   *
   * @returns MR 比較資料列
   */
  private transformToComparisonRow(
    timelineData: MRTimeline,
    files: number,
    totalLines: number,
    diffVersions?: number,
    includeEvents?: boolean,
    includePostMergeReviews?: boolean
  ): MRComparisonRow {
    // 從 timelineData 提取資訊
    const { mr, summary, cycleTimeSeconds } = timelineData;

    // 計算週期天數
    const cycleDays = cycleTimeSeconds / TIME_CONSTANTS.SECONDS_PER_DAY; // 秒轉天

    // 計算四階段時間分布
    const timeline = this.calculateTimelinePhases(timelineData, cycleDays);

    // 判斷 MR 當前階段
    const { phase, phaseLabel } = this.determineMRPhase(timelineData);

    // 提取審查者名稱（最多顯示 2 位，其他用 +N 表示）
    const reviewers = this.formatReviewers(summary.reviewers);

    // 檢測 AI Review
    const aiReviewResult = this.detectAIReview(timelineData, includePostMergeReviews);

    const row: MRComparisonRow = {
      iid: mr.id,
      title: mr.title.length > 50 ? mr.title.substring(0, 50) + '...' : mr.title,
      author: typeof mr.author === 'string' ? mr.author : mr.author.name,
      reviewers,
      cycleDays: Math.round(cycleDays * 10) / 10, // 保留 1 位小數
      codeChanges: {
        commits: summary.commits,
        files,
        totalLines,
      },
      reviewStats: {
        comments: summary.humanComments,
        ...(diffVersions !== undefined && { diffVersions }),
        hasAIReview: aiReviewResult.hasAI,
        aiReviewStatus: aiReviewResult.status,
        ...(summary.commentBreakdown && { commentBreakdown: summary.commentBreakdown }),
      },
      timeline,
      status: mr.mergedAt ? 'merged' : 'open',
      phase,
      phaseLabel,
      createdAt: mr.createdAt.toISOString(),
      mergedAt: mr.mergedAt ? mr.mergedAt.toISOString() : null,
    };

    // 如果需要包含事件，序列化事件列表
    if (includeEvents && timelineData.events && timelineData.events.length > 0) {
      try {
        row.events = timelineData.events.map(event => ({
          sequence: event.sequence,
          timestamp: event.timestamp.toISOString(),
          actor: {
            id: event.actor.id,
            username: event.actor.username,
            name: event.actor.name,
            role: event.actor.role,
            isAIBot: event.actor.isAIBot,
          },
          eventType: event.eventType,
          ...(event.details && { details: event.details }),
          ...(event.intervalToNext !== undefined && { intervalToNext: event.intervalToNext }),
        }));
      } catch (error: any) {
        // 事件序列化失敗時記錄警告並標記錯誤，但不影響整體結果
        const errorMessage = error.message || String(error);
        this.logger.warn(`Failed to serialize events for MR #${mr.id}: ${errorMessage}`);
        row.eventsSerializationError = errorMessage;
      }
    }

    return row;
  }

  /**
   * 檢測 MR 是否使用 AI Review
   *
   * 檢查邏輯：
   * - 預設（includePostMergeReviews = false）：只檢查合併前的 AI Review 數量
   *   - summary.aiReviews 已經排除了合併後的 Review (見 mr-timeline-service.ts:1271-1279)
   *   - 這確保了數據一致性：合併後的 AI Review 不影響 MR 流程指標
   *
   * - 啟用 includePostMergeReviews = true 時：使用 OR 邏輯檢查
   *   - 檢查 summary.aiReviews > 0（合併前）
   *   - OR 檢查 segments 包含 "First AI Review" 事件（包含合併後）
   *   - 用於特殊需求：完整追蹤 AI Review 參與度
   *
   * 注意：預設不使用 segments 檢查，因為會誤判合併後的 AI Review
   * (例如：合併後多天才有 AI Review，被誤判為「有 AI Review」)
   *
   * @param timelineData - MR 時間軸資料
   * @param includePostMergeReviews - 是否包含合併後的 AI Review（預設 false）
   */
  private detectAIReview(
    timelineData: MRTimeline,
    includePostMergeReviews: boolean = false
  ): { hasAI: boolean; status: 'yes' | 'no' | 'unknown' } {
    const { summary, segments } = timelineData;

    // 方法 1: 檢查 AI 評論數（只包含合併前）
    const hasAIReviews = (summary.aiReviews ?? 0) > 0;

    if (!includePostMergeReviews) {
      // 預設模式：只檢查合併前的 AI Review
      return {
        hasAI: hasAIReviews,
        status: hasAIReviews ? 'yes' : 'no',
      };
    }

    // 特殊模式：包含合併後的 AI Review
    // 方法 2: 檢查是否有 "First AI Review" 事件（包含合併後）
    const hasAIReviewEvent = segments.some(seg =>
      AI_REVIEW_EVENT_MARKERS.some(marker =>
        seg.from === marker || seg.to === marker
      )
    );

    // 使用 OR 邏輯
    const hasAI = hasAIReviews || hasAIReviewEvent;

    return {
      hasAI,
      status: hasAI ? 'yes' : 'no',
    };
  }

  /**
   * 判斷 MR 當前階段
   */
  private determineMRPhase(timelineData: MRTimeline): { phase: MRPhase; phaseLabel: string } {
    const { mr, segments } = timelineData;

    // 1. 已合併
    if (mr.mergedAt) {
      return { phase: 'merged', phaseLabel: '已合併' };
    }

    // 2. 已關閉（未合併）
    if (!mr.mergedAt && timelineData.mr.mergedAt === null) {
      // 檢查是否有任何審查活動
      const hasApproved = segments.some(seg => seg.to === 'Approved');
      const hasReview = segments.some(seg => seg.to === 'First Human Review');

      if (hasApproved) {
        // 已批准但未合併
        return { phase: 'ready-to-merge', phaseLabel: '等待合併' };
      }

      if (hasReview) {
        // 有審查活動
        return { phase: 'in-review', phaseLabel: '審核中' };
      }

      const hasMRCreated = segments.some(seg => seg.from === 'MR Created' || seg.to === 'MR Created');
      if (hasMRCreated) {
        // MR 已建立但無審查
        return { phase: 'waiting-review', phaseLabel: '等待審核' };
      }

      // 其他情況視為開發中
      return { phase: 'in-development', phaseLabel: '開發中' };
    }

    // 預設為開發中
    return { phase: 'in-development', phaseLabel: '開發中' };
  }

  /**
   * 取得 Phase 計算所需的關鍵時間戳記
   *
   * @returns 各關鍵狀態的時間戳記（毫秒）
   */
  private getPhaseBoundaryTimestamps(timelineData: MRTimeline): {
    mrCreatedTime: number;
    markedAsReadyTime: number | null;
    firstAIReviewTime: number | null;
    firstHumanReviewTime: number | null;
    firstReviewTime: number | null;
    approvedTime: number | null;
    mergedTime: number | null;
    firstReviewInferredFromApproved?: boolean;
  } {
    const { events, mr } = timelineData;

    let markedAsReadyTime: number | null = null;
    let lastReadyTime: number | null = null;
    let approvedTime: number | null = null;

    // 獲取 Merge 時間（用於過濾 Post-Merge 事件）
    const mergedTime = mr.mergedAt ? mr.mergedAt.getTime() : null;

    // 第一次掃描：找出最後一次 Marked as Ready 時間和第一個 Merge 前的 Approved 時間
    for (const event of events) {
      const eventTime = event.timestamp.getTime();

      if (event.eventType === EventType.MARKED_AS_READY) {
        lastReadyTime = eventTime;
        if (markedAsReadyTime === null) {
          markedAsReadyTime = eventTime;
        }
      }

      // 只計算 Merge 之前的 Approved 事件
      if (event.eventType === EventType.APPROVED && !approvedTime) {
        const isBeforeMerge = mergedTime === null || eventTime < mergedTime;
        if (isBeforeMerge) {
          approvedTime = eventTime;
        }
      }
    }

    // 確定 Wait 階段的起始時間
    // - Draft MR: 從最後一次 Marked as Ready 開始
    // - 一般 MR: 從 MR Created 開始
    const mrCreatedTime = mr.createdAt.getTime();
    const waitStartTime = lastReadyTime !== null ? lastReadyTime : mrCreatedTime;

    // 第二次掃描：找出 Wait 階段開始後、Merge 之前的第一個審查事件
    // 這樣可以排除：
    // 1. Draft 期間的審查事件
    // 2. Merge 之後的審查事件（測試性質的評論）
    let firstAIReviewTime: number | null = null;
    let firstHumanReviewTime: number | null = null;

    for (const event of events) {
      const eventTime = event.timestamp.getTime();

      // 只計算 waitStartTime 之後、Merge 之前的審查事件
      // 如果 MR 未合併（mergedTime === null），則不限制結束時間
      const isBeforeMerge = mergedTime === null || eventTime < mergedTime;

      if (eventTime >= waitStartTime && isBeforeMerge) {
        // Special handling for hybrid-reviewer: skip if response time > threshold
        // This ensures hybrid-reviewer's delayed responses don't count as "First Review" for Wait Time
        const isHybridReviewerDelayed =
          event.actor.username === 'hybrid-reviewer' &&
          (eventTime - mrCreatedTime) / 1000 > DEFAULT_AI_RESPONSE_THRESHOLD_SECONDS;

        if (!isHybridReviewerDelayed) {
          if (event.eventType === EventType.AI_REVIEW_STARTED && !firstAIReviewTime) {
            firstAIReviewTime = eventTime;
          }
          if (event.eventType === EventType.HUMAN_REVIEW_STARTED && !firstHumanReviewTime) {
            firstHumanReviewTime = eventTime;
          }
        }
      }
    }

    // 計算第一個審查時間（AI 或 Human，取最早的）
    let firstReviewTime: number | null = null;
    let firstReviewInferredFromApproved = false;

    if (firstAIReviewTime !== null && firstHumanReviewTime !== null) {
      firstReviewTime = Math.min(firstAIReviewTime, firstHumanReviewTime);
    } else if (firstAIReviewTime !== null) {
      firstReviewTime = firstAIReviewTime;
    } else if (firstHumanReviewTime !== null) {
      firstReviewTime = firstHumanReviewTime;
    } else if (approvedTime !== null && approvedTime >= waitStartTime) {
      // 回退方案：如果沒有任何審查事件，但有 Approved，則使用 Approved 時間
      // 這種情況通常是審查者直接按 Approve 而沒有留言
      firstReviewTime = approvedTime;
      firstReviewInferredFromApproved = true;
    }

    return {
      mrCreatedTime,
      markedAsReadyTime,
      firstAIReviewTime,
      firstHumanReviewTime,
      firstReviewTime,
      approvedTime,
      mergedTime: mr.mergedAt ? mr.mergedAt.getTime() : null,
      firstReviewInferredFromApproved,
    };
  }

  /**
   * 計算所有 Draft 期間的總時長（秒）
   *
   * @param timelineData - MR 時間軸資料
   * @param mrCreatedTime - MR 創建時間（毫秒）
   * @param mergedTime - MR 合併時間（毫秒）
   * @returns Draft 期間總時長（秒）
   *
   * @remarks
   * 處理所有 Draft 狀態的時間，包括：
   * 1. MR 創建時就是 Draft 狀態（從 MR Created 到第一次 Marked as Ready）
   * 2. MR 創建後轉為 Draft（多次 Ready ↔ Draft 切換）
   *
   * 算法：
   * - 掃描所有 MARKED_AS_DRAFT 和 MARKED_AS_READY 事件
   * - 配對事件計算每個 Draft 期間
   * - 處理邊界情況（創建時就是 Draft，或未標記 Ready 就合併）
   */
  private calculateAllDraftPeriods(
    timelineData: MRTimeline,
    mrCreatedTime: number,
    mergedTime: number | null
  ): number {
    const { events, mr } = timelineData;

    // 檢查 MR 創建時是否為 Draft 狀態
    const isDraftAtCreation = mr.isDraft;

    let totalDraftSeconds = 0;
    let currentDraftStartTime: number | null = isDraftAtCreation ? mrCreatedTime : null;

    // 掃描所有 Draft/Ready 事件
    for (const event of events) {
      const eventTime = event.timestamp.getTime();

      if (event.eventType === EventType.MARKED_AS_DRAFT) {
        // 開始新的 Draft 期間
        if (currentDraftStartTime === null) {
          currentDraftStartTime = eventTime;
        }
      } else if (event.eventType === EventType.MARKED_AS_READY) {
        // 結束當前 Draft 期間
        if (currentDraftStartTime !== null) {
          const draftDurationMs = eventTime - currentDraftStartTime;
          totalDraftSeconds += draftDurationMs / 1000;
          currentDraftStartTime = null;
        }
      }
    }

    // 處理未結束的 Draft 期間（雖然不太可能，因為只分析已合併的 MR）
    if (currentDraftStartTime !== null && mergedTime !== null) {
      const draftDurationMs = mergedTime - currentDraftStartTime;
      totalDraftSeconds += draftDurationMs / 1000;
    }

    return totalDraftSeconds;
  }

  /**
   * 計算時間軸四階段分布（修復版：使用時間範圍分類）
   *
   * 從 MRTimeline.segments 中提取實際的階段時間
   * 階段定義（符合 LinearB Pickup Time 標準）：
   * - Dev: First Commit → MR Created + 所有 Draft 期間
   *   - First Commit → MR Created（如果存在）
   *   - 加上所有 Draft 狀態的時間（無論何時轉 Draft）
   * - Wait: (最後一次 Marked as Ready 或 MR Created) → First Review (等待審查)
   *   - 對於 Draft MR: 從最後一次 Marked as Ready 到第一次審查（AI 或 Human）
   *   - 對於一般 MR: 從 MR Created 到第一次審查（AI 或 Human）
   *   - 包含作者在此期間的所有活動（commits 等），因為審查者尚未開始審查
   * - Review: First Review → Approved (或 Merged) (審查階段)
   *   - 包含所有審查相關活動：AI 審查、作者修改、等待人工審查、人工審查
   *   - 從第一次審查（AI 或 Human）開始，到 Approved 或 Merged
   * - Merge: Approved → Merged (合併階段，如果有 Approved)
   *
   * Bug Fix (2025-11-08): 改用時間範圍分類取代狀態轉換模式匹配
   * 修正了 77% MRs 顯示 wait=0 的錯誤
   *
   * Bug Fix (2025-11-08): 修正 Dev Time 計算邏輯
   * - 改用定義 C：First Commit → MR Created + 所有 Draft 期間
   * - 修正了 95% AI 期間 MRs 顯示 dev=0 的錯誤
   */
  private calculateTimelinePhases(timelineData: MRTimeline, cycleDays: number): TimelinePhases {
    const totalDurationSeconds = cycleDays * TIME_CONSTANTS.SECONDS_PER_DAY; // 天數轉秒數
    const segments = timelineData.segments || [];

    // 初始化四個階段的時長（秒）
    let devDuration = 0;
    let waitDuration = 0;
    let reviewDuration = 0;
    let mergeDuration = 0;

    // 取得關鍵時間戳記（毫秒）
    const timestamps = this.getPhaseBoundaryTimestamps(timelineData);
    const {
      mrCreatedTime,
      firstReviewTime,
      approvedTime,
      mergedTime,
      firstReviewInferredFromApproved,
    } = timestamps;

    // === Dev Time 計算（定義 C）===
    // Dev Time = First Commit → MR Created + 所有 Draft 期間

    // 1. 找到 first commit 時間
    const { events } = timelineData;
    let firstCommitTime: number | null = null;
    for (const event of events) {
      if (event.eventType === EventType.CODE_COMMITTED || event.eventType === EventType.COMMIT_PUSHED) {
        const commitTime = event.timestamp.getTime();
        if (firstCommitTime === null || commitTime < firstCommitTime) {
          firstCommitTime = commitTime;
        }
      }
    }

    // 2. 計算 first commit → MR Created 的時間（如果存在）
    if (firstCommitTime !== null && firstCommitTime < mrCreatedTime) {
      devDuration = (mrCreatedTime - firstCommitTime) / 1000; // 毫秒轉秒
    }

    // 3. 加上所有 Draft 期間的時間
    const draftDuration = this.calculateAllDraftPeriods(timelineData, mrCreatedTime, mergedTime);
    devDuration += draftDuration;

    // 確定 Wait 階段的起始時間
    // - Draft MR: 從最後一次 Marked as Ready 開始
    // - 一般 MR: 從 MR Created 開始
    let lastReadyTime: number | null = null;
    for (const event of events) {
      if (event.eventType === EventType.MARKED_AS_READY) {
        lastReadyTime = event.timestamp.getTime();
      }
    }
    const waitStartTime = lastReadyTime !== null ? lastReadyTime : mrCreatedTime;

    // 使用時間範圍分類 segments（只用於 Wait/Review/Merge 階段）
    for (const segment of segments) {
      const segmentStartTime = segment.fromEvent.timestamp.getTime();
      const segmentEndTime = segment.toEvent.timestamp.getTime();

      // Wait 階段: (Marked as Ready 或 MR Created) → First Review
      // 包含作者在此期間的所有活動（commits 等）
      if (firstReviewTime !== null &&
               segmentStartTime >= waitStartTime &&
               segmentEndTime <= firstReviewTime) {
        waitDuration += segment.durationSeconds;
      }
      // 邊界情況：無審查事件，整個 MR 週期都算 Wait
      else if (firstReviewTime === null &&
               segmentStartTime >= waitStartTime) {
        waitDuration += segment.durationSeconds;
      }
      // Review 階段: First Review → Approved (或 Merged if no Approved)
      else if (firstReviewTime !== null &&
               segmentStartTime >= firstReviewTime) {
        const reviewEndTime = approvedTime !== null ? approvedTime : (mergedTime || Infinity);
        if (segmentEndTime <= reviewEndTime) {
          reviewDuration += segment.durationSeconds;
        }
      }
      // Merge 階段: Approved → Merged
      else if (approvedTime !== null &&
               segmentStartTime >= approvedTime &&
               mergedTime !== null &&
               segmentEndTime <= mergedTime) {
        mergeDuration += segment.durationSeconds;
      }
    }

    // Fallback: 如果 segment-based 計算失敗（例如 segments 未涵蓋完整期間），
    // 使用時間戳直接計算，避免出現明顯錯誤的 0 值
    if (waitDuration === 0 && firstReviewTime !== null && firstReviewTime > waitStartTime) {
      waitDuration = (firstReviewTime - waitStartTime) / 1000; // 毫秒轉秒
    }
    if (reviewDuration === 0 && firstReviewTime !== null && approvedTime !== null && approvedTime > firstReviewTime) {
      reviewDuration = (approvedTime - firstReviewTime) / 1000;
    }
    if (mergeDuration === 0 && approvedTime !== null && mergedTime !== null && mergedTime > approvedTime) {
      mergeDuration = (mergedTime - approvedTime) / 1000;
    }

    // 如果沒有 segments 資料，使用均分
    if (segments.length === 0) {
      devDuration = totalDurationSeconds * 0.3;
      waitDuration = totalDurationSeconds * 0.1;
      reviewDuration = totalDurationSeconds * 0.5;
      mergeDuration = totalDurationSeconds * 0.1;
    }

    // 計算百分比
    const total = devDuration + waitDuration + reviewDuration + mergeDuration;
    const devPercentage = total > 0 ? (devDuration / total) * 100 : 0;
    const waitPercentage = total > 0 ? (waitDuration / total) * 100 : 0;
    const reviewPercentage = total > 0 ? (reviewDuration / total) * 100 : 0;
    const mergePercentage = total > 0 ? (mergeDuration / total) * 100 : 0;

    // 計算每個階段的活動強度
    const intensities = this.calculatePhaseIntensities(timelineData);

    // 計算每個階段的時間分段活動強度
    const phaseBoundaries = this.getPhaseBoundaries(timelineData);
    const segmentedIntensities = this.calculateSegmentedIntensities(timelineData, phaseBoundaries);

    const createPhaseData = (duration: number, percentage: number, phase: 'dev' | 'wait' | 'review' | 'merge'): PhaseData => ({
      durationSeconds: Math.round(duration),
      percentage: Math.round(percentage * 10) / 10,
      formattedDuration: this.formatDuration(duration),
      intensity: intensities[phase],
      timeSegments: segmentedIntensities[phase],
    });

    const result: TimelinePhases = {
      dev: createPhaseData(devDuration, devPercentage, 'dev'),
      wait: createPhaseData(waitDuration, waitPercentage, 'wait'),
      review: createPhaseData(reviewDuration, reviewPercentage, 'review'),
      merge: createPhaseData(mergeDuration, mergePercentage, 'merge'),
      totalDurationSeconds: Math.round(totalDurationSeconds),
    };

    // 如果 First Review 是從 Approved 推斷的，加入標記
    if (firstReviewInferredFromApproved) {
      (result as any).firstReviewInferredFromApproved = true;
    }

    return result;
  }

  /**
   * 取得各階段的時間邊界
   */
  private getPhaseBoundaries(timelineData: MRTimeline): {
    devStart: Date | null;
    devEnd: Date | null;
    reviewStart: Date | null;
    reviewEnd: Date | null;
    mergeStart: Date | null;
    mergeEnd: Date | null;
  } {
    const { events, mr } = timelineData;

    let firstReviewTime: Date | null = null;
    let approvedTime: Date | null = null;

    for (const event of events) {
      if (event.eventType === EventType.HUMAN_REVIEW_STARTED && !firstReviewTime) {
        firstReviewTime = event.timestamp;
      }
      if (event.eventType === EventType.APPROVED) {
        approvedTime = event.timestamp;
      }
    }

    // 找出第一個 commit 時間（開發開始）
    let firstCommitTime: Date | null = null;
    for (const event of events) {
      if (event.eventType === EventType.COMMIT_PUSHED) {
        if (!firstCommitTime || event.timestamp < firstCommitTime) {
          firstCommitTime = event.timestamp;
        }
      }
    }

    return {
      devStart: firstCommitTime,
      devEnd: firstReviewTime || mr.createdAt,
      reviewStart: firstReviewTime,
      reviewEnd: approvedTime || mr.mergedAt,
      mergeStart: approvedTime,
      mergeEnd: mr.mergedAt,
    };
  }

  /**
   * 計算每個階段的時間分段活動強度
   */
  private calculateSegmentedIntensities(
    timelineData: MRTimeline,
    boundaries: ReturnType<typeof this.getPhaseBoundaries>
  ): Record<'dev' | 'wait' | 'review' | 'merge', TimeSegmentIntensity[]> {
    const SEGMENT_DURATION = CONFIG.SEGMENT_DURATION_SECONDS; // 12 小時一段

    const calculateLevel = (commits: number, comments: number): 0 | 1 | 2 | 3 => {
      const totalActivity = commits + comments;
      if (totalActivity === 0) return 0;
      if (totalActivity <= 2) return 1;
      if (totalActivity <= 5) return 2;
      return 3;
    };

    const createSegmentsForPhase = (
      startTime: Date | null,
      endTime: Date | null
    ): TimeSegmentIntensity[] => {
      if (!startTime || !endTime) return [];

      const phaseDuration = (endTime.getTime() - startTime.getTime()) / 1000;
      if (phaseDuration <= 0) return [];

      // 計算分段數量（至少 1 段，最多根據時間長度）
      const numSegments = Math.max(1, Math.min(10, Math.ceil(phaseDuration / SEGMENT_DURATION)));
      const segmentDuration = phaseDuration / numSegments;

      const segments: TimeSegmentIntensity[] = [];
      const { events } = timelineData;

      for (let i = 0; i < numSegments; i++) {
        const segmentStart = new Date(startTime.getTime() + i * segmentDuration * 1000);
        const segmentEnd = new Date(startTime.getTime() + (i + 1) * segmentDuration * 1000);

        let commits = 0;
        let comments = 0;

        // 統計該時間段內的活動
        for (const event of events) {
          if (event.timestamp >= segmentStart && event.timestamp < segmentEnd) {
            if (event.eventType === EventType.COMMIT_PUSHED) {
              commits++;
            }
            if ((event.eventType === EventType.HUMAN_REVIEW_STARTED ||
                 event.eventType === EventType.AUTHOR_RESPONSE) &&
                event.actor && !event.actor.name.toLowerCase().includes('bot')) {
              comments++;
            }
          }
        }

        segments.push({
          startSeconds: i * segmentDuration,
          durationSeconds: segmentDuration,
          commits,
          comments,
          level: calculateLevel(commits, comments),
        });
      }

      return segments;
    };

    return {
      dev: createSegmentsForPhase(boundaries.devStart, boundaries.devEnd),
      wait: [], // Wait 階段通常較短且無活動
      review: createSegmentsForPhase(boundaries.reviewStart, boundaries.reviewEnd),
      merge: createSegmentsForPhase(boundaries.mergeStart, boundaries.mergeEnd),
    };
  }

  /**
   * 計算各階段的活動強度
   */
  private calculatePhaseIntensities(timelineData: MRTimeline): Record<'dev' | 'wait' | 'review' | 'merge', PhaseIntensity> {
    const { events, mr } = timelineData;

    const mergedAt = mr.mergedAt;

    // 找出關鍵時間點
    let firstReviewTime: Date | null = null;
    let approvedTime: Date | null = null;

    for (const event of events) {
      // 找第一次人工審查
      if (event.eventType === EventType.HUMAN_REVIEW_STARTED && !firstReviewTime) {
        firstReviewTime = event.timestamp;
      }

      // 找批准時間
      if (event.eventType === EventType.APPROVED) {
        approvedTime = event.timestamp;
      }
    }

    // 計算每個階段的活動量
    const phaseActivities = {
      dev: { commits: 0, comments: 0 },
      wait: { commits: 0, comments: 0 },
      review: { commits: 0, comments: 0 },
      merge: { commits: 0, comments: 0 },
    };

    for (const event of events) {
      const eventTime = event.timestamp;

      // 判斷事件屬於哪個階段
      let phase: 'dev' | 'wait' | 'review' | 'merge' | null = null;

      if (!firstReviewTime || eventTime < firstReviewTime) {
        phase = 'dev';
      } else if (!approvedTime || eventTime < approvedTime) {
        phase = 'review';
      } else if (mergedAt && eventTime < mergedAt) {
        phase = 'merge';
      }

      if (phase) {
        // 計算提交數
        if (event.eventType === EventType.COMMIT_PUSHED) {
          phaseActivities[phase].commits++;
        }

        // 計算評論數（排除 AI Bot）
        if ((event.eventType === EventType.HUMAN_REVIEW_STARTED ||
             event.eventType === EventType.AUTHOR_RESPONSE) &&
            event.actor && !event.actor.name.toLowerCase().includes('bot')) {
          phaseActivities[phase].comments++;
        }
      }
    }

    // 計算強度等級
    const calculateLevel = (commits: number, comments: number): 0 | 1 | 2 | 3 => {
      const totalActivity = commits + comments;
      if (totalActivity === 0) return 0;
      if (totalActivity <= 2) return 1;
      if (totalActivity <= 5) return 2;
      return 3;
    };

    return {
      dev: {
        commits: phaseActivities.dev.commits,
        comments: phaseActivities.dev.comments,
        level: calculateLevel(phaseActivities.dev.commits, phaseActivities.dev.comments),
      },
      wait: {
        commits: phaseActivities.wait.commits,
        comments: phaseActivities.wait.comments,
        level: calculateLevel(phaseActivities.wait.commits, phaseActivities.wait.comments),
      },
      review: {
        commits: phaseActivities.review.commits,
        comments: phaseActivities.review.comments,
        level: calculateLevel(phaseActivities.review.commits, phaseActivities.review.comments),
      },
      merge: {
        commits: phaseActivities.merge.commits,
        comments: phaseActivities.merge.comments,
        level: calculateLevel(phaseActivities.merge.commits, phaseActivities.merge.comments),
      },
    };
  }

  /**
   * 格式化時長
   */
  private formatDuration(seconds: number): string {
    const days = Math.floor(seconds / TIME_CONSTANTS.SECONDS_PER_DAY);
    const hours = Math.floor((seconds % TIME_CONSTANTS.SECONDS_PER_DAY) / TIME_CONSTANTS.SECONDS_PER_HOUR);

    if (days > 0) {
      return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
    if (hours > 0) {
      return `${hours}h`;
    }
    return `${Math.floor(seconds / 60)}m`;
  }

  /**
   * 建立錯誤行
   */
  private createErrorRow(mrIid: number, error: any): MRComparisonRow {
    return {
      iid: mrIid,
      title: '',
      author: '',
      cycleDays: 0,
      codeChanges: {
        commits: 0,
        files: 0,
        totalLines: 0,
      },
      reviewStats: {
        comments: 0,
      },
      timeline: {
        dev: { durationSeconds: 0, percentage: 0, formattedDuration: '0s', intensity: { commits: 0, comments: 0, level: 0 } },
        wait: { durationSeconds: 0, percentage: 0, formattedDuration: '0s', intensity: { commits: 0, comments: 0, level: 0 } },
        review: { durationSeconds: 0, percentage: 0, formattedDuration: '0s', intensity: { commits: 0, comments: 0, level: 0 } },
        merge: { durationSeconds: 0, percentage: 0, formattedDuration: '0s', intensity: { commits: 0, comments: 0, level: 0 } },
        totalDurationSeconds: 0,
      },
      status: 'closed',
      phase: 'closed',
      phaseLabel: '查詢失敗',
      createdAt: '',
      mergedAt: null,
      reviewers: '',
      error: error.message || 'MR 查詢失敗',
    };
  }

  /**
   * 格式化審查者名稱列表
   * @param reviewers - 審查者 Actor 陣列
   * @returns 格式化的審查者字串（最多顯示 2 位，其他用 +N 表示）
   */
  private formatReviewers(reviewers: any[]): string {
    if (!reviewers || reviewers.length === 0) {
      return '-';
    }

    // 取得前兩位審查者的名稱
    const names = reviewers.slice(0, 2).map(r => r.name);

    // 如果超過兩位，添加 +N 標示
    if (reviewers.length > 2) {
      const remaining = reviewers.length - 2;
      return `${names.join(', ')} +${remaining}`;
    }

    return names.join(', ');
  }

  /**
   * 計算彙總統計
   *
   * 從所有 MR 比較資料行中計算總體統計數據，包括：
   * - 成功/失敗數量
   * - 程式碼變更統計（平均值、總和）
   * - 審查統計（評論數、審查密度）
   * - 時間軸統計（平均週期時間、各階段時間分布）
   * - AI Review × MR Type 交叉統計（如果提供 classifications）
   *
   * @param rows - MR 比較資料行列表
   * @param classifications - 可選的 MR 類型分類結果
   * @returns 批次比較彙總統計
   */
  private calculateSummary(rows: MRComparisonRow[], classifications?: MRClassification[]): BatchComparisonSummary {
    const validRows = rows.filter(row => !row.error);
    const totalCount = rows.length;
    const successCount = validRows.length;
    const failedCount = totalCount - successCount;

    if (successCount === 0) {
      return this.createEmptySummary(totalCount, failedCount);
    }

    // 計算總計
    const totalCommits = validRows.reduce((sum, row) => sum + row.codeChanges.commits, 0);
    const totalFiles = validRows.reduce((sum, row) => sum + row.codeChanges.files, 0);
    const totalLines = validRows.reduce((sum, row) => sum + row.codeChanges.totalLines, 0);
    const totalComments = validRows.reduce((sum, row) => sum + row.reviewStats.comments, 0);
    const totalCycleDays = validRows.reduce((sum, row) => sum + row.cycleDays, 0);

    // 計算平均值
    const avgCommits = this.round(totalCommits / successCount, 1);
    const avgFiles = this.round(totalFiles / successCount, 1);
    const avgLines = this.round(totalLines / successCount, 0);
    const avgComments = this.round(totalComments / successCount, 1);
    const avgCycleDays = this.round(totalCycleDays / successCount, 1);

    // 計算審查密度
    const reviewDensityPerKLoc = totalLines > 0 ? this.round((totalComments / totalLines) * 1000, 1) : 0;
    const reviewDensityPerFile = totalFiles > 0 ? this.round(totalComments / totalFiles, 2) : 0;

    // 計算時間軸統計
    const totalDevTime = validRows.reduce((sum, row) => sum + row.timeline.dev.durationSeconds, 0);
    const totalWaitTime = validRows.reduce((sum, row) => sum + row.timeline.wait.durationSeconds, 0);
    const totalReviewTime = validRows.reduce((sum, row) => sum + row.timeline.review.durationSeconds, 0);
    const totalMergeTime = validRows.reduce((sum, row) => sum + row.timeline.merge.durationSeconds, 0);

    const totalDevPercent = validRows.reduce((sum, row) => sum + row.timeline.dev.percentage, 0);
    const totalWaitPercent = validRows.reduce((sum, row) => sum + row.timeline.wait.percentage, 0);
    const totalReviewPercent = validRows.reduce((sum, row) => sum + row.timeline.review.percentage, 0);
    const totalMergePercent = validRows.reduce((sum, row) => sum + row.timeline.merge.percentage, 0);

    // 計算百分位數統計
    // 程式碼變更
    const commitsValues = validRows.map(row => row.codeChanges.commits);
    const filesValues = validRows.map(row => row.codeChanges.files);
    const linesValues = validRows.map(row => row.codeChanges.totalLines);
    const commentsValues = validRows.map(row => row.reviewStats.comments);

    // 時間軸
    const cycleDaysValues = validRows.map(row => row.cycleDays);
    const devTimeValues = validRows.map(row => row.timeline.dev.durationSeconds);
    const waitTimeValues = validRows.map(row => row.timeline.wait.durationSeconds);
    const reviewTimeValues = validRows.map(row => row.timeline.review.durationSeconds);
    const mergeTimeValues = validRows.map(row => row.timeline.merge.durationSeconds);

    // 程式碼變更百分位數
    const medianCommits = this.round(this.calculatePercentile(commitsValues, 50), 1);
    const medianFiles = this.round(this.calculatePercentile(filesValues, 50), 1);
    const medianLines = this.round(this.calculatePercentile(linesValues, 50), 0);
    const p90Commits = this.round(this.calculatePercentile(commitsValues, 90), 1);
    const p90Files = this.round(this.calculatePercentile(filesValues, 90), 1);
    const p90Lines = this.round(this.calculatePercentile(linesValues, 90), 0);

    // 審查統計百分位數
    const medianComments = this.round(this.calculatePercentile(commentsValues, 50), 1);
    const p90Comments = this.round(this.calculatePercentile(commentsValues, 90), 1);

    // P50 (中位數)
    const medianCycleDays = this.round(this.calculatePercentile(cycleDaysValues, 50), 1);
    const medianDevTime = this.round(this.calculatePercentile(devTimeValues, 50), 0);
    const medianWaitTime = this.round(this.calculatePercentile(waitTimeValues, 50), 0);
    const medianReviewTime = this.round(this.calculatePercentile(reviewTimeValues, 50), 0);
    const medianMergeTime = this.round(this.calculatePercentile(mergeTimeValues, 50), 0);

    // P75
    const p75CycleDays = this.round(this.calculatePercentile(cycleDaysValues, 75), 1);

    // P90
    const p90CycleDays = this.round(this.calculatePercentile(cycleDaysValues, 90), 1);
    const p90DevTime = this.round(this.calculatePercentile(devTimeValues, 90), 0);
    const p90WaitTime = this.round(this.calculatePercentile(waitTimeValues, 90), 0);
    const p90ReviewTime = this.round(this.calculatePercentile(reviewTimeValues, 90), 0);
    const p90MergeTime = this.round(this.calculatePercentile(mergeTimeValues, 90), 0);

    // P95
    const p95CycleDays = this.round(this.calculatePercentile(cycleDaysValues, 95), 1);

    // 計算 AI Review 分組統計
    const withAIRows = validRows.filter(row => row.reviewStats.hasAIReview);
    const withoutAIRows = validRows.filter(row => !row.reviewStats.hasAIReview);

    const aiReviewGroupStats = {
      withAI: {
        count: withAIRows.length,
        avgCycleDays: withAIRows.length > 0
          ? this.round(withAIRows.reduce((sum, row) => sum + row.cycleDays, 0) / withAIRows.length, 1)
          : 0,
        medianCycleDays: withAIRows.length > 0
          ? this.round(this.calculatePercentile(withAIRows.map(row => row.cycleDays), 50), 1)
          : 0,
        p90CycleDays: withAIRows.length > 0
          ? this.round(this.calculatePercentile(withAIRows.map(row => row.cycleDays), 90), 1)
          : 0,
        avgWaitSeconds: withAIRows.length > 0
          ? this.round(withAIRows.reduce((sum, row) => sum + row.timeline.wait.durationSeconds, 0) / withAIRows.length, 0)
          : 0,
        medianWaitSeconds: withAIRows.length > 0
          ? this.round(this.calculatePercentile(withAIRows.map(row => row.timeline.wait.durationSeconds), 50), 0)
          : 0,
        p90WaitSeconds: withAIRows.length > 0
          ? this.round(this.calculatePercentile(withAIRows.map(row => row.timeline.wait.durationSeconds), 90), 0)
          : 0,
      },
      withoutAI: {
        count: withoutAIRows.length,
        avgCycleDays: withoutAIRows.length > 0
          ? this.round(withoutAIRows.reduce((sum, row) => sum + row.cycleDays, 0) / withoutAIRows.length, 1)
          : 0,
        medianCycleDays: withoutAIRows.length > 0
          ? this.round(this.calculatePercentile(withoutAIRows.map(row => row.cycleDays), 50), 1)
          : 0,
        p90CycleDays: withoutAIRows.length > 0
          ? this.round(this.calculatePercentile(withoutAIRows.map(row => row.cycleDays), 90), 1)
          : 0,
        avgWaitSeconds: withoutAIRows.length > 0
          ? this.round(withoutAIRows.reduce((sum, row) => sum + row.timeline.wait.durationSeconds, 0) / withoutAIRows.length, 0)
          : 0,
        medianWaitSeconds: withoutAIRows.length > 0
          ? this.round(this.calculatePercentile(withoutAIRows.map(row => row.timeline.wait.durationSeconds), 50), 0)
          : 0,
        p90WaitSeconds: withoutAIRows.length > 0
          ? this.round(this.calculatePercentile(withoutAIRows.map(row => row.timeline.wait.durationSeconds), 90), 0)
          : 0,
      },
    };

    // 如果有提供 classifications，使用增強版 AI Review 統計
    const finalAIReviewGroupStats = classifications && classifications.length > 0
      ? this.generateAIReviewWithMRTypeStats(validRows, classifications)
      : aiReviewGroupStats;

    return {
      totalCount,
      successCount,
      failedCount,
      codeChanges: {
        avgCommits,
        avgFiles,
        avgLines,
        medianCommits,
        medianFiles,
        medianLines,
        p90Commits,
        p90Files,
        p90Lines,
        totalCommits,
        totalFiles,
        totalLines,
      },
      reviewStats: {
        avgComments,
        medianComments,
        p90Comments,
        totalComments,
        reviewDensityPerKLoc,
        reviewDensityPerFile,
      },
      timelineStats: {
        avgCycleDays,
        medianCycleDays,
        p75CycleDays,
        p90CycleDays,
        p95CycleDays,
        avgPhaseDurations: {
          dev: this.round(totalDevTime / successCount, 0),
          wait: this.round(totalWaitTime / successCount, 0),
          review: this.round(totalReviewTime / successCount, 0),
          merge: this.round(totalMergeTime / successCount, 0),
        },
        medianPhaseDurations: {
          dev: medianDevTime,
          wait: medianWaitTime,
          review: medianReviewTime,
          merge: medianMergeTime,
        },
        p90PhaseDurations: {
          dev: p90DevTime,
          wait: p90WaitTime,
          review: p90ReviewTime,
          merge: p90MergeTime,
        },
        avgPhasePercentages: {
          dev: this.round(totalDevPercent / successCount, 1),
          wait: this.round(totalWaitPercent / successCount, 1),
          review: this.round(totalReviewPercent / successCount, 1),
          merge: this.round(totalMergePercent / successCount, 1),
        },
      },
      aiReviewGroupStats: finalAIReviewGroupStats,
    };
  }

  /**
   * 應用過濾條件
   *
   * 根據提供的過濾條件篩選 MR 資料行，支援：
   * - 週期時間範圍過濾（minCycleDays, maxCycleDays）
   * - 作者過濾（模糊匹配）
   * - MR 狀態過濾（merged, open, closed, all）
   * - 日期範圍過濾（createdAt 區間）
   *
   * @param rows - MR 比較資料行列表
   * @param filter - 過濾條件（可選）
   * @returns { filtered: 過濾後的資料行列表, phaseFilterStats: 階段過濾統計（T016）, matchedPhaseFilters: 匹配的階段（T019）}
   */
  private applyFilter(
    rows: MRComparisonRow[],
    filter: BatchComparisonInput['filter']
  ): {
    filtered: MRComparisonRow[];
    phaseFilterStats?: PhaseFilterStats;
    matchedPhaseFilters?: Record<number, string[]>;
  } {
    if (!filter) {
      return { filtered: rows };
    }

    let filtered = rows;

    // 作者篩選
    if (filter.author) {
      const authorLower = filter.author.toLowerCase();
      filtered = filtered.filter(row =>
        row.author.toLowerCase().includes(authorLower)
      );
    }

    // 狀態篩選
    if (filter.status && filter.status !== 'all') {
      filtered = filtered.filter(row => {
        // 跳過錯誤行
        if (row.error) return true;

        return row.status === filter.status;
      });
    }

    // 週期時間篩選
    if (filter.minCycleDays !== undefined) {
      filtered = filtered.filter(row => row.cycleDays >= filter.minCycleDays!);
    }

    if (filter.maxCycleDays !== undefined) {
      filtered = filtered.filter(row => row.cycleDays <= filter.maxCycleDays!);
    }

    // 階段過濾 (Feature: 013-mr-phase-filters, T016 統計追蹤, T019 匹配追蹤)
    let phaseFilterStats: PhaseFilterStats | undefined;
    let matchedPhaseFilters: Record<number, string[]> | undefined;
    if (filter.phaseFilters) {
      const result = this.applyPhaseFilters(filtered, filter.phaseFilters);
      filtered = result.filtered;
      phaseFilterStats = result.stats;
      matchedPhaseFilters = result.matchedPhaseFilters;
    }

    return { filtered, phaseFilterStats, matchedPhaseFilters };
  }

  /**
   * 應用階段過濾條件 (Feature: 013-mr-phase-filters)
   *
   * **過濾邏輯（AND 運算）**:
   * - 所有定義的過濾條件使用 AND 邏輯組合
   * - MR 必須同時滿足所有定義的條件才會被保留
   * - 使用提前退出優化：第一個不匹配的條件立即返回 false
   *
   * **階段過濾條件**:
   * - 每個階段支援 4 種過濾器：percentMin, percentMax, daysMin, daysMax
   * - 百分比過濾器範圍：0-100（對應階段佔總週期的百分比）
   * - 天數過濾器範圍：≥0（支援小數，例如 0.5 天 = 12 小時）
   * - 同一階段的多個條件也使用 AND 邏輯（例如：devPercentMin=30 AND devDaysMax=2）
   *
   * **特殊處理**:
   * - 合併階段（merge）：僅適用於 status='merged' 的 MR
   * - Open/Closed MR 如果有 merge 過濾條件會被自動排除（錯誤鍵：'merge-open-mr'）
   * - 錯誤行（row.error）會跳過過濾，直接通過（避免影響錯誤診斷）
   *
   * **統計追蹤**:
   * - T016: 追蹤每個過濾條件排除的 MR 數量（用於零結果診斷）
   * - T019: 追蹤每個 MR 匹配的階段（用於表格視覺化標示）
   *
   * @param rows - MR 比較資料行列表
   * @param phaseFilters - 階段過濾配置（所有屬性皆為可選）
   * @returns 包含三個欄位的物件：
   *   - filtered: 過濾後的資料行列表
   *   - stats: 過濾統計資訊（包含 totalCount, filteredCount, excludedByFilter）
   *   - matchedPhaseFilters: 每個 MR 匹配的階段名稱（Record<mrIid, string[]>）
   *
   * @example
   * ```typescript
   * // 範例 1: 過濾出開發階段佔比 ≥30% 且審查階段 ≤2 天的 MR
   * const result = this.applyPhaseFilters(rows, {
   *   devPercentMin: 30,
   *   reviewDaysMax: 2.0
   * });
   * // result.filtered 包含同時滿足兩個條件的 MR（AND 邏輯）
   * // result.stats.excludedByFilter 顯示每個條件分別排除了多少 MR
   *
   * // 範例 2: 多條件組合（開發階段 30-50%，審查階段 1-3 天）
   * const result2 = this.applyPhaseFilters(rows, {
   *   devPercentMin: 30,
   *   devPercentMax: 50,
   *   reviewDaysMin: 1.0,
   *   reviewDaysMax: 3.0
   * });
   * // 四個條件全部滿足才會保留 MR
   * ```
   *
   * @private
   */
  private applyPhaseFilters(
    rows: MRComparisonRow[],
    phaseFilters: PhaseFilter
  ): {
    filtered: MRComparisonRow[];
    stats: PhaseFilterStats;
    matchedPhaseFilters: Record<number, string[]>;
  } {
    const stats: PhaseFilterStats = {
      totalCount: rows.length,
      filteredCount: 0,
      excludedByFilter: {},
    };

    // T019: 追蹤每個 MR 匹配的階段
    const matchedPhaseFilters: Record<number, string[]> = {};

    const phases: Array<'dev' | 'wait' | 'review' | 'merge'> = ['dev', 'wait', 'review', 'merge'];

    const filtered = rows.filter(row => {
      // 跳過錯誤行
      if (row.error) return true;

      // 記錄這個 MR 匹配的階段
      const matchedPhases: string[] = [];

      // 迴圈處理所有階段
      for (const phase of phases) {
        // 特殊處理：merge 階段僅適用於已合併的 MR
        if (phase === 'merge' && row.status !== 'merged') {
          // Open/Closed MRs 沒有 merge 階段資料
          // 如果有任何 merge 過濾條件，排除這些 MR
          if (this.hasMergeFilters(phaseFilters)) {
            stats.excludedByFilter['merge-open-mr'] = (stats.excludedByFilter['merge-open-mr'] || 0) + 1;
            return false;
          }
          continue;
        }

        // 統一過濾檢查
        if (!this.checkPhaseFilters(row, phase, phaseFilters, stats)) {
          return false;
        }

        // T019: 如果該階段有過濾條件且通過了，記錄此階段
        if (this.hasPhaseFilters(phase, phaseFilters)) {
          matchedPhases.push(phase);
        }
      }

      // T019: 通過所有過濾條件，記錄此 MR 匹配的階段
      if (matchedPhases.length > 0) {
        matchedPhaseFilters[row.iid] = matchedPhases;
      }
      return true;
    });

    stats.filteredCount = filtered.length;
    return { filtered, stats, matchedPhaseFilters };
  }

  /**
   * 檢查單一階段的過濾條件
   *
   * @param row MR 資料行
   * @param phase 階段名稱（dev/wait/review/merge）
   * @param filters 過濾條件
   * @param stats 統計物件（用於追蹤排除計數）
   * @returns 是否通過該階段的所有過濾條件
   * @private
   */
  private checkPhaseFilters(
    row: MRComparisonRow,
    phase: 'dev' | 'wait' | 'review' | 'merge',
    filters: PhaseFilter,
    stats: PhaseFilterStats
  ): boolean {
    const timeline = row.timeline[phase];

    const percentMin = filters[`${phase}PercentMin` as keyof PhaseFilter];
    const percentMax = filters[`${phase}PercentMax` as keyof PhaseFilter];
    const daysMin = filters[`${phase}DaysMin` as keyof PhaseFilter];
    const daysMax = filters[`${phase}DaysMax` as keyof PhaseFilter];

    if (percentMin !== undefined && timeline.percentage < percentMin) {
      stats.excludedByFilter[`${phase}-percent-min`] = (stats.excludedByFilter[`${phase}-percent-min`] || 0) + 1;
      return false;
    }
    if (percentMax !== undefined && timeline.percentage > percentMax) {
      stats.excludedByFilter[`${phase}-percent-max`] = (stats.excludedByFilter[`${phase}-percent-max`] || 0) + 1;
      return false;
    }
    if (daysMin !== undefined && timeline.durationSeconds / TIME_CONSTANTS.SECONDS_PER_DAY < daysMin) {
      stats.excludedByFilter[`${phase}-days-min`] = (stats.excludedByFilter[`${phase}-days-min`] || 0) + 1;
      return false;
    }
    if (daysMax !== undefined && timeline.durationSeconds / TIME_CONSTANTS.SECONDS_PER_DAY > daysMax) {
      stats.excludedByFilter[`${phase}-days-max`] = (stats.excludedByFilter[`${phase}-days-max`] || 0) + 1;
      return false;
    }

    return true;
  }

  /**
   * 檢查某階段是否有任何過濾條件
   *
   * @param phase 階段名稱（dev/wait/review/merge）
   * @param filters 過濾條件
   * @returns 是否有定義任何該階段的過濾條件
   * @private
   */
  private hasPhaseFilters(phase: string, filters: PhaseFilter): boolean {
    return filters[`${phase}PercentMin` as keyof PhaseFilter] !== undefined ||
           filters[`${phase}PercentMax` as keyof PhaseFilter] !== undefined ||
           filters[`${phase}DaysMin` as keyof PhaseFilter] !== undefined ||
           filters[`${phase}DaysMax` as keyof PhaseFilter] !== undefined;
  }

  /**
   * 檢查是否有任何 merge 階段的過濾條件
   *
   * @param filters 過濾條件
   * @returns 是否有定義任何 merge 階段的過濾條件
   * @private
   */
  private hasMergeFilters(filters: PhaseFilter): boolean {
    return this.hasPhaseFilters('merge', filters);
  }

  /**
   * 應用排序條件
   */
  private applySort(
    rows: MRComparisonRow[],
    sort: BatchComparisonInput['sort']
  ): MRComparisonRow[] {
    if (!sort) {
      return rows;
    }

    const { field, order } = sort;
    const multiplier = order === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {
      let valueA: number;
      let valueB: number;

      switch (field) {
        case 'cycleDays':
          valueA = a.cycleDays;
          valueB = b.cycleDays;
          break;
        case 'commits':
          valueA = a.codeChanges.commits;
          valueB = b.codeChanges.commits;
          break;
        case 'files':
          valueA = a.codeChanges.files;
          valueB = b.codeChanges.files;
          break;
        case 'lines':
          valueA = a.codeChanges.totalLines;
          valueB = b.codeChanges.totalLines;
          break;
        case 'comments':
          valueA = a.reviewStats.comments;
          valueB = b.reviewStats.comments;
          break;
        case 'devTime':
          valueA = a.timeline.dev.durationSeconds;
          valueB = b.timeline.dev.durationSeconds;
          break;
        case 'waitTime':
          valueA = a.timeline.wait.durationSeconds;
          valueB = b.timeline.wait.durationSeconds;
          break;
        case 'reviewTime':
          valueA = a.timeline.review.durationSeconds;
          valueB = b.timeline.review.durationSeconds;
          break;
        case 'mergeTime':
          valueA = a.timeline.merge.durationSeconds;
          valueB = b.timeline.merge.durationSeconds;
          break;
        case 'createdAt':
          valueA = new Date(a.createdAt).getTime();
          valueB = new Date(b.createdAt).getTime();
          break;
        case 'mergedAt':
          // 未合併的 MR 排在最後
          valueA = a.mergedAt ? new Date(a.mergedAt).getTime() : Number.MAX_SAFE_INTEGER;
          valueB = b.mergedAt ? new Date(b.mergedAt).getTime() : Number.MAX_SAFE_INTEGER;
          break;
        default:
          return 0;
      }

      return (valueA - valueB) * multiplier;
    });
  }

  /**
   * 建立空的彙總統計
   */
  private createEmptySummary(totalCount: number, failedCount: number): BatchComparisonSummary {
    return {
      totalCount,
      successCount: 0,
      failedCount,
      codeChanges: {
        avgCommits: 0,
        avgFiles: 0,
        avgLines: 0,
        medianCommits: 0,
        medianFiles: 0,
        medianLines: 0,
        p90Commits: 0,
        p90Files: 0,
        p90Lines: 0,
        totalCommits: 0,
        totalFiles: 0,
        totalLines: 0,
      },
      reviewStats: {
        avgComments: 0,
        medianComments: 0,
        p90Comments: 0,
        totalComments: 0,
        reviewDensityPerKLoc: 0,
        reviewDensityPerFile: 0,
      },
      timelineStats: {
        avgCycleDays: 0,
        medianCycleDays: 0,
        p75CycleDays: 0,
        p90CycleDays: 0,
        p95CycleDays: 0,
        avgPhaseDurations: { dev: 0, wait: 0, review: 0, merge: 0 },
        medianPhaseDurations: { dev: 0, wait: 0, review: 0, merge: 0 },
        p90PhaseDurations: { dev: 0, wait: 0, review: 0, merge: 0 },
        avgPhasePercentages: { dev: 0, wait: 0, review: 0, merge: 0 },
      },
      aiReviewGroupStats: {
        withAI: {
          count: 0,
          avgCycleDays: 0,
          medianCycleDays: 0,
          p90CycleDays: 0,
          avgWaitSeconds: 0,
          medianWaitSeconds: 0,
          p90WaitSeconds: 0,
        },
        withoutAI: {
          count: 0,
          avgCycleDays: 0,
          medianCycleDays: 0,
          p90CycleDays: 0,
          avgWaitSeconds: 0,
          medianWaitSeconds: 0,
          p90WaitSeconds: 0,
        },
      },
    };
  }

  /**
   * 查詢 MR 的 Diff 版本數（基於 GitLab versions API）
   *
   * @param projectId - 專案 ID
   * @param mrIid - MR IID
   * @returns Diff 版本數（versions - 1），失敗時返回 undefined
   * @remarks 此指標與業界 "Review Cycles" 定義不同，僅供內部分析使用
   */
  private async fetchDiffVersions(projectId: string, mrIid: number): Promise<number | undefined> {
    try {
      // 從 gitlabClient.url 提取 host（移除 /api/v4/ 後綴）
      const apiUrl = (this.gitlabClient as any).url || 'https://gitlab.com/api/v4/';
      const host = apiUrl.replace(/\/api\/v4\/?$/, '');

      // 從環境變數取得 token
      const token = process.env.GITLAB_TOKEN ||
                    process.env.GITLAB_PERSONAL_ACCESS_TOKEN;

      if (!token) {
        return undefined;
      }

      const encodedProjectId = encodeURIComponent(projectId);
      const url = `${host}/api/v4/projects/${encodedProjectId}/merge_requests/${mrIid}/versions`;

      const response = await fetch(url, {
        headers: {
          'PRIVATE-TOKEN': token
        }
      });

      if (!response.ok) {
        return undefined;
      }

      const versions = await response.json();

      // versions 是一個陣列，輪數 = 版本數 - 1（第一版不算修正）
      if (Array.isArray(versions) && versions.length > 0) {
        return Math.max(0, versions.length - 1);
      }

      return 0; // 沒有版本記錄，視為 0 輪
    } catch (error) {
      // API 呼叫失敗時返回 undefined（不影響其他資料）
      return undefined;
    }
  }

  /**
   * 獲取 MR 的 Review Rounds 詳細分析
   *
   * @remarks
   * 此方法查詢 GitLab API 取得 MR 的所有版本（diff versions），
   * 並計算每輪審查的時間間隔、識別最慢輪次、計算平均間隔等統計資訊。
   *
   * **工作原理**:
   * 1. 從 GitLab API 獲取 MR 的所有版本（versions）
   * 2. 按時間排序版本（最舊到最新）
   * 3. 計算每輪之間的時間間隔（版本差異）
   * 4. 識別最慢的審查輪次（間隔最長）
   * 5. 計算平均審查間隔時間
   *
   * **輪數定義**: 總輪數 = 版本數量 - 1（第一個版本不算輪次）
   *
   * Feature: Review Rounds Detail (Phase 2)
   *
   * @param projectId - GitLab 專案 ID 或路徑（例如 "group/project" 或數字 ID）
   * @param mrIid - MR IID（內部 ID，顯示在 MR URL 中的數字，例如 !123 的 123）
   * @param title - MR 標題（用於結果顯示和錯誤診斷）
   * @param gitlabHost - GitLab 主機 URL（用於構建 MR 連結，例如 "https://gitlab.com" 或 "https://gitlab.example.com"）
   * @returns MR 輪數詳細信息，包含總輪數、最慢輪次、平均間隔等；API 失敗時返回 undefined
   *
   * @example
   * ```typescript
   * // 範例 1: 基本使用
   * const detail = await service.fetchRoundsDetail(
   *   'example/mobile-app',
   *   123,
   *   'feat: Add user authentication',
   *   'https://gitlab.com'
   * );
   *
   * if (detail) {
   *   console.log(`Total rounds: ${detail.totalRounds}`);
   *   console.log(`Slowest round: #${detail.slowestRound}`);
   *   console.log(`Average interval: ${detail.formattedAvgInterval}`);
   * }
   *
   * // 範例 2: 處理失敗情況
   * const detail = await service.fetchRoundsDetail(...);
   * if (!detail) {
   *   console.log('無法獲取輪數詳情（可能是權限不足或 API 錯誤）');
   * }
   * ```
   *
   * @public
   */
  async fetchRoundsDetail(
    projectId: string,
    mrIid: number,
    title: string,
    gitlabHost: string
  ): Promise<MRRoundsDetail | undefined> {
    try {
      // 從 gitlabClient.url 提取 host（移除 /api/v4/ 後綴）
      const apiUrl = (this.gitlabClient as any).url || 'https://gitlab.com/api/v4/';
      const host = apiUrl.replace(/\/api\/v4\/?$/, '');

      // 從環境變數取得 token
      const token = process.env.GITLAB_TOKEN ||
                    process.env.GITLAB_PERSONAL_ACCESS_TOKEN;

      if (!token) {
        return undefined;
      }

      const encodedProjectId = encodeURIComponent(projectId);
      const url = `${host}/api/v4/projects/${encodedProjectId}/merge_requests/${mrIid}/versions`;

      const response = await fetch(url, {
        headers: {
          'PRIVATE-TOKEN': token
        }
      });

      if (!response.ok) {
        return undefined;
      }

      const versionsData = await response.json();
      const versions = versionsData as MRVersion[];

      if (!Array.isArray(versions) || versions.length === 0) {
        return undefined;
      }

      // 按時間排序（最舊到最新）
      versions.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // 計算每輪的時間間隔
      const rounds: MRRound[] = [];
      let totalInterval = 0;

      for (let i = 0; i < versions.length; i++) {
        const version = versions[i]!; // Safe: i < versions.length
        const createdAt = new Date(version.created_at);

        let intervalSeconds = 0;
        if (i > 0) {
          const prevVersion = versions[i - 1]!; // Safe: i > 0
          const prevCreatedAt = new Date(prevVersion.created_at);
          intervalSeconds = Math.floor((createdAt.getTime() - prevCreatedAt.getTime()) / 1000);
          totalInterval += intervalSeconds;
        }

        rounds.push({
          roundNumber: i,
          createdAt: version.created_at,
          intervalSeconds,
          formattedInterval: i === 0 ? '初始版本' : this.formatDuration(intervalSeconds),
          isSlow: false, // 稍後更新
        });
      }

      // 計算平均間隔（排除第一個版本）
      const avgIntervalSeconds = rounds.length > 1
        ? Math.floor(totalInterval / (rounds.length - 1))
        : 0;

      // 識別慢速輪次（超過平均值 2 倍）
      const slowThreshold = avgIntervalSeconds * 2;
      rounds.forEach((round, idx) => {
        if (idx > 0 && round.intervalSeconds > slowThreshold && round.intervalSeconds > TIME_CONSTANTS.SECONDS_PER_DAY) {
          round.isSlow = true;
        }
      });

      // 找出最慢的輪次
      let slowestRound: number | undefined;
      let maxInterval = 0;
      rounds.forEach(round => {
        if (round.roundNumber > 0 && round.intervalSeconds > maxInterval) {
          maxInterval = round.intervalSeconds;
          slowestRound = round.roundNumber;
        }
      });

      // 構建 webUrl
      const cleanHost = gitlabHost.replace(/\/$/, '');
      const webUrl = `${cleanHost}/${projectId}/-/merge_requests/${mrIid}`;

      return {
        mrIid,
        title,
        webUrl,
        totalRounds: Math.max(0, versions.length - 1),
        rounds,
        slowestRound,
        avgIntervalSeconds,
        formattedAvgInterval: avgIntervalSeconds > 0 ? this.formatDuration(avgIntervalSeconds) : 'N/A',
      };
    } catch (error) {
      // API 呼叫失敗時返回 undefined
      return undefined;
    }
  }

  /**
   * 取得快取的時間軸資料
   * Feature: MR Type Classification (2025-11-15)
   *
   * @param mrIids - MR IID 列表（如果不提供，返回所有快取的時間軸）
   * @returns 時間軸資料陣列
   */
  public getCachedTimelines(mrIids?: number[]): MRTimeline[] {
    if (mrIids) {
      return mrIids
        .map(iid => this.cachedTimelines.get(iid))
        .filter((t): t is MRTimeline => t !== undefined);
    }
    return Array.from(this.cachedTimelines.values());
  }

  /**
   * 清除快取的時間軸資料
   * Feature: MR Type Classification (2025-11-15)
   */
  public clearCachedTimelines(): void {
    this.cachedTimelines.clear();
  }

  /**
   * 檢測 MR 類型
   * Feature: MR Type Classification (2025-11-15)
   *
   * @param timelineData - MR 時間軸數據
   * @param thresholdHours - Active Development MR 的閾值（小時），預設 2
   * @returns MR 分類結果
   */
  public detectMRType(
    timelineData: MRTimeline,
    thresholdHours: number = 2
  ): MRClassification {
    const { mr, events } = timelineData;
    const mrCreatedTime = new Date(mr.createdAt).getTime();

    // 找出 First Review 時間
    const firstReview = events.find(e =>
      e.eventType === EventType.AI_REVIEW_STARTED ||
      e.eventType === EventType.HUMAN_REVIEW_STARTED
    );

    if (!firstReview) {
      // 無 Review 事件，預設為 Standard
      return {
        iid: mr.id,
        mrType: MRType.STANDARD,
        reason: 'No review event found',
        waitTime: {
          totalPickupTime: 0,
          reviewResponseTime: 0,
          waitStartPoint: 'MR Created'
        }
      };
    }

    const firstReviewTime = new Date(firstReview.timestamp).getTime();

    // ========== 判斷 1: 是否為 Draft MR？ ==========
    // 找「Marked as Ready」事件（在 First Review 之前，且距離 MR Created > 1 小時）
    const readyEvent = events.find(e =>
      e.eventType === EventType.MARKED_AS_READY &&
      new Date(e.timestamp).getTime() < firstReviewTime &&
      new Date(e.timestamp).getTime() > mrCreatedTime + 60 * 60 * 1000 // 1 小時
    );

    if (readyEvent) {
      const readyTime = new Date(readyEvent.timestamp).getTime();
      const draftDuration = (readyTime - mrCreatedTime) / 1000; // 秒
      const reviewResponseTime = (firstReviewTime - readyTime) / 1000; // 秒
      const totalPickupTime = (firstReviewTime - mrCreatedTime) / 1000; // 秒

      return {
        iid: mr.id,
        mrType: MRType.DRAFT,
        reason: `Has Marked as Ready event ${(draftDuration / 3600).toFixed(1)}h after MR Created`,
        draftDuration,
        waitTime: {
          totalPickupTime,
          reviewResponseTime,
          waitStartPoint: 'Marked as Ready'
        }
      };
    }

    // ========== 判斷 2: 是否為 Active Development MR？ ==========
    // 找 Last Commit（在 First Review 之前）
    const commits = events.filter(e =>
      (e.eventType === EventType.CODE_COMMITTED || e.eventType === EventType.COMMIT_PUSHED) &&
      new Date(e.timestamp).getTime() < firstReviewTime
    );

    if (commits.length > 0) {
      const lastCommit = commits[commits.length - 1]!;
      const lastCommitTime = new Date(lastCommit.timestamp).getTime();
      const timeSinceCreatedHours = (lastCommitTime - mrCreatedTime) / 1000 / 60 / 60;

      if (timeSinceCreatedHours > thresholdHours) {
        const devDuration = (lastCommitTime - mrCreatedTime) / 1000; // 秒
        const reviewResponseTime = (firstReviewTime - lastCommitTime) / 1000; // 秒
        const totalPickupTime = (firstReviewTime - mrCreatedTime) / 1000; // 秒

        return {
          iid: mr.id,
          mrType: MRType.ACTIVE_DEVELOPMENT,
          reason: `Last Commit ${timeSinceCreatedHours.toFixed(1)}h after MR Created (threshold: ${thresholdHours}h)`,
          devDuration,
          waitTime: {
            totalPickupTime,
            reviewResponseTime,
            waitStartPoint: 'Last Commit'
          }
        };
      }
    }

    // ========== 判斷 3: Standard MR（預設） ==========
    const waitTime = (firstReviewTime - mrCreatedTime) / 1000; // 秒

    return {
      iid: mr.id,
      mrType: MRType.STANDARD,
      reason: 'Normal flow',
      waitTime: {
        totalPickupTime: waitTime,
        reviewResponseTime: waitTime,
        waitStartPoint: 'MR Created'
      }
    };
  }

  /**
   * 生成 MR 類型統計
   * Feature: MR Type Classification (2025-11-15)
   *
   * @param classifications - 所有 MR 的分類結果
   * @returns 按類型分組的統計
   */
  public generateMRTypeStats(
    classifications: MRClassification[]
  ): MRTypeStatsSummary {
    const totalCount = classifications.length;

    // 按類型分組
    const byType: Record<MRType, MRClassification[]> = {
      [MRType.STANDARD]: [],
      [MRType.DRAFT]: [],
      [MRType.ACTIVE_DEVELOPMENT]: []
    };

    classifications.forEach(c => {
      byType[c.mrType].push(c);
    });

    // 計算統計
    const stats: Partial<MRTypeStatsSummary> = {};

    for (const [type, items] of Object.entries(byType) as [MRType, MRClassification[]][]) {
      if (items.length === 0) {
        continue;
      }

      // Review Response Time 統計
      const reviewResponseTimes = items
        .map(i => i.waitTime.reviewResponseTime)
        .filter(t => t !== null && t !== undefined)
        .sort((a, b) => a - b);

      const reviewResponseTimeStats = this.calculatePercentiles(reviewResponseTimes);

      // 基本統計
      const typeStats: MRTypeStats = {
        count: items.length,
        percentage: (items.length / totalCount) * 100,
        reviewResponseTime: reviewResponseTimeStats
      };

      // Draft MR 額外統計
      if (type === MRType.DRAFT) {
        const draftDurations = items
          .map(i => i.draftDuration)
          .filter(d => d !== null && d !== undefined) as number[];

        if (draftDurations.length > 0) {
          typeStats.draftDuration = {
            avg: draftDurations.reduce((a, b) => a + b, 0) / draftDurations.length
          };
        }
      }

      // Active Development MR 額外統計
      if (type === MRType.ACTIVE_DEVELOPMENT) {
        const totalPickupTimes = items
          .map(i => i.waitTime.totalPickupTime)
          .filter(t => t !== null && t !== undefined)
          .sort((a, b) => a - b);

        const pickupStats = this.calculatePercentiles(totalPickupTimes);

        typeStats.totalPickupTime = {
          p50: pickupStats.p50,
          p75: pickupStats.p75,
          p90: pickupStats.p90,
          avg: pickupStats.avg
        };
      }

      stats[type] = typeStats;
    }

    return stats as MRTypeStatsSummary;
  }

  /**
   * 計算百分位數統計（內部輔助方法）
   * Feature: MR Type Classification (2025-11-15)
   *
   * @param values - 已排序的數值陣列
   * @returns 統計結果
   */
  private calculatePercentiles(values: number[]): {
    p50: number;
    p75: number;
    p90: number;
    avg: number;
    min: number;
    max: number;
  } {
    if (values.length === 0) {
      return { p50: 0, p75: 0, p90: 0, avg: 0, min: 0, max: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
    const p75 = sorted[Math.floor(sorted.length * 0.75)]!;
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const min = sorted[0]!;
    const max = sorted[sorted.length - 1]!;

    return { p50, p75, p90, avg, min, max };
  }

  /**
   * 生成 AI Review 分組 × MR 類型交叉統計
   *
   * @param rows - MR 比較資料列
   * @param classifications - MR 類型分類結果
   * @returns AI Review 分組統計（包含程式碼變更、審查統計、MR 類型細分）
   */
  private generateAIReviewWithMRTypeStats(
    rows: MRComparisonRow[],
    classifications: MRClassification[]
  ) {
    // 建立 iid → classification 的 Map
    const classificationMap = new Map(
      classifications.map(c => [c.iid, c])
    );

    // 按 AI Review 狀態分組
    const withAIRows = rows.filter(row => row.reviewStats.hasAIReview);
    const withoutAIRows = rows.filter(row => !row.reviewStats.hasAIReview);

    // 輔助函數：計算分組統計
    const calculateGroupStats = (groupRows: MRComparisonRow[]) => {
      if (groupRows.length === 0) {
        return {
          count: 0,
          overallTimeStats: {
            dev: { p50: 0, p75: 0, p90: 0, avg: 0 },
            wait: { p50: 0, p75: 0, p90: 0, avg: 0 },
            review: { p50: 0, p75: 0, p90: 0, avg: 0 },
            merge: { p50: 0, p75: 0, p90: 0, avg: 0 },
            leadReview: { p50: 0, p75: 0, p90: 0, avg: 0 },
            cycle: { p50: 0, p75: 0, p90: 0, avg: 0 }
          },
          codeChanges: {
            commits: { p50: 0, p75: 0, p90: 0, avg: 0 },
            files: { p50: 0, p75: 0, p90: 0, avg: 0 },
            lines: { p50: 0, p75: 0, p90: 0, avg: 0 }
          },
          reviewStats: {
            comments: { p50: 0, p75: 0, p90: 0, avg: 0 },
            diffVersions: { p50: 0, p75: 0, p90: 0, avg: 0 }
          },
          byMRType: {}
        };
      }

      // 計算整體時間統計
      const devTimes = groupRows.map(r => r.timeline.dev.durationSeconds);
      const waitTimes = groupRows.map(r => r.timeline.wait.durationSeconds);
      const reviewTimes = groupRows.map(r => r.timeline.review.durationSeconds);
      const mergeTimes = groupRows.map(r => r.timeline.merge.durationSeconds);
      const leadReviewTimes = groupRows.map(r =>
        r.timeline.wait.durationSeconds + r.timeline.review.durationSeconds
      );
      const cycleTimes = groupRows.map(r => r.timeline.totalDurationSeconds);

      const overallTimeStats = {
        dev: this.calculatePercentiles(devTimes),
        wait: this.calculatePercentiles(waitTimes),
        review: this.calculatePercentiles(reviewTimes),
        merge: this.calculatePercentiles(mergeTimes),
        leadReview: this.calculatePercentiles(leadReviewTimes),
        cycle: this.calculatePercentiles(cycleTimes)
      };

      // 計算程式碼變更統計
      const commits = groupRows.map(r => r.codeChanges.commits);
      const files = groupRows.map(r => r.codeChanges.files);
      const lines = groupRows.map(r => r.codeChanges.totalLines);
      const comments = groupRows.map(r => r.reviewStats.comments);
      const diffVersions = groupRows
        .map(r => r.reviewStats.diffVersions)
        .filter((v): v is number => v !== undefined);

      const commitsStats = this.calculatePercentiles(commits);
      const filesStats = this.calculatePercentiles(files);
      const linesStats = this.calculatePercentiles(lines);
      const commentsStats = this.calculatePercentiles(comments);
      const diffVersionsStats = this.calculatePercentiles(diffVersions);

      // 按 MR 類型細分
      const byMRType: Record<string, any> = {};

      // 分組統計各類型
      const typeGroups = {
        'Standard': groupRows.filter(r => classificationMap.get(r.iid)?.mrType === 'Standard'),
        'Draft': groupRows.filter(r => classificationMap.get(r.iid)?.mrType === 'Draft'),
        'Active Development': groupRows.filter(r => classificationMap.get(r.iid)?.mrType === 'Active Development')
      };

      for (const [mrType, typeRows] of Object.entries(typeGroups)) {
        if (typeRows.length === 0) continue;

        const percentage = (typeRows.length / groupRows.length) * 100;

        // 收集時間指標
        const devTimes = typeRows.map(r => r.timeline.dev.durationSeconds);
        const waitTimes = typeRows.map(r => r.timeline.wait.durationSeconds);
        const reviewTimes = typeRows.map(r => r.timeline.review.durationSeconds);
        const mergeTimes = typeRows.map(r => r.timeline.merge.durationSeconds);
        const leadReviewTimes = typeRows.map(r =>
          r.timeline.wait.durationSeconds + r.timeline.review.durationSeconds
        );
        const cycleTimes = typeRows.map(r => r.timeline.totalDurationSeconds);

        const devStats = this.calculatePercentiles(devTimes);
        const waitStats = this.calculatePercentiles(waitTimes);
        const reviewStats = this.calculatePercentiles(reviewTimes);
        const mergeStats = this.calculatePercentiles(mergeTimes);
        const leadReviewStats = this.calculatePercentiles(leadReviewTimes);
        const cycleStats = this.calculatePercentiles(cycleTimes);

        // 收集 Review Response Time
        const reviewResponseTimes = typeRows
          .map(r => classificationMap.get(r.iid)?.waitTime?.reviewResponseTime)
          .filter((time): time is number => time !== undefined);

        const reviewResponseStats = reviewResponseTimes.length > 0
          ? this.calculatePercentiles(reviewResponseTimes)
          : { p50: 0, p75: 0, p90: 0, avg: 0, min: 0, max: 0 };

        // 收集程式碼變更統計
        const typeCommits = typeRows.map(r => r.codeChanges.commits);
        const typeFiles = typeRows.map(r => r.codeChanges.files);
        const typeLines = typeRows.map(r => r.codeChanges.totalLines);

        const typeCommitsStats = this.calculatePercentiles(typeCommits);
        const typeFilesStats = this.calculatePercentiles(typeFiles);
        const typeLinesStats = this.calculatePercentiles(typeLines);

        // 收集詳細審查統計（human/AI/author breakdown）
        const totalComments = typeRows.map(r => r.reviewStats.comments);
        const humanReviews = typeRows.map(r => r.reviewStats.commentBreakdown?.humanReviewComments || 0);
        const aiReviews = typeRows.map(r => r.reviewStats.commentBreakdown?.aiComments || 0);
        const authorResponses = typeRows.map(r => r.reviewStats.commentBreakdown?.authorResponses || 0);
        const typeDiffVersions = typeRows
          .map(r => r.reviewStats.diffVersions)
          .filter((v): v is number => v !== undefined);

        const totalCommentsStats = this.calculatePercentiles(totalComments);
        const humanReviewsStats = this.calculatePercentiles(humanReviews);
        const aiReviewsStats = this.calculatePercentiles(aiReviews);
        const authorResponsesStats = this.calculatePercentiles(authorResponses);
        const typeDiffVersionsStats = this.calculatePercentiles(typeDiffVersions);

        byMRType[mrType] = {
          count: typeRows.length,
          percentage,
          mrIds: typeRows.map(r => r.iid).sort((a, b) => b - a), // 收集 MR IDs，降序排列
          codeChanges: {
            commits: { p50: typeCommitsStats.p50, p75: typeCommitsStats.p75, p90: typeCommitsStats.p90, avg: typeCommitsStats.avg },
            files: { p50: typeFilesStats.p50, p75: typeFilesStats.p75, p90: typeFilesStats.p90, avg: typeFilesStats.avg },
            lines: { p50: typeLinesStats.p50, p75: typeLinesStats.p75, p90: typeLinesStats.p90, avg: typeLinesStats.avg }
          },
          reviewStats: {
            totalComments: { p50: totalCommentsStats.p50, p75: totalCommentsStats.p75, p90: totalCommentsStats.p90, avg: totalCommentsStats.avg },
            humanReviews: { p50: humanReviewsStats.p50, p75: humanReviewsStats.p75, p90: humanReviewsStats.p90, avg: humanReviewsStats.avg },
            aiReviews: { p50: aiReviewsStats.p50, p75: aiReviewsStats.p75, p90: aiReviewsStats.p90, avg: aiReviewsStats.avg },
            authorResponses: { p50: authorResponsesStats.p50, p75: authorResponsesStats.p75, p90: authorResponsesStats.p90, avg: authorResponsesStats.avg },
            diffVersions: { p50: typeDiffVersionsStats.p50, p75: typeDiffVersionsStats.p75, p90: typeDiffVersionsStats.p90, avg: typeDiffVersionsStats.avg }
          },
          timeMetrics: {
            dev: { p50: devStats.p50, p75: devStats.p75, p90: devStats.p90, avg: devStats.avg },
            wait: { p50: waitStats.p50, p75: waitStats.p75, p90: waitStats.p90, avg: waitStats.avg },
            review: { p50: reviewStats.p50, p75: reviewStats.p75, p90: reviewStats.p90, avg: reviewStats.avg },
            merge: { p50: mergeStats.p50, p75: mergeStats.p75, p90: mergeStats.p90, avg: mergeStats.avg },
            leadReview: { p50: leadReviewStats.p50, p75: leadReviewStats.p75, p90: leadReviewStats.p90, avg: leadReviewStats.avg },
            cycle: { p50: cycleStats.p50, p75: cycleStats.p75, p90: cycleStats.p90, avg: cycleStats.avg }
          },
          reviewResponseTime: {
            p50: reviewResponseStats.p50,
            p75: reviewResponseStats.p75,
            p90: reviewResponseStats.p90,
            avg: reviewResponseStats.avg
          }
        };

        // Draft MRs: 加入 Draft Duration
        if (mrType === 'Draft') {
          const draftDurations = typeRows
            .map(r => classificationMap.get(r.iid)?.draftDuration)
            .filter((dur): dur is number => dur !== undefined);

          if (draftDurations.length > 0) {
            const draftStats = this.calculatePercentiles(draftDurations);
            byMRType[mrType].draftDuration = {
              p50: draftStats.p50,
              p75: draftStats.p75,
              p90: draftStats.p90,
              avg: draftStats.avg
            };
          }
        }

        // Active Development MRs: 加入 Dev Duration
        if (mrType === 'Active Development') {
          const devDurations = typeRows
            .map(r => classificationMap.get(r.iid)?.devDuration)
            .filter((dur): dur is number => dur !== undefined);

          if (devDurations.length > 0) {
            const devDurStats = this.calculatePercentiles(devDurations);
            byMRType[mrType].devDuration = {
              p50: devDurStats.p50,
              p75: devDurStats.p75,
              p90: devDurStats.p90,
              avg: devDurStats.avg
            };
          }
        }
      }

      return {
        count: groupRows.length,
        overallTimeStats,
        codeChanges: {
          commits: { p50: commitsStats.p50, p75: commitsStats.p75, p90: commitsStats.p90, avg: commitsStats.avg },
          files: { p50: filesStats.p50, p75: filesStats.p75, p90: filesStats.p90, avg: filesStats.avg },
          lines: { p50: linesStats.p50, p75: linesStats.p75, p90: linesStats.p90, avg: linesStats.avg }
        },
        reviewStats: {
          comments: { p50: commentsStats.p50, p75: commentsStats.p75, p90: commentsStats.p90, avg: commentsStats.avg },
          diffVersions: { p50: diffVersionsStats.p50, p75: diffVersionsStats.p75, p90: diffVersionsStats.p90, avg: diffVersionsStats.avg }
        },
        byMRType
      };
    };

    return {
      withAI: calculateGroupStats(withAIRows),
      withoutAI: calculateGroupStats(withoutAIRows)
    };
  }

  /**
   * 四捨五入
   */
  /**
   * 計算百分位數
   *
   * @param values - 數值陣列
   * @param percentile - 百分位數（0-100）
   * @returns 指定百分位數的值（如果陣列為空則返回 0）
   *
   * 使用線性插值法（Linear Interpolation）計算百分位數：
   * - P50 = 中位數
   * - P75 = 75% 的值小於等於此值
   * - P90 = 90% 的值小於等於此值
   * - P95 = 95% 的值小於等於此值
   * - P99 = 99% 的值小於等於此值
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    if (percentile < 0 || percentile > 100) {
      throw new Error('Percentile must be between 0 and 100');
    }

    const sorted = [...values].sort((a, b) => a - b);

    // 特殊情況：只有一個值
    if (sorted.length === 1) return sorted[0]!;

    // 計算位置（使用 (n-1) * p/100 公式，常見於統計軟體）
    const position = ((sorted.length - 1) * percentile) / 100;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);

    // 如果剛好在整數位置，直接返回
    if (lowerIndex === upperIndex) {
      return sorted[lowerIndex]!;
    }

    // 線性插值
    const lowerValue = sorted[lowerIndex]!;
    const upperValue = sorted[upperIndex]!;
    const fraction = position - lowerIndex;

    return lowerValue + (upperValue - lowerValue) * fraction;
  }

  private round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
