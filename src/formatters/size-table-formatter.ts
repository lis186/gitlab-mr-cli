/**
 * MR 規模分析 - 表格格式化器
 * Feature: 007-mr-size-analysis
 */

import Table from 'cli-table3'
import chalk from 'chalk'
import { SizeDistribution, SizeCategory, OversizedMR } from '../types/mr-size.js'

/**
 * 格式化規模分佈為表格
 *
 * @param distribution - 規模分佈資料
 * @returns 表格字串
 */
export function formatSizeDistribution(distribution: SizeDistribution): string {
  // 規模分類標準說明
  let output = chalk.bold('\n規模分類標準:') + '\n'
  output += chalk.dim('  XS: ≤10 檔案 且 ≤100 行變更\n')
  output += chalk.dim('  S:  ≤20 檔案 且 ≤200 行變更\n')
  output += chalk.dim('  M:  ≤50 檔案 且 ≤400 行變更\n')
  output += chalk.dim('  L:  ≤100 檔案 且 ≤800 行變更\n')
  output += chalk.dim('  XL: >100 檔案 或 >800 行變更\n')
  output += chalk.dim('  (註：當檔案數和行數門檻衝突時，取較大類別)\n\n')

  const table = new Table({
    head: [chalk.bold('規模類別'), chalk.bold('數量'), chalk.bold('百分比'), chalk.bold('分佈視覺化')],
    colWidths: [12, 10, 12, 26],
  })

  // 添加每個類別的統計
  const categories = [
    SizeCategory.XS,
    SizeCategory.S,
    SizeCategory.M,
    SizeCategory.L,
    SizeCategory.XL,
  ]

  for (const category of categories) {
    const stats = distribution.byCategory[category]
    // 產生長條圖 (最大 24 個字元寬度)
    const barLength = Math.round((stats.percentage / 100) * 24)
    const bar = '█'.repeat(barLength) + '░'.repeat(24 - barLength)
    table.push([category, stats.count.toString(), `${stats.percentage}%`, bar])
  }

  output += table.toString() + '\n'

  // 添加團隊健康度指標
  output += '\n' + chalk.bold('團隊健康度指標:') + '\n'

  const { healthMetrics } = distribution

  // S 或更小規模百分比
  const smallOrLessIcon = healthMetrics.smallOrLessPercent >= 60 ? chalk.green('✓') : chalk.red('✗')
  output += `  ${smallOrLessIcon} S 或更小規模: ${chalk.bold(healthMetrics.smallOrLessPercent + '%')} (目標: ≥ 60%)\n`

  // XL 規模百分比
  const xlIcon = healthMetrics.xlPercent < 10 ? chalk.green('✓') : chalk.red('✗')
  output += `  ${xlIcon} XL 規模: ${chalk.bold(healthMetrics.xlPercent + '%')} (目標: < 10%)\n`

  // 整體健康度
  output += '\n'
  if (healthMetrics.meetsGoals) {
    output += chalk.green('✓ 團隊達成健康度目標')
  } else {
    output += chalk.yellow('⚠ 團隊未達成健康度目標')
  }

  return output
}

/**
 * 格式化過大 MR 列表為表格
 *
 * @param oversizedMRs - 過大 MR 列表
 * @returns 表格字串
 */
export function formatOversizedMRs(oversizedMRs: OversizedMR[]): string {
  if (oversizedMRs.length === 0) {
    return chalk.green('✓ 沒有找到過大的 MR (L 或 XL)')
  }

  const table = new Table({
    head: [
      chalk.bold('IID'),
      chalk.bold('標題'),
      chalk.bold('作者'),
      chalk.bold('規模'),
      chalk.bold('檔案數'),
      chalk.bold('行數變更'),
    ],
    colWidths: [8, 40, 15, 8, 10, 12],
    wordWrap: true,
  })

  for (const mr of oversizedMRs) {
    // 根據規模類別使用不同顏色
    const categoryColor = mr.category === 'XL' ? chalk.red : chalk.yellow
    const categoryText = categoryColor(mr.category)

    // 標題過長時截斷
    const title = mr.title.length > 37 ? mr.title.substring(0, 34) + '...' : mr.title

    table.push([
      mr.iid.toString(),
      title,
      mr.author,
      categoryText,
      mr.fileCount.toString(),
      mr.totalChanges.toString(),
    ])
  }

  let output = table.toString() + '\n'
  output += '\n' + chalk.dim(`建議: 這些 MR 超出建議規模，考慮在未來將類似工作拆分成更小的 MR`)

  return output
}
