/**
 * T063-T064: 結構化錯誤處理器
 *
 * 提供統一的錯誤分類、訊息格式化和補救建議
 */

/**
 * T064: 錯誤類型枚舉
 */
export enum ErrorType {
  /** 認證失敗 - 401 */
  AUTHENTICATION = 'Authentication',
  /** 權限不足 - 403 */
  PERMISSION = 'Permission',
  /** 找不到資源 - 404 */
  NOT_FOUND = 'NotFound',
  /** API 限流 - 429 */
  RATE_LIMIT = 'RateLimit',
  /** 網路錯誤 - ENOTFOUND, ECONNREFUSED, ETIMEDOUT */
  NETWORK = 'Network',
  /** 驗證錯誤 - 輸入參數或資料格式錯誤 */
  VALIDATION = 'Validation',
  /** 未知錯誤 */
  UNKNOWN = 'Unknown',
}

/**
 * T063: 結構化錯誤介面
 */
export interface StructuredError {
  /** 錯誤類型 */
  type: ErrorType;
  /** 錯誤訊息 */
  message: string;
  /** 補救建議 */
  remedy: string;
  /** 原始錯誤（用於 --verbose 模式） */
  originalError?: any;
  /** HTTP 狀態碼（如果適用） */
  statusCode?: number;
  /** 錯誤代碼（如果適用） */
  code?: string;
}

/**
 * T063: 結構化錯誤類別
 */
export class AnalysisError extends Error {
  public readonly type: ErrorType;
  public readonly remedy: string;
  public readonly originalError?: any;
  public readonly statusCode?: number;
  public readonly code?: string;

  constructor(error: StructuredError) {
    super(error.message);
    this.name = 'AnalysisError';
    this.type = error.type;
    this.remedy = error.remedy;
    this.originalError = error.originalError;
    this.statusCode = error.statusCode;
    this.code = error.code;

    // 保留堆疊追蹤
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AnalysisError);
    }
  }

  /**
   * 序列化為結構化物件（用於 JSON 輸出）
   */
  toJSON(): StructuredError {
    return {
      type: this.type,
      message: this.message,
      remedy: this.remedy,
      statusCode: this.statusCode,
      code: this.code,
    };
  }
}

/**
 * T063: 錯誤分類器 - 將原始錯誤轉換為結構化錯誤
 */
export class ErrorClassifier {
  /**
   * 分類並結構化錯誤
   *
   * @param error - 原始錯誤物件
   * @returns 結構化錯誤
   */
  static classify(error: any): StructuredError {
    // 如果已經是 AnalysisError，直接返回
    if (error instanceof AnalysisError) {
      return error.toJSON();
    }

    // HTTP 狀態碼錯誤（GitLab API）
    if (error.response?.status) {
      return this.classifyHttpError(error);
    }

    // 網路錯誤（Node.js 錯誤代碼）
    if (error.code) {
      return this.classifyNetworkError(error);
    }

    // 驗證錯誤（自訂）
    if (error.name === 'ValidationError' || error.message?.includes('驗證') || error.message?.includes('無效')) {
      return {
        type: ErrorType.VALIDATION,
        message: error.message || '驗證失敗',
        remedy: '請檢查輸入參數是否正確',
        originalError: error,
      };
    }

    // 未知錯誤
    return {
      type: ErrorType.UNKNOWN,
      message: error.message || '發生未知錯誤',
      remedy: '請檢查錯誤訊息並重試，或使用 --verbose 查看詳細資訊',
      originalError: error,
    };
  }

  /**
   * 分類 HTTP 狀態碼錯誤
   */
  private static classifyHttpError(error: any): StructuredError {
    const status = error.response.status;
    const message = error.message || `HTTP ${status} 錯誤`;

    switch (status) {
      case 401:
        return {
          type: ErrorType.AUTHENTICATION,
          message: '認證失敗',
          remedy: '請檢查 GitLab Token 是否有效。可使用 --token 參數或設定環境變數 GITLAB_TOKEN',
          originalError: error,
          statusCode: status,
        };

      case 403:
        return {
          type: ErrorType.PERMISSION,
          message: '權限不足',
          remedy: '請確認 Token 具有存取此專案的權限。需要 api 或 read_api 權限',
          originalError: error,
          statusCode: status,
        };

      case 404:
        return {
          type: ErrorType.NOT_FOUND,
          message: '找不到資源',
          remedy: '請確認專案 ID 和 MR IID 是否正確。可使用 --verbose 查看詳細資訊',
          originalError: error,
          statusCode: status,
        };

      case 429:
        return {
          type: ErrorType.RATE_LIMIT,
          message: 'API 請求次數超過限制',
          remedy: '請稍後重試。GitLab API 有速率限制，建議減少批次大小或增加間隔',
          originalError: error,
          statusCode: status,
        };

      default:
        return {
          type: ErrorType.UNKNOWN,
          message: `API 錯誤 (${status}): ${message}`,
          remedy: '請檢查錯誤訊息並重試，或使用 --verbose 查看詳細資訊',
          originalError: error,
          statusCode: status,
        };
    }
  }

  /**
   * 分類網路錯誤
   */
  private static classifyNetworkError(error: any): StructuredError {
    const code = error.code;
    const message = error.message || `網路錯誤 (${code})`;

    switch (code) {
      case 'ENOTFOUND':
        return {
          type: ErrorType.NETWORK,
          message: '找不到主機',
          remedy: '請檢查 GitLab URL 是否正確。可使用 --url 參數或設定環境變數 GITLAB_HOST',
          originalError: error,
          code,
        };

      case 'ECONNREFUSED':
        return {
          type: ErrorType.NETWORK,
          message: '連線被拒絕',
          remedy: '請檢查 GitLab 伺服器是否正在運行，以及網路連線是否正常',
          originalError: error,
          code,
        };

      case 'ETIMEDOUT':
        return {
          type: ErrorType.NETWORK,
          message: '連線逾時',
          remedy: '請檢查網路連線是否穩定，或稍後重試',
          originalError: error,
          code,
        };

      case 'ECONNRESET':
        return {
          type: ErrorType.NETWORK,
          message: '連線被重設',
          remedy: '請檢查網路連線是否穩定，或稍後重試',
          originalError: error,
          code,
        };

      default:
        return {
          type: ErrorType.NETWORK,
          message: `網路錯誤: ${message}`,
          remedy: '請檢查網路連線和 GitLab URL 是否正確',
          originalError: error,
          code,
        };
    }
  }

  /**
   * 建立驗證錯誤
   */
  static createValidationError(message: string, remedy?: string): AnalysisError {
    return new AnalysisError({
      type: ErrorType.VALIDATION,
      message,
      remedy: remedy || '請檢查輸入參數是否正確',
    });
  }

  /**
   * 建立 Not Found 錯誤
   */
  static createNotFoundError(resource: string, identifier: string | number): AnalysisError {
    return new AnalysisError({
      type: ErrorType.NOT_FOUND,
      message: `找不到 ${resource}: ${identifier}`,
      remedy: `請確認 ${resource} 是否存在，或檢查識別碼是否正確`,
    });
  }
}
