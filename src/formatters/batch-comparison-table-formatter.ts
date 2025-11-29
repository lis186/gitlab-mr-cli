/**
 * 批次比較表格格式化器
 * Feature: 011-mr-batch-comparison
 *
 * 將批次比較結果格式化為終端表格輸出
 */

import Table from 'cli-table3';
import chalk from 'chalk';
import type { BatchComparisonResult } from '../types/batch-comparison.js';
import { TimelinePhaseFormatter, type IntensityMode } from './timeline-phase-formatter.js';
import { SummaryStatsFormatter } from './summary-stats-formatter.js';

/**
 * 時間軸縮放模式
 */
export type TimelineScaleMode = 'absolute' | 'relative';

/**
 * 表格顯示格式
 */
export type TableFormat = 'minimal' | 'standard' | 'full';

/**
 * 批次比較表格格式化器
 */
export class BatchComparisonTableFormatter {
  private readonly timelineFormatter: TimelinePhaseFormatter;
  private readonly summaryFormatter: SummaryStatsFormatter;
  private readonly scaleMode: TimelineScaleMode;
  private readonly format: TableFormat;

  constructor(
    intensityMode: IntensityMode = 'height',
    scaleMode: TimelineScaleMode = 'absolute',
    format: TableFormat = 'standard'
  ) {
    this.timelineFormatter = new TimelinePhaseFormatter(intensityMode);
    this.summaryFormatter = new SummaryStatsFormatter();
    this.scaleMode = scaleMode;
    this.format = format;
  }

  /**
   * 根據格式取得表格欄位配置
   */
  private getTableConfig(): { head: string[], widths: number[] } {
    switch (this.format) {
      case 'minimal':
        return {
          head: [
            chalk.bold('MR'),
            chalk.bold('標題'),
            chalk.bold('週期\n(天)'),
            chalk.bold('輪數'),
            chalk.bold('評論'),
            chalk.bold('AI'),
          ],
          widths: [6, 30, 7, 6, 6, 4],
        };

      case 'standard':
        return {
          head: [
            chalk.bold('MR'),
            chalk.bold('標題'),
            chalk.bold('作者'),
            chalk.bold('審查者'),
            chalk.bold('階段'),
            chalk.bold('週期\n(天)'),
            chalk.bold('提交'),
            chalk.bold('檔案'),
            chalk.bold('行數'),
            chalk.bold('評論'),
            chalk.bold('輪數'),
            chalk.bold('AI'),
          ],
          widths: [6, 16, 10, 12, 10, 7, 6, 6, 7, 6, 6, 4],
        };

      case 'full':
      default:
        return {
          head: [
            chalk.bold('MR'),
            chalk.bold('標題'),
            chalk.bold('作者'),
            chalk.bold('審查者'),
            chalk.bold('階段'),
            chalk.bold('週期\n(天)'),
            chalk.bold('開始\n時間'),
            chalk.bold('結束\n時間'),
            chalk.bold('提交'),
            chalk.bold('檔案'),
            chalk.bold('行數'),
            chalk.bold('評論'),
            chalk.bold('輪數'),
            chalk.bold('AI'),
            chalk.bold('時間軸'),
          ],
          widths: [6, 16, 10, 12, 10, 7, 12, 12, 6, 6, 7, 6, 6, 4, 50],
        };
    }
  }

  /**
   * 根據格式建立資料行
   */
  private buildTableRow(
    row: any,
    phaseDisplay: string,
    startTime: string,
    endTime: string,
    progressBar: string,
    absoluteTime: string,
    percentage: string
  ): string[] {
    const roundsDisplay = row.reviewStats.diffVersions !== undefined
      ? row.reviewStats.diffVersions.toString()
      : chalk.dim('-');

    const aiReviewDisplay = this.formatAIReview(row.reviewStats.aiReviewStatus);

    switch (this.format) {
      case 'minimal':
        return [
          chalk.bold.white(row.iid.toString()),
          row.title,
          row.cycleDays.toFixed(1),
          roundsDisplay,
          row.reviewStats.comments.toString(),
          aiReviewDisplay,
        ];

      case 'standard':
        return [
          chalk.bold.white(row.iid.toString()),
          row.title,
          row.author,
          row.reviewers,
          phaseDisplay,
          row.cycleDays.toFixed(1),
          row.codeChanges.commits.toString(),
          row.codeChanges.files.toString(),
          row.codeChanges.totalLines.toLocaleString('en-US'),
          row.reviewStats.comments.toString(),
          roundsDisplay,
          aiReviewDisplay,
        ];

      case 'full':
      default:
        return [
          chalk.bold.white(row.iid.toString()),
          row.title,
          row.author,
          row.reviewers,
          phaseDisplay,
          row.cycleDays.toFixed(1),
          startTime,
          endTime,
          row.codeChanges.commits.toString(),
          row.codeChanges.files.toString(),
          row.codeChanges.totalLines.toLocaleString('en-US'),
          row.reviewStats.comments.toString(),
          roundsDisplay,
          aiReviewDisplay,
          `${progressBar}\n${chalk.dim(absoluteTime)}\n${chalk.dim(percentage)}`,
        ];
    }
  }

  /**
   * 建立錯誤行
   */
  private buildErrorRow(iid: number, error: string): string[] {
    switch (this.format) {
      case 'minimal':
        return [
          chalk.red(iid.toString()),
          chalk.dim(error),
          '-',
          '-',
          '-',
          '-',
        ];

      case 'standard':
        return [
          chalk.red(iid.toString()),
          chalk.dim(error),
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
        ];

      case 'full':
      default:
        return [
          chalk.red(iid.toString()),
          chalk.dim(error),
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          chalk.red('❌ 查詢失敗'),
        ];
    }
  }

  /**
   * 格式化批次比較結果為終端表格
   *
   * @param result - 批次比較結果
   * @returns 格式化的表格字串
   */
  formatTable(result: BatchComparisonResult): string {
    const output: string[] = [];

    // 標題
    output.push(chalk.bold.cyan('\n🔍 MR 批次比較結果\n'));
    output.push(`專案: ${chalk.bold(result.metadata.projectId)}`);
    output.push(`查詢時間: ${new Date(result.metadata.queriedAt).toLocaleString('zh-TW')}`);
    output.push(`耗時: ${result.metadata.queryDurationMs}ms`);

    // 顯示過濾和排序條件
    if (result.metadata.appliedFilters || result.metadata.appliedSort) {
      output.push('');
      if (result.metadata.appliedFilters) {
        const filters: string[] = [];
        const f = result.metadata.appliedFilters;
        if (f.author) filters.push(`作者: ${f.author}`);
        if (f.status) {
          const statusLabels: Record<string, string> = {
            'merged': '已合併',
            'open': '未合併',
            'closed': '已關閉',
            'all': '全部',
          };
          filters.push(`狀態: ${statusLabels[f.status] || f.status}`);
        }
        if (f.minCycleDays) filters.push(`週期 >= ${f.minCycleDays}d`);
        if (f.maxCycleDays) filters.push(`週期 <= ${f.maxCycleDays}d`);
        if (f.dateRange) {
          const dateRangeParts: string[] = [];
          if (f.dateRange.since) dateRangeParts.push(`從 ${f.dateRange.since}`);
          if (f.dateRange.until) dateRangeParts.push(`到 ${f.dateRange.until}`);
          if (dateRangeParts.length > 0) {
            filters.push(`日期範圍: ${dateRangeParts.join(' ')}`);
          }
        }
        if (filters.length > 0) {
          output.push(`過濾條件: ${filters.join(', ')}`);
        }
      }
      if (result.metadata.appliedSort) {
        const sortLabel = this.getSortFieldLabel(result.metadata.appliedSort.field);
        const orderLabel = result.metadata.appliedSort.order === 'asc' ? '遞增' : '遞減';
        output.push(`排序: ${sortLabel} (${orderLabel})`);
      }
    }

    output.push('');

    // 圖例
    output.push(this.formatLegend());

    // 計算縮放參數
    let maxCycleDays = 1; // 用於相對模式
    if (this.scaleMode === 'relative') {
      maxCycleDays = Math.max(
        ...result.rows
          .filter(row => !row.error && row.cycleDays > 0)
          .map(row => row.cycleDays),
        0.1 // 最小值避免除以零
      );
    }

    // 建立表格
    const config = this.getTableConfig();
    const table = new Table({
      head: config.head,
      colWidths: config.widths,
      wordWrap: true,
      wrapOnWordBoundary: true,
    });

    // 添加資料行
    for (const row of result.rows) {
      if (row.error) {
        // 錯誤行
        table.push(this.buildErrorRow(row.iid, row.error));
      } else {
        // 正常行 - 根據模式選擇縮放方式
        let cycleDaysParam: number;
        if (this.scaleMode === 'relative') {
          // 相對模式：基於最大值縮放到64字符
          const scale = row.cycleDays > 0 ? row.cycleDays / maxCycleDays : 0.015625; // 最小 1/64
          cycleDaysParam = scale * 64; // 縮放到64天的範圍
        } else {
          // 絕對模式：1天 = 1字符
          cycleDaysParam = row.cycleDays;
        }

        // T020: 提取匹配的階段過濾器（用於視覺化標示）
        const matchedPhases = (result as any).matchedPhaseFilters?.[row.iid];
        const [progressBar, absoluteTime, percentage] = this.timelineFormatter.format(row.timeline, cycleDaysParam, matchedPhases);
        const phaseDisplay = this.formatPhase(row.phase, row.phaseLabel);
        const startTime = this.formatDateTime(row.createdAt);
        const endTime = row.mergedAt ? this.formatDateTime(row.mergedAt) : chalk.dim('-');

        table.push(this.buildTableRow(row, phaseDisplay, startTime, endTime, progressBar, absoluteTime, percentage));
      }
    }

    output.push(table.toString());

    return output.join('\n');
  }

  /**
   * 格式化彙總統計區塊
   *
   * @param summary - 彙總統計
   * @returns 格式化的統計字串
   */
  formatSummary(summary: BatchComparisonResult['summary']): string {
    return this.summaryFormatter.format(summary);
  }

  /**
   * 格式化圖例說明
   *
   * @returns 圖例字串
   */
  formatLegend(): string {
    const output: string[] = [];
    output.push(chalk.dim('時間軸圖例:'));
    output.push(chalk.dim('  ') + chalk.cyan('█') + chalk.dim(' 開發階段 (Dev)    ') +
                chalk.yellow('█') + chalk.dim(' 等待審查 (Wait)'));
    output.push(chalk.dim('  ') + chalk.magenta('█') + chalk.dim(' 審查階段 (Review)  ') +
                chalk.green('█') + chalk.dim(' 合併階段 (Merge)'));
    output.push(chalk.dim('  ' + this.timelineFormatter.getLegendText()));
    output.push('');
    output.push(chalk.dim('輪數說明:'));
    output.push(chalk.dim('  輪數 = MR 被修改並重新提交的次數（GitLab Diff Versions - 1）'));
    output.push(chalk.dim('  0 = 完美！無需修正直接合併 | 1-3 = 健康範圍 | 4+ = 可能需要檢討流程'));
    output.push(chalk.dim('  驗證方式: GitLab MR 頁面 → Changes 標籤 → 右上角版本選擇器'));
    output.push('');
    output.push(chalk.dim('AI Review 說明:'));
    output.push(chalk.dim('  ') + chalk.green('✅') + chalk.dim(' = 有使用 AI Review  |  ') +
                chalk.red('❌') + chalk.dim(' = 無使用 AI Review  |  ') +
                chalk.yellow('⚠️') + chalk.dim(' = 未知'));
    output.push('');
    return output.join('\n');
  }

  /**
   * 格式化 MR 階段顯示
   */
  private formatPhase(phase: string, phaseLabel: string): string {
    const phaseColors: Record<string, (text: string) => string> = {
      'merged': chalk.green,
      'ready-to-merge': chalk.blue,
      'in-review': chalk.yellow,
      'waiting-review': chalk.cyan,
      'in-development': chalk.magenta,
      'closed': chalk.gray,
    };

    const colorFn = phaseColors[phase] || chalk.white;
    return colorFn(phaseLabel);
  }

  /**
   * 格式化 AI Review 狀態顯示
   */
  private formatAIReview(status?: 'yes' | 'no' | 'unknown'): string {
    switch (status) {
      case 'yes':
        return chalk.green('✅');
      case 'no':
        return chalk.red('❌');
      case 'unknown':
      default:
        return chalk.yellow('⚠️');
    }
  }

  /**
   * 格式化日期時間為簡潔格式
   * @param dateTimeStr - ISO 8601 格式的日期時間字串
   * @returns 格式化的時間字串（例如：2024/10/20\n14:30）
   */
  private formatDateTime(dateTimeStr: string): string {
    if (!dateTimeStr) return chalk.dim('-');

    try {
      const date = new Date(dateTimeStr);
      const year = date.getFullYear().toString(); // 完整 4 位數年份
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return `${year}/${month}/${day}\n${hours}:${minutes}`;
    } catch (error) {
      return chalk.dim('-');
    }
  }

  /**
   * 取得排序欄位的中文標籤
   */
  private getSortFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      cycleDays: '週期時間',
      commits: '提交數',
      files: '檔案數',
      lines: '行數',
      comments: '評論數',
      devTime: '開發時間',
      waitTime: '等待時間',
      reviewTime: '審查時間',
      mergeTime: '合併時間',
      createdAt: '開始時間',
      mergedAt: '結束時間',
    };
    return labels[field] || field;
  }
}
