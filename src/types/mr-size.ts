/**
 * MR 規模分析型別定義
 * Feature: 007-mr-size-analysis
 */

/**
 * MR 規模分類層級
 */
export enum SizeCategory {
  XS = 'XS', // 理想規模：≤10 檔案，≤100 行
  S = 'S', // 健康規模：≤20 檔案，≤200 行
  M = 'M', // 可接受規模：≤50 檔案，≤400 行
  L = 'L', // 需注意規模：≤100 檔案，≤800 行
  XL = 'XL', // 警戒規模：>100 檔案或 >800 行
}

/**
 * 單一 MR 的規模指標
 */
export interface MRSizeMetrics {
  iid: number // MR 內部 ID
  title: string // MR 標題
  author: string // 作者名稱
  mergedAt: Date // 合併時間
  fileCount: number // 變更檔案數量
  additions: number // 新增行數
  deletions: number // 刪除行數
  totalChanges: number // 總變更行數（additions + deletions）
  category: SizeCategory // 規模分類
  webUrl: string // GitLab MR 連結
}

/**
 * 規模類別統計
 */
export interface CategoryStats {
  count: number // 該類別的 MR 數量
  percentage: number // 百分比（保留 1 位小數）
}

/**
 * 團隊健康度指標
 */
export interface HealthMetrics {
  smallOrLessPercent: number // XS + S 的百分比（目標：≥ 60%）
  xlPercent: number // XL 的百分比（目標：< 10%）
  meetsGoals: boolean // 是否達成團隊健康度目標
}

/**
 * MR 規模分佈統計
 */
export interface SizeDistribution {
  total: number // 分析的 MR 總數
  byCategory: Record<SizeCategory, CategoryStats> // 各類別統計
  healthMetrics: HealthMetrics // 團隊健康度指標
}

/**
 * 月度趨勢資料
 */
export interface MonthlyTrendData {
  month: string // 月份標識（格式：YYYY-MM）
  total: number // 該月的 MR 總數
  distribution: SizeDistribution // 該月的規模分佈
  hasLowSample: boolean // 是否樣本數不足（< 10）
}

/**
 * 趨勢分析結果
 */
export interface TrendAnalysisResult {
  dateRange: {
    since: Date
    until: Date
  }
  monthlyData: MonthlyTrendData[] // 月度資料
  overall: SizeDistribution // 整體期間的分佈
}

/**
 * 過大 MR（L 和 XL 類別）
 */
export interface OversizedMR {
  iid: number // MR 內部 ID
  title: string // MR 標題
  author: string // 作者名稱
  category: 'L' | 'XL' // 規模分類（只有 L 或 XL）
  fileCount: number // 變更檔案數量
  totalChanges: number // 總變更行數
  exceedsFileThreshold: boolean // 是否超出檔案數門檻
  exceedsLOCThreshold: boolean // 是否超出行數門檻
  webUrl: string // GitLab MR 連結
}
