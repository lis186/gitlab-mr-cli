/**
 * 時間軸階段視覺化格式化器
 * Feature: 011-mr-batch-comparison
 *
 * 將時間軸四階段格式化為彩色 ASCII 視覺化
 */

import chalk from 'chalk';
import type { TimelinePhases, PhaseData } from '../types/batch-comparison.js';

/**
 * 活動強度視覺化模式
 */
export type IntensityMode = 'shade' | 'height';

/**
 * 時間軸階段視覺化格式化器
 */
export class TimelinePhaseFormatter {
  private readonly MAX_WIDTH = 64; // 進度條最大寬度（對應 64 天）
  private readonly MIN_WIDTH = 1; // 進度條最小寬度（至少顯示 1 字符）
  private readonly CHARS_PER_DAY = 1; // 每天對應的字符數
  private readonly mode: IntensityMode; // 視覺化模式

  constructor(mode: IntensityMode = 'height') {
    this.mode = mode;
  }

  /**
   * 格式化時間軸階段為三行視覺化字串
   *
   * @param phases - 時間軸階段資料
   * @param cycleDays - 週期天數，用於等比例顯示（1天 = 1字符）
   * @param matchedPhases - 匹配的階段名稱（用於視覺化標示）
   * @returns 三行字串陣列 [視覺化條形圖, 絕對時間, 百分比]
   */
  format(phases: TimelinePhases, cycleDays?: number, matchedPhases?: string[]): [string, string, string] {
    const progressBar = this.generateProgressBar(phases, cycleDays);
    const absoluteTime = this.formatAbsoluteTime(phases);
    const percentage = this.formatPercentage(phases, matchedPhases);

    return [progressBar, absoluteTime, percentage];
  }

  /**
   * 生成顏色編碼的進度條
   *
   * @param phases - 時間軸階段資料
   * @param cycleDays - 週期天數（1天 = 1字符）
   * @returns 帶顏色的 ASCII 字符串
   */
  generateProgressBar(phases: TimelinePhases, cycleDays?: number): string {
    const { dev, wait, review, merge } = phases;

    // 計算實際總寬度：1天 = 1字符
    // 如果未提供 cycleDays，則使用預設寬度 32
    let actualWidth: number;
    if (cycleDays !== undefined) {
      actualWidth = Math.max(
        this.MIN_WIDTH,
        Math.min(
          this.MAX_WIDTH,
          Math.round(cycleDays * this.CHARS_PER_DAY)
        )
      );
    } else {
      actualWidth = 32; // 向後相容：預設寬度
    }

    // 計算每個階段的寬度（基於百分比）
    const devWidth = Math.round((dev.percentage / 100) * actualWidth);
    const waitWidth = Math.round((wait.percentage / 100) * actualWidth);
    const reviewWidth = Math.round((review.percentage / 100) * actualWidth);
    let mergeWidth = Math.round((merge.percentage / 100) * actualWidth);

    // 修正舍入誤差，確保總寬度 = actualWidth
    const totalWidth = devWidth + waitWidth + reviewWidth + mergeWidth;
    if (totalWidth < actualWidth) {
      mergeWidth += actualWidth - totalWidth;
    } else if (totalWidth > actualWidth) {
      mergeWidth = Math.max(0, mergeWidth - (totalWidth - actualWidth));
    }

    // 使用時間分段生成更精細的視覺化
    const devBar = this.generateSegmentedBar(dev, devWidth);
    const waitBar = this.getIntensityChar(wait.intensity.level, waitWidth);
    const reviewBar = this.generateSegmentedBar(review, reviewWidth);
    const mergeBar = this.generateSegmentedBar(merge, mergeWidth);

    // 應用顏色
    const devColored = chalk.cyan(devBar);
    const waitColored = chalk.yellow(waitBar);
    const reviewColored = chalk.magenta(reviewBar);
    const mergeColored = chalk.green(mergeBar);

    return devColored + waitColored + reviewColored + mergeColored;
  }

  /**
   * 根據時間分段生成有活動強度變化的進度條
   *
   * @param phase - 階段資料（包含 intensity 和可選的 timeSegments）
   * @param totalWidth - 進度條總寬度（字符數）
   * @returns 包含活動強度變化的字符串
   */
  private generateSegmentedBar(phase: PhaseData, totalWidth: number): string {
    // 如果沒有時間分段資料，使用整體強度
    if (!phase.timeSegments || phase.timeSegments.length === 0) {
      return this.getIntensityChar(phase.intensity.level, totalWidth);
    }

    const segments = phase.timeSegments;
    const totalDuration = segments.reduce((sum: number, seg: any) => sum + seg.durationSeconds, 0);

    let result = '';
    let remainingWidth = totalWidth;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue; // 防禦性檢查
      // 計算該分段應佔的寬度
      const segmentRatio = segment.durationSeconds / totalDuration;
      let segmentWidth = Math.round(segmentRatio * totalWidth);

      // 最後一段使用剩餘寬度，避免舍入誤差
      if (i === segments.length - 1) {
        segmentWidth = Math.max(0, remainingWidth); // 確保不會是負數
      }

      result += this.getIntensityChar(segment.level, segmentWidth);
      remainingWidth -= segmentWidth;
    }

    return result;
  }

  /**
   * 格式化絕對時間列
   *
   * @param phases - 時間軸階段資料
   * @returns 格式化的時間字串（例如 "2d|1h|3h|30m"）
   */
  formatAbsoluteTime(phases: TimelinePhases): string {
    const { dev, wait, review, merge } = phases;

    const parts = [
      dev.formattedDuration,
      wait.formattedDuration,
      review.formattedDuration,
      merge.formattedDuration,
    ];

    return parts.join('|');
  }

  /**
   * 格式化百分比列
   *
   * @param phases - 時間軸階段資料
   * @param matchedPhases - 匹配的階段名稱（用於視覺化標示）
   * @returns 格式化的百分比字串（例如 "40%|10%|35%|15%"）
   */
  formatPercentage(phases: TimelinePhases, matchedPhases?: string[]): string {
    const { dev, wait, review, merge } = phases;
    const matched = matchedPhases || [];

    const parts = [
      matched.includes('dev')
        ? chalk.yellow(`⚠️${Math.round(dev.percentage)}%`)
        : `${Math.round(dev.percentage)}%`,
      matched.includes('wait')
        ? chalk.yellow(`⚠️${Math.round(wait.percentage)}%`)
        : `${Math.round(wait.percentage)}%`,
      matched.includes('review')
        ? chalk.yellow(`⚠️${Math.round(review.percentage)}%`)
        : `${Math.round(review.percentage)}%`,
      matched.includes('merge')
        ? chalk.yellow(`⚠️${Math.round(merge.percentage)}%`)
        : `${Math.round(merge.percentage)}%`,
    ];

    return parts.join('|');
  }

  /**
   * 根據強度等級取得對應字符
   *
   * @param level - 強度等級 (0-3)
   * @param width - 寬度
   * @returns 視覺化字符串（根據模式選擇高度或濃淡）
   */
  private getIntensityChar(level: 0 | 1 | 2 | 3, width: number): string {
    if (width === 0) {
      return '';
    }

    const chars = this.mode === 'height'
      ? {
          0: '▁', // 無活動（最低高度）
          1: '▃', // 低活動（3/8 高度）
          2: '▆', // 中活動（3/4 高度）
          3: '█', // 高活動（全高度）
        }
      : {
          0: '░', // 無活動（淺色）
          1: '▒', // 低活動（中淺）
          2: '▓', // 中活動（中深）
          3: '█', // 高活動（深色）
        };

    return chars[level].repeat(width);
  }

  /**
   * 取得當前模式的圖例說明
   */
  getLegendText(): string {
    return this.mode === 'height'
      ? '高度表示活動強度: █ (高) ▆ (中) ▃ (低) ▁ (無)'
      : '濃淡表示活動強度: █ (高) ▓ (中) ▒ (低) ░ (無)';
  }
}
