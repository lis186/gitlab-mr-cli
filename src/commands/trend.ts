import { Command, Flags } from '@oclif/core'
import { GitLabClient } from '../services/gitlab-client.js'
import { aggregateByGranularity } from '../services/trend-aggregator.js'
import { calculateTrendSummary, generateFrequencyTrend, comparePeriods } from '../services/statistics-calculator.js'
import { formatTrendTable, formatTrendJSON, formatComparisonTable, formatComparisonJSON } from '../formatters/trend-formatter.js'
import { parseProjectIdentifier } from '../utils/project-parser.js'
import { parsePeriod, parseISODate, validateDateRange, parseComparePeriods } from '../utils/date-utils.js'
import { TimePeriodImpl, TimeGranularity } from '../models/trend.js'
import { AppError, ErrorType } from '../models/error.js'
import { zhTW } from '../i18n/zh-TW.js'

/**
 * T060: 估算查詢時間（秒）
 * 根據時間範圍長度估算 API 查詢所需時間
 */
function estimateQueryTime(daysCount: number): number {
  if (daysCount <= 30) return 2  // 30 天內：約 2 秒
  if (daysCount <= 90) return 5  // 90 天內：約 5 秒
  if (daysCount <= 365) return 15 // 1 年內：約 15 秒
  return 30 // 超過 1 年：約 30 秒
}

/**
 * Trend 命令 - 分析專案的合併頻率趨勢
 */
export default class Trend extends Command {
  static description = zhTW.trend.command.description

  static examples = [
    '<%= config.bin %> <%= command.id %> --project gitlab-org/gitlab',
    '<%= config.bin %> <%= command.id %> --project gitlab-org/gitlab --period 30d',
    '<%= config.bin %> <%= command.id %> --project 12345 --period 90d --granularity week',
    '<%= config.bin %> <%= command.id %> --project gitlab-org/gitlab --from 2025-01-01 --to 2025-01-31',
    '<%= config.bin %> <%= command.id %> --project gitlab-org/gitlab --period 30d --per-author',
    '<%= config.bin %> <%= command.id %> --project gitlab-org/gitlab --period 30d --format json',
    '<%= config.bin %> <%= command.id %> --project gitlab-org/gitlab --compare-periods "2025-09,2025-10"',
    '<%= config.bin %> <%= command.id %> --project gitlab-org/gitlab --compare-periods "30d,60d"',
  ]

  static flags = {
    project: Flags.string({
      char: 'p',
      description: '專案識別（專案 ID、路徑、或完整 URL）',
      required: true
    }),
    token: Flags.string({
      char: 't',
      description: 'GitLab Personal Access Token（或透過環境變數 GITLAB_TOKEN 設定）',
      env: 'GITLAB_TOKEN'
    }),
    host: Flags.string({
      char: 'h',
      description: 'GitLab 伺服器 URL（預設: https://gitlab.com）',
      env: 'GITLAB_HOST',
      default: 'https://gitlab.com'
    }),
    period: Flags.string({
      description: '時間範圍（例如：7d, 30d, 90d, 6m, 1y）',
      default: '30d',
      exclusive: ['from', 'to', 'compare-periods']
    }),
    from: Flags.string({
      description: '開始日期（ISO 8601 格式，例如：2025-01-01）',
      dependsOn: ['to'],
      exclusive: ['period', 'compare-periods']
    }),
    to: Flags.string({
      description: '結束日期（ISO 8601 格式，例如：2025-01-31）',
      dependsOn: ['from'],
      exclusive: ['period', 'compare-periods']
    }),
    'compare-periods': Flags.string({
      description: '比較兩個時間段（逗號分隔，例如：2025-09,2025-10 或 30d,60d）',
      exclusive: ['period', 'from', 'to']
    }),
    granularity: Flags.string({
      char: 'g',
      description: '時間粒度',
      options: ['day', 'week', 'month'],
      default: 'week'
    }),
    format: Flags.string({
      char: 'f',
      description: '輸出格式',
      options: ['table', 'json'],
      default: 'table'
    }),
    'per-author': Flags.boolean({
      description: '顯示人均統計',
      default: false
    }),
    threshold: Flags.integer({
      description: '小批量工作模式閾值（週人均合併數，預設 3）',
      default: 3
    })
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Trend)

    // 驗證 token 存在
    if (!flags.token) {
      this.error('請提供 GitLab Personal Access Token（使用 --token 或設定環境變數 GITLAB_TOKEN）')
    }

    try {
      // 檢查是否為比較模式
      if (flags['compare-periods']) {
        await this.runComparison(flags)
      } else {
        await this.runTrend(flags)
      }
    } catch (error) {
      // 處理錯誤
      if (error instanceof AppError) {
        this.handleAppError(error)
      } else if (error instanceof Error) {
        // 在測試環境中輸出詳細錯誤
        if (process.env.NODE_ENV === 'test') {
          this.error(`${error.message}\n${error.stack}`)
        } else {
          this.error(error.message)
        }
      } else {
        this.error(zhTW.trend.errors.unexpectedError)
      }
    }
  }

  /**
   * 執行單一期間趨勢分析
   */
  private async runTrend(flags: any): Promise<void> {
    // 1. 解析時間範圍
    let startDate: Date
    let endDate: Date

    if (flags.from && flags.to) {
      startDate = parseISODate(flags.from)
      endDate = parseISODate(flags.to)
      validateDateRange(startDate, endDate)
    } else {
      const parsed = parsePeriod(flags.period)
      startDate = parsed.startDate
      endDate = parsed.endDate
    }

    // 2. 建立時間範圍物件
    const granularity = flags.granularity as TimeGranularity
    const timePeriod = new TimePeriodImpl(startDate, endDate, granularity)

    // T060: 顯示進度提示（大型查詢）
    const estimatedTime = estimateQueryTime(timePeriod.daysCount)
    if (flags.format !== 'json' && estimatedTime > 5) {
      this.log(`正在查詢大量資料，預計需要 ${estimatedTime} 秒...`)
    }

    // 3. 解析專案識別
    const { identifier, host } = parseProjectIdentifier(flags.project)

    // 4. 建立 GitLab 客戶端
    const client = new GitLabClient({
      identifier,
      host: host || flags.host,
      token: flags.token
    })

    // 5. 查詢已合併的 MR
    if (flags.format !== 'json') {
      this.log(zhTW.trend.command.querying)
    }
    const mergeRequests = await client.getMergedMRsByTimeRange(
      startDate,
      endDate,
      {
        onWarning: (message) => {
          if (flags.format !== 'json') {
            this.log(message)
          }
        }
      }
    )

    // 6. 檢查是否有資料
    if (mergeRequests.length === 0) {
      this.log(zhTW.trend.command.noData)
      return
    }

    // 7. 彙總趨勢資料
    if (flags.format !== 'json') {
      this.log(zhTW.trend.command.analysing)
    }
    const dataPoints = aggregateByGranularity(mergeRequests, granularity)

    // 8. 生成趨勢結果
    const trend = generateFrequencyTrend(
      identifier.toString(),
      timePeriod,
      mergeRequests,
      dataPoints,
      flags.threshold
    )

    // 9. 計算摘要（如果需要人均統計）
    let summary = undefined
    if (flags['per-author']) {
      summary = calculateTrendSummary(
        mergeRequests,
        dataPoints,
        timePeriod,
        flags.threshold
      )
    }

    // 10. 格式化輸出
    let output: string
    if (flags.format === 'json') {
      output = formatTrendJSON(trend, summary)
    } else {
      output = formatTrendTable(trend, summary, flags['per-author'])
    }

    this.log(output)
  }

  /**
   * 執行期間比較分析
   */
  private async runComparison(flags: any): Promise<void> {
    // 1. 解析比較期間
    const { previousPeriod, currentPeriod } = parseComparePeriods(flags['compare-periods'])

    // 2. 建立時間範圍物件
    const granularity = flags.granularity as TimeGranularity
    const previousTimePeriod = new TimePeriodImpl(
      previousPeriod.startDate,
      previousPeriod.endDate,
      granularity
    )
    const currentTimePeriod = new TimePeriodImpl(
      currentPeriod.startDate,
      currentPeriod.endDate,
      granularity
    )

    // T060: 顯示進度提示（大型查詢）
    const totalDays = previousTimePeriod.daysCount + currentTimePeriod.daysCount
    const estimatedTime = estimateQueryTime(totalDays)
    if (flags.format !== 'json' && estimatedTime > 5) {
      this.log(`正在查詢兩個期間的大量資料，預計需要 ${estimatedTime} 秒...`)
    }

    // 3. 解析專案識別
    const { identifier, host } = parseProjectIdentifier(flags.project)

    // 4. 建立 GitLab 客戶端
    const client = new GitLabClient({
      identifier,
      host: host || flags.host,
      token: flags.token
    })

    // 5. 查詢兩個期間的 MR
    if (flags.format !== 'json') {
      this.log('正在查詢先前期間資料...')
    }
    const previousMRs = await client.getMergedMRsByTimeRange(
      previousPeriod.startDate,
      previousPeriod.endDate,
      {
        onWarning: (message) => {
          if (flags.format !== 'json') {
            this.log(message)
          }
        }
      }
    )

    if (flags.format !== 'json') {
      this.log('正在查詢當前期間資料...')
    }
    const currentMRs = await client.getMergedMRsByTimeRange(
      currentPeriod.startDate,
      currentPeriod.endDate,
      {
        onWarning: (message) => {
          if (flags.format !== 'json') {
            this.log(message)
          }
        }
      }
    )

    // 6. 彙總趨勢資料
    if (flags.format !== 'json') {
      this.log('正在分析比較結果...')
    }
    const previousDataPoints = aggregateByGranularity(previousMRs, granularity)
    const currentDataPoints = aggregateByGranularity(currentMRs, granularity)

    // 7. 生成趨勢結果
    const previousTrend = generateFrequencyTrend(
      identifier.toString(),
      previousTimePeriod,
      previousMRs,
      previousDataPoints,
      flags.threshold
    )
    const currentTrend = generateFrequencyTrend(
      identifier.toString(),
      currentTimePeriod,
      currentMRs,
      currentDataPoints,
      flags.threshold
    )

    // 8. 計算摘要（如果需要人均統計）
    let previousSummary = undefined
    let currentSummary = undefined
    if (flags['per-author']) {
      previousSummary = calculateTrendSummary(
        previousMRs,
        previousDataPoints,
        previousTimePeriod,
        flags.threshold
      )
      currentSummary = calculateTrendSummary(
        currentMRs,
        currentDataPoints,
        currentTimePeriod,
        flags.threshold
      )
    }

    // 9. 比較期間
    const comparison = comparePeriods(
      previousTrend,
      currentTrend,
      previousSummary,
      currentSummary
    )

    // 10. 格式化輸出
    let output: string
    if (flags.format === 'json') {
      output = formatComparisonJSON(comparison)
    } else {
      output = formatComparisonTable(comparison, flags['per-author'])
    }

    this.log(output)
  }

  /**
   * 處理應用程式錯誤
   */
  private handleAppError(error: AppError): void {
    switch (error.type) {
      case ErrorType.AUTH_ERROR:
        this.error(zhTW.trend.errors.authError)
        break
      case ErrorType.PROJECT_NOT_FOUND:
        this.error(zhTW.trend.errors.projectNotFound)
        break
      case ErrorType.NETWORK_ERROR:
        this.error(zhTW.trend.errors.networkError)
        break
      case ErrorType.RATE_LIMIT_ERROR:
        this.error(zhTW.trend.errors.rateLimitExhausted)
        break
      case ErrorType.INVALID_INPUT:
        this.error(`${zhTW.trend.errors.invalidInput}\n${error.message}`)
        break
      case ErrorType.API_ERROR:
        this.error(`${zhTW.trend.errors.apiError}\n${error.message}`)
        break
      default:
        this.error(zhTW.trend.errors.unexpectedError)
    }
  }
}
