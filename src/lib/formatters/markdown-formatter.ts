/**
 * Release Analysis Markdown Formatter
 *
 * 將發布品質分析結果格式化為 Markdown 輸出
 *
 * @module lib/formatters/markdown-formatter
 */

import type {
  IOutputFormatter,
  FormatterInput,
  JsonRelease,
  JsonMetrics,
  JsonTrends,
  MarkdownTable,
} from '../../types/release-output.js'

/**
 * Markdown Formatter 實作
 *
 * 格式化發布品質分析結果為 Markdown 輸出（文件友善格式）
 */
export class MarkdownFormatter implements IOutputFormatter {
  private readonly includeToc: boolean
  private readonly includeBadges: boolean

  /**
   * 建立 Markdown 格式化器
   *
   * @param options - 格式化選項
   * @param options.includeToc - 是否包含目錄（預設 false）
   * @param options.includeBadges - 是否使用 badges（預設 false）
   */
  constructor(options: { includeToc?: boolean; includeBadges?: boolean } = {}) {
    this.includeToc = options.includeToc ?? false
    this.includeBadges = options.includeBadges ?? false
  }

  /**
   * 格式化日期為 YYYY-MM-DD
   */
  private formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toISOString().split('T')[0] || dateString
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
   * 建立 Markdown 表格
   */
  private createTable(table: MarkdownTable): string {
    const output: string[] = []

    // 標題列
    output.push(`| ${table.headers.join(' | ')} |`)

    // 分隔列
    const alignments = table.alignment || table.headers.map(() => 'left' as const)
    const separators = alignments.map((align) => {
      if (align === 'center') return ':---:'
      if (align === 'right') return '---:'
      return '---'
    })
    output.push(`| ${separators.join(' | ')} |`)

    // 資料列
    for (const row of table.rows) {
      output.push(`| ${row.join(' | ')} |`)
    }

    return output.join('\n')
  }

  /**
   * 建立健康度 badge
   */
  private createHealthBadge(level: 'healthy' | 'warning' | 'critical'): string {
    if (!this.includeBadges) {
      const text = { healthy: '✓ 健康', warning: '⚠ 警告', critical: '✗ 警戒' }[level]
      return text
    }

    const color = { healthy: 'green', warning: 'yellow', critical: 'red' }[level]
    const text = { healthy: '健康', warning: '警告', critical: '警戒' }[level]
    return `![${text}](https://img.shields.io/badge/${text}-${color})`
  }

  /**
   * 建立 DORA 等級 badge
   */
  private createDoraBadge(level: 'elite' | 'high' | 'medium' | 'low'): string {
    if (!this.includeBadges) {
      const emoji = { elite: '🏆', high: '⭐', medium: '📊', low: '📉' }[level]
      return `${emoji} ${level.toUpperCase()}`
    }

    const color = { elite: 'purple', high: 'green', medium: 'yellow', low: 'red' }[level]
    return `![DORA ${level}](https://img.shields.io/badge/DORA-${level}-${color})`
  }

  /**
   * 建立趨勢 badge
   */
  private createTrendBadge(direction: 'improving' | 'stable' | 'degrading'): string {
    const symbol = { improving: '↗', stable: '→', degrading: '↘' }[direction]
    const text = { improving: '改善中', stable: '穩定', degrading: '惡化中' }[direction]

    if (!this.includeBadges) {
      return `${symbol} ${text}`
    }

    const color = { improving: 'green', stable: 'gray', degrading: 'red' }[direction]
    return `![${text}](https://img.shields.io/badge/${text}-${color})`
  }

  /**
   * 格式化完整分析輸出
   */
  format(data: FormatterInput): string {
    const output: string[] = []

    // 標題
    output.push('# 發布品質與準備度分析報告\n')

    // 目錄（如果需要）
    if (this.includeToc) {
      output.push('## 目錄\n')
      output.push('- [元資料](#元資料)')
      output.push('- [發布列表](#發布列表)')
      output.push('- [指標摘要](#指標摘要)')
      if (data.trends) {
        output.push('- [趨勢分析](#趨勢分析)')
      }
      output.push('')
    }

    // 元資料
    output.push('## 元資料\n')
    output.push(`- **專案**：${data.metadata.project}`)
    output.push(`- **分析時間**：${this.formatDate(data.metadata.analyzed_at)}`)
    output.push(
      `- **時間範圍**：${this.formatDate(data.metadata.time_range.since)} 至 ${this.formatDate(data.metadata.time_range.until)}`
    )
    output.push(
      `- **配置來源**：${data.metadata.config_source}${data.metadata.config_name ? ` (${data.metadata.config_name})` : ''}`
    )
    if (data.metadata.tool_version) {
      output.push(`- **工具版本**：${data.metadata.tool_version}`)
    }
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

    // 頁尾
    output.push('---\n')
    output.push(`*報告產生時間：${new Date().toISOString()}*`)

    return output.join('\n')
  }

  /**
   * 格式化發布列表
   */
  formatReleases(releases: JsonRelease[]): string {
    const output: string[] = []

    output.push('## 發布列表\n')

    if (releases.length === 0) {
      output.push('⚠ 未找到符合條件的發布\n')
      return output.join('\n')
    }

    const table: MarkdownTable = {
      headers: ['發布標籤', '發布時間', '類型', 'MR 數量', 'LOC 變更', '凍結期', '健康度'],
      rows: releases.map((release) => [
        release.tag,
        this.formatDate(release.date),
        release.type,
        release.mr_count.toString(),
        `+${(release.loc_additions + release.loc_deletions).toLocaleString()}`,
        `${release.freeze_days} 天`,
        this.createHealthBadge(release.health_level),
      ]),
      alignment: ['left', 'center', 'center', 'right', 'right', 'right', 'center'],
    }

    output.push(this.createTable(table))

    return output.join('\n')
  }

  /**
   * 格式化指標摘要
   */
  formatMetrics(metrics: JsonMetrics): string {
    const output: string[] = []

    output.push('## 指標摘要\n')

    // 1. 發布批量
    output.push('### 1. 發布批量 (Batch Size)\n')
    const batchTable: MarkdownTable = {
      headers: ['指標', '數值', '等級'],
      rows: [
        [
          '平均 MR 數量',
          metrics.batch_size.average_mr_count.toFixed(1),
          this.createHealthBadge(metrics.batch_size.level),
        ],
        ['平均 LOC 變更', metrics.batch_size.average_loc_changes.toFixed(0), ''],
      ],
      alignment: ['left', 'right', 'center'],
    }
    output.push(this.createTable(batchTable))
    output.push(`\n**建議**：${metrics.batch_size.recommendation}\n`)

    // 2. 主幹可部署性
    output.push('### 2. 主幹可部署性 (Trunk Health)\n')
    const trunkLevelText = {
      elite: 'Elite',
      good: '良好',
      'needs-improvement': '需改善',
    }[metrics.trunk_health.level]
    const trunkTable: MarkdownTable = {
      headers: ['指標', '數值', '等級'],
      rows: [
        [
          'Pipeline 成功率',
          this.formatPercentage(metrics.trunk_health.pipeline_success_rate),
          trunkLevelText,
        ],
        ['平均修復時間 (MTTR)', this.formatHours(metrics.trunk_health.mean_time_to_fix_hours), ''],
        ['中斷期數', metrics.trunk_health.broken_periods_count.toString(), ''],
        ['總中斷時長', this.formatHours(metrics.trunk_health.total_broken_hours), ''],
      ],
      alignment: ['left', 'right', 'center'],
    }
    output.push(this.createTable(trunkTable))
    output.push('')

    // 3. 整合頻率
    output.push('### 3. 整合頻率 (Integration Frequency)\n')
    const integrationTable: MarkdownTable = {
      headers: ['指標', '數值', 'DORA 等級'],
      rows: [
        [
          '總合併次數',
          metrics.integration_frequency.total_merges.toString(),
          this.createDoraBadge(metrics.integration_frequency.dora_level),
        ],
        ['每日平均合併次數', metrics.integration_frequency.daily_average.toFixed(2), ''],
        [
          '月底集中合併反模式',
          metrics.integration_frequency.has_end_of_month_pattern ? '✗ 是' : '✓ 否',
          '',
        ],
      ],
      alignment: ['left', 'right', 'center'],
    }
    output.push(this.createTable(integrationTable))
    output.push('')

    // 4. 發布準備度（如果有）
    if (metrics.release_readiness) {
      output.push('### 4. 發布準備度 (Release Readiness)\n')
      const readinessTable: MarkdownTable = {
        headers: ['指標', '數值', '狀態'],
        rows: [
          [
            '準備度評分',
            `${metrics.release_readiness.readiness_score}/100`,
            metrics.release_readiness.is_ready ? '✓ 就緒' : '⚠ 未就緒',
          ],
          ['待合併 MR 數量', metrics.release_readiness.pending_mr_count.toString(), ''],
          [
            '待合併 LOC 變更',
            metrics.release_readiness.pending_loc_changes.toLocaleString(),
            '',
          ],
          [
            'Pipeline 狀態',
            metrics.release_readiness.pipeline_status === 'passing' ? '✓ 通過' : '✗ 失敗',
            '',
          ],
          ['阻擋問題數量', metrics.release_readiness.blocking_issues_count.toString(), ''],
        ],
        alignment: ['left', 'right', 'center'],
      }
      output.push(this.createTable(readinessTable))
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

    output.push('## 趨勢分析\n')

    const trendTable: MarkdownTable = {
      headers: ['指標', '趨勢', '變化幅度', '當前值'],
      rows: [],
      alignment: ['left', 'center', 'right', 'right'],
    }

    // 發布批量趨勢
    const batchCurrent = trends.batch_size.values[trends.batch_size.values.length - 1]
    if (batchCurrent !== undefined) {
      trendTable.rows.push([
        '發布批量',
        this.createTrendBadge(trends.batch_size.direction),
        `${trends.batch_size.change_percentage > 0 ? '+' : ''}${trends.batch_size.change_percentage.toFixed(1)}%`,
        batchCurrent.toFixed(1),
      ])
    }

    // 整合頻率趨勢
    const integrationCurrent =
      trends.integration_frequency.values[trends.integration_frequency.values.length - 1]
    if (integrationCurrent !== undefined) {
      trendTable.rows.push([
        '整合頻率',
        this.createTrendBadge(trends.integration_frequency.direction),
        `${trends.integration_frequency.change_percentage > 0 ? '+' : ''}${trends.integration_frequency.change_percentage.toFixed(1)}%`,
        integrationCurrent.toFixed(2),
      ])
    }

    // 主幹健康度趨勢（如果有）
    if (trends.trunk_health) {
      const trunkCurrent = trends.trunk_health.values[trends.trunk_health.values.length - 1]
      if (trunkCurrent !== undefined) {
        trendTable.rows.push([
          '主幹健康度',
          this.createTrendBadge(trends.trunk_health.direction),
          `${trends.trunk_health.change_percentage > 0 ? '+' : ''}${trends.trunk_health.change_percentage.toFixed(1)}%`,
          this.formatPercentage(trunkCurrent),
        ])
      }
    }

    output.push(this.createTable(trendTable))
    output.push('')

    // 整體評估
    const overallSymbol = { improving: '↗', stable: '→', degrading: '↘' }[
      trends.overall_assessment
    ]
    const overallText = { improving: '改善中', stable: '穩定', degrading: '惡化中' }[
      trends.overall_assessment
    ]

    output.push(`**整體評估**：${overallSymbol} ${overallText}`)

    return output.join('\n')
  }
}
