import { AppError, ErrorType } from '../models/error.js'

/**
 * 錯誤訊息格式化器
 *
 * 將應用程式錯誤轉換為使用者友善的正體中文訊息
 */
export class ErrorFormatter {
  /**
   * 錯誤類型對應的正體中文訊息
   */
  private static readonly ERROR_MESSAGES: Record<ErrorType, string> = {
    [ErrorType.AUTH_ERROR]: 'GitLab 認證失敗：Token 無效或已過期',
    [ErrorType.PROJECT_NOT_FOUND]: '找不到指定的專案或沒有存取權限',
    [ErrorType.NETWORK_ERROR]: '網路連線失敗：無法連接到 GitLab 伺服器',
    [ErrorType.INVALID_INPUT]: '輸入格式錯誤：專案識別格式不正確',
    [ErrorType.RATE_LIMIT_ERROR]: 'GitLab API 速率限制：已達請求上限',
    [ErrorType.API_ERROR]: 'GitLab API 發生錯誤'
  }

  /**
   * 錯誤類型對應的建議動作
   */
  private static readonly SUGGESTED_ACTIONS: Record<ErrorType, string[]> = {
    [ErrorType.AUTH_ERROR]: [
      '請檢查 GitLab Personal Access Token 是否正確',
      '確認 Token 尚未過期',
      '驗證 Token 具有 read_api 或 api 權限',
      '使用 --token 參數或設定環境變數 GITLAB_TOKEN'
    ],
    [ErrorType.PROJECT_NOT_FOUND]: [
      '確認專案識別格式正確（專案 ID、namespace/project、或完整 URL）',
      '檢查是否有該專案的存取權限',
      '驗證專案確實存在於指定的 GitLab 伺服器',
      '若使用專案路徑，請確認命名空間和專案名稱正確'
    ],
    [ErrorType.NETWORK_ERROR]: [
      '檢查網路連線是否正常',
      '確認 GitLab 伺服器 URL 正確（使用 --host 或 GITLAB_HOST）',
      '檢查是否需要透過代理伺服器連線',
      '驗證防火牆設定是否允許連接'
    ],
    [ErrorType.INVALID_INPUT]: [
      '專案識別支援三種格式：',
      '  1. 數字 ID：12345',
      '  2. 專案路徑：namespace/project',
      '  3. 完整 URL：https://gitlab.com/namespace/project',
      '請確認輸入符合上述格式之一'
    ],
    [ErrorType.RATE_LIMIT_ERROR]: [
      '請稍後再試（通常需等待 1 分鐘）',
      '系統已自動重試，但已達最大重試次數',
      '考慮減少查詢範圍或使用較少的 API 請求',
      '檢查是否有其他程式同時使用相同的 Token'
    ],
    [ErrorType.API_ERROR]: [
      '請稍後再試',
      '檢查 GitLab 伺服器狀態',
      '查看詳細錯誤訊息以了解更多資訊'
    ]
  }

  /**
   * 格式化錯誤訊息（FR-020）
   *
   * 格式:
   * Error: <TYPE> - <REASON>
   * Suggestion: <ACTIONABLE_ADVICE>
   * [--verbose: Technical details]
   *
   * @param error - AppError 實例
   * @param verbose - 是否顯示技術細節（--verbose 模式）
   * @returns 格式化後的完整錯誤訊息
   */
  static format(error: AppError, verbose: boolean = false): string {
    const typeLabel = this.getTypeLabel(error.type)
    const message = this.ERROR_MESSAGES[error.type] || error.message
    const actions = this.SUGGESTED_ACTIONS[error.type] || []

    let output = `\nError: ${typeLabel} - ${message}\n`

    if (actions.length > 0) {
      output += '\nSuggestion:\n'
      actions.forEach(action => {
        output += `  • ${action}\n`
      })
    }

    // --verbose 模式顯示技術細節
    if (verbose && error.originalError) {
      output += '\nTechnical Details (--verbose):\n'
      output += `  Error Type: ${error.type}\n`
      output += `  Original Message: ${error.originalError.message}\n`

      if (error.originalError.stack) {
        output += `  Stack Trace:\n`
        const stackLines = error.originalError.stack.split('\n').slice(0, 5)
        stackLines.forEach(line => {
          output += `    ${line}\n`
        })
      }
    }

    return output
  }

  /**
   * 取得錯誤類型的英文標籤（FR-020）
   *
   * @param type - ErrorType
   * @returns 錯誤類型標籤
   */
  private static getTypeLabel(type: ErrorType): string {
    const labels: Record<ErrorType, string> = {
      [ErrorType.AUTH_ERROR]: 'Authentication',
      [ErrorType.PROJECT_NOT_FOUND]: 'Permission/Not Found',
      [ErrorType.NETWORK_ERROR]: 'Network',
      [ErrorType.INVALID_INPUT]: 'Validation',
      [ErrorType.RATE_LIMIT_ERROR]: 'Rate Limit',
      [ErrorType.API_ERROR]: 'API Error',
    }
    return labels[type] || 'Unknown'
  }

  /**
   * 取得錯誤訊息（不含建議動作）
   *
   * @param error - AppError 實例
   * @returns 簡短錯誤訊息
   */
  static getMessage(error: AppError): string {
    return this.ERROR_MESSAGES[error.type] || error.message
  }

  /**
   * 取得建議動作列表
   *
   * @param error - AppError 實例
   * @returns 建議動作陣列
   */
  static getSuggestedActions(error: AppError): string[] {
    return this.SUGGESTED_ACTIONS[error.type] || []
  }
}
