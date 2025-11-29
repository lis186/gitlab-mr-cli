/**
 * 發布服務錯誤處理工具
 *
 * 提供統一的錯誤處理、重試邏輯與降級策略
 *
 * @module services/release/error-handler
 */

import { AppError, ErrorType } from '../../models/error.js';
import { logger } from '../../utils/logger.js';

/**
 * API 呼叫選項
 */
export interface ApiCallOptions {
  /** 操作名稱（用於日誌） */
  operation: string;
  /** 是否允許重試 */
  retryable?: boolean;
  /** 最大重試次數 */
  maxRetries?: number;
  /** 重試延遲（毫秒） */
  retryDelay?: number;
  /** 降級值（當失敗時返回） */
  fallbackValue?: unknown;
  /** 錯誤處理策略 */
  errorStrategy?: 'throw' | 'fallback' | 'skip';
}

/**
 * GitLab API 錯誤響應
 */
interface GitLabApiError extends Error {
  response?: {
    status: number;
    statusText: string;
    data?: {
      message?: string;
      error?: string;
    };
  };
  cause?: {
    code?: string;
    message?: string;
  };
}

/**
 * 錯誤處理器類別
 */
export class ReleaseErrorHandler {
  /**
   * 包裝 GitLab API 呼叫，提供錯誤處理與重試機制
   *
   * @param fn - 要執行的 API 函數
   * @param options - API 呼叫選項
   * @returns Promise<T>
   */
  static async wrapApiCall<T>(
    fn: () => Promise<T>,
    options: ApiCallOptions
  ): Promise<T> {
    const {
      operation,
      retryable = false,
      maxRetries = 3,
      retryDelay = 1000,
      fallbackValue,
      errorStrategy = 'throw',
    } = options;

    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts <= (retryable ? maxRetries : 0)) {
      try {
        logger.debug(`執行 API 呼叫: ${operation} (嘗試 ${attempts + 1}/${maxRetries + 1})`);
        const result = await fn();
        logger.debug(`API 呼叫成功: ${operation}`);
        return result;
      } catch (error) {
        attempts++;
        lastError = error as Error;

        // 分類錯誤
        const appError = this.classifyError(error as Error, operation);

        // 判斷是否可重試
        const canRetry = retryable &&
                        attempts <= maxRetries &&
                        this.isRetryableError(appError);

        if (canRetry) {
          logger.warn(`API 呼叫失敗 (${operation})，將在 ${retryDelay}ms 後重試 (${attempts}/${maxRetries})`);
          await this.sleep(retryDelay * attempts); // 指數退避
          continue;
        }

        // 無法重試，根據策略處理
        logger.error(`API 呼叫失敗: ${operation}`, appError);

        if (errorStrategy === 'fallback' && fallbackValue !== undefined) {
          logger.warn(`使用降級值: ${operation}`);
          return fallbackValue as T;
        }

        if (errorStrategy === 'skip') {
          logger.warn(`跳過失敗的 API 呼叫: ${operation}`);
          throw appError; // 拋出但由上層處理
        }

        // 預設策略：拋出錯誤
        throw appError;
      }
    }

    // 不應該到達這裡
    throw lastError || new AppError(ErrorType.API_ERROR, `API 呼叫失敗: ${operation}`);
  }

  /**
   * 分類錯誤類型
   *
   * @param error - 原始錯誤
   * @param operation - 操作名稱
   * @returns AppError
   */
  static classifyError(error: Error, operation: string): AppError {
    const apiError = error as GitLabApiError;

    // 檢查 HTTP 狀態碼
    if (apiError.response) {
      const status = apiError.response.status;

      if (status === 401) {
        return new AppError(
          ErrorType.AUTH_ERROR,
          `認證失敗 (${operation}): Token 無效或已過期`,
          error
        );
      }

      if (status === 403) {
        return new AppError(
          ErrorType.PROJECT_NOT_FOUND,
          `權限不足 (${operation}): 無法存取該資源`,
          error
        );
      }

      if (status === 404) {
        return new AppError(
          ErrorType.PROJECT_NOT_FOUND,
          `資源不存在 (${operation}): 找不到請求的資源`,
          error
        );
      }

      if (status === 429) {
        return new AppError(
          ErrorType.RATE_LIMIT_ERROR,
          `速率限制 (${operation}): GitLab API 請求過於頻繁`,
          error
        );
      }

      if (status >= 500) {
        return new AppError(
          ErrorType.API_ERROR,
          `伺服器錯誤 (${operation}): GitLab 伺服器發生問題`,
          error
        );
      }
    }

    // 檢查網路錯誤
    const causeCode = apiError.cause?.code;
    if (causeCode === 'ECONNREFUSED' ||
        causeCode === 'ENOTFOUND' ||
        causeCode === 'ETIMEDOUT' ||
        causeCode === 'EAI_AGAIN') {
      return new AppError(
        ErrorType.NETWORK_ERROR,
        `網路連線失敗 (${operation}): 無法連接到 GitLab 伺服器`,
        error
      );
    }

    // 預設錯誤
    return new AppError(
      ErrorType.API_ERROR,
      `API 呼叫失敗 (${operation}): ${error.message}`,
      error
    );
  }

  /**
   * 判斷錯誤是否可重試
   *
   * @param error - AppError
   * @returns boolean
   */
  static isRetryableError(error: AppError): boolean {
    return (
      error.type === ErrorType.RATE_LIMIT_ERROR ||
      error.type === ErrorType.NETWORK_ERROR ||
      error.type === ErrorType.API_ERROR
    );
  }

  /**
   * 批次處理錯誤（用於並發請求）
   *
   * @param results - Promise.allSettled 結果
   * @param operation - 操作名稱
   * @returns 成功和失敗的分類結果
   */
  static handleBatchResults<T>(
    results: PromiseSettledResult<T>[],
    operation: string
  ): {
    successes: T[];
    failures: AppError[];
    successRate: number;
  } {
    const successes: T[] = [];
    const failures: AppError[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successes.push(result.value);
      } else {
        const appError = result.reason instanceof AppError
          ? result.reason
          : this.classifyError(result.reason as Error, operation);
        failures.push(appError);
      }
    }

    const successRate = results.length > 0
      ? (successes.length / results.length) * 100
      : 0;

    logger.debug(
      `批次操作完成 (${operation}): ${successes.length}/${results.length} 成功 (${successRate.toFixed(1)}%)`
    );

    if (failures.length > 0) {
      logger.warn(`批次操作有 ${failures.length} 個失敗 (${operation})`);
    }

    return {
      successes,
      failures,
      successRate,
    };
  }

  /**
   * 產生降級結果的建議訊息
   *
   * @param operation - 操作名稱
   * @param error - AppError
   * @returns 建議訊息
   */
  static generateFallbackMessage(operation: string, error: AppError): string {
    const messages: Record<ErrorType, string> = {
      [ErrorType.AUTH_ERROR]:
        `認證失敗導致 ${operation} 無法執行。請檢查 Token 設定。`,
      [ErrorType.PROJECT_NOT_FOUND]:
        `找不到資源或權限不足，${operation} 將跳過。`,
      [ErrorType.NETWORK_ERROR]:
        `網路連線問題導致 ${operation} 失敗，已使用降級策略。`,
      [ErrorType.RATE_LIMIT_ERROR]:
        `API 速率限制導致 ${operation} 失敗，建議稍後重試。`,
      [ErrorType.API_ERROR]:
        `API 錯誤導致 ${operation} 失敗。`,
      [ErrorType.INVALID_INPUT]:
        `輸入格式錯誤導致 ${operation} 無法執行。`,
    };

    return messages[error.type] || `${operation} 執行失敗。`;
  }

  /**
   * 延遲函數（用於重試）
   *
   * @param ms - 延遲毫秒數
   * @returns Promise<void>
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 便利函數：包裝 API 呼叫（簡化版）
 */
export async function wrapApiCall<T>(
  fn: () => Promise<T>,
  operation: string,
  options?: Partial<ApiCallOptions>
): Promise<T> {
  return ReleaseErrorHandler.wrapApiCall(fn, {
    operation,
    ...options,
  });
}

/**
 * 便利函數：處理批次結果
 */
export function handleBatchResults<T>(
  results: PromiseSettledResult<T>[],
  operation: string
) {
  return ReleaseErrorHandler.handleBatchResults(results, operation);
}
