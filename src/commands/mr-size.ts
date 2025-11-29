/**
 * MR Size 命令 - MR 規模分析
 *
 * 實作功能：007-mr-size-analysis
 * User Story 1 (P1): 檢視基本 MR 規模統計
 */

import { Command, Flags } from '@oclif/core'
import { GitLabClient } from '../services/gitlab-client.js'
import { SizeAnalyzer } from '../services/size-analyzer.js'
import { SizeTrendAnalyzer } from '../services/size-trend-analyzer.js'
import { formatSizeDistribution, formatOversizedMRs } from '../formatters/size-table-formatter.js'
import {
  formatSizeDistributionJson,
  formatOversizedMRsJson,
} from '../formatters/size-json-formatter.js'
import { formatTrendAnalysis, formatTrendAnalysisJson } from '../formatters/size-trend-formatter.js'
import { parseProjectIdentifier } from '../utils/project-parser.js'
import { getDateRange, normalizeDateString, validateDateRange } from '../utils/time-utils.js'
import chalk from 'chalk'

// Constants
const DEFAULT_DAYS = 30
const DEFAULT_LIMIT = 100
const BATCH_SIZE = 10

/**
 * MR Size 命令類別
 */
export default class MrSize extends Command {
  static description =
    'MR 規模分析 - 檢視 MR 規模分佈（XS/S/M/L/XL）、識別過大的 MR、追蹤團隊健康度趨勢'

  static examples = [
    '<%= config.bin %> <%= command.id %> --project example/mobile-app',
    '<%= config.bin %> <%= command.id %> --project 12345 --days 60',
    '<%= config.bin %> <%= command.id %> -p example/mobile-app --oversized',
    '<%= config.bin %> <%= command.id %> -p example/mobile-app --json',
  ]

  static flags = {
    project: Flags.string({
      char: 'p',
      description: 'GitLab 專案識別（專案 ID、路徑 namespace/project、或完整 URL）（或使用環境變數 GITLAB_PROJECT）',
      required: false,
      env: 'GITLAB_PROJECT',
    }),
    token: Flags.string({
      char: 't',
      description: 'GitLab Personal Access Token（或透過環境變數 GITLAB_TOKEN 設定）',
      env: 'GITLAB_TOKEN',
    }),
    host: Flags.string({
      char: 'h',
      description: 'GitLab 伺服器 URL（預設: https://gitlab.com）（或使用環境變數 GITLAB_HOST）',
      env: 'GITLAB_HOST',
      default: 'https://gitlab.com',
    }),
    days: Flags.integer({
      char: 'd',
      description: `分析最近 N 天的 MR（預設 ${DEFAULT_DAYS} 天，與 --since/--until 互斥）`,
      default: DEFAULT_DAYS,
    }),
    since: Flags.string({
      description: '開始日期（格式：YYYY-MM-DD，UTC 時區，包含當天 00:00:00，與 --days 互斥）',
    }),
    until: Flags.string({
      description: '結束日期（格式：YYYY-MM-DD，UTC 時區，包含當天 23:59:59，與 --days 互斥）',
    }),
    limit: Flags.integer({
      char: 'l',
      description: `限制分析的 MR 數量（預設 ${DEFAULT_LIMIT}）`,
      default: DEFAULT_LIMIT,
    }),
    json: Flags.boolean({
      char: 'j',
      description: '以 JSON 格式輸出結果',
      default: false,
    }),
    oversized: Flags.boolean({
      char: 'o',
      description: '顯示過大的 MR 清單（L 和 XL 類別）',
      default: false,
    }),
    trend: Flags.boolean({
      description: '顯示月度趨勢分析',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: '顯示詳細除錯資訊',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(MrSize)

    // 驗證 Project
    if (!flags.project) {
      this.error(
        chalk.red('錯誤: 缺少專案識別\n') +
          '請透過以下方式提供：\n' +
          '  1. 使用 --project 旗標\n' +
          '  2. 設定環境變數 GITLAB_PROJECT'
      )
    }

    // 驗證 Token
    if (!flags.token) {
      this.error(
        chalk.red('錯誤: 缺少 GitLab Token\n') +
          '請透過以下方式提供：\n' +
          '  1. 使用 --token 旗標\n' +
          '  2. 設定環境變數 GITLAB_TOKEN'
      )
    }

    // 解析專案識別
    const parsed = parseProjectIdentifier(flags.project)
    const host = parsed.host || flags.host

    // 建立 GitLab 客戶端
    const gitlabClient = new GitLabClient({
      token: flags.token,
      host,
      identifier: parsed.identifier,
    })

    // 建立 SizeAnalyzer
    const sizeAnalyzer = new SizeAnalyzer(gitlabClient)
    const trendAnalyzer = new SizeTrendAnalyzer(sizeAnalyzer)

    // 取得日期範圍
    let sinceStr: string
    let untilStr: string

    if (flags.since || flags.until) {
      // 使用自訂日期範圍
      if (!flags.since || !flags.until) {
        this.error('--since 和 --until 必須同時指定')
      }
      sinceStr = flags.since
      untilStr = flags.until
    } else {
      // 使用 days
      const range = getDateRange(flags.days)
      sinceStr = range.since
      untilStr = range.until
    }

    // 驗證日期範圍
    validateDateRange(sinceStr, untilStr)

    // 正規化日期字串為完整的 UTC 日期物件
    const since = normalizeDateString(sinceStr, 'start')
    const until = normalizeDateString(untilStr, 'end')

    try {
      if (!flags.json) {
        this.log(chalk.bold('\nMR 規模分佈分析'))
        this.log(`專案: ${chalk.cyan(flags.project)}`)
        this.log(`期間: ${chalk.dim(sinceStr)} ~ ${chalk.dim(untilStr)}`)

        if (flags.verbose) {
          this.log(chalk.dim(`\n[Verbose] GitLab 伺服器: ${host}`))
          this.log(chalk.dim(`[Verbose] 專案識別碼: ${parsed.identifier}`))
          this.log(chalk.dim(`[Verbose] 批次大小: ${BATCH_SIZE}`))
          this.log(chalk.dim(`[Verbose] MR 數量限制: ${flags.limit}`))
        }
      }

      // 取得已合併的 MR
      const mrs = await gitlabClient.getMergedMRsByTimeRange(since, until, {
        perPage: 100,
        maxPages: Math.ceil(flags.limit / 100),
        onWarning: (msg) => {
          if (!flags.json) {
            this.warn(msg)
          }
        },
      })

      if (mrs.length === 0) {
        if (!flags.json) {
          this.log(chalk.yellow('\n⚠ 在指定期間內沒有找到已合併的 MR'))
        } else {
          this.log(
            JSON.stringify({
              project: flags.project,
              dateRange: { since: sinceStr, until: untilStr },
              distribution: null,
              message: '沒有找到 MR',
            })
          )
        }
        return
      }

      // 限制 MR 數量
      const limitedMRs = mrs.slice(0, flags.limit)

      if (!flags.json) {
        this.log(`找到 ${chalk.bold(mrs.length)} 個已合併的 MR`)
        if (mrs.length > flags.limit) {
          this.log(chalk.dim(`(限制分析前 ${flags.limit} 個)`))
        }
        this.log()
        this.log('分析 MR 規模...')
      }

      // 分析 MR 規模
      const startTime = Date.now()
      const sizeMetrics = await sizeAnalyzer.analyzeMRSizes(limitedMRs, {
        batchSize: BATCH_SIZE,
        onProgress: (processed) => {
          if (!flags.json) {
            if (flags.verbose || processed % 10 === 0) {
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
              this.log(
                chalk.dim(
                  `${flags.verbose ? '[Verbose] ' : ''}已處理 ${processed}/${limitedMRs.length} 個 MRs... (${elapsed}s)`
                )
              )
            }
          }
        },
        onWarning: (msg) => {
          if (!flags.json) {
            this.warn(msg)
          }
        },
      })

      if (sizeMetrics.length === 0) {
        if (!flags.json) {
          this.log(chalk.yellow('\n⚠ 無法分析任何 MR（可能所有 MR 的 diff 資料都無法取得）'))
        }
        return
      }

      if (!flags.json) {
        this.log(`已分析 MR 總數: ${chalk.bold(sizeMetrics.length)}\n`)

        if (flags.verbose) {
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)
          const avgTime = ((Date.now() - startTime) / sizeMetrics.length).toFixed(0)
          this.log(chalk.dim(`[Verbose] 總耗時: ${totalTime}s`))
          this.log(chalk.dim(`[Verbose] 平均每個 MR: ${avgTime}ms\n`))
        }
      }

      // 計算分佈
      const distribution = sizeAnalyzer.calculateDistribution(sizeMetrics)

      // 輸出結果
      if (flags.trend) {
        // 顯示趨勢分析
        const trendResult = trendAnalyzer.analyzeTrend(sizeMetrics, { since, until })

        if (flags.json) {
          this.log(formatTrendAnalysisJson(trendResult, flags.project))
        } else {
          this.log(chalk.bold('\nMR 規模趨勢分析\n'))
          this.log(formatTrendAnalysis(trendResult))
        }
      } else if (flags.oversized) {
        // 顯示過大 MR 清單
        const oversizedMRs = sizeAnalyzer.filterOversizedMRs(sizeMetrics)

        if (flags.json) {
          this.log(formatOversizedMRsJson(oversizedMRs, flags.project, { since, until }))
        } else {
          this.log(chalk.bold(`\n過大 MR 清單（L 和 XL）`))
          this.log(`找到 ${chalk.bold(oversizedMRs.length)} 個過大 MR\n`)
          this.log(formatOversizedMRs(oversizedMRs))
        }
      } else {
        // 顯示規模分佈
        if (flags.json) {
          this.log(formatSizeDistributionJson(distribution, flags.project, { since, until }))
        } else {
          this.log(formatSizeDistribution(distribution))
        }
      }

      this.log() // 空行
    } catch (error) {
      if (error instanceof Error) {
        this.error(chalk.red(`錯誤: ${error.message}`))
      }
      throw error
    }
  }
}
