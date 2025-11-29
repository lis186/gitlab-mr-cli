/**
 * MR 週期時間趨勢格式化器
 *
 * 將週期時間趨勢分析結果格式化為終端表格輸出
 *
 * @module formatters/cycle-time-trend-formatter
 */

import Table from 'cli-table3'
import chalk from 'chalk'
import type { TrendPeriod, TrendResult } from '../types/cycle-time.js'

/**
 * 格式化趨勢分析為表格輸出
 *
 * @param result - 趨勢分析結果
 * @returns 格式化的表格字串
 */
export function formatCycleTimeTrend(result: TrendResult): string {
  const output: string[] = []

  // 標題
  output.push(chalk.bold.cyan('\n📈 MR 週期時間趨勢分析'))
  output.push('')

  // 專案資訊
  output.push(`專案：${chalk.bold(result.project.path)}`)
  output.push(`分析時段：${result.periods.length} 個${result.periodType === 'weekly' ? '週' : '月'}`)
  output.push(`分析日期：${result.analysisDate.split('T')[0]}`)
  output.push('')

  // 趨勢表格
  const table = new Table({
    head: [
      chalk.bold('時段'),
      chalk.bold('MR 數'),
      chalk.bold('平均週期'),
      chalk.bold('中位數'),
      chalk.bold('DORA'),
      chalk.bold('瓶頸階段'),
      chalk.bold('變化'),
    ],
    colWidths: [24, 8, 12, 12, 13, 15, 15],
  })

  for (const period of result.periods) {
    const row = formatPeriodRow(period)
    table.push(row)
  }

  output.push(table.toString())

  // 趨勢摘要
  output.push(formatTrendSummary(result))

  output.push('') // 結尾空行
  return output.join('\n')
}

/**
 * 格式化單一時段的表格行
 *
 * @param period - 趨勢時段
 * @returns 表格行資料
 */
function formatPeriodRow(period: TrendPeriod): string[] {
  // 時段標籤
  const label = period.label

  // MR 數量
  const mrCount = period.mrCount.toString()

  // 平均週期時間
  const meanCycleTime = period.totalCycleTime.mean > 0
    ? `${period.totalCycleTime.mean.toFixed(1)}h`
    : chalk.gray('N/A')

  // 中位數
  const medianCycleTime = period.totalCycleTime.median > 0
    ? `${period.totalCycleTime.median.toFixed(1)}h`
    : chalk.gray('N/A')

  // DORA 層級（帶顏色）
  const doraTier = formatDoraTier(period.doraTier)

  // 瓶頸階段
  const bottleneckStage = formatBottleneckStage(period)

  // 變化（相對前一時段）
  const change = formatChange(period.changeFromPrevious)

  return [label, mrCount, meanCycleTime, medianCycleTime, doraTier, bottleneckStage, change]
}

/**
 * 格式化 DORA 層級（帶顏色與 emoji）
 *
 * @param tier - DORA 層級
 * @returns 格式化的層級字串
 */
function formatDoraTier(tier: 'Elite' | 'High' | 'Medium' | 'Low'): string {
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

  const emoji = tierEmoji[tier]
  const color = tierColor[tier]

  return `${emoji} ${chalk[color](tier)}`
}

/**
 * 格式化瓶頸階段
 *
 * @param period - 趨勢時段
 * @returns 格式化的瓶頸階段字串
 */
function formatBottleneckStage(period: TrendPeriod): string {
  if (period.mrCount === 0) return chalk.gray('N/A')

  // 找出瓶頸階段（平均值最高的階段）
  const stages = [
    { name: 'Coding', value: period.stages.coding.mean },
    { name: 'Pickup', value: period.stages.pickup.mean },
    { name: 'Review', value: period.stages.review.mean },
    { name: 'Merge', value: period.stages.merge.mean },
  ]

  const bottleneck = stages.reduce((max, stage) =>
    stage.value > max.value ? stage : max
  )

  const percentage = period.totalCycleTime.mean > 0
    ? ((bottleneck.value / period.totalCycleTime.mean) * 100).toFixed(0)
    : '0'

  return `${bottleneck.name} (${percentage}%)`
}

/**
 * 格式化時段間變化
 *
 * @param change - 變化資訊
 * @returns 格式化的變化字串
 */
function formatChange(change?: TrendPeriod['changeFromPrevious']): string {
  if (!change) return chalk.gray('-')

  const { cycleTime, percentage } = change

  // 判斷是改善（減少）或惡化（增加）
  const isImprovement = cycleTime < 0
  const arrow = isImprovement ? '↓' : '↑'
  const color = isImprovement ? 'green' : 'red'

  const sign = percentage > 0 ? '+' : ''

  return chalk[color](`${arrow} ${sign}${percentage.toFixed(0)}%`)
}

/**
 * 格式化趨勢摘要
 *
 * @param result - 趨勢分析結果
 * @returns 格式化的摘要字串
 */
function formatTrendSummary(result: TrendResult): string {
  const output: string[] = []
  output.push('')
  output.push(chalk.bold.cyan('📊 趨勢摘要：'))
  output.push('')

  // 計算整體統計
  const periods = result.periods
  const totalMRs = periods.reduce((sum, p) => sum + p.mrCount, 0)
  const avgCycleTime = totalMRs > 0
    ? periods.reduce((sum, p) => sum + p.totalCycleTime.mean * p.mrCount, 0) / totalMRs
    : 0

  // 計算改善/惡化的時段數
  const periodsWithChange = periods.filter(p => p.changeFromPrevious)
  const improvementPeriods = periodsWithChange.filter(
    p => p.changeFromPrevious!.cycleTime < 0
  ).length
  const regressionPeriods = periodsWithChange.filter(
    p => p.changeFromPrevious!.cycleTime > 0
  ).length

  output.push(`  總 MR 數：${totalMRs}`)
  output.push(`  平均週期時間：${avgCycleTime.toFixed(1)} 小時`)
  output.push('')
  output.push(`  改善時段：${chalk.green(improvementPeriods)} 個 ${chalk.green('↓')}`)
  output.push(`  惡化時段：${chalk.red(regressionPeriods)} 個 ${chalk.red('↑')}`)

  // 整體趨勢判斷
  if (periods.length >= 2) {
    const firstPeriod = periods[0]!
    const lastPeriod = periods[periods.length - 1]!

    if (firstPeriod.mrCount > 0 && lastPeriod.mrCount > 0) {
      const overallChange = lastPeriod.totalCycleTime.mean - firstPeriod.totalCycleTime.mean
      const overallChangePercent = firstPeriod.totalCycleTime.mean > 0
        ? (overallChange / firstPeriod.totalCycleTime.mean) * 100
        : 0

      output.push('')
      if (overallChange < 0) {
        output.push(
          chalk.green(
            `  💡 整體趨勢：週期時間 ${chalk.bold('改善')} ${Math.abs(overallChangePercent).toFixed(0)}%`
          )
        )
      } else if (overallChange > 0) {
        output.push(
          chalk.yellow(
            `  💡 整體趨勢：週期時間 ${chalk.bold('增加')} ${overallChangePercent.toFixed(0)}%`
          )
        )
      } else {
        output.push(chalk.gray(`  💡 整體趨勢：週期時間 ${chalk.bold('持平')}`))
      }
    }
  }

  // 常見瓶頸階段分析
  const bottleneckCounts: Record<string, number> = {
    Coding: 0,
    Pickup: 0,
    Review: 0,
    Merge: 0,
  }

  for (const period of periods) {
    if (period.mrCount === 0) continue

    const stages = [
      { name: 'Coding' as const, value: period.stages.coding.mean },
      { name: 'Pickup' as const, value: period.stages.pickup.mean },
      { name: 'Review' as const, value: period.stages.review.mean },
      { name: 'Merge' as const, value: period.stages.merge.mean },
    ]

    const bottleneck = stages.reduce((max, stage) =>
      stage.value > max.value ? stage : max, stages[0]!
    )

    const key = bottleneck.name as keyof typeof bottleneckCounts
    bottleneckCounts[key] = (bottleneckCounts[key] || 0) + 1
  }

  const mostCommonBottleneck = Object.entries(bottleneckCounts).reduce((max, entry) =>
    entry[1] > max[1] ? entry : max
  )

  output.push('')
  output.push(
    chalk.yellow(
      `  ⚠️  最常見瓶頸：${mostCommonBottleneck[0]} (${mostCommonBottleneck[1]}/${periods.filter(p => p.mrCount > 0).length} 時段)`
    )
  )

  return output.join('\n')
}

/**
 * 格式化趨勢分析為 JSON 輸出
 *
 * @param result - 趨勢分析結果
 * @returns JSON 字串
 */
export function formatCycleTimeTrendJson(result: TrendResult): string {
  return JSON.stringify(result, null, 2)
}
