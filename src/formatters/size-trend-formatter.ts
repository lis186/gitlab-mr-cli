/**
 * MR 規模趨勢格式化器
 * Feature: 007-mr-size-analysis - Phase 5 (US3)
 */

import Table from 'cli-table3'
import chalk from 'chalk'
import { TrendAnalysisResult } from '../types/mr-size.js'

/**
 * 格式化趨勢分析結果為表格
 *
 * @param result - 趨勢分析結果
 * @returns 表格字串
 */
export function formatTrendAnalysis(result: TrendAnalysisResult): string {
  const table = new Table({
    head: [
      chalk.bold('月份'),
      chalk.bold('MR數'),
      chalk.bold('規模分佈 (XS/S/M/L/XL)'),
      chalk.bold('S或更小 (%)'),
      chalk.bold('XL (%)'),
    ],
    colWidths: [12, 10, 35, 18, 12],
  })

  for (const monthData of result.monthlyData) {
    const { month, total, distribution, hasLowSample } = monthData

    // 月份標識（加上低樣本警告）
    const monthLabel = hasLowSample ? `${month} *` : month

    // 規模分佈（簡潔格式）
    const distStr = [
      distribution.byCategory.XS.count,
      distribution.byCategory.S.count,
      distribution.byCategory.M.count,
      distribution.byCategory.L.count,
      distribution.byCategory.XL.count,
    ].join('/')

    // S 或更小百分比
    const smallPercent = distribution.healthMetrics.smallOrLessPercent
    const smallIcon = smallPercent >= 60 ? chalk.green('✓') : chalk.yellow('⚠')
    const smallStr = `${smallIcon} ${smallPercent}%`

    // XL 百分比
    const xlPercent = distribution.healthMetrics.xlPercent
    const xlIcon = xlPercent < 10 ? chalk.green('✓') : chalk.yellow('⚠')
    const xlStr = `${xlIcon} ${xlPercent}%`

    table.push([monthLabel, total.toString(), distStr, smallStr, xlStr])
  }

  let output = table.toString() + '\n'

  // 趨勢觀察摘要
  if (result.monthlyData.length >= 2) {
    const first = result.monthlyData[0]!
    const last = result.monthlyData[result.monthlyData.length - 1]!

    output += '\n' + chalk.bold('趨勢觀察:') + '\n'

    // S 或更小規模比例變化
    const smallChange =
      last.distribution.healthMetrics.smallOrLessPercent -
      first.distribution.healthMetrics.smallOrLessPercent
    if (smallChange > 0) {
      output += `  ${chalk.green('✓')} S 或更小規模比例提升: ${first.distribution.healthMetrics.smallOrLessPercent}% → ${last.distribution.healthMetrics.smallOrLessPercent}% (+${smallChange.toFixed(1)}%)\n`
    } else if (smallChange < 0) {
      output += `  ${chalk.yellow('⚠')} S 或更小規模比例下降: ${first.distribution.healthMetrics.smallOrLessPercent}% → ${last.distribution.healthMetrics.smallOrLessPercent}% (${smallChange.toFixed(1)}%)\n`
    } else {
      output += `  ${chalk.dim('=')} S 或更小規模比例維持: ${first.distribution.healthMetrics.smallOrLessPercent}%\n`
    }

    // XL 比例變化
    const xlChange =
      last.distribution.healthMetrics.xlPercent - first.distribution.healthMetrics.xlPercent
    if (xlChange > 0) {
      output += `  ${chalk.yellow('⚠')} XL 比例上升: ${first.distribution.healthMetrics.xlPercent}% → ${last.distribution.healthMetrics.xlPercent}% (+${xlChange.toFixed(1)}%)\n`
    } else if (xlChange < 0) {
      output += `  ${chalk.green('✓')} XL 比例下降: ${first.distribution.healthMetrics.xlPercent}% → ${last.distribution.healthMetrics.xlPercent}% (${xlChange.toFixed(1)}%)\n`
    } else {
      output += `  ${chalk.dim('=')} XL 比例維持: ${first.distribution.healthMetrics.xlPercent}%\n`
    }
  }

  // 低樣本數警告
  const hasLowSamples = result.monthlyData.some((m) => m.hasLowSample)
  if (hasLowSamples) {
    output += '\n' + chalk.dim('* 樣本數不足 10 個，統計可能不具代表性')
  }

  // 整體健康度
  output += '\n'
  if (result.overall.healthMetrics.meetsGoals) {
    output += chalk.green('✓ 團隊健康度達成目標')
  } else {
    output += chalk.yellow('⚠ 團隊健康度未達成目標')
  }

  return output
}

/**
 * 格式化趨勢分析結果為 JSON
 *
 * @param result - 趨勢分析結果
 * @param projectPath - 專案路徑
 * @returns JSON 字串
 */
export function formatTrendAnalysisJson(result: TrendAnalysisResult, projectPath: string): string {
  const output = {
    project: projectPath,
    dateRange: {
      since: result.dateRange.since.toISOString(),
      until: result.dateRange.until.toISOString(),
    },
    monthlyData: result.monthlyData,
    overall: result.overall,
  }

  return JSON.stringify(output, null, 2)
}
