/**
 * CycleTime 命令 - MR 週期時間四階段分解分析
 *
 * 實作功能：005-mr-cycle-time
 * User Story 1 (P1): 檢視四階段 MR 週期時間分解
 */

import { Command, Flags, ux } from '@oclif/core'
import { isValid, parseISO } from 'date-fns'
import { GitLabClient } from '../services/gitlab-client.js'
import { CycleTimeCalculator } from '../services/cycle-time-calculator.js'
import { StageAnalyzer } from '../services/stage-analyzer.js'
import { CycleTimeTrendAnalyzer } from '../services/cycle-time-trend-analyzer.js'
import { formatCycleTimeAnalysis } from '../formatters/cycle-time-table-formatter.js'
import { formatCycleTimeJson } from '../formatters/cycle-time-json-formatter.js'
import {
  formatCycleTimeTrend,
  formatCycleTimeTrendJson,
} from '../formatters/cycle-time-trend-formatter.js'
import { parseProjectIdentifier } from '../utils/project-parser.js'
import { getDateRange, normalizeDateString, validateDateRange } from '../utils/time-utils.js'
import { processBatchItems } from '../utils/batch-processor.js'
import type {
  CycleTimeMetrics,
  AnalysisResult,
  TrendResult,
} from '../types/cycle-time.js'
import type {
  GitLabMR,
  GitLabCommit,
  GitLabNote,
} from '../services/cycle-time-calculator.js'
import type { TrendGranularity } from '../models/trend-period.js'

// Constants
const MR_PER_PAGE = 100
const MAX_MRS_HARD_LIMIT = 500
const BATCH_SIZE = 10
const MIN_SAMPLE_SIZE = 10

// GitLab API Query Parameters
interface MergeRequestsQueryParams {
  projectId: string | number
  state: 'merged'
  orderBy: 'updated_at'
  sort: 'desc'
  perPage: number
  page?: number
}

/**
 * CycleTime 命令類別
 */
export default class CycleTime extends Command {
  static description =
    'MR 週期時間四階段分解分析（DORA Lead Time）- 分析 Coding/Pickup/Review/Merge Time，識別瓶頸階段'

  static examples = [
    '<%= config.bin %> <%= command.id %> --project example/mobile-app',
    '<%= config.bin %> <%= command.id %> --project 12345 --days 60',
    '<%= config.bin %> <%= command.id %> -p gitlab-org/gitlab --limit 100',
    '<%= config.bin %> <%= command.id %> -p example/mobile-app --json',
    '<%= config.bin %> <%= command.id %> -p example/mobile-app --trend weekly',
    '<%= config.bin %> <%= command.id %> -p example/mobile-app --trend monthly --days 90',
  ]

  static flags = {
    project: Flags.string({
      char: 'p',
      description: 'GitLab 專案識別（或使用環境變數 GITLAB_PROJECT）（專案 ID、路徑 namespace/project、或完整 URL）',
      required: false,
      env: 'GITLAB_PROJECT',
    }),
    token: Flags.string({
      char: 't',
      description:
        'GitLab Personal Access Token（或透過環境變數 GITLAB_TOKEN 設定）',
      env: 'GITLAB_TOKEN',
    }),
    host: Flags.string({
      char: 'h',
      description: 'GitLab 伺服器 URL（預設: https://gitlab.com）',
      env: 'GITLAB_HOST',
      default: 'https://gitlab.com',
    }),
    days: Flags.integer({
      char: 'd',
      description: '分析最近 N 天的 MR（預設 30 天，與 --since/--until 互斥）',
      default: 30,
    }),
    since: Flags.string({
      description: '開始日期（格式：YYYY-MM-DD，UTC 時區，包含當天 00:00:00，與 --days 互斥）',
    }),
    until: Flags.string({
      description: '結束日期（格式：YYYY-MM-DD，UTC 時區，包含當天 23:59:59，與 --days 互斥）',
    }),
    limit: Flags.integer({
      char: 'l',
      description: '限制分析的 MR 數量（預設 100）',
    }),
    json: Flags.boolean({
      char: 'j',
      description: '以 JSON 格式輸出結果',
      default: false,
    }),
    'show-details': Flags.boolean({
      description: '顯示每個 MR 的詳細資訊（包含異常標記）',
      default: false,
    }),
    trend: Flags.string({
      description: '顯示趨勢分析（weekly 或 monthly）',
      options: ['weekly', 'monthly'],
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(CycleTime)

    // 驗證 project 存在
    if (!flags.project) {
      this.error(
        '請提供專案識別（使用 --project 或設定環境變數 GITLAB_PROJECT）'
      )
    }

    // 驗證 token 存在
    if (!flags.token) {
      this.error(
        '請提供 GitLab Personal Access Token（使用 --token 或設定環境變數 GITLAB_TOKEN）'
      )
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

      // 驗證日期範圍參數（--days 與 --since/--until 互斥）
      const hasDays = flags.days !== 30 || (!flags.since && !flags.until)
      const hasCustomRange = flags.since || flags.until

      if (hasDays && hasCustomRange && flags.days !== 30) {
        this.error('不可同時使用 --days 與 --since/--until，請擇一使用')
      }

      // 計算日期範圍
      let since: string
      let until: string

      if (flags.since || flags.until) {
        // 使用自訂日期範圍
        const today = new Date().toISOString().split('T')[0] as string

        since = flags.since || '2020-01-01' // 預設為很早的日期
        until = flags.until || today

        // 驗證日期格式與有效性
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(since) || !dateRegex.test(until)) {
          this.error('日期格式錯誤，請使用 YYYY-MM-DD 格式')
        }

        // 驗證日期是否有效（例如：避免 2024-02-30）
        const sinceParsed = parseISO(since)
        const untilParsed = parseISO(until)

        if (!isValid(sinceParsed)) {
          this.error(`開始日期無效：${since}（請確認日期正確，例如：避免 2024-02-30）`)
        }

        if (!isValid(untilParsed)) {
          this.error(`結束日期無效：${until}（請確認日期正確，例如：避免 2024-02-30）`)
        }

        // 驗證日期邏輯
        const sinceDate = sinceParsed
        const untilDate = untilParsed

        if (sinceDate > untilDate) {
          this.error('開始日期不可晚於結束日期')
        }

        if (untilDate > new Date()) {
          this.error('結束日期不可晚於今天')
        }
      } else {
        // 使用相對天數
        const range = getDateRange(flags.days)
        since = range.since
        until = range.until
      }

      // 驗證日期範圍
      validateDateRange(since, until)

      // 正規化日期字串為完整的 UTC 日期物件
      const sinceDate = normalizeDateString(since, 'start')
      const untilDate = normalizeDateString(until, 'end')

      // JSON 模式下不顯示進度訊息
      if (!flags.json) {
        this.log(`\n🔍 正在查詢已合併的 MR（${since} 至 ${until}）...`)
      }

      // 取得已合併的 MR 列表
      const mergedMRs = await this.fetchMergeRequests(
        client,
        sinceDate,
        untilDate,
        flags.limit
      )

      if (mergedMRs.length === 0) {
        this.warn('找不到符合條件的已合併 MR，請檢查時間範圍或專案權限')
        return
      }

      if (!flags.json) {
        this.log(`✓ 找到 ${mergedMRs.length} 個已合併的 MR\n`)
      }

      // 批次分析 MR 週期時間
      if (!flags.json) {
        this.log('⏳ 正在分析 MR 週期時間...\n')
      }

      const [metrics, failedMRs] = await this.analyzeMRs(client, mergedMRs, identifier, flags.json)

      if (metrics.length === 0) {
        this.warn('所有 MR 分析失敗，請檢查 MR 資料完整性')
        return
      }

      // 如果有 --trend 旗標，執行趨勢分析
      if (flags.trend) {
        const granularity = flags.trend as TrendGranularity
        const trendAnalyzer = new CycleTimeTrendAnalyzer()

        const trendPeriods = trendAnalyzer.analyzeTrend(
          metrics,
          sinceDate,
          untilDate,
          granularity
        )

        const trendResult: TrendResult = {
          project: {
            path: flags.project,
            name: this.getProjectName(flags.project),
          },
          analysisDate: new Date().toISOString(),
          periodType: granularity === 'weekly' ? 'weekly' : 'biweekly',
          periods: trendPeriods,
        }

        // 輸出趨勢結果
        if (flags.json) {
          const jsonOutput = formatCycleTimeTrendJson(trendResult)
          this.log(jsonOutput)
        } else {
          const trendOutput = formatCycleTimeTrend(trendResult)
          this.log(trendOutput)
        }

        return
      }

      // 一般分析模式（無趨勢）
      // 警告：樣本數過少
      const warnings: string[] = []
      if (metrics.length < MIN_SAMPLE_SIZE) {
        warnings.push(
          `樣本數過少（${metrics.length} 個），統計結果可能不準確，建議至少 ${MIN_SAMPLE_SIZE} 個 MR`
        )
      }

      // 計算統計指標
      const stages = StageAnalyzer.calculateAllStageStatistics(metrics)
      const totalCycleTime = StageAnalyzer.calculateTotalStatistics(metrics)
      const doraTier = StageAnalyzer.classifyDoraTier(totalCycleTime.mean)
      const bottleneckStage = StageAnalyzer.identifyBottleneck(stages)

      // 計算資料品質指標
      const zeroCodingTimeCount = metrics.filter((m) => m.stages.codingTime === 0).length
      const zeroMergeTimeCount = metrics.filter((m) => m.stages.mergeTime === 0).length
      const noReviewCount = metrics.filter(
        (m) => m.stages.pickupTime === null && m.stages.reviewTime === null
      ).length

      // 建立分析結果
      const result: AnalysisResult = {
        project: {
          path: flags.project,
          name: this.getProjectName(flags.project),
        },
        analysisDate: new Date().toISOString(),
        timeRange: {
          since,
          until,
        },
        mrCount: metrics.length,
        stages,
        totalCycleTime,
        doraTier,
        bottleneckStage,
        dataQuality: {
          zeroCodingTimeCount,
          zeroMergeTimeCount,
          noReviewCount,
          totalCount: metrics.length,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        failedMRs: failedMRs.length > 0 ? failedMRs : undefined,
      }

      // 輸出結果（根據 --json 和 --show-details 旗標選擇格式）
      if (flags.json) {
        const jsonOutput = formatCycleTimeJson(result)
        this.log(jsonOutput)
      } else {
        // 如果有 --show-details 旗標，傳遞 metrics 顯示詳細資訊
        const tableOutput = flags['show-details']
          ? formatCycleTimeAnalysis(result, metrics)
          : formatCycleTimeAnalysis(result)
        this.log(tableOutput)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`分析失敗: ${error.message}`)
      } else {
        this.error('發生未知錯誤')
      }
    }
  }

  /**
   * 從專案路徑提取專案名稱
   */
  private getProjectName(projectPath: string): string {
    return projectPath.split('/').pop() || projectPath
  }

  /**
   * 取得已合併的 MR 列表
   */
  private async fetchMergeRequests(
    client: GitLabClient,
    startDate: Date,
    endDate: Date,
    limit?: number
  ): Promise<GitLabMR[]> {
    // 限制最大 MR 數量，避免記憶體耗盡
    const effectiveLimit = limit
      ? Math.min(limit, MAX_MRS_HARD_LIMIT)
      : MAX_MRS_HARD_LIMIT

    // 直接使用 GitLab API 客戶端
    const params: MergeRequestsQueryParams = {
      projectId: client.getProjectIdentifier(),
      state: 'merged',
      orderBy: 'updated_at',
      sort: 'desc',
      perPage: MR_PER_PAGE,
    }

    // 取得所有已合併的 MR
    const allMRs: GitLabMR[] = []
    const maxPages = Math.ceil(effectiveLimit / MR_PER_PAGE)

    for (let page = 1; page <= maxPages; page++) {
      const response = await client.getClient().MergeRequests.all({
        ...params,
        page,
      })

      if (response.length === 0) break

      allMRs.push(...(response as GitLabMR[]))

      if (allMRs.length >= effectiveLimit) break
    }

    // 過濾時間範圍
    const filtered = allMRs.filter((mr) => {
      if (!mr.merged_at) return false

      const mergedDate = new Date(mr.merged_at)
      return mergedDate >= startDate && mergedDate <= endDate
    })

    // 截取指定數量
    if (filtered.length > effectiveLimit) {
      return filtered.slice(0, effectiveLimit)
    }

    return filtered
  }

  /**
   * 批次分析 MR 週期時間
   * @returns [成功的 metrics, 失敗的 MR 資訊]
   */
  private async analyzeMRs(
    client: GitLabClient,
    mergedMRs: GitLabMR[],
    projectId: string | number,
    isJsonMode: boolean = false
  ): Promise<[CycleTimeMetrics[], Array<{ iid: number; title: string; error: string }>]> {
    // JSON 模式下不顯示進度指示器
    if (!isJsonMode) {
      ux.action.start('分析中', '', { stdout: true })
    }

    let processed = 0
    const failedMRs: Array<{ iid: number; title: string; error: string }> = []

    const result = await processBatchItems(
      mergedMRs,
      async (mr: GitLabMR) => {
        try {
          // 取得 MR 的 commits 和 notes（帶 rate limit 保護）
          const [commits, notes] = await Promise.all([
            client.getMergeRequestCommits(projectId, mr.iid, {
              onWarning: isJsonMode ? undefined : (msg) => this.warn(msg),
            }),
            client.getMergeRequestNotes(projectId, mr.iid, {
              onWarning: isJsonMode ? undefined : (msg) => this.warn(msg),
            }),
          ])

          // 計算週期時間（JSON 模式下抑制警告訊息）
          const metrics = CycleTimeCalculator.calculate(
            mr as GitLabMR,
            commits as GitLabCommit[],
            notes as GitLabNote[],
            {
              onWarning: isJsonMode ? undefined : (msg) => this.warn(msg),
            }
          )

          processed++
          if (!isJsonMode) {
            ux.action.status = `${processed}/${mergedMRs.length} MRs`
          }

          return metrics
        } catch (error) {
          // 單一 MR 失敗不影響整體
          const msg = error instanceof Error ? error.message : '未知錯誤'

          // 記錄失敗資訊（供 JSON 輸出）
          failedMRs.push({
            iid: mr.iid,
            title: mr.title,
            error: msg,
          })

          // JSON 模式下不顯示警告訊息（改在 JSON 輸出中提供）
          if (!isJsonMode) {
            this.warn(`MR !${mr.iid} 分析失敗: ${msg}`)
          }

          return null
        }
      },
      {
        batchSize: BATCH_SIZE,
        errorHandling: 'skip',
      }
    )

    if (!isJsonMode) {
      ux.action.stop('✓')
    }

    // 過濾失敗的結果
    const successfulMetrics = result.successes.filter((m): m is CycleTimeMetrics => m !== null)

    return [successfulMetrics, failedMRs]
  }
}
