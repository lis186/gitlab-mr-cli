import Table from 'cli-table3'
import chalk from 'chalk'
import { BranchHealthDetail, HealthStatistics } from '../types/branch-health.js'

/**
 * 分支健康度表格格式化器
 *
 * 根據 specs/003-branch-lifecycle-optimized/spec.md 需求
 * 使用 cli-table3 建立表格輸出，顯示分支生命週期與健康度統計
 */
export class BranchHealthFormatter {
  /**
   * 生命週期天數的顏色閾值
   */
  private static readonly LIFECYCLE_THRESHOLDS = {
    /** 正常（綠色）：< 30 天 */
    NORMAL: 30,
    /** 警告（黃色）：30-60 天 */
    WARNING: 60,
    /** 過時（紅色）：> 60 天 */
    STALE: Number.POSITIVE_INFINITY
  }

  /**
   * 格式化分支健康度表格
   *
   * @param branches - 分支清單
   * @param statistics - 統計資料
   * @param options - 格式化選項
   * @returns 格式化後的表格字串
   */
  format(
    branches: BranchHealthDetail[],
    statistics: HealthStatistics,
    options?: {
      /** 是否顯示 commitsBehind 欄位（--show-stale 時啟用） */
      showCommitsBehind?: boolean
      /** 排序依據欄位（預設：lifecycleDays） */
      sortBy?: keyof BranchHealthDetail
      /** 限制顯示筆數（預設：全部） */
      limit?: number
    }
  ): string {
    const { showCommitsBehind = false, sortBy = 'lifecycleDays', limit } = options || {}

    // 排序分支清單
    const sortedBranches = this.sortBranches(branches, sortBy)
    const displayBranches = limit ? sortedBranches.slice(0, limit) : sortedBranches

    // 建立表格
    const table = this.createTable(showCommitsBehind)

    // 填入分支資料
    for (const branch of displayBranches) {
      table.push(this.formatBranchRow(branch, showCommitsBehind))
    }

    // 組合輸出：表格 + 統計摘要
    const tableOutput = table.toString()
    const statisticsOutput = this.formatStatistics(statistics)

    return `${tableOutput}\n\n${statisticsOutput}`
  }

  /**
   * 建立表格結構
   */
  private createTable(showCommitsBehind: boolean): Table.Table {
    const headers = [
      chalk.bold('分支名稱'),
      chalk.bold('生命週期'),
      chalk.bold('MR 處理'),
      chalk.bold('最後提交'),
      chalk.bold('作者')
    ]

    const colWidths = [40, 12, 12, 15, 20]

    // 如果啟用 --show-stale，新增 commits behind 欄位
    if (showCommitsBehind) {
      headers.push(chalk.bold('落後提交'))
      colWidths.push(12)
    }

    return new Table({
      head: headers,
      colWidths
    })
  }

  /**
   * 格式化單個分支的表格列
   */
  private formatBranchRow(
    branch: BranchHealthDetail,
    showCommitsBehind: boolean
  ): string[] {
    const row = [
      this.truncateBranchName(branch.name),
      this.colorizeLifecycleDays(branch.lifecycleDays),
      this.formatMrProcessingDays(branch.mrProcessingDays),
      this.formatDate(branch.lastCommitDate),
      branch.author
    ]

    // 新增 commits behind（僅在 --show-stale 時）
    if (showCommitsBehind) {
      row.push(this.formatCommitsBehind(branch.commitsBehind))
    }

    return row
  }

  /**
   * 截斷過長的分支名稱
   */
  private truncateBranchName(name: string): string {
    const maxLength = 37
    return name.length > maxLength ? name.substring(0, maxLength) + '...' : name
  }

  /**
   * 根據天數上色生命週期數值
   */
  private colorizeLifecycleDays(days: number): string {
    const daysStr = `${days} 天`

    if (days < BranchHealthFormatter.LIFECYCLE_THRESHOLDS.NORMAL) {
      return chalk.green(daysStr) // 正常（綠色）
    } else if (days < BranchHealthFormatter.LIFECYCLE_THRESHOLDS.WARNING) {
      return chalk.yellow(daysStr) // 警告（黃色）
    } else {
      return chalk.red(daysStr) // 過時（紅色）
    }
  }

  /**
   * 格式化 MR 處理時間
   */
  private formatMrProcessingDays(days: number | null): string {
    if (days === null) {
      return chalk.gray('N/A') // 無 MR 的分支
    }
    return `${days} 天`
  }

  /**
   * 格式化日期（YYYY-MM-DD）
   */
  private formatDate(isoDateString: string): string {
    const date = new Date(isoDateString)
    const formatted = date.toISOString().split('T')[0]
    return formatted || isoDateString
  }

  /**
   * 格式化 commits behind 數值
   */
  private formatCommitsBehind(commits: number | undefined): string {
    if (commits === undefined) {
      return chalk.gray('-') // 未計算
    }
    return commits === 0 ? chalk.green('0') : chalk.yellow(`-${commits}`)
  }

  /**
   * 格式化統計摘要
   */
  private formatStatistics(stats: HealthStatistics): string {
    const lines = [
      chalk.bold.underline('統計摘要'),
      '',
      `總分支數: ${chalk.cyan(stats.totalBranches.toString())}`,
      `過時分支: ${chalk.red(stats.staleBranchCount.toString())} (${this.calcPercentage(stats.staleBranchCount, stats.totalBranches)}%)`,
      '',
      chalk.bold('生命週期分析:'),
      `  平均: ${this.formatDays(stats.avgLifecycleDays)}`,
      `  中位數: ${this.formatDays(stats.medianLifecycleDays)}`,
      `  最大: ${this.formatDays(stats.maxLifecycleDays)}`,
      '',
      chalk.bold('MR 處理時間:'),
      `  平均: ${this.formatDays(stats.avgMrProcessingDays)}`,
      `  中位數: ${this.formatDays(stats.medianMrProcessingDays)}`,
      `  最大: ${this.formatDays(stats.maxMrProcessingDays)}`
    ]

    return lines.join('\n')
  }

  /**
   * 格式化天數統計值（保留 1 位小數）
   */
  private formatDays(days: number): string {
    return chalk.yellow(`${days.toFixed(1)} 天`)
  }

  /**
   * 計算百分比（保留 1 位小數）
   */
  private calcPercentage(part: number, total: number): string {
    if (total === 0) return '0.0'
    return ((part / total) * 100).toFixed(1)
  }

  /**
   * 排序分支清單
   */
  private sortBranches(
    branches: BranchHealthDetail[],
    sortBy: keyof BranchHealthDetail
  ): BranchHealthDetail[] {
    return [...branches].sort((a, b) => {
      const aValue = a[sortBy]
      const bValue = b[sortBy]

      // 處理 null 值（放最後）
      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1

      // 數值排序（降序）
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return bValue - aValue
      }

      // 字串排序（升序）
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue)
      }

      return 0
    })
  }
}
