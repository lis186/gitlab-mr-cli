/**
 * Commit Analysis Constants
 * Issue #9: 提取 magic numbers 為常數以提升可維護性
 */

/**
 * Commit 規模分類閾值（LOC）
 *
 * 來源：基於業界研究與實務經驗
 * - 中位數約 19 LOC per commit (FR-003)
 * - 建議最大值 100 LOC 以確保易於審查
 * - 絕對最大值 200 LOC，超過則視為需要拆分
 */
export const LOC_THRESHOLDS = {
  /** 小型 commit 上限 */
  SMALL: 50,
  /** 中型 commit 上限 */
  MEDIUM: 100,
  /** 大型 commit 上限 */
  LARGE: 200,
} as const;

/**
 * Commit 嚴重度評估閾值（LOC）
 *
 * 來源：基於程式碼審查最佳實踐
 * - 100 LOC 是審查者能有效掌握的上限
 * - 200 LOC 以上顯著增加審查錯誤率
 */
export const SEVERITY_THRESHOLDS = {
  /** Warning 級別起始值 */
  WARNING: 100,
  /** Critical 級別起始值 */
  CRITICAL: 200,
} as const;

/**
 * 健康度評估閾值（超大 commits 百分比）
 *
 * 來源：根據 FR-010 健康度分級標準
 * - < 5%: 優秀團隊實踐
 * - 5-10%: 良好的程式碼管理
 * - > 25%: 需要流程改善
 */
export const HEALTH_THRESHOLDS = {
  /** 優秀：< 5% */
  EXCELLENT: 5,
  /** 良好：5% - 10% */
  GOOD: 10,
  /** 普通：10% - 15% */
  MODERATE: 15,
  /** 需改善：15% - 25% */
  NEEDS_IMPROVEMENT: 25,
  /** 嚴重：> 25% */
  // CRITICAL: 25 (implicit - anything above NEEDS_IMPROVEMENT)
} as const;

/**
 * 開發者評估閾值（超大 commits 百分比）
 */
export const DEVELOPER_THRESHOLDS = {
  /** 優秀：< 5% */
  EXCELLENT: 5,
  /** 良好：< 15% */
  GOOD: 15,
  /** 需改善：< 25% */
  NEEDS_IMPROVEMENT: 25,
} as const;

/**
 * 業界基準值
 *
 * 來源：基於開源專案統計研究 (FR-003)
 * - 中位數 commit size: 19 LOC
 * - 平均檔案數: 4 files per commit
 * - Google/Microsoft code review guidelines: 建議 < 100 LOC
 */
export const INDUSTRY_BENCHMARKS = {
  /** 平均 LOC per commit */
  AVG_LOC_PER_COMMIT: 19,
  /** 平均檔案數 per commit */
  AVG_FILES_PER_COMMIT: 4,
  /** 建議最大值 */
  RECOMMENDED_MAX_LOC: 100,
  /** 絕對最大值 */
  ABSOLUTE_MAX_LOC: 200,
} as const;

/**
 * 批次處理設定
 *
 * 來源：效能測試與 API 速率限制考量 (FR-017, FR-030)
 * - 批次大小 10: 平衡並發效能與記憶體使用
 * - 進度條閾值 100: 避免小型分析的 UI 閃爍
 */
export const BATCH_SETTINGS = {
  /** Commit 分析批次大小 */
  COMMIT_ANALYSIS_BATCH_SIZE: 10,
  /** 預設 commit 數量限制 */
  DEFAULT_COMMIT_LIMIT: 1000,
  /** 進度條顯示閾值 */
  PROGRESS_BAR_THRESHOLD: 100,
} as const;

/**
 * 趨勢分析設定
 *
 * 來源：資料視覺化最佳實踐 (FR-013b)
 * - 最大時間段 12: 確保圖表可讀性與記憶體效率
 * - 顯著變化閾值 10%: 過濾雜訊，凸顯有意義的趨勢
 */
export const TREND_SETTINGS = {
  /** 最大時間段數量 */
  MAX_PERIODS: 12,
  /** 顯著變化閾值（百分比） */
  SIGNIFICANT_CHANGE_THRESHOLD: 10,
} as const;

/**
 * Diff 解析安全限制
 */
export const DIFF_PARSING_LIMITS = {
  /** 最大 diff 字串長度（10MB） */
  MAX_DIFF_LENGTH: 10 * 1024 * 1024,
  /** 最大處理行數 */
  MAX_LINES: 1000000,
} as const;

/**
 * Git 操作設定
 */
export const GIT_SETTINGS = {
  /** Git 命令預設 timeout（毫秒） */
  DEFAULT_GIT_TIMEOUT: 10000,
} as const;
