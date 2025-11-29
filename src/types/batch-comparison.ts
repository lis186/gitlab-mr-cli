/**
 * 批次比較功能的型別定義
 * Feature: 011-mr-batch-comparison
 */

/**
 * 批次比較服務的輸入參數
 */
export interface BatchComparisonInput {
  /** GitLab 專案 ID 或路徑（例如 "group/project"） */
  projectId: string;

  /** 要比較的 MR IID 列表 */
  mrIids: number[];

  /** 過濾條件（可選） */
  filter?: {
    /** 作者篩選（例如 "Mike"） */
    author?: string;

    /** MR 狀態篩選 */
    status?: 'merged' | 'open' | 'closed' | 'all';

    /** 週期時間下限（天數） */
    minCycleDays?: number;

    /** 週期時間上限（天數） */
    maxCycleDays?: number;

    /** 日期範圍篩選 */
    dateRange?: {
      /** 開始日期（ISO 8601，格式：YYYY-MM-DD，UTC 時區） */
      since?: string;

      /** 結束日期（ISO 8601，格式：YYYY-MM-DD，UTC 時區） */
      until?: string;
    };

    /** 階段過濾條件 (Feature: 013-mr-phase-filters) */
    phaseFilters?: PhaseFilter;
  };

  /** 排序條件（可選） */
  sort?: {
    /** 排序欄位 */
    field: 'cycleDays' | 'commits' | 'files' | 'lines' | 'comments' |
           'devTime' | 'waitTime' | 'reviewTime' | 'mergeTime' |
           'createdAt' | 'mergedAt';

    /** 排序方向 */
    order: 'asc' | 'desc';
  };

  /** 限制結果數量（預設 100，建議不超過 200） */
  limit?: number;

  /** 是否包含詳細事件列表（預設 false，設為 true 會增加輸出大小） */
  includeEvents?: boolean;

  /**
   * 是否包含合併後的 AI Review（預設 false）
   *
   * - false（預設）：只計算合併前的 AI Review（符合 MR 流程指標定義）
   * - true：包含合併後的 AI Review（用於完整追蹤 AI Review 參與度）
   *
   * 注意：合併後的 Review 對 MR 流程指標（Wait Time, Review Time 等）無實際影響
   */
  includePostMergeReviews?: boolean;
}

/**
 * MR 當前所處階段
 */
export type MRPhase =
  | 'merged'           // 已合併
  | 'ready-to-merge'   // 等待合併（已批准）
  | 'in-review'        // 審核中
  | 'waiting-review'   // 等待審核
  | 'in-development'   // 開發中
  | 'closed';          // 已關閉

/**
 * 單一 MR 在比較表格中的資料行
 */
export interface MRComparisonRow {
  /** MR 編號（IID） */
  iid: number;

  /** MR 標題（截短至 50 字） */
  title: string;

  /** 作者名稱 */
  author: string;

  /** 審查者名稱列表（逗號分隔，最多顯示 2 位） */
  reviewers: string;

  /** 週期時間（天數，保留 1 位小數） */
  cycleDays: number;

  /** 程式碼變更統計 */
  codeChanges: {
    /** 提交數 */
    commits: number;

    /** 變更檔案數 */
    files: number;

    /** 總變更行數（新增 + 刪除） */
    totalLines: number;
  };

  /** 審查統計 */
  reviewStats: {
    /** 評論數（不含 AI Bot，包含 human review + author responses，為了向後相容保留） */
    comments: number;

    /** MR Diff 版本數（GitLab versions API），計算方式：版本總數 - 1，0 表示無修正直接合併
     * 注意：此欄位與業界 "Review Cycles" 定義不同，僅供內部分析使用 */
    diffVersions?: number;

    /** 是否使用 AI Review */
    hasAIReview?: boolean;

    /** AI Review 狀態（yes: 有, no: 無, unknown: 未知） */
    aiReviewStatus?: 'yes' | 'no' | 'unknown';

    /** Comment 詳細分類 (可選，用於更精確的負擔分析) */
    commentBreakdown?: {
      humanReviewComments: number;  // 人類 Reviewer 的評論
      aiComments: number;           // AI 審查評論
      authorResponses: number;      // 作者回應
      ciBotComments: number;        // CI Bot 評論
    };
  };

  /** 時間軸視覺化資料 */
  timeline: TimelinePhases;

  /** MR 狀態（用於顯示警告） */
  status: 'merged' | 'open' | 'closed';

  /** MR 當前階段 */
  phase: MRPhase;

  /** 階段顯示文字 */
  phaseLabel: string;

  /** MR 建立時間（ISO 8601） */
  createdAt: string;

  /** MR 合併時間（ISO 8601，未合併則為 null） */
  mergedAt: string | null;

  /** 詳細事件時間軸（可選，用於包含完整事件列表的輸出） */
  events?: Array<{
    sequence: number;
    timestamp: string;
    actor: {
      id: number;
      username: string;
      name: string;
      role: string;
      isAIBot: boolean;
    };
    eventType: string;
    details?: {
      count?: number;
      commitSha?: string;
      pipelineId?: number;
      branchName?: string;
      message?: string;
    };
    intervalToNext?: number;
  }>;

  /** 事件序列化錯誤訊息（如果事件序列化失敗） */
  eventsSerializationError?: string;

  /** 錯誤訊息（如果 API 查詢失敗） */
  error?: string;
}

/**
 * MR 時間軸的四個階段資料
 */
export interface TimelinePhases {
  /** 開發階段（MR Created → First Review） */
  dev: PhaseData;

  /** 等待審查階段（First Review → Active Review） */
  wait: PhaseData;

  /** 審查階段（Active Review → Approved） */
  review: PhaseData;

  /** 合併階段（Approved → Merged） */
  merge: PhaseData;

  /** 總時長（秒） */
  totalDurationSeconds: number;
}

/**
 * 時間分段活動強度
 */
export interface TimeSegmentIntensity {
  /** 分段開始時間（相對於階段開始，秒數） */
  startSeconds: number;

  /** 分段時長（秒） */
  durationSeconds: number;

  /** 該分段的提交數 */
  commits: number;

  /** 該分段的評論數 */
  comments: number;

  /** 強度等級（0-3：無/低/中/高） */
  level: 0 | 1 | 2 | 3;
}

/**
 * 單一階段的資料
 */
export interface PhaseData {
  /** 階段時長（秒） */
  durationSeconds: number;

  /** 佔總週期的百分比（0-100） */
  percentage: number;

  /** 格式化的時長字串（例如 "2d 5h"） */
  formattedDuration: string;

  /** 活動強度（用於視覺化） */
  intensity: PhaseIntensity;

  /** 時間分段活動強度（用於顯示階段內活動變化） */
  timeSegments?: TimeSegmentIntensity[];
}

/**
 * 階段活動強度（用於視覺化濃淡）
 */
export interface PhaseIntensity {
  /** 該階段的提交數 */
  commits: number;

  /** 該階段的評論數 */
  comments: number;

  /** 強度等級（0-3：無/低/中/高） */
  level: 0 | 1 | 2 | 3;
}

/**
 * 批次比較的彙總統計
 */
export interface BatchComparisonSummary {
  /** 總 MR 數量 */
  totalCount: number;

  /** 成功查詢的 MR 數量 */
  successCount: number;

  /** 失敗的 MR 數量 */
  failedCount: number;

  /** 程式碼變更彙總 */
  codeChanges: {
    /** 平均提交數 */
    avgCommits: number;

    /** 平均變更檔案數 */
    avgFiles: number;

    /** 平均變更行數 */
    avgLines: number;

    /** 中位數提交數 (P50) */
    medianCommits: number;

    /** 中位數變更檔案數 (P50) */
    medianFiles: number;

    /** 中位數變更行數 (P50) */
    medianLines: number;

    /** P90 提交數 - 90% 的 MRs 提交數 ≤ 此值 */
    p90Commits: number;

    /** P90 變更檔案數 - 90% 的 MRs 變更檔案數 ≤ 此值 */
    p90Files: number;

    /** P90 變更行數 - 90% 的 MRs 變更行數 ≤ 此值 */
    p90Lines: number;

    /** 總提交數 */
    totalCommits: number;

    /** 總變更檔案數 */
    totalFiles: number;

    /** 總變更行數 */
    totalLines: number;
  };

  /** 審查彙總 */
  reviewStats: {
    /** 平均評論數 */
    avgComments: number;

    /** 中位數評論數 (P50) */
    medianComments: number;

    /** P90 評論數 */
    p90Comments: number;

    /** 總評論數 */
    totalComments: number;

    /** 審查密度（評論數 / 1k 行） */
    reviewDensityPerKLoc: number;

    /** 審查密度（評論數 / 檔案） */
    reviewDensityPerFile: number;
  };

  /** 時間軸彙總 */
  timelineStats: {
    /** 平均週期時間（天數） */
    avgCycleDays: number;

    /** 中位數週期時間（天數） */
    medianCycleDays: number;

    /** P75 週期時間（天數） - 75% 的 MRs 在此時間內完成 */
    p75CycleDays: number;

    /** P90 週期時間（天數） - 90% 的 MRs 在此時間內完成 */
    p90CycleDays: number;

    /** P95 週期時間（天數） - 95% 的 MRs 在此時間內完成 */
    p95CycleDays: number;

    /** 各階段平均時間（秒） */
    avgPhaseDurations: {
      dev: number;
      wait: number;
      review: number;
      merge: number;
    };

    /** 各階段中位數時間（秒） */
    medianPhaseDurations: {
      dev: number;
      wait: number;
      review: number;
      merge: number;
    };

    /** 各階段 P90 時間（秒） - 用於識別異常值 */
    p90PhaseDurations: {
      dev: number;
      wait: number;
      review: number;
      merge: number;
    };

    /** 各階段平均百分比 */
    avgPhasePercentages: {
      dev: number;
      wait: number;
      review: number;
      merge: number;
    };
  };

  /** AI Review 分組統計（可選）
   *
   * 支援兩種格式：
   * 1. 基礎格式：僅包含 Cycle Time 和 Wait Time 統計
   * 2. 增強格式：包含程式碼變更、審查統計、以及按 MR 類型細分的時間指標
   */
  aiReviewGroupStats?: {
    /** 有 AI Review 的 MR 統計 */
    withAI: {
      count: number;
      avgCycleDays?: number;
      medianCycleDays?: number;
      p90CycleDays?: number;
      avgWaitSeconds?: number;
      medianWaitSeconds?: number;
      p90WaitSeconds?: number;
      /** 整體時間統計（增強格式） */
      overallTimeStats?: {
        dev: { p50: number; p75: number; p90: number; avg: number };
        wait: { p50: number; p75: number; p90: number; avg: number };
        review: { p50: number; p75: number; p90: number; avg: number };
        merge: { p50: number; p75: number; p90: number; avg: number };
        leadReview: { p50: number; p75: number; p90: number; avg: number };
        cycle: { p50: number; p75: number; p90: number; avg: number };
      };
      /** 程式碼變更統計（增強格式） */
      codeChanges?: {
        commits: { p50: number; p75: number; p90: number; avg: number };
        files: { p50: number; p75: number; p90: number; avg: number };
        lines: { p50: number; p75: number; p90: number; avg: number };
      };
      /** 審查統計（增強格式） */
      reviewStats?: {
        comments: { p50: number; p75: number; p90: number; avg: number };
        diffVersions: { p50: number; p75: number; p90: number; avg: number };
      };
      /** 按 MR 類型細分（增強格式） */
      byMRType?: Record<string, {
        count: number;
        percentage: number;
        mrIds: number[];  // MR IDs 列表
        /** 程式碼變更統計 */
        codeChanges: {
          commits: { p50: number; p75: number; p90: number; avg: number };
          files: { p50: number; p75: number; p90: number; avg: number };
          lines: { p50: number; p75: number; p90: number; avg: number };
        };
        /** 審查統計（細分為 human/AI/author） */
        reviewStats: {
          totalComments: { p50: number; p75: number; p90: number; avg: number };
          humanReviews: { p50: number; p75: number; p90: number; avg: number };
          aiReviews: { p50: number; p75: number; p90: number; avg: number };
          authorResponses: { p50: number; p75: number; p90: number; avg: number };
          diffVersions: { p50: number; p75: number; p90: number; avg: number };
        };
        timeMetrics: {
          dev: { p50: number; p75: number; p90: number; avg: number };
          wait: { p50: number; p75: number; p90: number; avg: number };
          review: { p50: number; p75: number; p90: number; avg: number };
          merge: { p50: number; p75: number; p90: number; avg: number };
          leadReview: { p50: number; p75: number; p90: number; avg: number };
          cycle: { p50: number; p75: number; p90: number; avg: number };
        };
        reviewResponseTime: {
          p50: number;
          p75: number;
          p90: number;
          avg: number;
        };
        draftDuration?: {
          p50: number;
          p75: number;
          p90: number;
          avg: number;
        };
        devDuration?: {
          p50: number;
          p75: number;
          p90: number;
          avg: number;
        };
      }>;
    };
    /** 沒有 AI Review 的 MR 統計 */
    withoutAI: {
      count: number;
      avgCycleDays?: number;
      medianCycleDays?: number;
      p90CycleDays?: number;
      avgWaitSeconds?: number;
      medianWaitSeconds?: number;
      p90WaitSeconds?: number;
      /** 整體時間統計（增強格式） */
      overallTimeStats?: {
        dev: { p50: number; p75: number; p90: number; avg: number };
        wait: { p50: number; p75: number; p90: number; avg: number };
        review: { p50: number; p75: number; p90: number; avg: number };
        merge: { p50: number; p75: number; p90: number; avg: number };
        leadReview: { p50: number; p75: number; p90: number; avg: number };
        cycle: { p50: number; p75: number; p90: number; avg: number };
      };
      /** 程式碼變更統計（增強格式） */
      codeChanges?: {
        commits: { p50: number; p75: number; p90: number; avg: number };
        files: { p50: number; p75: number; p90: number; avg: number };
        lines: { p50: number; p75: number; p90: number; avg: number };
      };
      /** 審查統計（增強格式） */
      reviewStats?: {
        comments: { p50: number; p75: number; p90: number; avg: number };
        diffVersions: { p50: number; p75: number; p90: number; avg: number };
      };
      /** 按 MR 類型細分（增強格式） */
      byMRType?: Record<string, {
        count: number;
        percentage: number;
        mrIds: number[];  // MR IDs 列表
        /** 程式碼變更統計 */
        codeChanges: {
          commits: { p50: number; p75: number; p90: number; avg: number };
          files: { p50: number; p75: number; p90: number; avg: number };
          lines: { p50: number; p75: number; p90: number; avg: number };
        };
        /** 審查統計（細分為 human/AI/author） */
        reviewStats: {
          totalComments: { p50: number; p75: number; p90: number; avg: number };
          humanReviews: { p50: number; p75: number; p90: number; avg: number };
          aiReviews: { p50: number; p75: number; p90: number; avg: number };
          authorResponses: { p50: number; p75: number; p90: number; avg: number };
          diffVersions: { p50: number; p75: number; p90: number; avg: number };
        };
        timeMetrics: {
          dev: { p50: number; p75: number; p90: number; avg: number };
          wait: { p50: number; p75: number; p90: number; avg: number };
          review: { p50: number; p75: number; p90: number; avg: number };
          merge: { p50: number; p75: number; p90: number; avg: number };
          leadReview: { p50: number; p75: number; p90: number; avg: number };
          cycle: { p50: number; p75: number; p90: number; avg: number };
        };
        reviewResponseTime: {
          p50: number;
          p75: number;
          p90: number;
          avg: number;
        };
        draftDuration?: {
          p50: number;
          p75: number;
          p90: number;
          avg: number;
        };
        devDuration?: {
          p50: number;
          p75: number;
          p90: number;
          avg: number;
        };
      }>;
    };
  };
}

/**
 * 批次比較服務的輸出結果
 */
export interface BatchComparisonResult {
  /** MR 比較資料行列表 */
  rows: MRComparisonRow[];

  /** 彙總統計 */
  summary: BatchComparisonSummary;

  /** 查詢元資訊 */
  metadata: {
    /** 專案 ID */
    projectId: string;

    /** 查詢時間（ISO 8601） */
    queriedAt: string;

    /** 查詢耗時（毫秒） */
    queryDurationMs: number;

    /** 應用的過濾條件 */
    appliedFilters?: BatchComparisonInput['filter'];

    /** 應用的排序條件 */
    appliedSort?: BatchComparisonInput['sort'];
  };
}

/**
 * 錯誤類型列舉
 */
export enum ErrorType {
  AUTHENTICATION = 'Authentication',
  PERMISSION = 'Permission',
  NOT_FOUND = 'Not Found',
  RATE_LIMIT = 'Rate Limit',
  NETWORK = 'Network',
  VALIDATION = 'Validation',
  PARTIAL_FAILURE = 'Partial Failure',
}

/**
 * 服務層錯誤
 */
export class ServiceError extends Error {
  constructor(
    public readonly type: ErrorType,
    message: string,
    public readonly cause: string,
    public readonly remedy: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ServiceError';
    Object.setPrototypeOf(this, ServiceError.prototype);
  }

  /**
   * 格式化錯誤訊息為使用者友善的輸出
   * @param verbose 是否顯示詳細資訊
   */
  format(verbose = false): string {
    let output = `\n❌ ${this.type} Error: ${this.message}\n`;
    output += `\n原因: ${this.cause}\n`;
    output += `建議: ${this.remedy}\n`;

    if (verbose && this.details) {
      output += `\n詳細資訊:\n${JSON.stringify(this.details, null, 2)}\n`;
    }

    return output;
  }
}

/**
 * 輸入驗證錯誤
 */
export class ValidationError extends ServiceError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly constraint: string
  ) {
    super(
      ErrorType.VALIDATION,
      message,
      `欄位 "${field}" 違反限制條件: ${constraint}`,
      '請檢查輸入參數並重試。',
      { field, constraint }
    );
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * JSON 匯出格式（與 BatchComparisonResult 相同）
 */
export type JSONExportFormat = BatchComparisonResult;

/**
 * CSV 匯出格式定義
 */
export interface CSVExportFormat {
  /** CSV 標頭列 */
  headers: string[];

  /** CSV 資料列 */
  rows: string[][];
}

/**
 * CSV 欄位對應
 */
export const CSV_COLUMNS = [
  'MR IID',
  'Title',
  'Author',
  'Cycle Days',
  'Commits',
  'Files',
  'Lines',
  'Comments',
  'AI Review',
  'Dev Time (s)',
  'Wait Time (s)',
  'Review Time (s)',
  'Merge Time (s)',
  'Dev %',
  'Wait %',
  'Review %',
  'Merge %',
  'Status',
] as const;

/**
 * 階段過濾配置 (Feature: 013-mr-phase-filters)
 *
 * 所有屬性皆為可選。定義的屬性使用 AND 邏輯組合：
 * MR 必須滿足所有定義的條件才會被包含在結果中。
 */
export interface PhaseFilter {
  // 開發階段過濾
  devPercentMin?: number;  // 0-100
  devPercentMax?: number;  // 0-100
  devDaysMin?: number;     // ≥0
  devDaysMax?: number;     // ≥0

  // 等待階段過濾
  waitPercentMin?: number;
  waitPercentMax?: number;
  waitDaysMin?: number;
  waitDaysMax?: number;

  // 審查階段過濾
  reviewPercentMin?: number;
  reviewPercentMax?: number;
  reviewDaysMin?: number;
  reviewDaysMax?: number;

  // 合併階段過濾
  mergePercentMin?: number;
  mergePercentMax?: number;
  mergeDaysMin?: number;
  mergeDaysMax?: number;
}

/**
 * 驗證結果 (Feature: 013-mr-phase-filters)
 */
export interface ValidationResult {
  /** 是否通過驗證 */
  isValid: boolean;

  /** 錯誤訊息清單（isValid=false 時非空） */
  errors: string[];
}

/**
 * 階段過濾統計 (Feature: 013-mr-phase-filters, T016)
 *
 * 追蹤每個過濾條件排除了多少 MR。
 */
export interface PhaseFilterStats {
  /** 過濾前的總 MR 數量 */
  totalCount: number;

  /** 過濾後的 MR 數量 */
  filteredCount: number;

  /** 每個過濾條件排除的 MR 數量 */
  excludedByFilter: Record<string, number>;
}

/**
 * 過濾後的批次比較結果 (Feature: 013-mr-phase-filters)
 *
 * 擴充既有結果型別，新增過濾匹配資訊。
 */
export interface FilteredBatchComparisonResult extends BatchComparisonResult {
  /** 每個 MR 匹配的過濾器清單 */
  matchedPhaseFilters?: Record<number, string[]>; // { mrIid: ['wait-percent', 'review-days'] }

  /** 階段過濾統計資訊 (T016) */
  phaseFilterStats?: PhaseFilterStats;
}

/**
 * GitLab MR 版本信息（來自 Diff Versions API）
 * Feature: Review Rounds Detail (Phase 2)
 */
export interface MRVersion {
  /** 版本 ID */
  id: number;

  /** 版本建立時間（ISO 8601） */
  created_at: string;

  /** Head commit SHA */
  head_commit_sha: string;

  /** Base commit SHA */
  base_commit_sha: string;
}

/**
 * 單一輪次的詳細信息
 * Feature: Review Rounds Detail (Phase 2)
 */
export interface MRRound {
  /** 輪次編號（從 1 開始，0 表示初始版本） */
  roundNumber: number;

  /** 版本建立時間（ISO 8601） */
  createdAt: string;

  /** 距離上一輪的時間間隔（秒） */
  intervalSeconds: number;

  /** 格式化的時間間隔字串（例如 "2d 3h"） */
  formattedInterval: string;

  /** 是否為慢速輪次（時間間隔超過平均值 2 倍） */
  isSlow: boolean;
}

/**
 * MR 輪數詳細信息
 * Feature: Review Rounds Detail (Phase 2)
 */
export interface MRRoundsDetail {
  /** MR IID */
  mrIid: number;

  /** MR 標題 */
  title: string;

  /** MR GitLab 連結 */
  webUrl: string;

  /** 總輪數 */
  totalRounds: number;

  /** 各輪次詳細信息 */
  rounds: MRRound[];

  /** 最慢的輪次編號（如果有） */
  slowestRound?: number;

  /** 平均輪次間隔（秒） */
  avgIntervalSeconds: number;

  /** 格式化的平均間隔字串 */
  formattedAvgInterval: string;
}

/**
 * MR 類型 Enum
 * Feature: MR Type Classification (2025-11-15)
 */
export enum MRType {
  STANDARD = 'Standard',
  DRAFT = 'Draft',
  ACTIVE_DEVELOPMENT = 'Active Development'
}

/**
 * MR 分類結果
 * Feature: MR Type Classification (2025-11-15)
 */
export interface MRClassification {
  /** MR IID */
  iid: number;

  /** MR 類型 */
  mrType: MRType;

  /** 分類原因（用於除錯） */
  reason: string;

  /** Draft 期間（秒），僅 Draft MR 有值 */
  draftDuration?: number;

  /** 持續開發期間（秒），僅 Active Development MR 有值 */
  devDuration?: number;

  /** 等待時間資訊 */
  waitTime: {
    /** 總 Pickup Time（MR Created → First Review），秒 */
    totalPickupTime: number;

    /** Review 響應時間（精確計算），秒 */
    reviewResponseTime: number;

    /** Wait Time 起點 */
    waitStartPoint: 'MR Created' | 'Marked as Ready' | 'Last Commit';
  };
}

/**
 * MR 類型統計
 * Feature: MR Type Classification (2025-11-15)
 */
export interface MRTypeStats {
  /** 數量 */
  count: number;

  /** 佔比（百分比） */
  percentage: number;

  /** Review 響應時間統計 */
  reviewResponseTime: {
    p50: number;
    p75: number;
    p90: number;
    avg: number;
    min: number;
    max: number;
  };

  /** Draft 期間統計（僅 Draft MR） */
  draftDuration?: {
    avg: number;
  };

  /** 總 Pickup Time 統計（僅 Active Development MR） */
  totalPickupTime?: {
    p50: number;
    p75: number;
    p90: number;
    avg: number;
  };
}

/**
 * 分類統計結果
 * Feature: MR Type Classification (2025-11-15)
 */
export type MRTypeStatsSummary = {
  [key in MRType]?: MRTypeStats;
};
