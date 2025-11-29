/**
 * 發布批量分析表格格式化器
 *
 * 將發布批量分析結果格式化為終端表格輸出
 *
 * @module formatters/release-analysis-formatter
 */

import Table from 'cli-table3';
import chalk from 'chalk';
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
 * 格式化發布批量分析結果為表格
 *
 * @param output - 分析輸出
 * @returns 格式化的表格字串
 */
export function formatReleaseAnalysis(output: ReleaseAnalysisOutput): string {
  const lines: string[] = [];

  // 判斷是否為純整合頻率分析模式
  // 1. 配置明確設定為 integration_only
  // 2. 或者無發布記錄但有整合頻率分析
  const isIntegrationOnlyMode =
    output.analysisMode === 'integration_only' ||
    (output.releases.length === 0 && output.integrationFrequency);

  // 標題
  lines.push('');
  lines.push(chalk.bold.cyan('═══════════════════════════════════════════════'));
  if (isIntegrationOnlyMode) {
    lines.push(chalk.bold.cyan('  整合頻率分析報告'));
  } else {
    lines.push(chalk.bold.cyan('  發布批量分析報告'));
  }
  lines.push(chalk.bold.cyan('═══════════════════════════════════════════════'));
  lines.push('');

  // 專案資訊
  lines.push(chalk.bold('專案：') + output.project.path);
  lines.push(chalk.bold('時間範圍：') + `${output.timeRange.since} 至 ${output.timeRange.until}`);
  lines.push(chalk.bold('配置：') + output.configName);
  lines.push('');

  // 如果是純整合頻率分析模式，跳過總體批量指標
  if (!isIntegrationOnlyMode) {
    // 總體指標
    lines.push(chalk.bold.magenta('總體批量指標（僅計算月度發布）'));
    lines.push('─'.repeat(47));
    lines.push('');

    const avgMRs = output.metrics.average_mr_count.toFixed(1);
    const avgLOC = output.metrics.average_loc_changes.toFixed(0);

    const levelColor = getLevelColor(output.metrics.level);
    const levelText = getLevelText(output.metrics.level);

    lines.push(`${chalk.bold('平均 MR 數量：')} ${levelColor(avgMRs)}`);
    lines.push(`${chalk.bold('平均 LOC 變更：')} ${levelColor(avgLOC)}`);
    lines.push(`${chalk.bold('健康度等級：')} ${levelColor(levelText)}`);
    lines.push('');
    lines.push(`${chalk.bold('建議：')} ${output.metrics.recommendation}`);
    lines.push('');
  }

  // 發布清單（僅在非純整合頻率分析模式且有發布記錄時顯示）
  if (!isIntegrationOnlyMode && output.releases.length > 0) {
    lines.push(chalk.bold.magenta(`發布清單（共 ${output.releases.length} 個發布）`));
    lines.push('─'.repeat(47));
    lines.push('');

    const table = new Table({
      head: [
        chalk.cyan('標籤'),
        chalk.cyan('類型'),
        chalk.cyan('日期'),
        chalk.cyan('MR 數'),
        chalk.cyan('LOC'),
        chalk.cyan('備註'),
        chalk.cyan('健康度'),
      ],
      style: {
        head: [],
        border: [],
      },
      colWidths: [20, 10, 13, 8, 8, 30, 10],
    });

    for (const release of output.releases) {
      // 只有當 health_level 不為 null 時才顯示健康度
      const healthDisplay = release.health_level !== null
        ? getLevelColor(release.health_level)(getLevelText(release.health_level))
        : chalk.gray('N/A');

      // 產生各欄位內容
      const { mrDisplay, locDisplay, note } = generateReleaseColumns(release);

      table.push([
        release.tag,
        release.type,
        release.date.toISOString().split('T')[0],
        mrDisplay,
        locDisplay,
        note,
        healthDisplay,
      ]);
    }

    lines.push(table.toString());
    lines.push('');
  } else if (!isIntegrationOnlyMode) {
    // 僅在非純整合頻率分析模式下顯示「無發布記錄」
    lines.push(chalk.yellow('無發布記錄'));
    lines.push('');
  }

  // 發布節奏分析（僅在非純整合頻率分析模式下顯示）
  if (!isIntegrationOnlyMode && output.releaseRhythm && output.releaseRhythm.length > 0) {
    lines.push(chalk.bold.magenta('發布節奏分析'));
    lines.push('─'.repeat(47));
    lines.push('');

    for (const rhythm of output.releaseRhythm) {
      lines.push(
        `${chalk.bold(rhythm.type)} 發布：${chalk.cyan(rhythm.count.toString())} 次，${rhythm.frequency}`
      );
      lines.push(`  ${chalk.gray('→')} ${rhythm.assessment}`);
      lines.push('');
    }
  }

  // 品質分析（僅在非純整合頻率分析模式下顯示）
  if (output.qualityMetrics && !isIntegrationOnlyMode) {
    lines.push(chalk.bold.magenta('品質分析'));
    lines.push('─'.repeat(47));
    lines.push('');

    // Major 發布品質
    if (output.qualityMetrics.majorReleaseQuality.length > 0) {
      lines.push(chalk.bold('月度發布品質（發布後首個 hotfix 時間）'));
      lines.push('');

      for (const quality of output.qualityMetrics.majorReleaseQuality) {
        const daysText = quality.daysUntilFirstHotfix !== null
          ? `${quality.daysUntilFirstHotfix} 天`
          : '無 hotfix';

        const assessmentColor = quality.daysUntilFirstHotfix === null || quality.daysUntilFirstHotfix >= 14
          ? chalk.green
          : quality.daysUntilFirstHotfix >= 7
          ? chalk.yellow
          : chalk.red;

        lines.push(
          `${chalk.bold(quality.majorRelease.tag)} (${quality.majorRelease.date.toISOString().split('T')[0]})`
        );
        lines.push(`  首個 hotfix: ${daysText}`);
        lines.push(`  ${chalk.gray('→')} ${assessmentColor(quality.assessment)}`);
        lines.push('');
      }
    }

    // 穩定期分析
    const { longest, shortest } = output.qualityMetrics.stabilityPeriods;
    if (longest || shortest) {
      lines.push(chalk.bold('品質穩定期（Hotfix 間隔分析）'));
      lines.push('');

      if (longest) {
        lines.push(
          `${chalk.green('🏆 最長無 hotfix 期間')}: ${chalk.bold(longest.days.toString())} 天`
        );
        lines.push(`  期間: ${longest.period}`);
        lines.push(`  ${chalk.gray('→')} 該時期品質特別穩定，值得回顧流程作為最佳實踐`);
        lines.push('');
      }

      if (shortest) {
        lines.push(
          `${chalk.yellow('⚠️  最短無 hotfix 期間')}: ${chalk.bold(shortest.days.toString())} 天`
        );
        lines.push(`  期間: ${shortest.period}`);
        if (shortest.days < 5) {
          lines.push(`  ${chalk.gray('→')} 該時期問題集中爆發，建議檢討品質流程`);
        } else {
          lines.push(`  ${chalk.gray('→')} 正常範圍`);
        }
        lines.push('');
      }
    }
  }

  // 整合頻率分析
  if (output.integrationFrequency) {
    lines.push(chalk.bold.magenta('整合頻率分析（Trunk-based Development 實踐）'));
    lines.push('─'.repeat(47));
    lines.push('');

    const freq = output.integrationFrequency;

    // DORA 等級顯示
    const doraColor = getDoraLevelColor(freq.dora_level);
    lines.push(`${chalk.bold('DORA 等級：')} ${doraColor(freq.dora_level.toUpperCase())}`);
    lines.push(`  ${chalk.gray('→')} ${freq.dora_description}`);
    lines.push('');

    // 頻率統計
    lines.push(chalk.bold('合併統計'));
    lines.push(`  分析天數：${freq.days_analyzed} 天`);
    lines.push(`  總合併次數：${chalk.cyan(freq.total_merges.toString())} 次`);
    lines.push(`  平均每日：${chalk.cyan(freq.merges_per_day.toFixed(2))} 次`);
    lines.push(`  平均每週：${chalk.cyan(freq.merges_per_week.toFixed(1))} 次`);
    lines.push('');

    // 月底模式偵測
    if (freq.end_of_month_pattern?.detected) {
      lines.push(chalk.bold.red('⚠️  月底集中合併反模式警告'));
      lines.push(`  最後 5 天合併：${chalk.yellow(freq.end_of_month_pattern.last_5_days_count.toString())} 次`);
      lines.push(`  前 25 天合併：${chalk.gray(freq.end_of_month_pattern.first_25_days_count.toString())} 次`);
      lines.push(`  ${chalk.gray('→')} ${freq.end_of_month_pattern.warning}`);
      lines.push('');
      lines.push(chalk.bold('建議：'));
      lines.push('  • 建立每日整合檢查點，避免月底集中合併');
      lines.push('  • 縮小 MR 批量大小，提高合併頻率');
      lines.push('  • 加強 CI/CD 自動化，降低合併心理門檻');
      lines.push('');
    }
  }

  // 發布準備度分析
  if (output.readiness && output.readiness.freezePeriodAssessment.length > 0) {
    lines.push(chalk.bold.magenta('發布準備度分析（凍結期健康評估）'));
    lines.push('─'.repeat(47));
    lines.push('');

    const summary = output.readiness.summary;

    // 摘要統計
    lines.push(chalk.bold('準備度摘要'));
    lines.push(`  分析發布數：${output.readiness.freezePeriodAssessment.length} 次`);
    lines.push(`  平均凍結期：${chalk.cyan(summary.avgFreezeDays.toFixed(1))} 天`);
    lines.push(`  健康評級：${chalk.green(summary.healthyCount.toString())} 健康 / ${chalk.yellow(summary.warningCount.toString())} 警告 / ${chalk.red(summary.criticalCount.toString())} 危險`);
    lines.push(`  ${chalk.gray('→')} ${summary.recommendation}`);
    lines.push('');

    // 個別評估（只顯示警告和危險）
    const problemReleases = output.readiness.freezePeriodAssessment.filter(
      (a) => a.healthLevel !== 'healthy'
    );

    if (problemReleases.length > 0) {
      lines.push(chalk.bold('需要關注的發布'));
      for (const assessment of problemReleases) {
        const color = assessment.healthLevel === 'critical' ? chalk.red : chalk.yellow;
        lines.push(
          `${color('⚠️')} ${chalk.bold(assessment.release.tag)} (${assessment.release.date.toISOString().split('T')[0]})`
        );
        lines.push(`  凍結期：${assessment.freezeDays} 天`);
        lines.push(`  ${chalk.gray('→')} ${assessment.assessment}`);
      }
      lines.push('');
    }
  }

  // 趨勢分析
  if (output.trendAnalysis && output.trendAnalysis.monthlyComparisons.length > 0) {
    lines.push(chalk.bold.magenta('趨勢分析（Year-over-Year 同期比較）'));
    lines.push('─'.repeat(47));
    lines.push('');

    const trend = output.trendAnalysis;

    // 月度表現標題
    lines.push(chalk.bold('月度表現（Month-over-Month + Year-over-Year）'));
    lines.push('');

    // 表格標題
    lines.push(
      `${chalk.gray('月份')}      ${chalk.gray('批量 MR')}    ${chalk.gray('MoM')}     ${chalk.gray('YoY')}     ${chalk.gray('凍結期')}    ${chalk.gray('MoM')}     ${chalk.gray('YoY')}     ${chalk.gray('Major')}   ${chalk.gray('MoM')}     ${chalk.gray('YoY')}     ${chalk.gray('Hotfix')}  ${chalk.gray('MoM')}     ${chalk.gray('YoY')}     ${chalk.gray('Minor')}   ${chalk.gray('MoM')}     ${chalk.gray('YoY')}`
    );
    lines.push('─'.repeat(180));

    // 逐月顯示
    for (const comparison of trend.monthlyComparisons) {
      const month = comparison.month;
      const curr = comparison.current;
      const prevMonth = comparison.previousMonth;
      const prevYear = comparison.previousYear;

      // 批量 - MoM
      const batchMomArrow = prevMonth ? getTrendArrow(comparison.batchSize.mom.direction) : '';
      const batchMomColor = prevMonth
        ? getTrendDirectionColor(comparison.batchSize.mom.direction)
        : chalk.gray;
      const batchMomChange = prevMonth
        ? `${comparison.batchSize.mom.changePercent > 0 ? '+' : ''}${comparison.batchSize.mom.changePercent.toFixed(0)}%`
        : '-';

      // 批量 - YoY
      const batchYoyArrow = prevYear ? getTrendArrow(comparison.batchSize.yoy.direction) : '';
      const batchYoyColor = prevYear
        ? getTrendDirectionColor(comparison.batchSize.yoy.direction)
        : chalk.gray;
      const batchYoyChange = prevYear
        ? `${comparison.batchSize.yoy.changePercent > 0 ? '+' : ''}${comparison.batchSize.yoy.changePercent.toFixed(0)}%`
        : '-';

      // 凍結期 - MoM
      const freezeMomArrow = prevMonth ? getTrendArrow(comparison.freezePeriod.mom.direction) : '';
      const freezeMomColor = prevMonth
        ? getTrendDirectionColor(comparison.freezePeriod.mom.direction)
        : chalk.gray;
      const freezeMomChange = prevMonth
        ? `${comparison.freezePeriod.mom.changePercent > 0 ? '+' : ''}${comparison.freezePeriod.mom.changePercent.toFixed(0)}%`
        : '-';

      // 凍結期 - YoY
      const freezeYoyArrow = prevYear ? getTrendArrow(comparison.freezePeriod.yoy.direction) : '';
      const freezeYoyColor = prevYear
        ? getTrendDirectionColor(comparison.freezePeriod.yoy.direction)
        : chalk.gray;
      const freezeYoyChange = prevYear
        ? `${comparison.freezePeriod.yoy.changePercent > 0 ? '+' : ''}${comparison.freezePeriod.yoy.changePercent.toFixed(0)}%`
        : '-';

      // Major 發布 - MoM
      const majorMomArrow = prevMonth
        ? getTrendArrow(comparison.majorReleaseFrequency.mom.direction)
        : '';
      const majorMomColor = prevMonth
        ? getTrendDirectionColor(comparison.majorReleaseFrequency.mom.direction)
        : chalk.gray;
      const majorMomChange = prevMonth
        ? `${comparison.majorReleaseFrequency.mom.changePercent > 0 ? '+' : ''}${comparison.majorReleaseFrequency.mom.changePercent.toFixed(0)}%`
        : '-';

      // Major 發布 - YoY
      const majorYoyArrow = prevYear
        ? getTrendArrow(comparison.majorReleaseFrequency.yoy.direction)
        : '';
      const majorYoyColor = prevYear
        ? getTrendDirectionColor(comparison.majorReleaseFrequency.yoy.direction)
        : chalk.gray;
      const majorYoyChange = prevYear
        ? `${comparison.majorReleaseFrequency.yoy.changePercent > 0 ? '+' : ''}${comparison.majorReleaseFrequency.yoy.changePercent.toFixed(0)}%`
        : '-';

      // Hotfix - MoM
      const hotfixMomArrow = prevMonth ? getTrendArrow(comparison.hotfixFrequency.mom.direction) : '';
      const hotfixMomColor = prevMonth
        ? getTrendDirectionColor(comparison.hotfixFrequency.mom.direction)
        : chalk.gray;
      const hotfixMomChange = prevMonth
        ? `${comparison.hotfixFrequency.mom.changePercent > 0 ? '+' : ''}${comparison.hotfixFrequency.mom.changePercent.toFixed(0)}%`
        : '-';

      // Hotfix - YoY
      const hotfixYoyArrow = prevYear ? getTrendArrow(comparison.hotfixFrequency.yoy.direction) : '';
      const hotfixYoyColor = prevYear
        ? getTrendDirectionColor(comparison.hotfixFrequency.yoy.direction)
        : chalk.gray;
      const hotfixYoyChange = prevYear
        ? `${comparison.hotfixFrequency.yoy.changePercent > 0 ? '+' : ''}${comparison.hotfixFrequency.yoy.changePercent.toFixed(0)}%`
        : '-';

      // Minor 發布 - MoM
      const minorMomArrow = prevMonth
        ? getTrendArrow(comparison.minorReleaseFrequency.mom.direction)
        : '';
      const minorMomColor = prevMonth
        ? getTrendDirectionColor(comparison.minorReleaseFrequency.mom.direction)
        : chalk.gray;
      const minorMomChange = prevMonth
        ? `${comparison.minorReleaseFrequency.mom.changePercent > 0 ? '+' : ''}${comparison.minorReleaseFrequency.mom.changePercent.toFixed(0)}%`
        : '-';

      // Minor 發布 - YoY
      const minorYoyArrow = prevYear
        ? getTrendArrow(comparison.minorReleaseFrequency.yoy.direction)
        : '';
      const minorYoyColor = prevYear
        ? getTrendDirectionColor(comparison.minorReleaseFrequency.yoy.direction)
        : chalk.gray;
      const minorYoyChange = prevYear
        ? `${comparison.minorReleaseFrequency.yoy.changePercent > 0 ? '+' : ''}${comparison.minorReleaseFrequency.yoy.changePercent.toFixed(0)}%`
        : '-';

      lines.push(
        `${chalk.cyan(month)}   ${curr.avgMrCount.toFixed(0).padStart(3)} MR     ` +
          `${batchMomColor(batchMomArrow + batchMomChange.padStart(5))}   ` +
          `${batchYoyColor(batchYoyArrow + batchYoyChange.padStart(5))}   ` +
          `${curr.avgFreezeDays.toFixed(1)}天    ` +
          `${freezeMomColor(freezeMomArrow + freezeMomChange.padStart(5))}   ` +
          `${freezeYoyColor(freezeYoyArrow + freezeYoyChange.padStart(5))}   ` +
          `${curr.majorReleases}次      ` +
          `${majorMomColor(majorMomArrow + majorMomChange.padStart(5))}   ` +
          `${majorYoyColor(majorYoyArrow + majorYoyChange.padStart(5))}   ` +
          `${curr.hotfixReleases}次      ` +
          `${hotfixMomColor(hotfixMomArrow + hotfixMomChange.padStart(5))}   ` +
          `${hotfixYoyColor(hotfixYoyArrow + hotfixYoyChange.padStart(5))}   ` +
          `${curr.minorReleases}次      ` +
          `${minorMomColor(minorMomArrow + minorMomChange.padStart(5))}   ` +
          `${minorYoyColor(minorYoyArrow + minorYoyChange.padStart(5))}`
      );
    }
    lines.push('');

    // 年度總評
    const validYoyComparisons = trend.monthlyComparisons.filter((c) => c.previousYear !== null);
    const validMomComparisons = trend.monthlyComparisons.filter((c) => c.previousMonth !== null);
    const yoyCount = validYoyComparisons.length;
    const momCount = validMomComparisons.length;
    const comparisonText = `MoM: ${momCount} 個月, YoY: ${yoyCount} 個月`;
    lines.push(
      chalk.bold(
        `年度總評（分析期間：${trend.monthlyComparisons[trend.monthlyComparisons.length - 1]?.month} ~ ${trend.monthlyComparisons[0]?.month}，共 ${trend.monthlyComparisons.length} 個月，${comparisonText}）`
      )
    );
    lines.push('─'.repeat(80));
    lines.push('');

    const yearlyAssess = trend.yearlyAssessment;

    // 批量大小趨勢
    lines.push(chalk.bold('批量大小趨勢'));
    lines.push(chalk.cyan('  [Month-over-Month]'));
    const batchMomArrow = getTrendArrow(yearlyAssess.batchSize.mom.direction);
    const batchMomColor = getTrendDirectionColor(yearlyAssess.batchSize.mom.direction);
    lines.push(
      `    平均變化：${yearlyAssess.batchSize.mom.avgChange > 0 ? '+' : ''}${yearlyAssess.batchSize.mom.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    改善/穩定/惡化：${yearlyAssess.batchSize.mom.improvingMonths}/${yearlyAssess.batchSize.mom.stableMonths}/${yearlyAssess.batchSize.mom.degradingMonths} 個月`
    );
    lines.push(`    整體評估：${batchMomColor(batchMomArrow)} ${yearlyAssess.batchSize.mom.assessment}`);
    lines.push(chalk.cyan('  [Year-over-Year]'));
    const batchYoyArrow = getTrendArrow(yearlyAssess.batchSize.yoy.direction);
    const batchYoyColor = getTrendDirectionColor(yearlyAssess.batchSize.yoy.direction);
    lines.push(
      `    平均變化：${yearlyAssess.batchSize.yoy.avgChange > 0 ? '+' : ''}${yearlyAssess.batchSize.yoy.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    改善/穩定/惡化：${yearlyAssess.batchSize.yoy.improvingMonths}/${yearlyAssess.batchSize.yoy.stableMonths}/${yearlyAssess.batchSize.yoy.degradingMonths} 個月`
    );
    lines.push(`    整體評估：${batchYoyColor(batchYoyArrow)} ${yearlyAssess.batchSize.yoy.assessment}`);
    lines.push('');

    // 凍結期趨勢
    lines.push(chalk.bold('凍結期趨勢'));
    lines.push(chalk.cyan('  [Month-over-Month]'));
    const freezeMomArrow = getTrendArrow(yearlyAssess.freezePeriod.mom.direction);
    const freezeMomColor = getTrendDirectionColor(yearlyAssess.freezePeriod.mom.direction);
    lines.push(
      `    平均變化：${yearlyAssess.freezePeriod.mom.avgChange > 0 ? '+' : ''}${yearlyAssess.freezePeriod.mom.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    改善/穩定/惡化：${yearlyAssess.freezePeriod.mom.improvingMonths}/${yearlyAssess.freezePeriod.mom.stableMonths}/${yearlyAssess.freezePeriod.mom.degradingMonths} 個月`
    );
    lines.push(
      `    整體評估：${freezeMomColor(freezeMomArrow)} ${yearlyAssess.freezePeriod.mom.assessment}`
    );
    lines.push(chalk.cyan('  [Year-over-Year]'));
    const freezeYoyArrow = getTrendArrow(yearlyAssess.freezePeriod.yoy.direction);
    const freezeYoyColor = getTrendDirectionColor(yearlyAssess.freezePeriod.yoy.direction);
    lines.push(
      `    平均變化：${yearlyAssess.freezePeriod.yoy.avgChange > 0 ? '+' : ''}${yearlyAssess.freezePeriod.yoy.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    改善/穩定/惡化：${yearlyAssess.freezePeriod.yoy.improvingMonths}/${yearlyAssess.freezePeriod.yoy.stableMonths}/${yearlyAssess.freezePeriod.yoy.degradingMonths} 個月`
    );
    lines.push(
      `    整體評估：${freezeYoyColor(freezeYoyArrow)} ${yearlyAssess.freezePeriod.yoy.assessment}`
    );
    lines.push('');

    // Major 發布趨勢（中性指標）
    lines.push(chalk.bold('Major 發布頻率（中性指標）'));
    lines.push(chalk.cyan('  [Month-over-Month]'));
    lines.push(
      `    平均變化：${yearlyAssess.majorReleaseFrequency.mom.avgChange > 0 ? '+' : ''}${yearlyAssess.majorReleaseFrequency.mom.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    穩定月份：${yearlyAssess.majorReleaseFrequency.mom.stableMonths} 個月`
    );
    lines.push(chalk.cyan('  [Year-over-Year]'));
    lines.push(
      `    平均變化：${yearlyAssess.majorReleaseFrequency.yoy.avgChange > 0 ? '+' : ''}${yearlyAssess.majorReleaseFrequency.yoy.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    穩定月份：${yearlyAssess.majorReleaseFrequency.yoy.stableMonths} 個月`
    );
    lines.push('');

    // Hotfix 頻率趨勢（品質指標：減少 = 好）
    lines.push(chalk.bold('Hotfix 頻率（品質指標：減少 = 好）'));
    lines.push(chalk.cyan('  [Month-over-Month]'));
    const hotfixMomArrow = getTrendArrow(yearlyAssess.hotfixFrequency.mom.direction);
    const hotfixMomColor = getTrendDirectionColor(yearlyAssess.hotfixFrequency.mom.direction);
    lines.push(
      `    平均變化：${yearlyAssess.hotfixFrequency.mom.avgChange > 0 ? '+' : ''}${yearlyAssess.hotfixFrequency.mom.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    改善/穩定/惡化：${yearlyAssess.hotfixFrequency.mom.improvingMonths}/${yearlyAssess.hotfixFrequency.mom.stableMonths}/${yearlyAssess.hotfixFrequency.mom.degradingMonths} 個月`
    );
    lines.push(
      `    整體評估：${hotfixMomColor(hotfixMomArrow)} ${yearlyAssess.hotfixFrequency.mom.assessment}`
    );
    lines.push(chalk.cyan('  [Year-over-Year]'));
    const hotfixYoyArrow = getTrendArrow(yearlyAssess.hotfixFrequency.yoy.direction);
    const hotfixYoyColor = getTrendDirectionColor(yearlyAssess.hotfixFrequency.yoy.direction);
    lines.push(
      `    平均變化：${yearlyAssess.hotfixFrequency.yoy.avgChange > 0 ? '+' : ''}${yearlyAssess.hotfixFrequency.yoy.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    改善/穩定/惡化：${yearlyAssess.hotfixFrequency.yoy.improvingMonths}/${yearlyAssess.hotfixFrequency.yoy.stableMonths}/${yearlyAssess.hotfixFrequency.yoy.degradingMonths} 個月`
    );
    lines.push(
      `    整體評估：${hotfixYoyColor(hotfixYoyArrow)} ${yearlyAssess.hotfixFrequency.yoy.assessment}`
    );
    lines.push('');

    // Minor 發布趨勢（中性指標）
    lines.push(chalk.bold('Minor 發布頻率（中性指標）'));
    lines.push(chalk.cyan('  [Month-over-Month]'));
    lines.push(
      `    平均變化：${yearlyAssess.minorReleaseFrequency.mom.avgChange > 0 ? '+' : ''}${yearlyAssess.minorReleaseFrequency.mom.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    穩定月份：${yearlyAssess.minorReleaseFrequency.mom.stableMonths} 個月`
    );
    lines.push(chalk.cyan('  [Year-over-Year]'));
    lines.push(
      `    平均變化：${yearlyAssess.minorReleaseFrequency.yoy.avgChange > 0 ? '+' : ''}${yearlyAssess.minorReleaseFrequency.yoy.avgChange.toFixed(1)}%`
    );
    lines.push(
      `    穩定月份：${yearlyAssess.minorReleaseFrequency.yoy.stableMonths} 個月`
    );
    lines.push('');

    // 整體趨勢
    const overallArrow = getTrendArrow(yearlyAssess.overall.direction);
    const overallColor = getTrendDirectionColor(yearlyAssess.overall.direction);
    lines.push(chalk.bold('整體趨勢'));
    lines.push(`  ${overallColor(overallArrow + overallArrow)} ${yearlyAssess.overall.summary}`);
    lines.push('');

    // 關鍵洞察
    if (yearlyAssess.overall.keyInsights.length > 0) {
      lines.push(chalk.bold('關鍵洞察：'));
      for (const insight of yearlyAssess.overall.keyInsights) {
        lines.push(`  • ${insight}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 取得趨勢方向箭頭
 *
 * @param direction - 趨勢方向
 * @returns 箭頭符號
 */
function getTrendArrow(direction: 'improving' | 'stable' | 'degrading'): string {
  switch (direction) {
    case 'improving':
      return '↗';
    case 'stable':
      return '→';
    case 'degrading':
      return '↘';
  }
}

/**
 * 取得趨勢方向顏色
 *
 * @param direction - 趨勢方向
 * @returns Chalk 顏色函數
 */
function getTrendDirectionColor(direction: 'improving' | 'stable' | 'degrading'): typeof chalk {
  switch (direction) {
    case 'improving':
      return chalk.green;
    case 'stable':
      return chalk.yellow;
    case 'degrading':
      return chalk.red;
  }
}

/**
 * 產生發布各欄位內容
 *
 * @param release - 發布物件
 * @returns 各欄位顯示內容
 */
function generateReleaseColumns(release: Release): {
  mrDisplay: string;
  locDisplay: string;
  note: string;
} {
  let mrDisplay: string;
  let locDisplay: string;
  const noteParts: string[] = [];

  // Major 發布：顯示批量資訊
  if (release.type === 'major') {
    mrDisplay = release.mr_count.toString();
    locDisplay = release.total_loc_changes.toString();
    if (release.interval_days !== undefined) {
      noteParts.push(`距上次 ${release.interval_days}d`);
    }
    noteParts.push(`凍結 ${release.freeze_days}d`);
  }
  // Hotfix：顯示問題修復資訊
  else if (release.type === 'hotfix') {
    if (release.mr_count === 0) {
      mrDisplay = chalk.gray('0');
      locDisplay = release.total_loc_changes.toString();
      noteParts.push(chalk.gray('手動標籤'));
    } else {
      mrDisplay = `${release.mr_count}`;
      locDisplay = release.total_loc_changes.toString();
    }
    if (release.interval_days !== undefined) {
      noteParts.push(`距上次 ${release.interval_days}d`);
    }
  }
  // Minor：顯示客戶需求資訊
  else if (release.type === 'minor') {
    if (release.mr_count === 0) {
      mrDisplay = chalk.gray('0');
      locDisplay = release.total_loc_changes.toString();
      noteParts.push(chalk.gray('無 MR'));
    } else {
      mrDisplay = release.mr_count.toString();
      locDisplay = release.total_loc_changes.toString();
    }
    if (release.interval_days !== undefined) {
      noteParts.push(`距上次 ${release.interval_days}d`);
    }
  }
  // 其他類型
  else {
    mrDisplay = release.mr_count.toString();
    locDisplay = release.total_loc_changes.toString();
  }

  return {
    mrDisplay,
    locDisplay,
    note: noteParts.join(', '),
  };
}

/**
 * 取得健康度等級顏色
 *
 * @param level - 健康度等級
 * @returns Chalk 顏色函數
 */
function getLevelColor(level: 'healthy' | 'warning' | 'critical'): typeof chalk {
  switch (level) {
    case 'healthy':
      return chalk.green;
    case 'warning':
      return chalk.yellow;
    case 'critical':
      return chalk.red;
  }
}

/**
 * 取得 DORA 等級顏色
 *
 * @param level - DORA 等級
 * @returns Chalk 顏色函數
 */
function getDoraLevelColor(level: 'elite' | 'high' | 'medium' | 'low'): typeof chalk {
  switch (level) {
    case 'elite':
      return chalk.green;
    case 'high':
      return chalk.cyan;
    case 'medium':
      return chalk.yellow;
    case 'low':
      return chalk.red;
  }
}

/**
 * 取得健康度等級文字
 *
 * @param level - 健康度等級
 * @returns 等級文字
 */
function getLevelText(level: 'healthy' | 'warning' | 'critical'): string {
  switch (level) {
    case 'healthy':
      return '健康';
    case 'warning':
      return '注意';
    case 'critical':
      return '警戒';
  }
}
