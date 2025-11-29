/**
 * Release Analysis Table Formatter
 *
 * 使用 cli-table3 將發布品質分析結果格式化為終端表格輸出
 *
 * @module lib/formatters/table-formatter
 */

import Table from 'cli-table3'
import chalk from 'chalk'
import type {
  IOutputFormatter,
  FormatterInput,
  JsonRelease,
  JsonMetrics,
  JsonTrends,
} from '../../types/release-output.js'

/**
 * 健康度等級顏色映射
 */
const healthColors = {
  healthy: chalk.green,
  warning: chalk.yellow,
  critical: chalk.red,
  elite: chalk.magenta,
  high: chalk.green,
  medium: chalk.yellow,
  low: chalk.red,
  good: chalk.cyan,
  'needs-improvement': chalk.red,
} as const

/**
 * 健康度等級符號映射
 */
const healthSymbols = {
  healthy: '✓',
  warning: '⚠',
  critical: '✗',
  elite: '🏆',
  high: '⭐',
  medium: '📊',
  low: '📉',
} as const

/**
 * 趨勢方向符號映射
 */
const trendSymbols = {
  improving: '↗',
  stable: '→',
  degrading: '↘',
} as const

/**
 * 趨勢方向顏色映射
 */
const trendColors = {
  improving: chalk.green,
  stable: chalk.gray,
  degrading: chalk.red,
} as const

/**
 * Table Formatter 實作
 *
 * 格式化發布品質分析結果為終端表格輸出
 */
export class TableFormatter implements IOutputFormatter {
  /**
   * 格式化日期為 YYYY-MM-DD
   */
  private formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toISOString().split('T')[0] || dateString
  }

  /**
   * 格式化 LOC 變更（顯示千位分隔符）
   */
  private formatLOC(additions: number, deletions: number): string {
    const total = additions + deletions
    const sign = additions > deletions ? '+' : ''
    return `${sign}${total.toLocaleString()}`
  }

  /**
   * 格式化健康度等級（帶顏色與符號）
   */
  private formatHealth(level: 'healthy' | 'warning' | 'critical'): string {
    const color = healthColors[level]
    const symbol = healthSymbols[level]
    const text = {
      healthy: '健康',
      warning: '警告',
      critical: '警戒',
    }[level]
    return color(`${symbol} ${text}`)
  }

  /**
   * 格式化 DORA 等級（帶顏色與符號）
   */
  private formatDoraLevel(level: 'elite' | 'high' | 'medium' | 'low'): string {
    const color = healthColors[level]
    const symbol = healthSymbols[level]
    const text = {
      elite: 'Elite',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    }[level]
    return color(`${symbol} ${text}`)
  }

  /**
   * 格式化主幹健康度等級
   */
  private formatTrunkLevel(level: 'elite' | 'good' | 'needs-improvement'): string {
    const color = healthColors[level]
    const text = {
      elite: 'Elite',
      good: '良好',
      'needs-improvement': '需改善',
    }[level]
    return color(text)
  }

  /**
   * 格式化趨勢方向（帶顏色與符號）
   */
  private formatTrend(direction: 'improving' | 'stable' | 'degrading'): string {
    const color = trendColors[direction]
    const symbol = trendSymbols[direction]
    const text = {
      improving: '改善中',
      stable: '穩定',
      degrading: '惡化中',
    }[direction]
    return color(`${symbol} ${text}`)
  }

  /**
   * 格式化百分比
   */
  private formatPercentage(value: number): string {
    return `${(value * 100).toFixed(1)}%`
  }

  /**
   * 格式化小時數
   */
  private formatHours(hours: number): string {
    if (hours < 1) {
      return `${Math.round(hours * 60)} 分鐘`
    }
    return `${hours.toFixed(1)} 小時`
  }

  /**
   * 格式化完整分析輸出
   */
  format(data: FormatterInput): string {
    const output: string[] = []

    // 標題
    output.push(chalk.bold.cyan('\n📊 發布品質與準備度分析\n'))

    // 元資料
    output.push(`專案：${chalk.bold(data.metadata.project)}`)
    output.push(
      `分析時間：${this.formatDate(data.metadata.analyzed_at)}`
    )
    output.push(
      `時間範圍：${this.formatDate(data.metadata.time_range.since)} 至 ${this.formatDate(data.metadata.time_range.until)}`
    )
    output.push(
      `配置來源：${data.metadata.config_source}${data.metadata.config_name ? ` (${data.metadata.config_name})` : ''}`
    )
    output.push('')

    // 發布列表
    output.push(this.formatReleases(data.releases))
    output.push('')

    // 指標摘要
    output.push(this.formatMetrics(data.metrics))
    output.push('')

    // 趨勢分析（如果有）
    if (data.trends) {
      output.push(this.formatTrends(data.trends))
      output.push('')
    }

    return output.join('\n')
  }

  /**
   * 格式化發布列表
   */
  formatReleases(releases: JsonRelease[]): string {
    if (releases.length === 0) {
      return chalk.yellow('⚠ 未找到符合條件的發布')
    }

    const table = new Table({
      head: [
        chalk.bold('發布標籤'),
        chalk.bold('發布時間'),
        chalk.bold('類型'),
        chalk.bold('MR 數量'),
        chalk.bold('LOC 變更'),
        chalk.bold('凍結期'),
        chalk.bold('健康度'),
      ],
      colWidths: [20, 12, 12, 10, 12, 10, 12],
    })

    for (const release of releases) {
      table.push([
        release.tag,
        this.formatDate(release.date),
        release.type,
        release.mr_count.toString(),
        this.formatLOC(release.loc_additions, release.loc_deletions),
        `${release.freeze_days} 天`,
        this.formatHealth(release.health_level),
      ])
    }

    const output: string[] = []
    output.push(chalk.bold.cyan('發布列表：\n'))
    output.push(table.toString())
    return output.join('\n')
  }

  /**
   * 格式化指標摘要
   */
  formatMetrics(metrics: JsonMetrics): string {
    const output: string[] = []

    output.push(chalk.bold.cyan('指標摘要：\n'))

    // 發布批量指標
    output.push(chalk.bold('1. 發布批量 (Batch Size)'))
    const batchTable = new Table({
      head: [chalk.bold('指標'), chalk.bold('數值'), chalk.bold('等級')],
      colWidths: [25, 15, 15],
    })
    batchTable.push([
      '平均 MR 數量',
      metrics.batch_size.average_mr_count.toFixed(1),
      this.formatHealth(metrics.batch_size.level),
    ])
    batchTable.push([
      '平均 LOC 變更',
      metrics.batch_size.average_loc_changes.toFixed(0),
      '',
    ])
    output.push(batchTable.toString())
    output.push(chalk.gray(`   建議：${metrics.batch_size.recommendation}`))
    output.push('')

    // 主幹可部署性指標
    output.push(chalk.bold('2. 主幹可部署性 (Trunk Health)'))
    const trunkTable = new Table({
      head: [chalk.bold('指標'), chalk.bold('數值'), chalk.bold('等級')],
      colWidths: [25, 15, 15],
    })
    trunkTable.push([
      'Pipeline 成功率',
      this.formatPercentage(metrics.trunk_health.pipeline_success_rate),
      this.formatTrunkLevel(metrics.trunk_health.level),
    ])
    trunkTable.push([
      '平均修復時間 (MTTR)',
      this.formatHours(metrics.trunk_health.mean_time_to_fix_hours),
      '',
    ])
    trunkTable.push([
      '中斷期數',
      metrics.trunk_health.broken_periods_count.toString(),
      '',
    ])
    trunkTable.push([
      '總中斷時長',
      this.formatHours(metrics.trunk_health.total_broken_hours),
      '',
    ])
    output.push(trunkTable.toString())
    output.push('')

    // 整合頻率指標
    output.push(chalk.bold('3. 整合頻率 (Integration Frequency)'))
    const integrationTable = new Table({
      head: [chalk.bold('指標'), chalk.bold('數值'), chalk.bold('DORA 等級')],
      colWidths: [25, 15, 15],
    })
    integrationTable.push([
      '總合併次數',
      metrics.integration_frequency.total_merges.toString(),
      this.formatDoraLevel(metrics.integration_frequency.dora_level),
    ])
    integrationTable.push([
      '每日平均合併次數',
      metrics.integration_frequency.daily_average.toFixed(2),
      '',
    ])
    integrationTable.push([
      '月底集中合併反模式',
      metrics.integration_frequency.has_end_of_month_pattern ? chalk.red('✗ 是') : chalk.green('✓ 否'),
      '',
    ])
    output.push(integrationTable.toString())
    output.push('')

    // 發布準備度指標（如果有）
    if (metrics.release_readiness) {
      output.push(chalk.bold('4. 發布準備度 (Release Readiness)'))
      const readinessTable = new Table({
        head: [chalk.bold('指標'), chalk.bold('數值'), chalk.bold('狀態')],
        colWidths: [25, 15, 15],
      })
      readinessTable.push([
        '準備度評分',
        `${metrics.release_readiness.readiness_score}/100`,
        metrics.release_readiness.is_ready ? chalk.green('✓ 就緒') : chalk.yellow('⚠ 未就緒'),
      ])
      readinessTable.push([
        '待合併 MR 數量',
        metrics.release_readiness.pending_mr_count.toString(),
        '',
      ])
      readinessTable.push([
        '待合併 LOC 變更',
        metrics.release_readiness.pending_loc_changes.toLocaleString(),
        '',
      ])
      readinessTable.push([
        'Pipeline 狀態',
        metrics.release_readiness.pipeline_status === 'passing'
          ? chalk.green('✓ 通過')
          : chalk.red('✗ 失敗'),
        '',
      ])
      readinessTable.push([
        '阻擋問題數量',
        metrics.release_readiness.blocking_issues_count.toString(),
        '',
      ])
      output.push(readinessTable.toString())
      output.push('')
    }

    return output.join('\n')
  }

  /**
   * 格式化趨勢分析
   */
  formatTrends(trends: JsonTrends | undefined): string {
    if (!trends) {
      return ''
    }

    const output: string[] = []

    output.push(chalk.bold.cyan('趨勢分析：\n'))

    const trendTable = new Table({
      head: [chalk.bold('指標'), chalk.bold('趨勢'), chalk.bold('變化幅度'), chalk.bold('當前值')],
      colWidths: [25, 15, 15, 15],
    })

    // 發布批量趨勢
    const batchCurrent = trends.batch_size.values[trends.batch_size.values.length - 1]
    if (batchCurrent !== undefined) {
      trendTable.push([
        '發布批量',
        this.formatTrend(trends.batch_size.direction),
        `${trends.batch_size.change_percentage > 0 ? '+' : ''}${trends.batch_size.change_percentage.toFixed(1)}%`,
        batchCurrent.toFixed(1),
      ])
    }

    // 整合頻率趨勢
    const integrationCurrent =
      trends.integration_frequency.values[trends.integration_frequency.values.length - 1]
    if (integrationCurrent !== undefined) {
      trendTable.push([
        '整合頻率',
        this.formatTrend(trends.integration_frequency.direction),
        `${trends.integration_frequency.change_percentage > 0 ? '+' : ''}${trends.integration_frequency.change_percentage.toFixed(1)}%`,
        integrationCurrent.toFixed(2),
      ])
    }

    // 主幹健康度趨勢（如果有）
    if (trends.trunk_health) {
      const trunkCurrent = trends.trunk_health.values[trends.trunk_health.values.length - 1]
      if (trunkCurrent !== undefined) {
        trendTable.push([
          '主幹健康度',
          this.formatTrend(trends.trunk_health.direction),
          `${trends.trunk_health.change_percentage > 0 ? '+' : ''}${trends.trunk_health.change_percentage.toFixed(1)}%`,
          this.formatPercentage(trunkCurrent),
        ])
      }
    }

    output.push(trendTable.toString())
    output.push('')

    // 整體評估
    const overallColor =
      trends.overall_assessment === 'improving'
        ? chalk.green
        : trends.overall_assessment === 'degrading'
          ? chalk.red
          : chalk.gray

    const overallSymbol =
      trends.overall_assessment === 'improving'
        ? '↗'
        : trends.overall_assessment === 'degrading'
          ? '↘'
          : '→'

    const overallText = {
      improving: '改善中',
      stable: '穩定',
      degrading: '惡化中',
    }[trends.overall_assessment]

    output.push(
      `${chalk.bold('整體評估：')}${overallColor(`${overallSymbol} ${overallText}`)}`
    )

    return output.join('\n')
  }
}
