/**
 * Review Rounds 詳細分析格式化器
 * Feature: Review Rounds Detail (Phase 2)
 *
 * 將輪數詳細信息格式化為終端輸出
 */

import chalk from 'chalk';
import type { MRRoundsDetail } from '../types/batch-comparison.js';

/**
 * Review Rounds 詳細分析格式化器
 */
export class RoundsDetailFormatter {
  /**
   * 格式化輪數詳細分析
   *
   * @param roundsDetails - MR 輪數詳細信息列表
   * @returns 格式化的輸出字串
   */
  format(roundsDetails: MRRoundsDetail[]): string {
    if (roundsDetails.length === 0) {
      return '';
    }

    const output: string[] = [];

    output.push('');
    output.push(chalk.bold.cyan('📊 Review Rounds 詳細分析'));
    output.push('');

    // 只顯示有輪數的 MR（總輪數 > 0）
    const mrsWithRounds = roundsDetails.filter(mr => mr.totalRounds > 0);

    if (mrsWithRounds.length === 0) {
      output.push(chalk.dim('所有 MR 都是一次通過，無需修正！ 👍'));
      return output.join('\n');
    }

    for (const mrDetail of mrsWithRounds) {
      output.push(this.formatSingleMR(mrDetail));
      output.push('');
    }

    return output.join('\n');
  }

  /**
   * 格式化單一 MR 的輪數詳細信息
   */
  private formatSingleMR(mrDetail: MRRoundsDetail): string {
    const output: string[] = [];

    // 標題和連結
    output.push(chalk.bold(`MR !${mrDetail.mrIid}: ${mrDetail.title}`));
    output.push(chalk.dim(`🔗 ${mrDetail.webUrl}`));
    output.push('');

    // 統計摘要
    output.push(`  總輪數: ${chalk.bold.yellow(mrDetail.totalRounds.toString())} 輪修正`);
    output.push(`  平均間隔: ${chalk.bold(mrDetail.formattedAvgInterval)}`);
    if (mrDetail.slowestRound !== undefined) {
      output.push(`  最慢輪次: 第 ${chalk.bold.red(mrDetail.slowestRound.toString())} 輪`);
    }
    output.push('');

    // 輪次詳情（跳過第 0 輪初始版本）
    output.push(`  輪次詳情：`);
    const visibleRounds = mrDetail.rounds.filter(r => r.roundNumber > 0);

    for (const round of visibleRounds) {
      const roundLabel = `第 ${round.roundNumber} 輪`;
      const interval = round.formattedInterval;

      let line = `    ${roundLabel}: ${interval}`;

      // 標記慢速輪次
      if (round.isSlow) {
        line += chalk.red(' ⚠️ 偏慢');
      }

      output.push(line);
    }

    // 建議
    const suggestions = this.generateSuggestions(mrDetail);
    if (suggestions.length > 0) {
      output.push('');
      output.push(`  💡 建議：`);
      suggestions.forEach(suggestion => {
        output.push(`    • ${chalk.dim(suggestion)}`);
      });
    }

    return output.join('\n');
  }

  /**
   * 生成改進建議
   */
  private generateSuggestions(mrDetail: MRRoundsDetail): string[] {
    const suggestions: string[] = [];

    // 輪數過多
    if (mrDetail.totalRounds >= 10) {
      suggestions.push('輪數過多（≥10），建議檢討需求是否明確、設計是否完整');
    } else if (mrDetail.totalRounds >= 5) {
      suggestions.push('輪數偏高（≥5），可能需要改善程式碼品質或加強 self-review');
    }

    // 慢速輪次
    const slowRounds = mrDetail.rounds.filter(r => r.isSlow);
    if (slowRounds.length > 0) {
      const slowRoundNumbers = slowRounds.map(r => r.roundNumber).join(', ');
      suggestions.push(`第 ${slowRoundNumbers} 輪耗時過長，可能等待 reviewer 回覆或遇到技術難題`);
    }

    // 平均間隔過長
    if (mrDetail.avgIntervalSeconds > 172800) { // 2 天
      suggestions.push('平均修正間隔過長（>2天），建議加快修正速度或主動追蹤 review 進度');
    }

    return suggestions;
  }
}
