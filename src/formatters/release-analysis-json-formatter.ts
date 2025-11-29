/**
 * 發布批量分析 JSON 格式化器
 *
 * 將發布批量分析結果格式化為 JSON 輸出
 *
 * @module formatters/release-analysis-json-formatter
 */

import type { Release } from '../models/release.js';
import type { IntegrationFrequencyAnalysis } from '../services/release/integration-analyzer.js';
import type { TrendAnalysis } from '../services/release/trend-analyzer.js';

/**
 * 分析輸出結構
 */
export interface ReleaseAnalysisOutput {
  project: {
    path: string;
    name: string;
  };
  analysisDate: string;
  timeRange: {
    since: string;
    until: string;
  };
  configSource: string;
  configName: string;
  analysisMode?: 'standard' | 'integration_only';  // 分析模式
  releases: Release[];
  metrics: {
    average_mr_count: number;
    average_loc_changes: number;
    level: 'healthy' | 'warning' | 'critical';
    recommendation: string;
  };
  releaseRhythm?: Array<{
    type: string;
    count: number;
    averageInterval: number | null;
    frequency: string;
    assessment: string;
  }>;
  qualityMetrics?: {
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
  };
  integrationFrequency?: IntegrationFrequencyAnalysis;
  readiness?: {
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
  };
  trendAnalysis?: TrendAnalysis;
}

/**
 * 格式化發布批量分析結果為 JSON
 *
 * @param output - 分析輸出
 * @returns 格式化的 JSON 字串
 */
export function formatReleaseAnalysisJson(output: ReleaseAnalysisOutput): string {
  const jsonOutput = {
    metadata: {
      analyzed_at: output.analysisDate,
      project: output.project.path,
      project_name: output.project.name,
      time_range: output.timeRange,
      config_source: output.configSource,
      config_name: output.configName,
    },
    metrics: {
      batch_size: output.metrics,
    },
    releases: output.releases.map((release) => ({
      tag: release.tag,
      commit_sha: release.commit_sha,
      date: release.date.toISOString(),
      type: release.type,
      mr_count: release.mr_count,
      mr_list: release.mr_list,
      total_loc_additions: release.total_loc_additions,
      total_loc_deletions: release.total_loc_deletions,
      total_loc_changes: release.total_loc_changes,
      interval_days: release.interval_days,
      freeze_days: release.freeze_days,
      health_level: release.health_level,
      previous_release_tag: release.previous_release_tag,
    })),
    release_rhythm: output.releaseRhythm
      ? output.releaseRhythm.map((rhythm) => ({
          type: rhythm.type,
          count: rhythm.count,
          average_interval_days: rhythm.averageInterval,
          frequency: rhythm.frequency,
          assessment: rhythm.assessment,
        }))
      : undefined,
    quality_metrics: output.qualityMetrics
      ? {
          major_release_quality: output.qualityMetrics.majorReleaseQuality.map((q) => ({
            major_release_tag: q.majorRelease.tag,
            major_release_date: q.majorRelease.date.toISOString(),
            days_until_first_hotfix: q.daysUntilFirstHotfix,
            first_hotfix_tag: q.firstHotfix?.tag || null,
            first_hotfix_date: q.firstHotfix?.date.toISOString() || null,
            assessment: q.assessment,
          })),
          stability_periods: {
            longest: output.qualityMetrics.stabilityPeriods.longest
              ? {
                  days: output.qualityMetrics.stabilityPeriods.longest.days,
                  period: output.qualityMetrics.stabilityPeriods.longest.period,
                  start_release: output.qualityMetrics.stabilityPeriods.longest.startRelease.tag,
                  end_release: output.qualityMetrics.stabilityPeriods.longest.endRelease.tag,
                }
              : null,
            shortest: output.qualityMetrics.stabilityPeriods.shortest
              ? {
                  days: output.qualityMetrics.stabilityPeriods.shortest.days,
                  period: output.qualityMetrics.stabilityPeriods.shortest.period,
                  start_release: output.qualityMetrics.stabilityPeriods.shortest.startRelease.tag,
                  end_release: output.qualityMetrics.stabilityPeriods.shortest.endRelease.tag,
                }
              : null,
          },
        }
      : undefined,
    integration_frequency: output.integrationFrequency
      ? {
          days_analyzed: output.integrationFrequency.days_analyzed,
          total_merges: output.integrationFrequency.total_merges,
          merges_per_day: output.integrationFrequency.merges_per_day,
          merges_per_week: output.integrationFrequency.merges_per_week,
          dora_level: output.integrationFrequency.dora_level,
          dora_description: output.integrationFrequency.dora_description,
          end_of_month_pattern: output.integrationFrequency.end_of_month_pattern,
        }
      : undefined,
    readiness: output.readiness
      ? {
          freeze_period_assessment: output.readiness.freezePeriodAssessment.map((a) => ({
            release_tag: a.release.tag,
            release_date: a.release.date.toISOString(),
            freeze_days: a.freezeDays,
            assessment: a.assessment,
            health_level: a.healthLevel,
          })),
          summary: {
            avg_freeze_days: output.readiness.summary.avgFreezeDays,
            healthy_count: output.readiness.summary.healthyCount,
            warning_count: output.readiness.summary.warningCount,
            critical_count: output.readiness.summary.criticalCount,
            recommendation: output.readiness.summary.recommendation,
          },
        }
      : undefined,
    trend_analysis: output.trendAnalysis
      ? {
          monthly_stats: output.trendAnalysis.monthlyStats.map((m) => ({
            month: m.month,
            release_count: m.releaseCount,
            avg_mr_count: m.avgMrCount,
            avg_loc_changes: m.avgLocChanges,
            avg_freeze_days: m.avgFreezeDays,
            major_releases: m.majorReleases,
            hotfix_releases: m.hotfixReleases,
            minor_releases: m.minorReleases,
          })),
          monthly_comparisons: output.trendAnalysis.monthlyComparisons.map((comp) => ({
            month: comp.month,
            current: {
              release_count: comp.current.releaseCount,
              avg_mr_count: comp.current.avgMrCount,
              avg_loc_changes: comp.current.avgLocChanges,
              avg_freeze_days: comp.current.avgFreezeDays,
              major_releases: comp.current.majorReleases,
              hotfix_releases: comp.current.hotfixReleases,
              minor_releases: comp.current.minorReleases,
            },
            previous_month: comp.previousMonth
              ? {
                  release_count: comp.previousMonth.releaseCount,
                  avg_mr_count: comp.previousMonth.avgMrCount,
                  avg_loc_changes: comp.previousMonth.avgLocChanges,
                  avg_freeze_days: comp.previousMonth.avgFreezeDays,
                  major_releases: comp.previousMonth.majorReleases,
                  hotfix_releases: comp.previousMonth.hotfixReleases,
                  minor_releases: comp.previousMonth.minorReleases,
                }
              : null,
            previous_year: comp.previousYear
              ? {
                  release_count: comp.previousYear.releaseCount,
                  avg_mr_count: comp.previousYear.avgMrCount,
                  avg_loc_changes: comp.previousYear.avgLocChanges,
                  avg_freeze_days: comp.previousYear.avgFreezeDays,
                  major_releases: comp.previousYear.majorReleases,
                  hotfix_releases: comp.previousYear.hotfixReleases,
                  minor_releases: comp.previousYear.minorReleases,
                }
              : null,
            batch_size: {
              mom: {
                direction: comp.batchSize.mom.direction,
                change_percent: comp.batchSize.mom.changePercent,
              },
              yoy: {
                direction: comp.batchSize.yoy.direction,
                change_percent: comp.batchSize.yoy.changePercent,
              },
            },
            freeze_period: {
              mom: {
                direction: comp.freezePeriod.mom.direction,
                change_percent: comp.freezePeriod.mom.changePercent,
              },
              yoy: {
                direction: comp.freezePeriod.yoy.direction,
                change_percent: comp.freezePeriod.yoy.changePercent,
              },
            },
            major_release_frequency: {
              mom: {
                direction: comp.majorReleaseFrequency.mom.direction,
                change_percent: comp.majorReleaseFrequency.mom.changePercent,
              },
              yoy: {
                direction: comp.majorReleaseFrequency.yoy.direction,
                change_percent: comp.majorReleaseFrequency.yoy.changePercent,
              },
            },
            hotfix_frequency: {
              mom: {
                direction: comp.hotfixFrequency.mom.direction,
                change_percent: comp.hotfixFrequency.mom.changePercent,
              },
              yoy: {
                direction: comp.hotfixFrequency.yoy.direction,
                change_percent: comp.hotfixFrequency.yoy.changePercent,
              },
            },
            minor_release_frequency: {
              mom: {
                direction: comp.minorReleaseFrequency.mom.direction,
                change_percent: comp.minorReleaseFrequency.mom.changePercent,
              },
              yoy: {
                direction: comp.minorReleaseFrequency.yoy.direction,
                change_percent: comp.minorReleaseFrequency.yoy.changePercent,
              },
            },
          })),
          yearly_assessment: {
            batch_size: {
              mom: {
                avg_change: output.trendAnalysis.yearlyAssessment.batchSize.mom.avgChange,
                improving_months: output.trendAnalysis.yearlyAssessment.batchSize.mom.improvingMonths,
                degrading_months: output.trendAnalysis.yearlyAssessment.batchSize.mom.degradingMonths,
                stable_months: output.trendAnalysis.yearlyAssessment.batchSize.mom.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.batchSize.mom.bestMonth
                  ? {
                      month: output.trendAnalysis.yearlyAssessment.batchSize.mom.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.batchSize.mom.bestMonth.changePercent,
                    }
                  : null,
                worst_month: output.trendAnalysis.yearlyAssessment.batchSize.mom.worstMonth
                  ? {
                      month: output.trendAnalysis.yearlyAssessment.batchSize.mom.worstMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.batchSize.mom.worstMonth.changePercent,
                    }
                  : null,
                assessment: output.trendAnalysis.yearlyAssessment.batchSize.mom.assessment,
                direction: output.trendAnalysis.yearlyAssessment.batchSize.mom.direction,
              },
              yoy: {
                avg_change: output.trendAnalysis.yearlyAssessment.batchSize.yoy.avgChange,
                improving_months: output.trendAnalysis.yearlyAssessment.batchSize.yoy.improvingMonths,
                degrading_months: output.trendAnalysis.yearlyAssessment.batchSize.yoy.degradingMonths,
                stable_months: output.trendAnalysis.yearlyAssessment.batchSize.yoy.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.batchSize.yoy.bestMonth
                  ? {
                      month: output.trendAnalysis.yearlyAssessment.batchSize.yoy.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.batchSize.yoy.bestMonth.changePercent,
                    }
                  : null,
                worst_month: output.trendAnalysis.yearlyAssessment.batchSize.yoy.worstMonth
                  ? {
                      month: output.trendAnalysis.yearlyAssessment.batchSize.yoy.worstMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.batchSize.yoy.worstMonth.changePercent,
                    }
                  : null,
                assessment: output.trendAnalysis.yearlyAssessment.batchSize.yoy.assessment,
                direction: output.trendAnalysis.yearlyAssessment.batchSize.yoy.direction,
              },
            },
            freeze_period: {
              mom: {
                avg_change: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.avgChange,
                improving_months: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.improvingMonths,
                degrading_months: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.degradingMonths,
                stable_months: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.bestMonth
                  ? {
                      month: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.freezePeriod.mom.bestMonth.changePercent,
                    }
                  : null,
                worst_month: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.worstMonth
                  ? {
                      month: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.worstMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.freezePeriod.mom.worstMonth.changePercent,
                    }
                  : null,
                assessment: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.assessment,
                direction: output.trendAnalysis.yearlyAssessment.freezePeriod.mom.direction,
              },
              yoy: {
                avg_change: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.avgChange,
                improving_months: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.improvingMonths,
                degrading_months: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.degradingMonths,
                stable_months: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.bestMonth
                  ? {
                      month: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.bestMonth.changePercent,
                    }
                  : null,
                worst_month: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.worstMonth
                  ? {
                      month: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.worstMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.worstMonth.changePercent,
                    }
                  : null,
                assessment: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.assessment,
                direction: output.trendAnalysis.yearlyAssessment.freezePeriod.yoy.direction,
              },
            },
            major_release_frequency: {
              mom: {
                avg_change: output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.avgChange,
                improving_months:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.improvingMonths,
                degrading_months:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.degradingMonths,
                stable_months:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.bestMonth
                  ? {
                      month:
                        output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.bestMonth
                          .changePercent,
                    }
                  : null,
                worst_month:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.worstMonth
                    ? {
                        month:
                          output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.worstMonth
                            .month,
                        change_percent:
                          output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.worstMonth
                            .changePercent,
                      }
                    : null,
                assessment:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.assessment,
                direction: output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.mom.direction,
              },
              yoy: {
                avg_change: output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.avgChange,
                improving_months:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.improvingMonths,
                degrading_months:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.degradingMonths,
                stable_months:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.bestMonth
                  ? {
                      month:
                        output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.bestMonth
                          .changePercent,
                    }
                  : null,
                worst_month:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.worstMonth
                    ? {
                        month:
                          output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.worstMonth
                            .month,
                        change_percent:
                          output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.worstMonth
                            .changePercent,
                      }
                    : null,
                assessment:
                  output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.assessment,
                direction: output.trendAnalysis.yearlyAssessment.majorReleaseFrequency.yoy.direction,
              },
            },
            hotfix_frequency: {
              mom: {
                avg_change: output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.avgChange,
                improving_months:
                  output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.improvingMonths,
                degrading_months:
                  output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.degradingMonths,
                stable_months: output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.bestMonth
                  ? {
                      month:
                        output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.bestMonth
                          .changePercent,
                    }
                  : null,
                worst_month: output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.worstMonth
                  ? {
                      month:
                        output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.worstMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.worstMonth
                          .changePercent,
                    }
                  : null,
                assessment: output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.assessment,
                direction: output.trendAnalysis.yearlyAssessment.hotfixFrequency.mom.direction,
              },
              yoy: {
                avg_change: output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.avgChange,
                improving_months:
                  output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.improvingMonths,
                degrading_months:
                  output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.degradingMonths,
                stable_months: output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.bestMonth
                  ? {
                      month:
                        output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.bestMonth
                          .changePercent,
                    }
                  : null,
                worst_month: output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.worstMonth
                  ? {
                      month:
                        output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.worstMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.worstMonth
                          .changePercent,
                    }
                  : null,
                assessment: output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.assessment,
                direction: output.trendAnalysis.yearlyAssessment.hotfixFrequency.yoy.direction,
              },
            },
            minor_release_frequency: {
              mom: {
                avg_change: output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.avgChange,
                improving_months:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.improvingMonths,
                degrading_months:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.degradingMonths,
                stable_months:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.bestMonth
                  ? {
                      month:
                        output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.bestMonth
                          .changePercent,
                    }
                  : null,
                worst_month:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.worstMonth
                    ? {
                        month:
                          output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.worstMonth
                            .month,
                        change_percent:
                          output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.worstMonth
                            .changePercent,
                      }
                    : null,
                assessment:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.assessment,
                direction: output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.mom.direction,
              },
              yoy: {
                avg_change: output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.avgChange,
                improving_months:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.improvingMonths,
                degrading_months:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.degradingMonths,
                stable_months:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.stableMonths,
                best_month: output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.bestMonth
                  ? {
                      month:
                        output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.bestMonth.month,
                      change_percent:
                        output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.bestMonth
                          .changePercent,
                    }
                  : null,
                worst_month:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.worstMonth
                    ? {
                        month:
                          output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.worstMonth
                            .month,
                        change_percent:
                          output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.worstMonth
                            .changePercent,
                      }
                    : null,
                assessment:
                  output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.assessment,
                direction: output.trendAnalysis.yearlyAssessment.minorReleaseFrequency.yoy.direction,
              },
            },
            overall: {
              direction: output.trendAnalysis.yearlyAssessment.overall.direction,
              summary: output.trendAnalysis.yearlyAssessment.overall.summary,
              key_insights: output.trendAnalysis.yearlyAssessment.overall.keyInsights,
            },
          },
        }
      : undefined,
  };

  return JSON.stringify(jsonOutput, null, 2);
}
