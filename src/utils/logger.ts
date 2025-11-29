/**
 * Logger 工具 - 用於記錄應用程式日誌
 *
 * 功能：006-release-readiness 階段 9
 * 任務：T079 - 加入日誌記錄
 */

import chalk from 'chalk';

/**
 * 日誌等級
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Logger 配置選項
 */
export interface LoggerOptions {
  /** 是否啟用 verbose 模式（顯示 DEBUG 訊息） */
  verbose?: boolean;
  /** 最小日誌等級 */
  minLevel?: LogLevel;
  /** 是否使用顏色（預設：true） */
  useColors?: boolean;
  /** 是否顯示時間戳（預設：false） */
  showTimestamp?: boolean;
  /** 日誌前綴 */
  prefix?: string;
}

/**
 * Logger 類別
 */
export class Logger {
  private options: Required<LoggerOptions>;

  constructor(options: LoggerOptions = {}) {
    this.options = {
      verbose: options.verbose ?? false,
      minLevel: options.minLevel ?? (options.verbose ? LogLevel.DEBUG : LogLevel.INFO),
      useColors: options.useColors ?? true,
      showTimestamp: options.showTimestamp ?? false,
      prefix: options.prefix ?? '',
    };
  }

  /**
   * 更新 Logger 配置
   */
  setOptions(options: Partial<LoggerOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };

    // 如果啟用 verbose，自動降低最小日誌等級到 DEBUG
    if (options.verbose && !options.minLevel) {
      this.options.minLevel = LogLevel.DEBUG;
    }
  }

  /**
   * 檢查是否應該輸出該等級的日誌
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.options.minLevel;
  }

  /**
   * 格式化日誌訊息
   */
  private formatMessage(level: LogLevel, message: string): string {
    let formatted = '';

    // 時間戳
    if (this.options.showTimestamp) {
      const timestamp = new Date().toISOString();
      formatted += `[${timestamp}] `;
    }

    // 前綴
    if (this.options.prefix) {
      formatted += `[${this.options.prefix}] `;
    }

    // 日誌等級
    const levelLabel = this.getLevelLabel(level);
    if (this.options.useColors) {
      formatted += this.colorizeLevel(level, levelLabel) + ' ';
    } else {
      formatted += levelLabel + ' ';
    }

    // 訊息
    formatted += message;

    return formatted;
  }

  /**
   * 取得日誌等級標籤
   */
  private getLevelLabel(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return '[DEBUG]';
      case LogLevel.INFO:
        return '[INFO] ';
      case LogLevel.WARN:
        return '[WARN] ';
      case LogLevel.ERROR:
        return '[ERROR]';
      default:
        return '[LOG]  ';
    }
  }

  /**
   * 為日誌等級標籤添加顏色
   */
  private colorizeLevel(level: LogLevel, label: string): string {
    switch (level) {
      case LogLevel.DEBUG:
        return chalk.gray(label);
      case LogLevel.INFO:
        return chalk.blue(label);
      case LogLevel.WARN:
        return chalk.yellow(label);
      case LogLevel.ERROR:
        return chalk.red(label);
      default:
        return label;
    }
  }

  /**
   * DEBUG 等級日誌（僅在 verbose 模式下顯示）
   */
  debug(message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const formatted = this.formatMessage(LogLevel.DEBUG, message);
    console.debug(formatted, ...args);
  }

  /**
   * INFO 等級日誌
   */
  info(message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const formatted = this.formatMessage(LogLevel.INFO, message);
    console.info(formatted, ...args);
  }

  /**
   * WARN 等級日誌
   */
  warn(message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const formatted = this.formatMessage(LogLevel.WARN, message);
    console.warn(formatted, ...args);
  }

  /**
   * ERROR 等級日誌
   */
  error(message: string, error?: Error | any, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const formatted = this.formatMessage(LogLevel.ERROR, message);

    if (error instanceof Error) {
      console.error(formatted, error.message, ...args);
      if (this.options.verbose && error.stack) {
        console.error(chalk.gray(error.stack));
      }
    } else if (error) {
      console.error(formatted, error, ...args);
    } else {
      console.error(formatted, ...args);
    }
  }

  /**
   * 記錄 API 呼叫
   */
  apiCall(method: string, endpoint: string, params?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const message = `API 呼叫: ${method} ${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      this.debug(message, params);
    } else {
      this.debug(message);
    }
  }

  /**
   * 記錄 API 回應
   */
  apiResponse(method: string, endpoint: string, status: number, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const message = `API 回應: ${method} ${endpoint} - ${status}`;
    if (data) {
      this.debug(message, data);
    } else {
      this.debug(message);
    }
  }

  /**
   * 記錄效能指標
   */
  performance(operation: string, durationMs: number): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    this.debug(`效能: ${operation} 完成於 ${durationMs}ms`);
  }

  /**
   * 建立子 Logger（帶有額外前綴）
   */
  child(prefix: string): Logger {
    const childPrefix = this.options.prefix
      ? `${this.options.prefix}:${prefix}`
      : prefix;

    return new Logger({
      ...this.options,
      prefix: childPrefix,
    });
  }
}

/**
 * 全域預設 Logger 實例
 */
export const logger = new Logger();

/**
 * 建立 Logger 實例
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}
