/**
 * 趨勢格式化器
 *
 * 負責將趨勢資料格式化為表格或 JSON 輸出
 */

import Table from 'cli-table3'
import chalk from 'chalk'
import { FrequencyTrend } from '../models/trend.js'
import { TrendSummary } from '../models/statistics.js'
import { PeriodComparison } from '../models/comparison.js'
import { zhTW } from '../i18n/zh-TW.js'

/**
 * 格式化趨勢為表格輸出
 * @param trend 頻率趨勢資料
 * @param summary 趨勢摘要（可選）
 * @param showPerAuthor 是否顯示人均統計
 * @returns 表格字串
 */
export function formatTrendTable(
  trend: FrequencyTrend,
  summary?: TrendSummary,
  showPerAuthor: boolean = false
): string {
  const { dataPoints } = trend

  // 建立表格
  const headers = [
    zhTW.trend.table.headers.date,
    zhTW.trend.table.headers.mergeCount
  ]

  if (showPerAuthor) {
    headers.push(zhTW.trend.table.headers.activeDevelopers)
    headers.push(zhTW.trend.table.headers.avgPerDeveloper)
  }

  const table = new Table({
    head: headers.map(h => chalk.cyan.bold(h)),
    style: { head: [] } // 移除預設樣式
  })

  // 填充資料行
  for (const dataPoint of dataPoints) {
    const row: string[] = [
      dataPoint.timeLabel,
      dataPoint.mergeCount.toString()
    ]

    if (showPerAuthor) {
      row.push(dataPoint.activeDeveloperCount.toString())
      row.push(formatNumber(dataPoint.avgMergesPerDeveloper, 2))
    }

    table.push(row)
  }

  let output = table.toString()

  // 新增摘要資訊
  if (summary) {
    output += '\n\n' + chalk.bold(zhTW.trend.statistics.summary + '：')
    output += `\n  ${zhTW.trend.statistics.totalMerges}：${summary.totalMerges}`

    if (showPerAuthor) {
      output += `\n  ${zhTW.trend.statistics.totalActiveDevelopers}：${summary.totalActiveDevelopers}`
      output += `\n  ${zhTW.trend.statistics.weeklyAvgMergesPerDeveloper}：${formatNumber(summary.weeklyAvgMergesPerDeveloper, 2)}`

      // 小批量評估狀態
      const assessment = summary.overallBatchAssessment
      const statusColor = assessment.isHealthy ? chalk.green : chalk.yellow
      output += `\n  ${statusColor(assessment.statusMessage)}`

      if (assessment.suggestion) {
        output += `\n  ${chalk.dim(assessment.suggestion)}`
      }
    }
  }

  return output
}

/**
 * 格式化趨勢為 JSON 輸出
 * @param trend 頻率趨勢資料
 * @param summary 趨勢摘要（可選）
 * @returns JSON 字串
 */
export function formatTrendJSON(
  trend: FrequencyTrend,
  summary?: TrendSummary
): string {
  const output: any = {
    projectId: trend.projectId,
    timePeriod: {
      startDate: formatLocalDate(trend.timePeriod.startDate),
      endDate: formatLocalDate(trend.timePeriod.endDate),
      granularity: trend.timePeriod.granularity,
      daysCount: trend.timePeriod.daysCount,
      weeksCount: trend.timePeriod.weeksCount
    },
    dataPoints: trend.dataPoints.map(dp => ({
      timeLabel: dp.timeLabel,
      periodStart: formatLocalDate(dp.periodStart),
      periodEnd: formatLocalDate(dp.periodEnd),
      mergeCount: dp.mergeCount,
      activeDeveloperCount: dp.activeDeveloperCount,
      avgMergesPerDeveloper: roundTo(dp.avgMergesPerDeveloper, 2)
    })),
    queriedAt: trend.queriedAt.toISOString()
  }

  if (summary) {
    output.summary = {
      totalMerges: summary.totalMerges,
      totalActiveDevelopers: summary.totalActiveDevelopers,
      overallAvgMergesPerDeveloper: roundTo(summary.overallAvgMergesPerDeveloper, 2),
      weeklyAverageMerges: roundTo(summary.weeklyAverageMerges, 2),
      weeklyAvgMergesPerDeveloper: roundTo(summary.weeklyAvgMergesPerDeveloper, 2),
      overallBatchAssessment: summary.overallBatchAssessment
    }
  }

  return JSON.stringify(output, null, 2)
}

/**
 * 格式化數字（保留指定小數位數）
 * @param value 數值
 * @param decimals 小數位數
 * @returns 格式化後的字串
 */
function formatNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals)
}

/**
 * 四捨五入到指定小數位數
 * @param value 數值
 * @param decimals 小數位數
 * @returns 四捨五入後的數值
 */
function roundTo(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals)
  return Math.round(value * multiplier) / multiplier
}

/**
 * 格式化本地日期為 YYYY-MM-DD
 * @param date 日期物件
 * @returns 格式化後的日期字串
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 格式化期間比較為表格輸出
 * @param comparison 期間比較結果
 * @param showPerAuthor 是否顯示人均統計
 * @returns 表格字串
 */
export function formatComparisonTable(
  comparison: PeriodComparison,
  showPerAuthor: boolean = false
): string {
  const { previousPeriod, currentPeriod } = comparison

  // 計算總合併數
  const previousTotal = previousPeriod.dataPoints.reduce((sum, dp) => sum + dp.mergeCount, 0)
  const currentTotal = currentPeriod.dataPoints.reduce((sum, dp) => sum + dp.mergeCount, 0)

  let output = chalk.bold('\n📊 期間比較分析\n')

  // 期間資訊表格
  const infoTable = new Table({
    head: [chalk.cyan.bold(''), chalk.cyan.bold('先前期間'), chalk.cyan.bold('當前期間'), chalk.cyan.bold('變化')],
    style: { head: [] }
  })

  // 時間範圍（使用本地時間格式化，避免時區問題）
  const prevPeriodStr = `${formatLocalDate(previousPeriod.timePeriod.startDate)} ~ ${formatLocalDate(previousPeriod.timePeriod.endDate)}`
  const currPeriodStr = `${formatLocalDate(currentPeriod.timePeriod.startDate)} ~ ${formatLocalDate(currentPeriod.timePeriod.endDate)}`
  infoTable.push(['時間範圍', prevPeriodStr, currPeriodStr, ''])

  // 總合併數
  const totalChange = formatChangePercent(comparison.totalMergesChangePercent)
  infoTable.push(['總合併數', previousTotal.toString(), currentTotal.toString(), totalChange])

  // 週平均合併數
  const prevWeeklyAvg = formatNumber(previousTotal / previousPeriod.timePeriod.weeksCount, 2)
  const currWeeklyAvg = formatNumber(currentTotal / currentPeriod.timePeriod.weeksCount, 2)
  const weeklyChange = formatChangePercent(comparison.weeklyAverageChangePercent)
  infoTable.push(['週平均合併數', prevWeeklyAvg, currWeeklyAvg, weeklyChange])

  // 人均統計（如果有）
  if (showPerAuthor && comparison.perDeveloperChangePercent !== undefined) {
    const perDevChange = formatChangePercent(comparison.perDeveloperChangePercent)
    infoTable.push(['週人均合併數', '-', '-', perDevChange])
  }

  output += infoTable.toString()

  // 改善狀態
  output += '\n\n' + chalk.bold('評估：')
  if (comparison.isImprovement) {
    output += ' ' + chalk.green('✓ 合併頻率提升')
  } else {
    output += ' ' + chalk.yellow('✗ 合併頻率下降')
  }

  return output
}

/**
 * 格式化期間比較為 JSON 輸出
 * @param comparison 期間比較結果
 * @returns JSON 字串
 */
export function formatComparisonJSON(comparison: PeriodComparison): string {
  const output = {
    previousPeriod: {
      projectId: comparison.previousPeriod.projectId,
      timePeriod: {
        startDate: formatLocalDate(comparison.previousPeriod.timePeriod.startDate),
        endDate: formatLocalDate(comparison.previousPeriod.timePeriod.endDate),
        granularity: comparison.previousPeriod.timePeriod.granularity,
        daysCount: comparison.previousPeriod.timePeriod.daysCount,
        weeksCount: comparison.previousPeriod.timePeriod.weeksCount
      },
      totalMerges: comparison.previousPeriod.dataPoints.reduce((sum, dp) => sum + dp.mergeCount, 0)
    },
    currentPeriod: {
      projectId: comparison.currentPeriod.projectId,
      timePeriod: {
        startDate: formatLocalDate(comparison.currentPeriod.timePeriod.startDate),
        endDate: formatLocalDate(comparison.currentPeriod.timePeriod.endDate),
        granularity: comparison.currentPeriod.timePeriod.granularity,
        daysCount: comparison.currentPeriod.timePeriod.daysCount,
        weeksCount: comparison.currentPeriod.timePeriod.weeksCount
      },
      totalMerges: comparison.currentPeriod.dataPoints.reduce((sum, dp) => sum + dp.mergeCount, 0)
    },
    changes: {
      totalMergesChangePercent: roundTo(comparison.totalMergesChangePercent, 1),
      weeklyAverageChangePercent: roundTo(comparison.weeklyAverageChangePercent, 1),
      perDeveloperChangePercent: comparison.perDeveloperChangePercent !== undefined
        ? roundTo(comparison.perDeveloperChangePercent, 1)
        : undefined,
      isImprovement: comparison.isImprovement
    }
  }

  return JSON.stringify(output, null, 2)
}

/**
 * 格式化變化百分比
 * @param percent 百分比
 * @returns 格式化後的字串（帶顏色）
 */
function formatChangePercent(percent: number): string {
  const sign = percent > 0 ? '+' : ''
  const value = `${sign}${percent.toFixed(1)}%`

  if (percent > 0) {
    return chalk.green(value)
  } else if (percent < 0) {
    return chalk.red(value)
  } else {
    return chalk.gray(value)
  }
}
