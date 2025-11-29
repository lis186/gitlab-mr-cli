/**
 * 終端寬度偵測工具
 * Feature: 011-mr-batch-comparison
 */

/**
 * 終端寬度偵測器
 */
export class TerminalWidthDetector {
  /**
   * 取得當前終端寬度
   * @returns 終端寬度（字元數），預設 120
   */
  static getWidth(): number {
    // 優先使用 process.stdout.columns
    if (process.stdout.columns) {
      return process.stdout.columns;
    }

    // 嘗試從環境變數取得
    if (process.env.COLUMNS) {
      const width = parseInt(process.env.COLUMNS, 10);
      if (!isNaN(width) && width > 0) {
        return width;
      }
    }

    // 預設寬度
    return 120;
  }

  /**
   * 檢查終端寬度是否足夠顯示表格
   * @param minWidth 最小建議寬度（預設 120）
   * @returns 是否足夠寬度
   */
  static isWidthSufficient(minWidth = 120): boolean {
    return this.getWidth() >= minWidth;
  }

  /**
   * 取得寬度警告訊息（如果寬度不足）
   * @param minWidth 最小建議寬度（預設 120）
   * @returns 警告訊息，若寬度足夠則返回 null
   */
  static getWidthWarning(minWidth = 120): string | null {
    const currentWidth = this.getWidth();
    if (currentWidth >= minWidth) {
      return null;
    }

    return `⚠️  警告: 終端寬度 (${currentWidth}) 小於建議寬度 (${minWidth})，表格顯示可能不完整。\n建議: 請增加終端視窗寬度或使用 --json/--csv 匯出格式。\n`;
  }
}
