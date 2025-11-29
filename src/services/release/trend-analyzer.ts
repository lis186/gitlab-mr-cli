/**
 * 發布趨勢分析器
 *
 * 分析跨發布的趨勢變化，追蹤改善或惡化方向
 *
 * @module services/release/trend-analyzer
 */

import type { Release } from '../../models/release.js';

/**
 * 趨勢分析閾值常數
 */
const TREND_THRESHOLDS = {
  /** 批量大小與凍結期的改善/惡化閾值（百分比） */
  BATCH_SIZE_AND_FREEZE: {
    IMPROVING: -10,  // 減少 10% 以上視為改善
    DEGRADING: 10,   // 增加 10% 以上視為惡化
  },
  /** 發布頻率的改善/惡化閾值（百分比） */
  RELEASE_FREQUENCY: {
    IMPROVING: -20,  // 減少 20% 以上視為改善（對 hotfix）
    DEGRADING: 20,   // 增加 20% 以上視為惡化（對 hotfix）
  },
} as const;

/**
 * 趨勢方向
 */
export type TrendDirection = 'improving' | 'stable' | 'degrading';

/**
 * 月度統計
 */
export interface MonthlyStats {
  month: string; // YYYY-MM 格式
  releaseCount: number;
  avgMrCount: number;
  avgLocChanges: number;
  avgFreezeDays: number;
  majorReleases: number;
  hotfixReleases: number;
  minorReleases: number;
}

/**
 * 趨勢比較資料（MoM 或 YoY）
 */
export interface TrendComparison {
  direction: TrendDirection;
  changePercent: number;
}

/**
 * 單月比較結果（包含 MoM 和 YoY）
 */
export interface MonthlyComparison {
  month: string;
  current: MonthlyStats;
  previousMonth: MonthlyStats | null; // 上個月資料（MoM）
  previousYear: MonthlyStats | null; // 去年同期資料（YoY）
  batchSize: {
    mom: TrendComparison; // Month-over-Month
    yoy: TrendComparison; // Year-over-Year
  };
  freezePeriod: {
    mom: TrendComparison;
    yoy: TrendComparison;
  };
  // 發布頻率拆分為三種類型獨立評估
  majorReleaseFrequency: {
    mom: TrendComparison;
    yoy: TrendComparison;
  };
  hotfixFrequency: {
    mom: TrendComparison;
    yoy: TrendComparison;
  };
  minorReleaseFrequency: {
    mom: TrendComparison;
    yoy: TrendComparison;
  };
}

// 向後相容的別名
export type MonthlyYoYComparison = MonthlyComparison;

/**
 * 單一指標的評估結果
 */
export interface MetricAssessment {
  avgChange: number;
  improvingMonths: number;
  degradingMonths: number;
  stableMonths: number;
  bestMonth: { month: string; changePercent: number } | null;
  worstMonth: { month: string; changePercent: number } | null;
  assessment: string;
  direction: TrendDirection;
}

/**
 * 年度總評（分別統計 MoM 和 YoY）
 */
export interface YearlyAssessment {
  batchSize: {
    mom: MetricAssessment; // Month-over-Month 評估
    yoy: MetricAssessment; // Year-over-Year 評估
  };
  freezePeriod: {
    mom: MetricAssessment;
    yoy: MetricAssessment;
  };
  // 發布頻率拆分為三種類型獨立評估
  majorReleaseFrequency: {
    mom: MetricAssessment;
    yoy: MetricAssessment;
  };
  hotfixFrequency: {
    mom: MetricAssessment;
    yoy: MetricAssessment;
  };
  minorReleaseFrequency: {
    mom: MetricAssessment;
    yoy: MetricAssessment;
  };
  overall: {
    direction: TrendDirection;
    summary: string;
    keyInsights: string[];
  };
}

/**
 * 趨勢分析結果
 */
export interface TrendAnalysis {
  monthlyStats: MonthlyStats[];
  monthlyComparisons: MonthlyYoYComparison[];
  yearlyAssessment: YearlyAssessment;
}

/**
 * 趨勢分析器
 */
export class TrendAnalyzer {
  /**
   * 分析發布趨勢
   *
   * @param releases - 發布列表（按時間排序，由新到舊）
   * @param months - 分析月數（預設 3）
   * @returns 趨勢分析結果
   */
  analyzeTrends(releases: Release[], months: number = 3): TrendAnalysis {
    // 按月份分組統計
    const monthlyStats = this.groupByMonth(releases, months);

    // 如果少於 2 個月的數據，無法計算趨勢
    if (monthlyStats.length < 2) {
      return this.getInsufficientDataResult(monthlyStats);
    }

    // 建立月份 Map 以便快速查找
    const monthMap = this.buildMonthMap(monthlyStats);

    // 計算每月的 MoM 和 YoY 比較
    const monthlyComparisons = this.calculateMonthlyComparisons(monthlyStats, monthMap, months);

    // 計算年度總評
    const yearlyAssessment = this.calculateYearlyAssessment(monthlyComparisons);

    return {
      monthlyStats,
      monthlyComparisons,
      yearlyAssessment,
    };
  }

  /**
   * 建立月份 Map 以便快速查找
   *
   * @param monthlyStats - 月度統計列表
   * @returns 月份 Map (key: 'YYYY-MM', value: MonthlyStats)
   * @private
   */
  private buildMonthMap(monthlyStats: MonthlyStats[]): Map<string, MonthlyStats> {
    const monthMap = new Map<string, MonthlyStats>();
    for (const stat of monthlyStats) {
      monthMap.set(stat.month, stat);
    }
    return monthMap;
  }

  /**
   * 計算每月的 MoM 和 YoY 比較
   *
   * @param monthlyStats - 月度統計列表
   * @param monthMap - 月份 Map
   * @param months - 要比較的月數
   * @returns 月度比較列表
   * @private
   */
  private calculateMonthlyComparisons(
    monthlyStats: MonthlyStats[],
    monthMap: Map<string, MonthlyStats>,
    months: number
  ): MonthlyComparison[] {
    const monthlyComparisons: MonthlyComparison[] = [];
    const recentMonths = monthlyStats.slice(0, months); // 只取最近 N 個月進行比較

    for (let i = 0; i < recentMonths.length; i++) {
      const currentStat = recentMonths[i]!;
      const previousMonthStat = i + 1 < recentMonths.length ? recentMonths[i + 1]! : null;
      const previousYearStat = this.findPreviousYearStat(currentStat.month, monthMap);

      const comparison = this.buildMonthlyComparison(currentStat, previousMonthStat, previousYearStat);
      monthlyComparisons.push(comparison);
    }

    return monthlyComparisons;
  }

  /**
   * 找出去年同期的統計資料
   *
   * @param currentMonth - 當前月份 (格式: 'YYYY-MM')
   * @param monthMap - 月份 Map
   * @returns 去年同期統計資料，若無則為 null
   * @private
   */
  private findPreviousYearStat(
    currentMonth: string,
    monthMap: Map<string, MonthlyStats>
  ): MonthlyStats | null {
    const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);
    const previousYearMonth = `${currentYear! - 1}-${String(currentMonthNum!).padStart(2, '0')}`;
    return monthMap.get(previousYearMonth) || null;
  }

  /**
   * 建立單月的比較資料
   *
   * @param current - 當前月統計
   * @param previousMonth - 上月統計
   * @param previousYear - 去年同期統計
   * @returns 月度比較資料
   * @private
   */
  private buildMonthlyComparison(
    current: MonthlyStats,
    previousMonth: MonthlyStats | null,
    previousYear: MonthlyStats | null
  ): MonthlyComparison {
    // 計算所有 MoM 變化
    const momChanges = this.calculateMoMChanges(current, previousMonth);

    // 計算所有 YoY 變化
    const yoyChanges = this.calculateYoYChanges(current, previousYear);

    return {
      month: current.month,
      current,
      previousMonth,
      previousYear,
      batchSize: {
        mom: {
          direction: this.getTrendDirection(
            momChanges.batchSize,
            TREND_THRESHOLDS.BATCH_SIZE_AND_FREEZE.IMPROVING,
            TREND_THRESHOLDS.BATCH_SIZE_AND_FREEZE.DEGRADING
          ),
          changePercent: momChanges.batchSize,
        },
        yoy: {
          direction: this.getTrendDirection(
            yoyChanges.batchSize,
            TREND_THRESHOLDS.BATCH_SIZE_AND_FREEZE.IMPROVING,
            TREND_THRESHOLDS.BATCH_SIZE_AND_FREEZE.DEGRADING
          ),
          changePercent: yoyChanges.batchSize,
        },
      },
      freezePeriod: {
        mom: {
          direction: this.getTrendDirection(
            momChanges.freezePeriod,
            TREND_THRESHOLDS.BATCH_SIZE_AND_FREEZE.IMPROVING,
            TREND_THRESHOLDS.BATCH_SIZE_AND_FREEZE.DEGRADING
          ),
          changePercent: momChanges.freezePeriod,
        },
        yoy: {
          direction: this.getTrendDirection(
            yoyChanges.freezePeriod,
            TREND_THRESHOLDS.BATCH_SIZE_AND_FREEZE.IMPROVING,
            TREND_THRESHOLDS.BATCH_SIZE_AND_FREEZE.DEGRADING
          ),
          changePercent: yoyChanges.freezePeriod,
        },
      },
      majorReleaseFrequency: {
        mom: {
          direction: this.getTrendDirection(
            momChanges.majorRelease,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.IMPROVING,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.DEGRADING
          ),
          changePercent: momChanges.majorRelease,
        },
        yoy: {
          direction: this.getTrendDirection(
            yoyChanges.majorRelease,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.IMPROVING,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.DEGRADING
          ),
          changePercent: yoyChanges.majorRelease,
        },
      },
      hotfixFrequency: {
        mom: {
          direction: this.getTrendDirection(
            momChanges.hotfix,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.IMPROVING,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.DEGRADING
          ),
          changePercent: momChanges.hotfix,
        },
        yoy: {
          direction: this.getTrendDirection(
            yoyChanges.hotfix,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.IMPROVING,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.DEGRADING
          ),
          changePercent: yoyChanges.hotfix,
        },
      },
      minorReleaseFrequency: {
        mom: {
          direction: this.getTrendDirection(
            momChanges.minorRelease,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.IMPROVING,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.DEGRADING
          ),
          changePercent: momChanges.minorRelease,
        },
        yoy: {
          direction: this.getTrendDirection(
            yoyChanges.minorRelease,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.IMPROVING,
            TREND_THRESHOLDS.RELEASE_FREQUENCY.DEGRADING
          ),
          changePercent: yoyChanges.minorRelease,
        },
      },
    };
  }

  /**
   * 計算 MoM（Month-over-Month）變化
   *
   * @param current - 當前月統計
   * @param previous - 上月統計
   * @returns MoM 變化百分比
   * @private
   */
  private calculateMoMChanges(
    current: MonthlyStats,
    previous: MonthlyStats | null
  ): {
    batchSize: number;
    freezePeriod: number;
    majorRelease: number;
    hotfix: number;
    minorRelease: number;
  } {
    if (!previous) {
      return {
        batchSize: 0,
        freezePeriod: 0,
        majorRelease: 0,
        hotfix: 0,
        minorRelease: 0,
      };
    }

    return {
      batchSize: this.calculateChangePercent(current.avgMrCount, previous.avgMrCount),
      freezePeriod: this.calculateChangePercent(current.avgFreezeDays, previous.avgFreezeDays),
      majorRelease: this.calculateChangePercent(current.majorReleases, previous.majorReleases),
      hotfix: this.calculateChangePercent(current.hotfixReleases, previous.hotfixReleases),
      minorRelease: this.calculateChangePercent(current.minorReleases, previous.minorReleases),
    };
  }

  /**
   * 計算 YoY（Year-over-Year）變化
   *
   * @param current - 當前月統計
   * @param previousYear - 去年同期統計
   * @returns YoY 變化百分比
   * @private
   */
  private calculateYoYChanges(
    current: MonthlyStats,
    previousYear: MonthlyStats | null
  ): {
    batchSize: number;
    freezePeriod: number;
    majorRelease: number;
    hotfix: number;
    minorRelease: number;
  } {
    if (!previousYear) {
      return {
        batchSize: 0,
        freezePeriod: 0,
        majorRelease: 0,
        hotfix: 0,
        minorRelease: 0,
      };
    }

    return {
      batchSize: this.calculateChangePercent(current.avgMrCount, previousYear.avgMrCount),
      freezePeriod: this.calculateChangePercent(current.avgFreezeDays, previousYear.avgFreezeDays),
      majorRelease: this.calculateChangePercent(current.majorReleases, previousYear.majorReleases),
      hotfix: this.calculateChangePercent(current.hotfixReleases, previousYear.hotfixReleases),
      minorRelease: this.calculateChangePercent(current.minorReleases, previousYear.minorReleases),
    };
  }

  /**
   * 按月份分組統計
   *
   * @param releases - 發布列表
   * @param months - 分析月數
   * @returns 月度統計列表（由新到舊）
   * @private
   */
  private groupByMonth(releases: Release[], months: number): MonthlyStats[] {
    const monthMap = new Map<string, Release[]>();

    // 分組到各月份
    for (const release of releases) {
      const monthKey = this.getMonthKey(release.date);
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
      }
      const monthReleases = monthMap.get(monthKey);
      if (monthReleases) {
        monthReleases.push(release);
      }
    }

    // 取得最近 N 個月的統計
    const sortedMonths = Array.from(monthMap.keys()).sort().reverse();
    const recentMonths = sortedMonths.slice(0, months);

    const stats: MonthlyStats[] = [];
    for (const month of recentMonths) {
      const monthReleases = monthMap.get(month);
      if (monthReleases) {
        stats.push(this.calculateMonthlyStats(month, monthReleases));
      }
    }

    // 額外加入去年同期資料（用於 YoY 比較）
    if (recentMonths.length > 0) {
      const latestMonth = recentMonths[0]!;
      const [currentYear, currentMonthNum] = latestMonth.split('-').map(Number);
      const previousYearMonth = `${currentYear! - 1}-${String(currentMonthNum!).padStart(2, '0')}`;

      // 如果 previousYearMonth 還沒被包含在 stats 中，且存在於資料中，則加入
      if (!recentMonths.includes(previousYearMonth) && monthMap.has(previousYearMonth)) {
        const previousYearReleases = monthMap.get(previousYearMonth);
        if (previousYearReleases) {
          stats.push(this.calculateMonthlyStats(previousYearMonth, previousYearReleases));
        }
      }
    }

    return stats;
  }

  /**
   * 計算單月統計
   *
   * @param month - 月份 (YYYY-MM)
   * @param releases - 該月的發布列表
   * @returns 月度統計
   * @private
   */
  private calculateMonthlyStats(month: string, releases: Release[]): MonthlyStats {
    const majorReleases = releases.filter((r) => r.type === 'major');
    const hotfixReleases = releases.filter((r) => r.type === 'hotfix');
    const minorReleases = releases.filter((r) => r.type === 'minor');

    // 只計算 major 發布的平均值
    const totalMr = majorReleases.reduce((sum, r) => sum + r.mr_count, 0);
    const totalLoc = majorReleases.reduce((sum, r) => sum + r.total_loc_changes, 0);
    const totalFreeze = majorReleases.reduce((sum, r) => sum + r.freeze_days, 0);

    const avgMrCount = majorReleases.length > 0 ? totalMr / majorReleases.length : 0;
    const avgLocChanges = majorReleases.length > 0 ? totalLoc / majorReleases.length : 0;
    const avgFreezeDays = majorReleases.length > 0 ? totalFreeze / majorReleases.length : 0;

    return {
      month,
      releaseCount: releases.length,
      avgMrCount,
      avgLocChanges,
      avgFreezeDays,
      majorReleases: majorReleases.length,
      hotfixReleases: hotfixReleases.length,
      minorReleases: minorReleases.length,
    };
  }

  /**
   * 計算年度總評
   *
   * @param comparisons - 月度 YoY 比較列表
   * @returns 年度總評
   * @private
   */
  private calculateYearlyAssessment(comparisons: MonthlyComparison[]): YearlyAssessment {
    if (comparisons.length === 0) {
      return this.getEmptyYearlyAssessment();
    }

    // 計算所有指標的評估
    const metricAssessments = this.calculateAllMetricAssessments(comparisons);

    // 計算整體評估
    const overall = this.calculateOverallAssessment(
      metricAssessments.batchSize,
      metricAssessments.freezePeriod,
      metricAssessments.hotfixFrequency,
      comparisons
    );

    return {
      ...metricAssessments,
      overall,
    };
  }

  /**
   * 計算所有指標的評估（MoM 和 YoY）
   *
   * @param comparisons - 月度比較列表
   * @returns 所有指標評估
   * @private
   */
  private calculateAllMetricAssessments(comparisons: MonthlyComparison[]): {
    batchSize: { mom: MetricAssessment; yoy: MetricAssessment };
    freezePeriod: { mom: MetricAssessment; yoy: MetricAssessment };
    majorReleaseFrequency: { mom: MetricAssessment; yoy: MetricAssessment };
    hotfixFrequency: { mom: MetricAssessment; yoy: MetricAssessment };
    minorReleaseFrequency: { mom: MetricAssessment; yoy: MetricAssessment };
  } {
    // 批量大小總評（MoM + YoY）
    const batchSizeMom = this.calculateMetricAssessment(comparisons, 'batchSize', true, 'mom');
    const batchSizeYoy = this.calculateMetricAssessment(comparisons, 'batchSize', true, 'yoy');

    // 凍結期總評（MoM + YoY）
    const freezePeriodMom = this.calculateMetricAssessment(comparisons, 'freezePeriod', true, 'mom');
    const freezePeriodYoy = this.calculateMetricAssessment(comparisons, 'freezePeriod', true, 'yoy');

    // Major 發布：中性指標（穩定頻率最佳）
    const majorReleaseFrequencyMom = this.calculateMetricAssessment(
      comparisons,
      'majorReleaseFrequency',
      null,
      'mom'
    );
    const majorReleaseFrequencyYoy = this.calculateMetricAssessment(
      comparisons,
      'majorReleaseFrequency',
      null,
      'yoy'
    );

    // Hotfix 發布：減少為改善（品質指標）
    const hotfixFrequencyMom = this.calculateMetricAssessment(comparisons, 'hotfixFrequency', true, 'mom');
    const hotfixFrequencyYoy = this.calculateMetricAssessment(comparisons, 'hotfixFrequency', true, 'yoy');

    // Minor 發布：中性指標（視業務需求而定）
    const minorReleaseFrequencyMom = this.calculateMetricAssessment(
      comparisons,
      'minorReleaseFrequency',
      null,
      'mom'
    );
    const minorReleaseFrequencyYoy = this.calculateMetricAssessment(
      comparisons,
      'minorReleaseFrequency',
      null,
      'yoy'
    );

    return {
      batchSize: { mom: batchSizeMom, yoy: batchSizeYoy },
      freezePeriod: { mom: freezePeriodMom, yoy: freezePeriodYoy },
      majorReleaseFrequency: { mom: majorReleaseFrequencyMom, yoy: majorReleaseFrequencyYoy },
      hotfixFrequency: { mom: hotfixFrequencyMom, yoy: hotfixFrequencyYoy },
      minorReleaseFrequency: { mom: minorReleaseFrequencyMom, yoy: minorReleaseFrequencyYoy },
    };
  }

  /**
   * 計算整體評估
   *
   * @param batchSize - 批量大小評估
   * @param freezePeriod - 凍結期評估
   * @param hotfixFrequency - Hotfix 頻率評估
   * @param comparisons - 月度比較列表
   * @returns 整體評估
   * @private
   */
  private calculateOverallAssessment(
    batchSize: { mom: MetricAssessment; yoy: MetricAssessment },
    freezePeriod: { mom: MetricAssessment; yoy: MetricAssessment },
    hotfixFrequency: { mom: MetricAssessment; yoy: MetricAssessment },
    comparisons: MonthlyComparison[]
  ): {
    direction: TrendDirection;
    summary: string;
    keyInsights: string[];
  } {
    // 計算總體評分
    const { totalScore, momScore, yoyScore } = this.calculateTotalScore(
      batchSize,
      freezePeriod,
      hotfixFrequency
    );

    // 判定整體方向與總結
    const { direction, summary } = this.determineOverallTrend(totalScore, momScore, yoyScore);

    // 生成關鍵洞察
    const keyInsights = this.generateKeyInsights(batchSize, freezePeriod, hotfixFrequency, comparisons);

    return { direction, summary, keyInsights };
  }

  /**
   * 計算總體評分
   *
   * @private
   */
  private calculateTotalScore(
    batchSize: { mom: MetricAssessment; yoy: MetricAssessment },
    freezePeriod: { mom: MetricAssessment; yoy: MetricAssessment },
    hotfixFrequency: { mom: MetricAssessment; yoy: MetricAssessment }
  ): { totalScore: number; momScore: number; yoyScore: number } {
    const scores = {
      improving: 1,
      stable: 0,
      degrading: -1,
    };

    const momScore =
      scores[batchSize.mom.direction] +
      scores[freezePeriod.mom.direction] +
      scores[hotfixFrequency.mom.direction];

    const yoyScore =
      scores[batchSize.yoy.direction] +
      scores[freezePeriod.yoy.direction] +
      scores[hotfixFrequency.yoy.direction];

    // 綜合 MoM 和 YoY 評分（MoM 權重較高）
    const totalScore = momScore * 2 + yoyScore;

    return { totalScore, momScore, yoyScore };
  }

  /**
   * 判定整體趨勢方向與總結
   *
   * @private
   */
  private determineOverallTrend(
    totalScore: number,
    momScore: number,
    yoyScore: number
  ): { direction: TrendDirection; summary: string } {
    let direction: TrendDirection;
    let summary: string;

    if (totalScore >= 4) {
      direction = 'improving';
      summary = '短期與長期趨勢均向好，團隊實踐持續改善';
    } else if (totalScore <= -4) {
      direction = 'degrading';
      summary = '短期與長期趨勢均惡化，建議立即檢討流程';
    } else if (momScore >= 1 && yoyScore >= 0) {
      direction = 'improving';
      summary = '短期表現優異，長期趨勢穩健';
    } else if (momScore <= -1 && yoyScore <= 0) {
      direction = 'degrading';
      summary = '短期表現不佳，需加強改善力道';
    } else {
      direction = 'stable';
      summary = '整體趨勢穩定，持續監控關鍵指標';
    }

    return { direction, summary };
  }

  /**
   * 計算單一指標的年度評估
   *
   * @param comparisons - 月度比較列表
   * @param metricKey - 指標鍵值
   * @param metricName - 指標名稱
   * @param decreaseIsImproving - 減少是否為改善
   * @param trendType - 趨勢類型（'mom' 或 'yoy'）
   * @returns 指標評估結果
   * @private
   */
  private calculateMetricAssessment(
    comparisons: MonthlyComparison[],
    metricKey:
      | 'batchSize'
      | 'freezePeriod'
      | 'majorReleaseFrequency'
      | 'hotfixFrequency'
      | 'minorReleaseFrequency',
    decreaseIsImproving: boolean | null, // null 表示中性指標，不評估好壞
    trendType: 'mom' | 'yoy'
  ): MetricAssessment {
    // 收集統計數據
    const stats = this.collectMetricStatistics(comparisons, metricKey, decreaseIsImproving, trendType);

    // 判定整體方向
    const direction = this.determineMetricDirection(
      stats.improvingMonths,
      stats.degradingMonths,
      stats.stableMonths
    );

    // 生成評估描述
    const assessment = this.generateMetricAssessment(
      metricKey,
      direction,
      stats.improvingMonths,
      stats.degradingMonths,
      stats.validComparisonCount
    );

    return {
      avgChange: stats.avgChange,
      improvingMonths: stats.improvingMonths,
      degradingMonths: stats.degradingMonths,
      stableMonths: stats.stableMonths,
      bestMonth: stats.bestMonth,
      worstMonth: stats.worstMonth,
      assessment,
      direction,
    };
  }

  /**
   * 收集指標統計數據
   *
   * @param comparisons - 月度比較列表
   * @param metricKey - 指標鍵值
   * @param decreaseIsImproving - 減少是否為改善
   * @param trendType - 趨勢類型
   * @returns 統計數據
   * @private
   */
  private collectMetricStatistics(
    comparisons: MonthlyComparison[],
    metricKey:
      | 'batchSize'
      | 'freezePeriod'
      | 'majorReleaseFrequency'
      | 'hotfixFrequency'
      | 'minorReleaseFrequency',
    decreaseIsImproving: boolean | null,
    trendType: 'mom' | 'yoy'
  ): {
    improvingMonths: number;
    degradingMonths: number;
    stableMonths: number;
    avgChange: number;
    validComparisonCount: number;
    bestMonth: { month: string; changePercent: number } | null;
    worstMonth: { month: string; changePercent: number } | null;
  } {
    let improvingMonths = 0;
    let degradingMonths = 0;
    let stableMonths = 0;
    let totalChange = 0;
    let validComparisonCount = 0;
    let bestMonth: { month: string; changePercent: number } | null = null;
    let worstMonth: { month: string; changePercent: number } | null = null;

    for (const comparison of comparisons) {
      // 根據類型檢查是否有比較資料
      const hasComparison =
        trendType === 'mom' ? comparison.previousMonth !== null : comparison.previousYear !== null;

      if (!hasComparison) {
        continue;
      }

      validComparisonCount++;
      const metric = comparison[metricKey][trendType];
      const direction = metric.direction;
      const changePercent = metric.changePercent;

      totalChange += changePercent;

      // 統計改善/惡化/穩定月份
      if (decreaseIsImproving !== null) {
        if (direction === 'improving') improvingMonths++;
        else if (direction === 'degrading') degradingMonths++;
        else stableMonths++;
      } else {
        // 中性指標：全部視為穩定
        stableMonths++;
      }

      // 更新最佳/最差月份
      if (decreaseIsImproving === true) {
        if (!bestMonth || changePercent < bestMonth.changePercent) {
          bestMonth = { month: comparison.month, changePercent };
        }
        if (!worstMonth || changePercent > worstMonth.changePercent) {
          worstMonth = { month: comparison.month, changePercent };
        }
      } else if (decreaseIsImproving === false) {
        if (!bestMonth || changePercent > bestMonth.changePercent) {
          bestMonth = { month: comparison.month, changePercent };
        }
        if (!worstMonth || changePercent < worstMonth.changePercent) {
          worstMonth = { month: comparison.month, changePercent };
        }
      }
    }

    const avgChange = validComparisonCount > 0 ? totalChange / validComparisonCount : 0;

    return {
      improvingMonths,
      degradingMonths,
      stableMonths,
      avgChange,
      validComparisonCount,
      bestMonth,
      worstMonth,
    };
  }

  /**
   * 判定指標的整體趨勢方向
   *
   * @param improvingMonths - 改善月份數
   * @param degradingMonths - 惡化月份數
   * @param stableMonths - 穩定月份數
   * @returns 趨勢方向
   * @private
   */
  private determineMetricDirection(
    improvingMonths: number,
    degradingMonths: number,
    stableMonths: number
  ): TrendDirection {
    if (improvingMonths > degradingMonths + stableMonths / 2) {
      return 'improving';
    } else if (degradingMonths > improvingMonths + stableMonths / 2) {
      return 'degrading';
    } else {
      return 'stable';
    }
  }

  /**
   * 生成指標評估描述
   *
   * @param metricKey - 指標鍵值
   * @param direction - 趨勢方向
   * @param improvingMonths - 改善月份數
   * @param degradingMonths - 惡化月份數
   * @param validComparisonCount - 有效比較月份數
   * @returns 評估描述
   * @private
   */
  private generateMetricAssessment(
    metricKey: string,
    direction: TrendDirection,
    improvingMonths: number,
    degradingMonths: number,
    validComparisonCount: number
  ): string {
    if (metricKey === 'batchSize') {
      return this.generateBatchSizeAssessment(direction, improvingMonths, degradingMonths, validComparisonCount);
    } else if (metricKey === 'freezePeriod') {
      return this.generateFreezePeriodAssessment(direction, improvingMonths, degradingMonths, validComparisonCount);
    } else {
      return this.generateReleaseFrequencyAssessment(direction, improvingMonths, degradingMonths, validComparisonCount);
    }
  }

  /**
   * 生成批量大小的評估描述
   * @private
   */
  private generateBatchSizeAssessment(
    direction: TrendDirection,
    improvingMonths: number,
    degradingMonths: number,
    validComparisonCount: number
  ): string {
    if (direction === 'improving') {
      return `批量持續減少，${improvingMonths}/${validComparisonCount} 月份優於去年同期`;
    } else if (direction === 'degrading') {
      return `批量持續增加，${degradingMonths}/${validComparisonCount} 月份劣於去年同期，建議檢視整合流程`;
    } else {
      return `批量維持穩定`;
    }
  }

  /**
   * 生成凍結期的評估描述
   * @private
   */
  private generateFreezePeriodAssessment(
    direction: TrendDirection,
    improvingMonths: number,
    degradingMonths: number,
    validComparisonCount: number
  ): string {
    if (direction === 'improving') {
      return `凍結期大幅改善，${improvingMonths}/${validComparisonCount} 月份優於去年同期，顯示測試自動化成效`;
    } else if (direction === 'degrading') {
      return `凍結期延長，${degradingMonths}/${validComparisonCount} 月份劣於去年同期，建議檢討測試自動化`;
    } else {
      return `凍結期維持穩定`;
    }
  }

  /**
   * 生成發布頻率的評估描述
   * @private
   */
  private generateReleaseFrequencyAssessment(
    direction: TrendDirection,
    improvingMonths: number,
    degradingMonths: number,
    validComparisonCount: number
  ): string {
    if (direction === 'improving') {
      return `發布頻率提升，${improvingMonths}/${validComparisonCount} 月份優於去年同期`;
    } else if (direction === 'degrading') {
      return `發布頻率降低，${degradingMonths}/${validComparisonCount} 月份劣於去年同期`;
    } else {
      return `發布頻率維持穩定`;
    }
  }

  /**
   * 生成關鍵洞察（結合 MoM 和 YoY）
   *
   * @param batchSize - 批量評估（包含 mom 和 yoy）
   * @param freezePeriod - 凍結期評估
   * @param hotfixFrequency - Hotfix 頻率評估（品質指標）
   * @param comparisons - 月度比較列表
   * @returns 關鍵洞察列表
   * @private
   */
  private generateKeyInsights(
    batchSize: { mom: MetricAssessment; yoy: MetricAssessment },
    freezePeriod: { mom: MetricAssessment; yoy: MetricAssessment },
    hotfixFrequency: { mom: MetricAssessment; yoy: MetricAssessment },
    comparisons: MonthlyComparison[]
  ): string[] {
    const insights: string[] = [];

    const momCount = comparisons.filter((c) => c.previousMonth !== null).length;
    const yoyCount = comparisons.filter((c) => c.previousYear !== null).length;

    // 短期趨勢洞察（MoM）
    if (batchSize.mom.improvingMonths >= momCount * 0.6) {
      insights.push(
        `短期批量控制良好，${batchSize.mom.improvingMonths}/${momCount} 個月持續改善`
      );
    } else if (batchSize.mom.degradingMonths >= momCount * 0.6) {
      insights.push(
        `短期批量持續增加（${batchSize.mom.degradingMonths}/${momCount} 個月），建議檢視最近流程變化`
      );
    }

    // 長期趨勢洞察（YoY）
    if (yoyCount > 0 && batchSize.yoy.improvingMonths >= yoyCount * 0.6) {
      insights.push(
        `長期趨勢向好，${batchSize.yoy.improvingMonths}/${yoyCount} 個月優於去年同期`
      );
    }

    // 凍結期洞察
    if (freezePeriod.mom.avgChange < -20) {
      insights.push(
        `凍結期大幅改善（MoM 平均 ${freezePeriod.mom.avgChange.toFixed(1)}%），顯示測試自動化成效`
      );
    }

    // Hotfix 頻率洞察（品質指標）
    if (momCount > 0) {
      if (hotfixFrequency.mom.improvingMonths >= momCount * 0.6) {
        insights.push(
          `✓ 發布品質持續改善，${hotfixFrequency.mom.improvingMonths}/${momCount} 個月 Hotfix 減少`
        );
      } else if (hotfixFrequency.mom.degradingMonths >= momCount * 0.6) {
        insights.push(
          `⚠️  品質需關注，${hotfixFrequency.mom.degradingMonths}/${momCount} 個月 Hotfix 增加`
        );
      }
    }

    if (yoyCount > 0 && hotfixFrequency.yoy.improvingMonths >= yoyCount * 0.6) {
      insights.push(
        `長期品質穩健，${hotfixFrequency.yoy.improvingMonths}/${yoyCount} 個月 Hotfix 優於去年同期`
      );
    }

    return insights;
  }

  /**
   * 取得空的年度評估（資料不足時）
   *
   * @returns 空的年度評估
   * @private
   */
  private getEmptyYearlyAssessment(): YearlyAssessment {
    const emptyMetric: MetricAssessment = {
      avgChange: 0,
      improvingMonths: 0,
      degradingMonths: 0,
      stableMonths: 0,
      bestMonth: null,
      worstMonth: null,
      assessment: '資料不足，無法計算評估',
      direction: 'stable' as TrendDirection,
    };

    return {
      batchSize: {
        mom: emptyMetric,
        yoy: emptyMetric,
      },
      freezePeriod: {
        mom: emptyMetric,
        yoy: emptyMetric,
      },
      majorReleaseFrequency: {
        mom: emptyMetric,
        yoy: emptyMetric,
      },
      hotfixFrequency: {
        mom: emptyMetric,
        yoy: emptyMetric,
      },
      minorReleaseFrequency: {
        mom: emptyMetric,
        yoy: emptyMetric,
      },
      overall: {
        direction: 'stable',
        summary: '資料不足，無法進行趨勢評估',
        keyInsights: [],
      },
    };
  }

  /**
   * 計算變化百分比
   *
   * @param current - 當前值
   * @param previous - 前一值
   * @returns 變化百分比
   * @private
   */
  private calculateChangePercent(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
  }

  /**
   * 取得趨勢方向
   *
   * @param changePercent - 變化百分比
   * @param improvingThreshold - 改善門檻（負數表示減少為改善）
   * @param degradingThreshold - 惡化門檻（正數表示增加為惡化）
   * @returns 趨勢方向
   * @private
   */
  private getTrendDirection(
    changePercent: number,
    improvingThreshold: number,
    degradingThreshold: number
  ): TrendDirection {
    if (changePercent <= improvingThreshold) {
      return 'improving';
    } else if (changePercent >= degradingThreshold) {
      return 'degrading';
    } else {
      return 'stable';
    }
  }

  /**
   * 取得月份鍵值 (YYYY-MM)
   *
   * @param date - 日期
   * @returns 月份鍵值
   * @private
   */
  private getMonthKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * 取得資料不足時的結果
   *
   * @param monthlyStats - 月度統計
   * @returns 趨勢分析結果
   * @private
   */
  private getInsufficientDataResult(monthlyStats: MonthlyStats[]): TrendAnalysis {
    return {
      monthlyStats,
      monthlyComparisons: [],
      yearlyAssessment: this.getEmptyYearlyAssessment(),
    };
  }
}
