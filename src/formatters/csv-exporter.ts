/**
 * CSV 匯出器
 * Feature: 011-mr-batch-comparison
 *
 * 將批次比較結果匯出為 CSV 格式
 */

import type { BatchComparisonResult, MRComparisonRow } from '../types/batch-comparison.js';
import { CSV_COLUMNS } from '../types/batch-comparison.js';

/**
 * CSV 匯出器
 */
export class CSVExporter {
  /**
   * 將批次比較結果匯出為 CSV 格式
   *
   * @param result - 批次比較結果
   * @returns CSV 格式字串
   */
  export(result: BatchComparisonResult): string {
    const lines: string[] = [];

    // 添加標頭
    lines.push(CSV_COLUMNS.join(','));

    // 添加資料行
    for (const row of result.rows) {
      if (!row.error) {
        lines.push(this.rowToCSV(row));
      }
    }

    return lines.join('\n');
  }

  /**
   * 將單一 MRComparisonRow 轉換為 CSV 行
   *
   * @param row - MR 比較資料行
   * @returns CSV 格式字串
   */
  rowToCSV(row: MRComparisonRow): string {
    const values = [
      row.iid.toString(),
      this.escapeCSV(row.title),
      this.escapeCSV(row.author),
      row.cycleDays.toFixed(1),
      row.codeChanges.commits.toString(),
      row.codeChanges.files.toString(),
      row.codeChanges.totalLines.toString(),
      row.reviewStats.comments.toString(),
      this.formatAIReviewForCSV(row.reviewStats.aiReviewStatus),
      row.timeline.dev.durationSeconds.toString(),
      row.timeline.wait.durationSeconds.toString(),
      row.timeline.review.durationSeconds.toString(),
      row.timeline.merge.durationSeconds.toString(),
      row.timeline.dev.percentage.toFixed(1),
      row.timeline.wait.percentage.toFixed(1),
      row.timeline.review.percentage.toFixed(1),
      row.timeline.merge.percentage.toFixed(1),
      row.status,
    ];

    return values.join(',');
  }

  /**
   * 格式化 AI Review 狀態為 CSV 格式
   *
   * @param status - AI Review 狀態
   * @returns 格式化後的字串（Yes/No/Unknown）
   */
  private formatAIReviewForCSV(status?: 'yes' | 'no' | 'unknown'): string {
    switch (status) {
      case 'yes':
        return 'Yes';
      case 'no':
        return 'No';
      case 'unknown':
      default:
        return 'Unknown';
    }
  }

  /**
   * 處理 CSV 特殊字符（RFC 4180）
   *
   * @param value - 原始字串
   * @returns 轉義後的字串
   */
  private escapeCSV(value: string): string {
    // 如果包含逗號、雙引號或換行符，需要用雙引號包裹
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      // 雙引號需要轉義為兩個雙引號
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    }

    return value;
  }
}
