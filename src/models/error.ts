/**
 * 應用程式錯誤類型
 */
export enum ErrorType {
  /** GitLab API 驗證失敗 */
  AUTH_ERROR = 'AUTH_ERROR',

  /** 專案不存在或無權限 */
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',

  /** 網路連線錯誤 */
  NETWORK_ERROR = 'NETWORK_ERROR',

  /** 輸入格式錯誤 */
  INVALID_INPUT = 'INVALID_INPUT',

  /** API 速率限制 */
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',

  /** GitLab API 錯誤 */
  API_ERROR = 'API_ERROR'
}

/**
 * 應用程式錯誤模型
 */
export class AppError extends Error {
  constructor(
    public type: ErrorType,
    public message: string,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'AppError'
  }
}
