/**
 * 型別定義：Commit 規模分析
 * 功能：004-commit-size-analysis
 *
 * 此檔案定義所有 commit 分析相關的列舉和介面
 */

/**
 * 規模類別（FR-004）
 *
 * 分類標準：
 * - SMALL: < 50 LOC
 * - MEDIUM: 50-100 LOC
 * - LARGE: 100-200 LOC
 * - OVERSIZED: > 200 LOC
 */
export enum SizeCategory {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  OVERSIZED = 'oversized',
}

/**
 * 嚴重程度級別（FR-006）
 *
 * 分類標準：
 * - NORMAL: < 100 LOC（無問題）
 * - WARNING: 100-200 LOC（警告，需要注意）
 * - CRITICAL: > 200 LOC（嚴重，需要重構）
 */
export enum SeverityLevel {
  NORMAL = 'normal',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * 健康度評估（FR-008）
 *
 * 基於超大 commits 百分比：
 * - EXCELLENT: 0-5%
 * - GOOD: 5-10%
 * - MODERATE: 10-15%
 * - NEEDS_IMPROVEMENT: 15-25%
 * - CRITICAL: > 25%
 */
export enum HealthAssessment {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  MODERATE = 'moderate',
  NEEDS_IMPROVEMENT = 'needs_improvement',
  CRITICAL = 'critical',
}

/**
 * 開發者評估（FR-012a）
 *
 * 基於開發者超大 commits 百分比（比團隊標準稍微放寬）：
 * - EXCELLENT: 0-5%
 * - GOOD: 5-15%
 * - NEEDS_IMPROVEMENT: 15-25%
 * - CRITICAL: > 25%
 */
export enum DeveloperAssessment {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  NEEDS_IMPROVEMENT = 'needs_improvement',
  CRITICAL = 'critical',
}

/**
 * 趨勢方向（FR-014）
 *
 * 相對於前一時間段的變化：
 * - IMPROVING: 平均 LOC 下降或超大百分比下降
 * - STABLE: 變化 < 5%
 * - DEGRADING: 平均 LOC 上升或超大百分比上升
 */
export enum TrendDirection {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DEGRADING = 'degrading',
}

/**
 * 單一 commit 的分析結果（FR-002, FR-003, FR-004, FR-006）
 */
export interface CommitAnalysis {
  /** Commit SHA（40 字元） */
  sha: string;

  /** 作者名稱 */
  author: string;

  /** 作者電子郵件（用於分組） */
  authorEmail: string;

  /** 提交時間戳記 */
  timestamp: Date;

  /** Commit 訊息 */
  message: string;

  /** 變更的檔案數量（FR-003） */
  filesChanged: number;

  /** 程式碼行數（additions + deletions）（FR-002） */
  loc: number;

  /** 新增行數 */
  additions: number;

  /** 刪除行數 */
  deletions: number;

  /** 規模類別（FR-004） */
  sizeCategory: SizeCategory;

  /** 嚴重程度級別（FR-006） */
  severityLevel: SeverityLevel;

  /** 重構建議（僅當 loc > 200 時）（FR-010） */
  refactorSuggestion: string | null;

  /** 是否為 merge commit（FR-019） */
  isMergeCommit: boolean;

  /** 分支名稱（若使用 --branches 旗標指定） */
  branch: string | null;
}

/**
 * 規模分布統計（FR-007）
 */
export interface SizeDistribution {
  small: {
    count: number;
    percentage: number;
  };
  medium: {
    count: number;
    percentage: number;
  };
  large: {
    count: number;
    percentage: number;
  };
  oversized: {
    count: number;
    percentage: number;
  };
}

/**
 * 彙總統計（FR-005, FR-007, FR-008）
 */
export interface AggregateStatistics {
  /** 總 commit 數（包含排除的） */
  totalCommits: number;

  /** 實際分析的 commits（排除 merge/0 LOC） */
  analyzedCommits: number;

  /** 排除的 commits（merge + 0 LOC） */
  excludedCommits: number;

  /** 平均檔案數（FR-005） */
  avgFilesPerCommit: number;

  /** 平均 LOC（FR-005） */
  avgLOCPerCommit: number;

  /** 中位數 LOC（FR-005） */
  medianLOC: number;

  /** 最大 LOC（FR-005） */
  maxLOC: number;

  /** 規模分布（FR-007） */
  distribution: SizeDistribution;

  /** 健康度評估（FR-008） */
  healthAssessment: HealthAssessment;

  /** 超大 commits 百分比（用於評估） */
  oversizedPercentage: number;
}

/**
 * 開發者 commit 模式（FR-012, FR-012a）
 */
export interface DeveloperPattern {
  /** 開發者名稱 */
  author: string;

  /** 開發者電子郵件 */
  authorEmail: string;

  /** 該開發者的 commit 數 */
  totalCommits: number;

  /** 平均 LOC */
  avgLOC: number;

  /** 平均檔案數 */
  avgFiles: number;

  /** 超大 commits 數量 */
  oversizedCount: number;

  /** 超大 commits 百分比 */
  oversizedPercentage: number;

  /** 開發者評估（FR-012a） */
  assessment: DeveloperAssessment;

  /** 該開發者的所有 commits */
  commits: CommitAnalysis[];
}

/**
 * 趨勢期間統計（FR-013, FR-014, FR-015）
 */
export interface TrendPeriod {
  /** 時間段識別碼（例如：monthly-1） */
  id: string;

  /** 時間段開始 */
  start: Date;

  /** 時間段結束 */
  end: Date;

  /** 該時間段的統計 */
  statistics: AggregateStatistics;

  /** 趨勢方向（相對於前一期間）（FR-014） */
  trendDirection: TrendDirection | null;

  /** 平均 LOC 變化百分比（FR-014） */
  avgLOCChange: number | null;

  /** 超大百分比變化（FR-014） */
  oversizedChange: number | null;

  /** 是否為顯著變化（>10% 變化）（FR-015） */
  isSignificant: boolean;
}

/**
 * 趨勢分析粒度選項（FR-013a）
 */
export type TrendGranularity = 'weekly' | 'monthly' | 'quarterly';
