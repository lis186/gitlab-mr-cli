/**
 * 統計摘要格式化器
 * Feature: 011-mr-batch-comparison
 *
 * 格式化批次比較的彙總統計
 */

import chalk from 'chalk';
import type { BatchComparisonSummary } from '../types/batch-comparison.js';

/**
 * 統計摘要格式化器
 */
export class SummaryStatsFormatter {
  /**
   * 格式化統計摘要為結構化字串
   *
   * @param summary - 彙總統計
   * @returns 格式化的統計摘要
   */
  format(summary: BatchComparisonSummary): string {
    const output: string[] = [];

    // 標題
    output.push(chalk.bold.cyan('\n📊 批次比較統計摘要\n'));

    // 基本統計
    output.push(chalk.bold('基本統計：'));
    output.push(this.formatItem('  總 MR 數量', summary.totalCount, '個'));
    output.push(this.formatItem('  成功查詢', summary.successCount, '個'));
    if (summary.failedCount > 0) {
      output.push(this.formatItem('  查詢失敗', summary.failedCount, '個', chalk.red));
    }
    output.push('');

    // 程式碼變更統計
    output.push(chalk.bold('程式碼變更：'));
    output.push(this.formatItem('  提交數（平均）', summary.codeChanges.avgCommits, 'commits'));
    output.push(this.formatItem('  提交數（P50）', summary.codeChanges.medianCommits, 'commits'));
    output.push(this.formatItem('  提交數（P90）', summary.codeChanges.p90Commits, 'commits'));
    output.push(this.formatItem('  變更檔案數（平均）', summary.codeChanges.avgFiles, 'files'));
    output.push(this.formatItem('  變更檔案數（P50）', summary.codeChanges.medianFiles, 'files'));
    output.push(this.formatItem('  變更檔案數（P90）', summary.codeChanges.p90Files, 'files'));
    output.push(this.formatItem('  變更行數（平均）', summary.codeChanges.avgLines, 'lines'));
    output.push(this.formatItem('  變更行數（P50）', summary.codeChanges.medianLines, 'lines'));
    output.push(this.formatItem('  變更行數（P90）', summary.codeChanges.p90Lines, 'lines'));
    output.push('');

    // 審查統計
    output.push(chalk.bold('審查統計：'));
    output.push(this.formatItem('  評論數（平均）', summary.reviewStats.avgComments, 'comments'));
    output.push(this.formatItem('  評論數（P50）', summary.reviewStats.medianComments, 'comments'));
    output.push(this.formatItem('  評論數（P90）', summary.reviewStats.p90Comments, 'comments'));
    output.push(this.formatItem('  審查密度', summary.reviewStats.reviewDensityPerKLoc, 'comments/1k lines'));
    output.push(this.formatItem('  審查密度', summary.reviewStats.reviewDensityPerFile, 'comments/file'));
    output.push('');

    // 時間軸統計
    output.push(chalk.bold('時間軸統計：'));
    output.push(this.formatItem('  週期時間（平均）', summary.timelineStats.avgCycleDays, '天'));
    output.push(this.formatItem('  週期時間（P50 中位數）', summary.timelineStats.medianCycleDays, '天'));
    output.push(this.formatItem('  週期時間（P75）', summary.timelineStats.p75CycleDays, '天'));
    output.push(this.formatItem('  週期時間（P90）', summary.timelineStats.p90CycleDays, '天'));
    output.push(this.formatItem('  週期時間（P95）', summary.timelineStats.p95CycleDays, '天'));
    output.push('');
    output.push(chalk.dim('  各階段時間（平均值）：'));
    output.push(this.formatPhaseItem('    開發階段', summary.timelineStats.avgPhaseDurations.dev, summary.timelineStats.avgPhasePercentages.dev, chalk.cyan));
    output.push(this.formatPhaseItem('    等待審查', summary.timelineStats.avgPhaseDurations.wait, summary.timelineStats.avgPhasePercentages.wait, chalk.yellow));
    output.push(this.formatPhaseItem('    審查階段', summary.timelineStats.avgPhaseDurations.review, summary.timelineStats.avgPhasePercentages.review, chalk.magenta));
    output.push(this.formatPhaseItem('    合併階段', summary.timelineStats.avgPhaseDurations.merge, summary.timelineStats.avgPhasePercentages.merge, chalk.green));
    output.push('');
    output.push(chalk.dim('  各階段時間（P50 中位數）：'));
    output.push(this.formatPhaseItem('    開發階段', summary.timelineStats.medianPhaseDurations.dev, summary.timelineStats.avgPhasePercentages.dev, chalk.cyan));
    output.push(this.formatPhaseItem('    等待審查', summary.timelineStats.medianPhaseDurations.wait, summary.timelineStats.avgPhasePercentages.wait, chalk.yellow));
    output.push(this.formatPhaseItem('    審查階段', summary.timelineStats.medianPhaseDurations.review, summary.timelineStats.avgPhasePercentages.review, chalk.magenta));
    output.push(this.formatPhaseItem('    合併階段', summary.timelineStats.medianPhaseDurations.merge, summary.timelineStats.avgPhasePercentages.merge, chalk.green));
    output.push('');
    output.push(chalk.dim('  各階段時間（P90）：'));
    output.push(this.formatPhaseItem('    開發階段', summary.timelineStats.p90PhaseDurations.dev, summary.timelineStats.avgPhasePercentages.dev, chalk.cyan));
    output.push(this.formatPhaseItem('    等待審查', summary.timelineStats.p90PhaseDurations.wait, summary.timelineStats.avgPhasePercentages.wait, chalk.yellow));
    output.push(this.formatPhaseItem('    審查階段', summary.timelineStats.p90PhaseDurations.review, summary.timelineStats.avgPhasePercentages.review, chalk.magenta));
    output.push(this.formatPhaseItem('    合併階段', summary.timelineStats.p90PhaseDurations.merge, summary.timelineStats.avgPhasePercentages.merge, chalk.green));

    // AI Review 分組統計
    if (summary.aiReviewGroupStats) {
      const { withAI, withoutAI } = summary.aiReviewGroupStats;
      output.push('');
      output.push(chalk.bold('AI Review 分組統計：'));
      output.push('');
      output.push(chalk.green('  有 AI Review：'));
      output.push(this.formatItem('    MR 數量', withAI.count, '個'));
      output.push(this.formatItem('    週期時間（平均）', withAI.avgCycleDays ?? 0, '天'));
      output.push(this.formatItem('    週期時間（P50）', withAI.medianCycleDays ?? 0, '天'));
      output.push(this.formatItem('    週期時間（P90）', withAI.p90CycleDays ?? 0, '天'));
      output.push(this.formatTripleItem('    等待時間', withAI.avgWaitSeconds ?? 0, withAI.medianWaitSeconds ?? 0, withAI.p90WaitSeconds ?? 0));
      output.push('');
      output.push(chalk.dim('  沒有 AI Review：'));
      output.push(this.formatItem('    MR 數量', withoutAI.count, '個'));
      output.push(this.formatItem('    週期時間（平均）', withoutAI.avgCycleDays ?? 0, '天'));
      output.push(this.formatItem('    週期時間（P50）', withoutAI.medianCycleDays ?? 0, '天'));
      output.push(this.formatItem('    週期時間（P90）', withoutAI.p90CycleDays ?? 0, '天'));
      output.push(this.formatTripleItem('    等待時間', withoutAI.avgWaitSeconds ?? 0, withoutAI.medianWaitSeconds ?? 0, withoutAI.p90WaitSeconds ?? 0));
    }

    output.push('');
    return output.join('\n');
  }

  /**
   * 格式化單一統計項目
   *
   * @param label - 項目標籤
   * @param value - 項目值
   * @param unit - 單位（可選）
   * @param color - 顏色函數（可選）
   * @returns 格式化的項目字串
   */
  formatItem(label: string, value: number | string, unit?: string, color?: (str: string) => string): string {
    const valueStr = typeof value === 'number' ? value.toLocaleString('en-US') : value;
    const unitStr = unit ? ` ${unit}` : '';
    const displayValue = `${valueStr}${unitStr}`;

    return `${label.padEnd(24)} ${color ? color(displayValue) : displayValue}`;
  }

  /**
   * 格式化階段項目（帶百分比）
   */
  private formatPhaseItem(
    label: string,
    durationSeconds: number,
    percentage: number,
    color: (str: string) => string
  ): string {
    const duration = this.formatDuration(durationSeconds);
    const percentStr = `${percentage.toFixed(1)}%`;
    const displayValue = `${duration.padEnd(8)} (${percentStr})`;

    return `${label.padEnd(24)} ${color(displayValue)}`;
  }

  /**
   * 格式化三值項目（平均值、P50、P90）
   */
  private formatTripleItem(label: string, avgSeconds: number, medianSeconds: number, p90Seconds: number): string {
    const avgDuration = this.formatDuration(avgSeconds);
    const medianDuration = this.formatDuration(medianSeconds);
    const p90Duration = this.formatDuration(p90Seconds);
    const displayValue = `平均 ${avgDuration}, P50 ${medianDuration}, P90 ${p90Duration}`;

    return `${label.padEnd(24)} ${displayValue}`;
  }

  /**
   * 格式化時長
   */
  private formatDuration(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
  }
}
