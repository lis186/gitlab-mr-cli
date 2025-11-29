/**
 * T065-T066: 錯誤格式化器
 *
 * 提供終端和 JSON 兩種輸出格式
 */

import chalk from 'chalk';
import type { StructuredError } from '../lib/error-handler.js';
import { ErrorType } from '../lib/error-handler.js';

/**
 * T065: 終端錯誤格式化器
 */
export class TerminalErrorFormatter {
  /**
   * 格式化錯誤為終端輸出
   *
   * @param error - 結構化錯誤
   * @param verbose - 是否顯示詳細資訊（堆疊追蹤）
   * @returns 格式化字串
   */
  format(error: StructuredError, verbose = false): string {
    const output: string[] = [];

    // 錯誤圖示和類型
    const icon = this.getErrorIcon(error.type);
    const typeLabel = this.getTypeLabel(error.type);

    output.push('');
    output.push(chalk.bold.red(`${icon} ${typeLabel}`));
    output.push('');

    // 錯誤訊息
    output.push(chalk.red(`  訊息: ${error.message}`));

    // HTTP 狀態碼（如果有）
    if (error.statusCode) {
      output.push(chalk.gray(`  狀態碼: ${error.statusCode}`));
    }

    // 錯誤代碼（如果有）
    if (error.code) {
      output.push(chalk.gray(`  錯誤代碼: ${error.code}`));
    }

    output.push('');

    // 補救建議
    output.push(chalk.yellow(`  💡 建議: ${error.remedy}`));
    output.push('');

    // 詳細資訊（--verbose 模式）
    if (verbose && error.originalError) {
      output.push(chalk.gray('  ───────────────────────────────────────────────'));
      output.push(chalk.gray('  詳細資訊（--verbose）：'));
      output.push('');

      // 堆疊追蹤
      if (error.originalError.stack) {
        output.push(chalk.gray(this.indentLines(error.originalError.stack, 2)));
      } else {
        output.push(chalk.gray(this.indentLines(JSON.stringify(error.originalError, null, 2), 2)));
      }

      output.push('');
      output.push(chalk.gray('  ───────────────────────────────────────────────'));
    }

    return output.join('\n');
  }

  /**
   * 取得錯誤類型圖示
   */
  private getErrorIcon(type: ErrorType): string {
    switch (type) {
      case ErrorType.AUTHENTICATION:
        return '🔐';
      case ErrorType.PERMISSION:
        return '🚫';
      case ErrorType.NOT_FOUND:
        return '🔍';
      case ErrorType.RATE_LIMIT:
        return '⏱️';
      case ErrorType.NETWORK:
        return '🌐';
      case ErrorType.VALIDATION:
        return '⚠️';
      case ErrorType.UNKNOWN:
      default:
        return '❌';
    }
  }

  /**
   * 取得錯誤類型標籤
   */
  private getTypeLabel(type: ErrorType): string {
    switch (type) {
      case ErrorType.AUTHENTICATION:
        return '認證失敗';
      case ErrorType.PERMISSION:
        return '權限不足';
      case ErrorType.NOT_FOUND:
        return '找不到資源';
      case ErrorType.RATE_LIMIT:
        return 'API 限流';
      case ErrorType.NETWORK:
        return '網路錯誤';
      case ErrorType.VALIDATION:
        return '驗證錯誤';
      case ErrorType.UNKNOWN:
      default:
        return '未知錯誤';
    }
  }

  /**
   * 將多行文字縮排
   */
  private indentLines(text: string, spaces: number): string {
    const indent = ' '.repeat(spaces);
    return text
      .split('\n')
      .map((line) => indent + line)
      .join('\n');
  }
}

/**
 * T066: JSON 錯誤格式化器
 */
export class JsonErrorFormatter {
  /**
   * 格式化錯誤為 JSON 輸出
   *
   * @param error - 結構化錯誤
   * @param includeStack - 是否包含堆疊追蹤
   * @returns JSON 字串
   */
  format(error: StructuredError, includeStack = false): string {
    const output: any = {
      error: {
        type: error.type,
        message: error.message,
        remedy: error.remedy,
      },
    };

    // 可選欄位
    if (error.statusCode) {
      output.error.statusCode = error.statusCode;
    }

    if (error.code) {
      output.error.code = error.code;
    }

    // 堆疊追蹤（僅在 --verbose 模式）
    if (includeStack && error.originalError?.stack) {
      output.error.stack = error.originalError.stack;
    }

    return JSON.stringify(output, null, 2);
  }
}

/**
 * 統一錯誤格式化器 - 根據輸出模式自動選擇
 */
export class ErrorFormatter {
  private readonly terminalFormatter = new TerminalErrorFormatter();
  private readonly jsonFormatter = new JsonErrorFormatter();

  /**
   * 格式化錯誤
   *
   * @param error - 結構化錯誤
   * @param options - 格式化選項
   * @returns 格式化字串
   */
  format(
    error: StructuredError,
    options: {
      json?: boolean;
      verbose?: boolean;
    } = {}
  ): string {
    const { json = false, verbose = false } = options;

    if (json) {
      return this.jsonFormatter.format(error, verbose);
    } else {
      return this.terminalFormatter.format(error, verbose);
    }
  }
}
