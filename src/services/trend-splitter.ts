/**
 * Trend Splitter 服務
 * 功能：004-commit-size-analysis - US4
 *
 * 負責將時間範圍分割為多個趨勢分析時間段
 */

import {
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachQuarterOfInterval,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  differenceInDays,
} from 'date-fns';
import type { TrendGranularity } from '../models/trend-period.js';
import { AppError, ErrorType } from '../models/error.js';
import { TREND_SETTINGS } from '../constants/commit-analysis.js';

/**
 * 時間段資訊
 */
export interface PeriodInfo {
  startDate: Date;
  endDate: Date;
}

/**
 * TrendSplitter 類別
 *
 * 負責根據粒度將時間範圍分割為多個時間段
 */
export class TrendSplitter {
  /** 最大時間段數量（FR-013b） - Issue #4: 使用centralized constant */
  private static readonly MAX_PERIODS = TREND_SETTINGS.MAX_PERIODS;

  /**
   * 分割時間範圍為多個時間段
   *
   * @param startDate - 開始日期
   * @param endDate - 結束日期
   * @param granularity - 粒度（weekly/monthly/quarterly）
   * @returns 時間段陣列
   * @throws AppError 當時間段數量超過限制時
   */
  splitTimeRange(
    startDate: Date,
    endDate: Date,
    granularity: TrendGranularity
  ): PeriodInfo[] {
    // 驗證日期範圍
    this.validateDateRange(startDate, endDate);

    // 根據粒度分割
    const periods = this.splitByGranularity(startDate, endDate, granularity);

    // 驗證時間段數量（FR-013b）
    this.validatePeriodCount(periods, granularity);

    return periods;
  }

  /**
   * 驗證日期範圍
   *
   * @param startDate - 開始日期
   * @param endDate - 結束日期
   * @throws AppError 當日期範圍無效時
   */
  private validateDateRange(startDate: Date, endDate: Date): void {
    if (startDate >= endDate) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        '開始日期必須早於結束日期'
      );
    }

    const daysDiff = differenceInDays(endDate, startDate);
    if (daysDiff < 1) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        '時間範圍至少需要 1 天'
      );
    }
  }

  /**
   * 根據粒度分割時間範圍
   *
   * @param startDate - 開始日期
   * @param endDate - 結束日期
   * @param granularity - 粒度
   * @returns 時間段陣列
   */
  private splitByGranularity(
    startDate: Date,
    endDate: Date,
    granularity: TrendGranularity
  ): PeriodInfo[] {
    switch (granularity) {
      case 'weekly':
        return this.splitByWeek(startDate, endDate);
      case 'monthly':
        return this.splitByMonth(startDate, endDate);
      case 'quarterly':
        return this.splitByQuarter(startDate, endDate);
    }
  }

  /**
   * 按週分割
   *
   * @param startDate - 開始日期
   * @param endDate - 結束日期
   * @returns 週時間段陣列
   */
  private splitByWeek(startDate: Date, endDate: Date): PeriodInfo[] {
    const weeks = eachWeekOfInterval(
      { start: startDate, end: endDate },
      { weekStartsOn: 1 } // 週一開始
    );

    return weeks.map((weekStart) => ({
      startDate: startOfWeek(weekStart, { weekStartsOn: 1 }),
      endDate: endOfWeek(weekStart, { weekStartsOn: 1 }),
    }));
  }

  /**
   * 按月分割
   *
   * @param startDate - 開始日期
   * @param endDate - 結束日期
   * @returns 月時間段陣列
   */
  private splitByMonth(startDate: Date, endDate: Date): PeriodInfo[] {
    const months = eachMonthOfInterval({ start: startDate, end: endDate });

    return months.map((monthStart) => ({
      startDate: startOfMonth(monthStart),
      endDate: endOfMonth(monthStart),
    }));
  }

  /**
   * 按季分割
   *
   * @param startDate - 開始日期
   * @param endDate - 結束日期
   * @returns 季時間段陣列
   */
  private splitByQuarter(startDate: Date, endDate: Date): PeriodInfo[] {
    const quarters = eachQuarterOfInterval({ start: startDate, end: endDate });

    return quarters.map((quarterStart) => ({
      startDate: startOfQuarter(quarterStart),
      endDate: endOfQuarter(quarterStart),
    }));
  }

  /**
   * 驗證時間段數量（FR-013b）
   *
   * @param periods - 時間段陣列
   * @param granularity - 粒度
   * @throws AppError 當時間段數量超過限制時
   */
  private validatePeriodCount(periods: PeriodInfo[], granularity: TrendGranularity): void {
    if (periods.length > TrendSplitter.MAX_PERIODS) {
      const suggestions = this.getSuggestions(granularity);
      throw new AppError(
        ErrorType.INVALID_INPUT,
        `時間段數量 (${periods.length}) 超過限制 (${TrendSplitter.MAX_PERIODS})。${suggestions}`
      );
    }

    if (periods.length < 2) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        '趨勢分析至少需要 2 個時間段'
      );
    }
  }

  /**
   * 取得縮小時間範圍的建議
   *
   * @param granularity - 當前粒度
   * @returns 建議文字
   */
  private getSuggestions(granularity: TrendGranularity): string {
    const suggestions = [];

    if (granularity === 'weekly') {
      suggestions.push('縮短時間範圍至 12 週內');
      suggestions.push('或使用 --trend-by monthly');
    } else if (granularity === 'monthly') {
      suggestions.push('縮短時間範圍至 12 個月內');
      suggestions.push('或使用 --trend-by quarterly');
    } else {
      suggestions.push('縮短時間範圍至 12 季內（3 年）');
    }

    return '建議：' + suggestions.join('，');
  }

  /**
   * 自動選擇合適的粒度
   *
   * @param startDate - 開始日期
   * @param endDate - 結束日期
   * @returns 建議的粒度
   */
  static autoSelectGranularity(startDate: Date, endDate: Date): TrendGranularity {
    const daysDiff = differenceInDays(endDate, startDate);

    if (daysDiff <= 84) {
      // <= 12 週
      return 'weekly';
    } else if (daysDiff <= 365) {
      // <= 12 個月
      return 'monthly';
    } else {
      return 'quarterly';
    }
  }
}
