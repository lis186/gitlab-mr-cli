import { Command, Flags } from '@oclif/core'
import { GitLabClient } from '../services/gitlab-client.js'
import { TableFormatter } from '../formatters/table-formatter.js'
import { JsonFormatter } from '../formatters/json-formatter.js'
import { CompactFormatter } from '../formatters/compact-formatter.js'
import { parseProjectIdentifier } from '../utils/project-parser.js'
import { formatDate } from '../utils/formatters.js'
import { AppError, ErrorType } from '../models/error.js'
import { ErrorFormatter } from '../utils/error-formatter.js'

/**
 * List 命令 - 列出 GitLab 專案的 Merge Requests
 */
export default class List extends Command {
  static description = '列出指定 GitLab 專案的最近 Merge Requests（預設 20 個，可透過 --limit 參數調整）'

  static examples = [
    '<%= config.bin %> <%= command.id %> --project gitlab-org/gitlab',
    '<%= config.bin %> <%= command.id %> --project 12345 --limit 10',
    '<%= config.bin %> <%= command.id %> --project https://gitlab.com/foo/bar --token YOUR_TOKEN',
    '<%= config.bin %> <%= command.id %> --project gitlab-org/gitlab --format json',
    '<%= config.bin %> <%= command.id %> --project 12345 --format compact',
  ]

  static flags = {
    project: Flags.string({
      char: 'p',
      description: 'GitLab 專案識別（專案 ID、路徑 namespace/project、或完整 URL）',
      required: true,
    }),
    token: Flags.string({
      char: 't',
      description: 'GitLab Personal Access Token（或透過環境變數 GITLAB_TOKEN 設定）',
      env: 'GITLAB_TOKEN',
    }),
    host: Flags.string({
      char: 'h',
      description: 'GitLab 伺服器 URL（預設: https://gitlab.com）',
      env: 'GITLAB_HOST',
      default: 'https://gitlab.com',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'MR 數量上限（範圍 1-100，預設 20）',
      default: 20,
    }),
    format: Flags.string({
      char: 'f',
      description: '輸出格式（table|json|compact，預設 table）',
      options: ['table', 'json', 'compact'],
      default: 'table',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(List)

    // 驗證 limit 參數範圍（T028）
    if (flags.limit < 1 || flags.limit > 100) {
      this.error('limit 參數必須在 1-100 範圍內')
    }

    // 驗證 token 存在
    if (!flags.token) {
      this.error('請提供 GitLab Personal Access Token（使用 --token 或設定環境變數 GITLAB_TOKEN）')
    }

    try {
      // 解析專案識別
      const { identifier, host } = parseProjectIdentifier(flags.project)

      // 建立 GitLab 客戶端
      const client = new GitLabClient({
        identifier,
        host: host || flags.host,
        token: flags.token,
      })

      // 取得 MR 列表
      const mergeRequests = await client.getMergeRequests(flags.limit)

      // 處理「專案沒有 MR」的邊緣案例（T026）
      if (mergeRequests.length === 0) {
        this.log('此專案目前沒有 Merge Request')
        return
      }

      // 處理「MR 數量少於指定 limit」的邊緣案例（T027）
      // 這個案例實際上不需要特殊處理，API 會自動返回所有可用的 MR
      // 但我們可以在輸出中顯示實際數量

      // T063: 根據 format 參數選擇適當的 formatter
      let output: string
      switch (flags.format) {
        case 'json': {
          // T064: 使用 JsonFormatter
          const formatter = new JsonFormatter()
          output = formatter.format(mergeRequests)
          break
        }
        case 'compact': {
          // T064: 使用 CompactFormatter
          const formatter = new CompactFormatter()
          output = formatter.format(mergeRequests, formatDate)
          break
        }
        case 'table':
        default: {
          // T064: 使用 TableFormatter（預設）
          const formatter = new TableFormatter()
          output = formatter.format(mergeRequests, formatDate)
          // 對於 table 格式，額外顯示總數
          output += `\n\n顯示 ${mergeRequests.length} 個 Merge Request`
          break
        }
      }

      this.log(output)
    } catch (error) {
      // T047: 整合錯誤處理
      if (error instanceof AppError) {
        // 使用 ErrorFormatter 格式化錯誤訊息
        const formattedError = ErrorFormatter.format(error)
        this.error(formattedError, { exit: this.getExitCode(error.type) })
      } else if (error instanceof Error) {
        this.error(`執行失敗：${error.message}`, { exit: 1 })
      } else {
        this.error('執行失敗：未知錯誤', { exit: 1 })
      }
    }
  }

  /**
   * T048: 根據錯誤類型取得對應的退出碼
   *
   * @param errorType - 錯誤類型
   * @returns 退出碼
   */
  private getExitCode(errorType: ErrorType): number {
    switch (errorType) {
      case ErrorType.AUTH_ERROR:
        return 1
      case ErrorType.PROJECT_NOT_FOUND:
        return 2
      case ErrorType.NETWORK_ERROR:
        return 3
      case ErrorType.INVALID_INPUT:
        return 4
      case ErrorType.API_ERROR:
      default:
        return 1
    }
  }
}
