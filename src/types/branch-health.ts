/**
 * 分支生命週期分析型別定義
 *
 * 基於 specs/003-branch-lifecycle-optimized/data-model.md
 *
 * @module types/branch-health
 */

// ============================================================================
// 核心實體
// ============================================================================

/**
 * Branch（分支）
 *
 * 代表 GitLab 專案中未合併的 Git 分支
 */
export interface Branch {
  /** 分支名稱 */
  name: string
  /** 最後提交日期 */
  lastCommitDate: Date
  /** 分支建立日期 */
  createdDate: Date
  /** 關聯的 MR ID（若存在） */
  mergeRequestId: number | null
  /** 分支作者 */
  author: string
  /** 是否為保護分支 */
  protected: boolean
}

/**
 * BranchLifecycle（分支健康度）
 *
 * 計算與儲存分支的雙重生命週期指標
 */
export interface BranchLifecycle {
  /** 關聯的分支名稱 */
  branchName: string
  /** 總生命週期（天） */
  totalLifecycleDays: number
  /** MR 處理時間（天），若無 MR 則為 null */
  mrProcessingDays: number | null
  /** 分支建立日期 */
  createdDate: Date
  /** 最後更新日期 */
  lastUpdatedDate: Date
  /** 是否過時（超過閾值） */
  isStale: boolean
  /** 過時判定閾值（天） */
  staleThreshold: number
}

/**
 * StaleBranch（過時分支）
 *
 * 延伸 BranchLifecycle，新增 commits behind 分析
 */
export interface StaleBranch extends BranchLifecycle {
  /** 落後預設分支的 commits 數 */
  commitsBehind: number | null
  /** 比較的基準分支（如 "main"） */
  baseBranch: string
  /** commits behind 資料來源 */
  fetchSource: 'local-git' | 'api'
}

/**
 * NamingConvention（命名規範）
 *
 * 驗證分支名稱是否符合團隊規範
 */
export interface NamingConvention {
  /** 分支名稱 */
  branchName: string
  /** 是否符合規範 */
  matchesPattern: boolean
  /** 使用的正則表達式 */
  pattern: string
  /** 是否為活躍分支（≤ 90 天） */
  isActive: boolean
  /** 最後更新日期 */
  lastUpdatedDate: Date
}

// ============================================================================
// 時間段比較模型
// ============================================================================

/**
 * PeriodStatistics（時間段統計）
 *
 * 單一時間段的健康度統計
 */
export interface PeriodStatistics {
  /** 時間段標籤（如 "2025-09"） */
  label: string
  /** 時間段開始日期 */
  startDate: Date
  /** 時間段結束日期 */
  endDate: Date
  /** 總分支數 */
  totalBranches: number
  /** 平均生命週期（天） */
  avgLifecycleDays: number
  /** 中位數生命週期（天） */
  medianLifecycleDays: number
  /** 最大生命週期（天） */
  maxLifecycleDays: number
  /** 平均 MR 處理時間（天） */
  avgMrProcessingDays: number
}

/**
 * PeriodChanges（時間段變化）
 *
 * 兩個時間段之間的差異與趨勢
 */
export interface PeriodChanges {
  /** 平均生命週期變化（天） */
  avgLifecycleDaysChange: number
  /** 趨勢（改善/惡化/穩定） */
  avgLifecycleTrend: 'improving' | 'worsening' | 'stable'
  /** 中位數生命週期變化 */
  medianLifecycleDaysChange: number
  /** 總分支數變化 */
  totalBranchesChange: number
}

/**
 * PeriodComparison（時間段比較）
 *
 * 比較不同時間段的分支健康度指標
 */
export interface PeriodComparison {
  /** 第一個時間段統計 */
  period1: PeriodStatistics
  /** 第二個時間段統計 */
  period2: PeriodStatistics
  /** 變化量與趨勢 */
  changes: PeriodChanges
}

// ============================================================================
// 聚合統計模型
// ============================================================================

/**
 * HealthStatistics（健康度統計）
 *
 * 聚合多個 BranchLifecycle 的統計指標
 */
export interface HealthStatistics {
  /** 總分支數 */
  totalBranches: number
  /** 平均生命週期（天） */
  avgLifecycleDays: number
  /** 中位數生命週期（天） */
  medianLifecycleDays: number
  /** 最大生命週期（天） */
  maxLifecycleDays: number
  /** 平均 MR 處理時間（天） */
  avgMrProcessingDays: number
  /** 中位數 MR 處理時間 */
  medianMrProcessingDays: number
  /** 最大 MR 處理時間 */
  maxMrProcessingDays: number
  /** 過時分支數 */
  staleBranchCount: number
}

// ============================================================================
// 輸出模型
// ============================================================================

/**
 * BranchHealthDetail（分支詳細資訊）
 *
 * 輸出中的單個分支資訊
 */
export interface BranchHealthDetail {
  /** 分支名稱 */
  name: string
  /** 生命週期（天） */
  lifecycleDays: number
  /** MR 處理時間（天），若無 MR 則為 null */
  mrProcessingDays: number | null
  /** 最後提交日期（ISO 8601） */
  lastCommitDate: string
  /** 落後 commits 數（僅在 --show-stale 時出現） */
  commitsBehind?: number
  /** 作者 */
  author: string
  /** MR ID */
  mrId: number | null
}

/**
 * BranchHealthOutput（完整輸出）
 *
 * 整合所有分析結果，用於 JSON 輸出
 * 對應規格中的 JSON Schema（spec.md § JSON 輸出結構）
 */
export interface BranchHealthOutput {
  /** 元資料 */
  metadata: {
    /** 命令名稱 */
    command: string
    /** 專案識別符 */
    project: string
    /** 執行時間戳（ISO 8601） */
    timestamp: string
    /** 執行時間（如 "7.32s"） */
    executionTime: string
    /** 優化模式 */
    optimization: 'local-git' | 'api-batch' | 'api-serial'
  }
  /** 統計摘要 */
  statistics: HealthStatistics
  /** 分支詳細清單 */
  branches: BranchHealthDetail[]
  /** 過時分支清單（僅在 --show-stale 時出現） */
  staleBranches?: BranchHealthDetail[]
  /** 命名檢查結果（僅在 --check-naming 時出現） */
  namingCompliance?: {
    pattern: string
    compliant: string[]
    nonCompliant: string[]
    complianceRate: number
  }
  /** 時間段比較（僅在 --compare-periods 時出現） */
  periodComparison?: PeriodComparison
}

// ============================================================================
// 本地 Git 客戶端配置
// ============================================================================

/**
 * LocalGitClientConfig（本地 Git 客戶端配置）
 *
 * 用於初始化本地 Git 客戶端
 */
export interface LocalGitClientConfig {
  /** 本地 Git repository 路徑（絕對路徑） */
  repoPath: string
  /** 預期的專案識別符（如 "example/mobile-app"），用於驗證 */
  expectedProjectId: string
  /** 基準分支名稱（預設 "main"） */
  baseBranch?: string
  /** Git 命令超時時間（毫秒，預設 10000 = 10秒）- Issue #4: 增加預設值以支援大型 repository */
  gitTimeout?: number
}

/**
 * RepoValidationResult（Repo 驗證結果）
 *
 * 本地 Git repository 驗證結果
 */
export interface RepoValidationResult {
  /** 是否有效 */
  isValid: boolean
  /** Remote origin URL */
  remoteOriginUrl: string | null
  /** 最後 fetch 日期 */
  lastFetchDate: Date | null
  /** 驗證警告訊息 */
  warnings: string[]
  /** 驗證錯誤訊息（若 isValid = false） */
  error: string | null
}

// ============================================================================
// 批次處理選項
// ============================================================================

/**
 * BatchQueryOptions（批次查詢選項）
 *
 * 用於 GitLab API 批次請求
 */
export interface BatchQueryOptions {
  /** 批次大小（預設 10） */
  batchSize?: number
  /** 並發請求數量（預設 10） */
  concurrency?: number
  /** 進度回呼 */
  onProgress?: (processed: number, total: number) => void
  /** 錯誤處理策略 */
  errorHandling?: 'skip' | 'throw'
}
