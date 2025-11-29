/**
 * Trend Period 資料模型
 * 功能：004-commit-size-analysis - US4
 *
 * 用於表示趨勢分析中的單一時間段及其統計資料
 */

import type { AggregateStatistics } from '../types/commit-analysis.js';

/**
 * 趨勢方向（FR-014）
 */
export enum TrendDirection {
  IMPROVING = 'improving',     // 改善（平均 LOC 下降）
  STABLE = 'stable',           // 穩定（變化 <5%）
  WORSENING = 'worsening',     // 惡化（平均 LOC 上升）
}

/**
 * 時間段粒度
 */
export type TrendGranularity = 'weekly' | 'monthly' | 'quarterly';

/**
 * 趨勢時間段
 */
export interface TrendPeriod {
  /** 時間段標籤（如 "2025-10", "Q3 2025"） */
  label: string;

  /** 開始日期 */
  startDate: Date;

  /** 結束日期 */
  endDate: Date;

  /** 該時間段的統計資料 */
  statistics: AggregateStatistics;

  /** 與前一時間段比較的趨勢方向（第一個時間段為 null） */
  trendDirection: TrendDirection | null;

  /** 平均 LOC 變化百分比（與前一時間段比較） */
  avgLOCChange: number | null;

  /** 超大率變化百分比（與前一時間段比較） */
  oversizedChange: number | null;

  /** 是否為顯著變化（>10% 變化，FR-015） */
  isSignificantChange: boolean;
}

/**
 * 趨勢分析結果
 */
export interface TrendAnalysisResult {
  /** 時間段陣列（按時間順序） */
  periods: TrendPeriod[];

  /** 整體趨勢方向 */
  overallTrend: TrendDirection;

  /** 總平均 LOC 變化（第一個時間段 vs 最後一個時間段） */
  totalAvgLOCChange: number;

  /** 總超大率變化（第一個時間段 vs 最後一個時間段） */
  totalOversizedChange: number;
}

/**
 * 計算趨勢方向（FR-014）
 *
 * @param currentAvgLOC - 當前時間段的平均 LOC
 * @param previousAvgLOC - 前一時間段的平均 LOC
 * @returns 趨勢方向
 */
export function calculateTrendDirection(
  currentAvgLOC: number,
  previousAvgLOC: number
): TrendDirection {
  const changePercentage = ((currentAvgLOC - previousAvgLOC) / previousAvgLOC) * 100;

  if (Math.abs(changePercentage) < 5) {
    return TrendDirection.STABLE;
  }

  return changePercentage < 0 ? TrendDirection.IMPROVING : TrendDirection.WORSENING;
}

/**
 * 計算變化百分比
 *
 * @param current - 當前值
 * @param previous - 前一值
 * @returns 變化百分比
 */
export function calculateChangePercentage(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * 判斷是否為顯著變化（FR-015）
 *
 * @param changePercentage - 變化百分比
 * @returns 是否顯著
 */
export function isSignificantChange(changePercentage: number): boolean {
  return Math.abs(changePercentage) > 10;
}

/**
 * 取得趨勢方向的顯示名稱
 *
 * @param direction - 趨勢方向
 * @returns 顯示名稱
 */
export function getTrendDirectionDisplayName(direction: TrendDirection): string {
  const displayNames = {
    [TrendDirection.IMPROVING]: '改善',
    [TrendDirection.STABLE]: '穩定',
    [TrendDirection.WORSENING]: '惡化',
  };
  return displayNames[direction];
}

/**
 * 取得趨勢方向的顏色
 *
 * @param direction - 趨勢方向
 * @returns chalk 顏色名稱
 */
export function getTrendDirectionColor(
  direction: TrendDirection
): 'green' | 'gray' | 'red' {
  const colors = {
    [TrendDirection.IMPROVING]: 'green' as const,
    [TrendDirection.STABLE]: 'gray' as const,
    [TrendDirection.WORSENING]: 'red' as const,
  };
  return colors[direction];
}

/**
 * 格式化時間段標籤
 *
 * @param startDate - 開始日期
 * @param granularity - 粒度
 * @returns 格式化的標籤
 */
export function formatPeriodLabel(
  startDate: Date,
  granularity: TrendGranularity
): string {
  const year = startDate.getFullYear();
  const month = startDate.getMonth() + 1;
  const quarter = Math.ceil(month / 3);

  switch (granularity) {
    case 'weekly': {
      const weekNum = getWeekNumber(startDate);
      return `${year}-W${weekNum.toString().padStart(2, '0')}`;
    }
    case 'monthly':
      return `${year}-${month.toString().padStart(2, '0')}`;
    case 'quarterly':
      return `Q${quarter} ${year}`;
  }
}

/**
 * 取得週數（ISO 8601）
 *
 * @param date - 日期
 * @returns 週數
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
