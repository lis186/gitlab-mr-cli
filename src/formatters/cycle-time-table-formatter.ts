/**
 * MR 週期時間表格格式化器
 *
 * 將週期時間分析結果格式化為終端表格輸出
 *
 * @module formatters/cycle-time-table-formatter
 */

import Table from 'cli-table3'
import chalk from 'chalk'
import type { AnalysisResult, StageStatistics } from '../types/cycle-time.js'
import { formatDuration } from '../utils/time-utils.js'

// Data Quality Thresholds
const ZERO_CODING_TIME_THRESHOLD = 0.2 // 20% - 當超過此比例的 MR Coding Time=0 時觸發警告
const NO_REVIEW_THRESHOLD = 0.3 // 30% - 當超過此比例的 MR 無審查記錄時觸發警告

/**
 * 格式化階段分解（四階段進度條）
 *
 * @param stages - 四階段統計
 * @returns 格式化的階段分解字串
 */
function formatStageBreakdown(stages: {
  coding: StageStatistics
  pickup: StageStatistics
  review: StageStatistics
  merge: StageStatistics
}): string {
  const output: string[] = []
  output.push(chalk.bold.cyan('\n階段分解（平均值）：\n'))

  const stageOrder: Array<keyof typeof stages> = ['coding', 'pickup', 'review', 'merge']
  const stageLabels = {
    coding: 'Coding Time',
    pickup: 'Pickup Time',
    review: 'Review Time',
    merge: 'Merge Time',
  }

  for (const stageName of stageOrder) {
    const stage = stages[stageName]
    const label = stageLabels[stageName]
    const meanHours = stage.mean.toFixed(1)
    const percentage = stage.percentage.toFixed(0)

    // 建立 Unicode 進度條
    const barLength = 20
    const filledLength = Math.round((stage.percentage / 100) * barLength)
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)

    // 瓶頸標記（平均值不顯示瓶頸標示，因為容易被極端值扭曲）
    const bottleneckMark = ''

    output.push(`  ${label.padEnd(15)} ${meanHours.padStart(6)} 小時  ${bar} (${percentage}%)${bottleneckMark}`)
  }

  // 分隔線
  output.push('  ' + '─'.repeat(60))

  return output.join('\n')
}

/**
 * 格式化階段分解（P75 百分位數進度條）
 *
 * @param stages - 四階段統計
 * @param totalP75 - 總週期時間的 P75
 * @returns 格式化的階段分解字串
 */
function formatStageBreakdownP75(
  stages: {
    coding: StageStatistics
    pickup: StageStatistics
    review: StageStatistics
    merge: StageStatistics
  },
  totalP75: number
): string {
  const output: string[] = []
  output.push(chalk.bold.cyan('\n階段分解（P75 百分位數）：\n'))

  const stageOrder: Array<keyof typeof stages> = ['coding', 'pickup', 'review', 'merge']
  const stageLabels = {
    coding: 'Coding Time',
    pickup: 'Pickup Time',
    review: 'Review Time',
    merge: 'Merge Time',
  }

  for (const stageName of stageOrder) {
    const stage = stages[stageName]
    const label = stageLabels[stageName]
    const p75Hours = stage.p75.toFixed(1)
    const percentage = totalP75 > 0 ? (stage.p75 / totalP75) * 100 : 0
    const percentageStr = percentage.toFixed(0)

    // 建立 Unicode 進度條
    const barLength = 20
    const filledLength = Math.max(0, Math.min(barLength, Math.round((percentage / 100) * barLength)))
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)

    // P75 百分位數是統計分佈，不顯示瓶頸標示（避免誤導使用者）
    // 瓶頸識別應基於平均值並在建議區塊中呈現

    output.push(`  ${label.padEnd(15)} ${p75Hours.padStart(6)} 小時  ${bar} (${percentageStr}%)`)
  }

  // 分隔線
  output.push('  ' + '─'.repeat(60))
  output.push(`  總週期時間 P75: ${totalP75.toFixed(1).padStart(6)} 小時`)

  return output.join('\n')
}

/**
 * 格式化統計摘要表格
 *
 * @param stages - 四階段統計
 * @returns 格式化的統計表格
 */
function formatStatisticsTable(stages: {
  coding: StageStatistics
  pickup: StageStatistics
  review: StageStatistics
  merge: StageStatistics
}): string {
  const table = new Table({
    head: [
      chalk.bold('階段'),
      chalk.bold('平均值'),
      chalk.bold('中位數'),
      chalk.bold('P75'),
      chalk.bold('P90'),
    ],
    colWidths: [15, 12, 12, 12, 12],
  })

  const stageOrder: Array<keyof typeof stages> = ['coding', 'pickup', 'review', 'merge']
  const stageLabels = {
    coding: 'Coding',
    pickup: 'Pickup',
    review: 'Review',
    merge: 'Merge',
  }

  for (const stageName of stageOrder) {
    const stage = stages[stageName]
    const label = stageLabels[stageName]

    table.push([
      chalk.bold(label),
      `${stage.mean.toFixed(1)}h`,
      `${stage.median.toFixed(1)}h`,
      `${stage.p75.toFixed(1)}h`,
      `${stage.p90.toFixed(1)}h`,
    ])
  }

  return table.toString()
}

/**
 * 格式化 DORA 基準對比（完整版）
 *
 * @param result - 分析結果
 * @returns 格式化的基準對比字串
 */
function formatDoraBenchmark(result: AnalysisResult): string {
  const output: string[] = []
  output.push(chalk.bold.cyan('\n\nDORA 基準對比：\n'))

  // 層級對應的 emoji 與顏色
  const tierEmoji = {
    Elite: '🏆',
    High: '⭐',
    Medium: '📊',
    Low: '📉',
  }

  const tierColor = {
    Elite: 'green',
    High: 'cyan',
    Medium: 'yellow',
    Low: 'red',
  } as const

  const emoji = tierEmoji[result.doraTier]
  const color = tierColor[result.doraTier]

  // 顯示團隊層級
  output.push(`  團隊表現：${emoji} ${chalk[color].bold(result.doraTier)}`)

  // 顯示總週期時間
  const meanCycleTime = result.totalCycleTime.mean
  output.push(`  平均週期時間：${formatDuration(meanCycleTime)}`)

  // 顯示所有層級門檻
  output.push('')
  output.push(chalk.gray('  層級標準（基於 DORA 2024 研究）：'))
  output.push(
    chalk.gray(`    • ${chalk.green('Elite')}:   < 26 小時    （業界前 10%）`)
  )
  output.push(
    chalk.gray(`    • ${chalk.cyan('High')}:    < 1 週      （業界前 25%）`)
  )
  output.push(
    chalk.gray(`    • ${chalk.yellow('Medium')}: < 1 個月    （業界前 50%）`)
  )
  output.push(chalk.gray(`    • ${chalk.red('Low')}:     >= 1 個月   （需改善）`))

  // 瓶頸階段識別（僅顯示識別結果，不提供建議）
  // 原因：在沒有深入分析具體原因之前，不應武斷給出改善建議
  output.push('')
  const bottleneckStageLabels = {
    coding: 'Coding Time（開發時間）',
    pickup: 'Pickup Time（等待審查時間）',
    review: 'Review Time（審查時間）',
    merge: 'Merge Time（合併等待時間）',
  }

  const bottleneckLabel = bottleneckStageLabels[result.bottleneckStage]
  const bottleneckPercentage = result.stages[result.bottleneckStage].percentage.toFixed(0)

  output.push(chalk.yellow(`  ⚠️ 週期時間分布：`))
  output.push(
    chalk.yellow(
      `     ${bottleneckLabel} 佔 ${bottleneckPercentage}% 的週期時間`
    )
  )

  return output.join('\n')
}

/**
 * 格式化資料品質提醒
 *
 * @param result - 分析結果
 * @returns 格式化的資料品質提醒字串
 */
function formatDataQualityReminder(result: AnalysisResult): string {
  if (!result.dataQuality) return ''

  const { zeroCodingTimeCount, zeroMergeTimeCount, noReviewCount, totalCount } =
    result.dataQuality

  // 計算百分比
  const zeroCodingPct = ((zeroCodingTimeCount / totalCount) * 100).toFixed(1)
  const zeroMergePct = ((zeroMergeTimeCount / totalCount) * 100).toFixed(1)
  const noReviewPct = ((noReviewCount / totalCount) * 100).toFixed(1)

  // 只在有異常資料時才顯示提醒
  if (zeroCodingTimeCount === 0 && zeroMergeTimeCount === 0 && noReviewCount === 0) {
    return ''
  }

  const output: string[] = []
  output.push('')
  output.push(chalk.bold.cyan('📋 資料品質提醒：'))
  output.push('')

  // Coding Time = 0 的提醒
  if (zeroCodingTimeCount > 0) {
    output.push(
      chalk.gray(
        `  • ${zeroCodingTimeCount} 個 MR 的 Coding Time = 0（${zeroCodingPct}%）- 可能因 rebase/amend`
      )
    )
  }

  // Merge Time = 0 的提醒
  if (zeroMergeTimeCount > 0) {
    output.push(
      chalk.gray(
        `  • ${zeroMergeTimeCount} 個 MR 的 Merge Time = 0（${zeroMergePct}%）- 快速/自動合併`
      )
    )
  }

  // 無審查的提醒
  if (noReviewCount > 0) {
    output.push(
      chalk.gray(`  • ${noReviewCount} 個 MR 無審查記錄（${noReviewPct}%）`)
    )
  }

  // 總結建議（如果有明顯的資料品質問題）
  const hasSignificantIssues =
    zeroCodingTimeCount / totalCount > ZERO_CODING_TIME_THRESHOLD ||
    noReviewCount / totalCount > NO_REVIEW_THRESHOLD

  if (hasSignificantIssues) {
    output.push('')
    output.push(
      chalk.yellow('  💡 資料品質問題較多，建議參考以下更穩健的統計指標：')
    )

    // 顯示 P75 階段分解視覺化
    output.push(formatStageBreakdownP75(result.stages, result.totalCycleTime.p75))

    // 建立中位數與百分位數表格
    output.push('')
    output.push(chalk.bold.cyan('詳細統計（中位數、P75、P90）：\n'))

    const robustTable = new Table({
      head: [
        chalk.bold('階段'),
        chalk.bold('中位數'),
        chalk.bold('P75'),
        chalk.bold('P90'),
      ],
      colWidths: [15, 12, 12, 12],
    })

    const stageOrder: Array<keyof typeof result.stages> = ['coding', 'pickup', 'review', 'merge']
    const stageLabels = {
      coding: 'Coding',
      pickup: 'Pickup',
      review: 'Review',
      merge: 'Merge',
    }

    for (const stageName of stageOrder) {
      const stage = result.stages[stageName]
      robustTable.push([
        chalk.bold(stageLabels[stageName]),
        `${stage.median.toFixed(1)}h`,
        `${stage.p75.toFixed(1)}h`,
        `${stage.p90.toFixed(1)}h`,
      ])
    }

    // 新增總計行
    robustTable.push([
      chalk.bold.cyan('總計'),
      chalk.cyan(`${result.totalCycleTime.median.toFixed(1)}h`),
      chalk.cyan(`${result.totalCycleTime.p75.toFixed(1)}h`),
      chalk.cyan(`${result.totalCycleTime.p90.toFixed(1)}h`),
    ])

    output.push(robustTable.toString())
  }

  return output.join('\n')
}

/**
 * 格式化 MR 詳細列表
 *
 * @param metrics - MR 週期時間指標陣列
 * @returns 格式化的 MR 詳細列表字串
 */
function formatMRDetails(metrics: import('../types/cycle-time.js').CycleTimeMetrics[]): string {
  const output: string[] = []
  output.push('')
  output.push(chalk.bold.cyan('📋 MR 詳細列表：'))
  output.push('')

  for (const m of metrics) {
    // 判斷是否有異常
    const hasAnomaly =
      m.stages.codingTime === 0 ||
      m.stages.mergeTime === 0 ||
      (m.stages.pickupTime === null && m.stages.reviewTime === null)

    const anomalyMark = hasAnomaly ? chalk.yellow(' ⚠️ 異常') : chalk.green(' ✓ 正常')

    output.push(chalk.gray('━'.repeat(70)))
    output.push(`!${m.mr.iid}  ${m.mr.title}${anomalyMark}`)

    // 階段時間
    const coding =
      m.stages.codingTime === 0
        ? chalk.yellow(`Coding: 0.0h ⚠️ (可能因 rebase)`)
        : `Coding: ${m.stages.codingTime.toFixed(1)}h`
    const pickup =
      m.stages.pickupTime === null
        ? chalk.gray('Pickup: N/A (無審查)')
        : `Pickup: ${m.stages.pickupTime.toFixed(1)}h`
    const review =
      m.stages.reviewTime === null
        ? chalk.gray('Review: N/A (無審查)')
        : `Review: ${m.stages.reviewTime.toFixed(1)}h`
    const merge =
      m.stages.mergeTime === 0
        ? chalk.yellow(`Merge: 0.0h ⚠️ (快速合併)`)
        : `Merge: ${m.stages.mergeTime.toFixed(1)}h`

    output.push(`       ${coding}`)
    output.push(`       ${pickup}`)
    output.push(`       ${review}`)
    output.push(`       ${merge}`)
    output.push(`       Total: ${m.totalCycleTime.toFixed(1)}h`)
  }

  output.push(chalk.gray('━'.repeat(70)))

  return output.join('\n')
}

/**
 * 格式化完整的週期時間分析結果
 *
 * @param result - 分析結果
 * @param metrics - MR 週期時間指標陣列（選填，用於 --show-details）
 * @returns 格式化的表格字串
 */
export function formatCycleTimeAnalysis(
  result: AnalysisResult,
  metrics?: import('../types/cycle-time.js').CycleTimeMetrics[]
): string {
  const output: string[] = []

  // 標題
  output.push(chalk.bold.cyan('\n📊 MR 週期時間分析'))
  output.push('')

  // 專案資訊
  output.push(`專案：${chalk.bold(result.project.path)}`)
  output.push(`分析 MR 數量：${chalk.bold(result.mrCount)} 個`)
  output.push(`時間範圍：${result.timeRange.since} 至 ${result.timeRange.until}`)

  // 警告訊息
  if (result.warnings && result.warnings.length > 0) {
    output.push('')
    for (const warning of result.warnings) {
      output.push(chalk.yellow(`⚠️  ${warning}`))
    }
  }

  // 階段分解
  output.push(formatStageBreakdown(result.stages))

  // 總週期時間
  const totalMean = result.totalCycleTime.mean
  output.push(`  總週期時間:    ${totalMean.toFixed(1).padStart(6)} 小時`)

  // 統計摘要表格
  output.push(chalk.bold.cyan('\n\n統計摘要：\n'))
  output.push(formatStatisticsTable(result.stages))

  // DORA 基準對比
  output.push(formatDoraBenchmark(result))

  // MR 詳細列表（如果有提供 metrics）
  if (metrics && metrics.length > 0) {
    output.push(formatMRDetails(metrics))
  }

  // 資料品質提醒
  const dataQualityReminder = formatDataQualityReminder(result)
  if (dataQualityReminder) {
    output.push(dataQualityReminder)
  }

  output.push('') // 結尾空行
  return output.join('\n')
}
