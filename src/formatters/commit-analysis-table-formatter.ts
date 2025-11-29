/**
 * Commit 分析表格格式化器
 * 功能：004-commit-size-analysis
 *
 * 將 commit 分析結果格式化為終端表格輸出（FR-011, FR-020, FR-021, FR-022）
 */

import Table from 'cli-table3';
import chalk from 'chalk';
import type { AggregateStatistics, CommitAnalysis } from '../types/commit-analysis.js';
import {
  getHealthAssessmentDisplayName,
  getHealthAssessmentColor,
} from '../models/aggregate-statistics.js';
import {
  getSeverityLevelDisplayName,
  getSeverityLevelColor,
} from '../utils/severity-assessor.js';
import type { DeveloperPattern } from '../models/developer-pattern.js';
import {
  getDeveloperAssessmentDisplayName,
  getDeveloperAssessmentColor,
} from '../models/developer-pattern.js';
import type { TrendAnalysisResult } from '../models/trend-period.js';
import {
  getTrendDirectionDisplayName,
  getTrendDirectionColor,
} from '../models/trend-period.js';
import {
  LOC_THRESHOLDS,
  HEALTH_THRESHOLDS,
  INDUSTRY_BENCHMARKS,
  TREND_SETTINGS,
} from '../constants/commit-analysis.js';

/**
 * 格式化基本 commit 分析結果為表格（使用者故事 1）
 *
 * @param statistics - 彙總統計
 * @returns 格式化的表格字串
 */
export function formatBasicAnalysis(statistics: AggregateStatistics): string {
  const output: string[] = [];

  // 標題
  output.push(chalk.bold.cyan('\n📊 Commit 規模分析報告\n'));

  // 基本統計表格
  const statsTable = new Table({
    head: [chalk.bold('指標'), chalk.bold('數值')],
    colWidths: [30, 30],
  });

  statsTable.push(
    ['總 commits', statistics.totalCommits.toString()],
    ['分析的 commits', statistics.analyzedCommits.toString()],
    ['排除的 commits', `${statistics.excludedCommits} (merge commits + 0 LOC)`],
    ['平均檔案數/commit', statistics.avgFilesPerCommit.toFixed(1)],
    ['平均 LOC/commit', statistics.avgLOCPerCommit.toFixed(1)],
    ['中位數 LOC', statistics.medianLOC.toFixed(0)],
    ['最大 LOC', statistics.maxLOC.toString()]
  );

  output.push(statsTable.toString());

  // 規模分布表格
  output.push(chalk.bold.cyan('\n📈 規模分布\n'));

  const distTable = new Table({
    head: [
      chalk.bold('類別'),
      chalk.bold('範圍'),
      chalk.bold('數量'),
      chalk.bold('百分比'),
    ],
    colWidths: [15, 20, 15, 20],
  });

  distTable.push(
    [
      chalk.green('小型'),
      `< ${LOC_THRESHOLDS.SMALL} LOC`,
      statistics.distribution.small.count.toString(),
      `${statistics.distribution.small.percentage.toFixed(1)}%`,
    ],
    [
      chalk.cyan('中型'),
      `${LOC_THRESHOLDS.SMALL}-${LOC_THRESHOLDS.MEDIUM} LOC`,
      statistics.distribution.medium.count.toString(),
      `${statistics.distribution.medium.percentage.toFixed(1)}%`,
    ],
    [
      chalk.yellow('大型'),
      `${LOC_THRESHOLDS.MEDIUM}-${LOC_THRESHOLDS.LARGE} LOC`,
      statistics.distribution.large.count.toString(),
      `${statistics.distribution.large.percentage.toFixed(1)}%`,
    ],
    [
      chalk.red('超大'),
      `> ${LOC_THRESHOLDS.LARGE} LOC`,
      statistics.distribution.oversized.count.toString(),
      `${statistics.distribution.oversized.percentage.toFixed(1)}%`,
    ]
  );

  output.push(distTable.toString());

  // 健康度評估（FR-008）
  output.push(chalk.bold.cyan('\n🏥 健康度評估\n'));

  const healthColor = getHealthAssessmentColor(statistics.healthAssessment);
  const healthName = getHealthAssessmentDisplayName(statistics.healthAssessment);

  output.push(
    `整體評估：${chalk[healthColor].bold(healthName)} (超大 commits: ${statistics.oversizedPercentage.toFixed(1)}%)`
  );

  // 業界基準比較（FR-020, FR-021）
  output.push(chalk.bold.cyan('\n📚 業界基準比較\n'));

  const benchmarkTable = new Table({
    head: [chalk.bold('指標'), chalk.bold('您的專案'), chalk.bold('業界最佳實踐')],
    colWidths: [25, 20, 30],
  });

  const avgLOCStatus =
    statistics.avgLOCPerCommit <= INDUSTRY_BENCHMARKS.AVG_LOC_PER_COMMIT
      ? chalk.green('✓ 符合')
      : statistics.avgLOCPerCommit <= INDUSTRY_BENCHMARKS.RECOMMENDED_MAX_LOC
      ? chalk.yellow('△ 可接受')
      : chalk.red('✗ 需改善');

  const avgFilesStatus =
    statistics.avgFilesPerCommit <= INDUSTRY_BENCHMARKS.AVG_FILES_PER_COMMIT
      ? chalk.green('✓ 符合')
      : statistics.avgFilesPerCommit <= 10
      ? chalk.yellow('△ 可接受')
      : chalk.red('✗ 需改善');

  benchmarkTable.push(
    ['平均 LOC/commit', statistics.avgLOCPerCommit.toFixed(1), `${INDUSTRY_BENCHMARKS.AVG_LOC_PER_COMMIT} LOC ${avgLOCStatus}`],
    ['平均檔案數/commit', statistics.avgFilesPerCommit.toFixed(1), `${INDUSTRY_BENCHMARKS.AVG_FILES_PER_COMMIT} 個檔案 ${avgFilesStatus}`],
    [
      '建議最大值',
      statistics.distribution.large.count + statistics.distribution.oversized.count + ` commits > ${INDUSTRY_BENCHMARKS.RECOMMENDED_MAX_LOC} LOC`,
      `${INDUSTRY_BENCHMARKS.RECOMMENDED_MAX_LOC} LOC（程式碼審查效率）`,
    ],
    [
      '絕對最大值',
      statistics.distribution.oversized.count + ` commits > ${INDUSTRY_BENCHMARKS.ABSOLUTE_MAX_LOC} LOC`,
      `${INDUSTRY_BENCHMARKS.ABSOLUTE_MAX_LOC} LOC（缺陷率顯著上升）`,
    ]
  );

  output.push(benchmarkTable.toString());

  // 教育性背景訊息（FR-022）
  if (statistics.oversizedPercentage > HEALTH_THRESHOLDS.MODERATE) {
    output.push(
      chalk.yellow(
        `\n⚠️  研究顯示：>${INDUSTRY_BENCHMARKS.ABSOLUTE_MAX_LOC} LOC 的 commits 缺陷率顯著較高，且程式碼審查效率明顯下降。`
      )
    );
    output.push(
      chalk.yellow(
        '   建議：採用更小的批次，每個 commit 聚焦單一變更，提升審查品質和部署信心。\n'
      )
    );
  } else if (statistics.avgLOCPerCommit <= INDUSTRY_BENCHMARKS.AVG_LOC_PER_COMMIT) {
    output.push(
      chalk.green(
        '\n✓  太棒了！您的團隊遵循小批量最佳實踐，commit 規模符合業界研究標準。\n'
      )
    );
  }

  return output.join('\n');
}

/**
 * 格式化問題 commits 清單為表格（使用者故事 2）
 *
 * @param commits - 問題 commits 陣列（已篩選 >100 LOC）
 * @returns 格式化的表格字串
 */
export function formatProblemCommits(commits: CommitAnalysis[]): string {
  if (commits.length === 0) {
    return chalk.green(`\n✓ 沒有發現問題 commits（所有 commits 都 <${INDUSTRY_BENCHMARKS.RECOMMENDED_MAX_LOC} LOC）\n`);
  }

  const output: string[] = [];

  output.push(chalk.bold.yellow(`\n⚠️  發現 ${commits.length} 個問題 Commits\n`));

  const table = new Table({
    head: [
      chalk.bold('SHA'),
      chalk.bold('作者'),
      chalk.bold('LOC'),
      chalk.bold('檔案'),
      chalk.bold('嚴重程度'),
      chalk.bold('Commit 訊息'),
      chalk.bold('建議'),
    ],
    colWidths: [12, 18, 8, 8, 12, 35, 35],
    wordWrap: true,
  });

  // 按 LOC 降序排列
  const sorted = [...commits].sort((a, b) => b.loc - a.loc);

  for (const commit of sorted.slice(0, 20)) {
    // 最多顯示 20 個
    const severityColor = getSeverityLevelColor(commit.severityLevel);
    const severityName = getSeverityLevelDisplayName(commit.severityLevel);

    // 取得 commit 訊息前 80 字元（FR-009）
    const firstLine = commit.message.split('\n')[0] || '';
    const messagePreview = firstLine.substring(0, 80);
    const displayMessage = firstLine.length > 80 ? `${messagePreview}...` : messagePreview;

    table.push([
      commit.sha.substring(0, 8),
      commit.author.substring(0, 16),
      chalk[severityColor](commit.loc.toString()),
      commit.filesChanged.toString(),
      chalk[severityColor](severityName),
      displayMessage,
      commit.refactorSuggestion || '-',
    ]);
  }

  output.push(table.toString());

  if (commits.length > 20) {
    output.push(
      chalk.gray(`\n（僅顯示前 20 個，總共 ${commits.length} 個問題 commits）\n`)
    );
  }

  return output.join('\n');
}

/**
 * 格式化開發者模式分析為表格（使用者故事 3）
 *
 * @param patterns - 開發者模式陣列
 * @param teamAvg - 團隊平均 LOC（用於比較）
 * @returns 格式化的表格字串
 */
export function formatDeveloperPatterns(
  patterns: DeveloperPattern[],
  teamAvg: number
): string {
  if (patterns.length === 0) {
    return chalk.yellow('\n⚠️  沒有開發者資料\n');
  }

  const output: string[] = [];

  output.push(chalk.bold.cyan('\n👥 開發者 Commit 規模模式分析\n'));

  // 團隊基準
  output.push(`團隊平均 LOC/commit: ${teamAvg.toFixed(1)}\n`);

  const table = new Table({
    head: [
      chalk.bold('開發者'),
      chalk.bold('Commits'),
      chalk.bold('平均 LOC'),
      chalk.bold('平均檔案'),
      chalk.bold('超大數'),
      chalk.bold('超大率'),
      chalk.bold('評估'),
    ],
    colWidths: [20, 10, 12, 12, 10, 10, 12],
  });

  for (const pattern of patterns) {
    const assessmentColor = getDeveloperAssessmentColor(pattern.assessment);
    const assessmentName = getDeveloperAssessmentDisplayName(pattern.assessment);

    // 比較團隊平均
    const avgDiff = pattern.avgLOC - teamAvg;
    const avgCompare =
      avgDiff > 10
        ? chalk.red(`↑ +${avgDiff.toFixed(0)}`)
        : avgDiff < -10
        ? chalk.green(`↓ ${avgDiff.toFixed(0)}`)
        : chalk.gray('≈');

    table.push([
      pattern.developer.substring(0, 18),
      pattern.totalCommits.toString(),
      `${pattern.avgLOC.toFixed(1)} ${avgCompare}`,
      pattern.avgFiles.toFixed(1),
      pattern.oversizedCount.toString(),
      `${pattern.oversizedPercentage.toFixed(1)}%`,
      chalk[assessmentColor](assessmentName),
    ]);
  }

  output.push(table.toString());

  // 顯示建議（針對需改善的開發者）
  const needsImprovement = patterns.filter((p) => p.suggestion !== null);
  if (needsImprovement.length > 0) {
    output.push(chalk.bold.yellow('\n⚠️  改善建議\n'));

    for (const pattern of needsImprovement) {
      output.push(`${chalk.bold(pattern.developer)}: ${pattern.suggestion}`);
    }

    output.push('');
  }

  return output.join('\n');
}

/**
 * 格式化趨勢分析為表格（使用者故事 4）
 *
 * @param trendResult - 趨勢分析結果
 * @returns 格式化的表格字串
 */
export function formatTrendAnalysis(trendResult: TrendAnalysisResult): string {
  const output: string[] = [];

  output.push(chalk.bold.cyan('\n📈 Commit 規模趨勢分析\n'));

  // 整體趨勢摘要
  const overallColor = getTrendDirectionColor(trendResult.overallTrend);
  const overallName = getTrendDirectionDisplayName(trendResult.overallTrend);
  
  output.push(`整體趨勢: ${chalk[overallColor](overallName)}`);
  output.push(`平均 LOC 變化: ${formatChangePercentage(trendResult.totalAvgLOCChange)}`);
  output.push(`超大率變化: ${formatChangePercentage(trendResult.totalOversizedChange)}`);
  output.push('');

  // 時間段表格
  const table = new Table({
    head: [
      chalk.bold('時間段'),
      chalk.bold('Commits'),
      chalk.bold('平均 LOC'),
      chalk.bold('超大率'),
      chalk.bold('趨勢'),
      chalk.bold('變化'),
    ],
    colWidths: [15, 10, 12, 10, 10, 15],
  });

  for (const period of trendResult.periods) {
    const trendStr = period.trendDirection
      ? chalk[getTrendDirectionColor(period.trendDirection)](
          getTrendDirectionDisplayName(period.trendDirection)
        )
      : '-';

    const changeStr = period.avgLOCChange !== null
      ? formatChangePercentage(period.avgLOCChange) +
        (period.isSignificantChange ? chalk.yellow(' *') : '')
      : '-';

    table.push([
      period.label,
      period.statistics.analyzedCommits.toString(),
      period.statistics.avgLOCPerCommit.toFixed(1),
      `${period.statistics.oversizedPercentage.toFixed(1)}%`,
      trendStr,
      changeStr,
    ]);
  }

  output.push(table.toString());

  // 顯著變化說明
  const hasSignificantChanges = trendResult.periods.some((p) => p.isSignificantChange);
  if (hasSignificantChanges) {
    output.push(chalk.yellow(`\n* 顯著變化（>${TREND_SETTINGS.SIGNIFICANT_CHANGE_THRESHOLD}%）`));
  }

  return output.join('\n');
}

/**
 * 格式化變化百分比
 *
 * @param change - 變化百分比
 * @returns 格式化字串
 */
function formatChangePercentage(change: number): string {
  const formatted = change.toFixed(1);
  if (change > 0) {
    return chalk.red(`+${formatted}%`);
  } else if (change < 0) {
    return chalk.green(`${formatted}%`);
  } else {
    return chalk.gray('0.0%');
  }
}
