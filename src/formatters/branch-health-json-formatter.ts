import { BranchHealthOutput } from '../types/branch-health.js'

/**
 * Branch Health JSON 格式化器
 *
 * 將分支健康度分析結果格式化為 JSON 輸出，符合規格定義的結構
 * 參考：specs/003-branch-lifecycle-optimized/spec.md § JSON 輸出結構
 */
export class BranchHealthJsonFormatter {
  /**
   * 格式化分支健康度輸出為 JSON
   *
   * @param output - 分支健康度完整輸出
   * @returns 格式化後的 JSON 字串
   */
  format(output: BranchHealthOutput): string {
    // 建構符合規格的 JSON 結構
    const formattedOutput = {
      metadata: {
        command: output.metadata.command,
        project: output.metadata.project,
        timestamp: output.metadata.timestamp,
        executionTime: output.metadata.executionTime,
        optimization: output.metadata.optimization
      },
      statistics: {
        totalBranches: output.statistics.totalBranches,
        averageLifecycleDays: this.roundToOneDecimal(output.statistics.avgLifecycleDays),
        medianLifecycleDays: this.roundToOneDecimal(output.statistics.medianLifecycleDays),
        maxLifecycleDays: this.roundToOneDecimal(output.statistics.maxLifecycleDays),
        averageMrProcessingDays: this.roundToOneDecimal(output.statistics.avgMrProcessingDays),
        medianMrProcessingDays: this.roundToOneDecimal(output.statistics.medianMrProcessingDays),
        maxMrProcessingDays: this.roundToOneDecimal(output.statistics.maxMrProcessingDays)
      },
      branches: output.branches.map(branch => ({
        name: branch.name,
        lifecycleDays: this.roundToOneDecimal(branch.lifecycleDays),
        mrProcessingDays: branch.mrProcessingDays !== null
          ? this.roundToOneDecimal(branch.mrProcessingDays)
          : null,
        lastCommitDate: branch.lastCommitDate, // 已為 ISO 8601 格式
        ...(branch.commitsBehind !== undefined && { commitsBehind: branch.commitsBehind }),
        author: branch.author,
        mrId: branch.mrId
      }))
    }

    // 加入可選的進階分析結果
    if (output.staleBranches) {
      Object.assign(formattedOutput, {
        staleBranches: output.staleBranches.map(branch => ({
          name: branch.name,
          lifecycleDays: this.roundToOneDecimal(branch.lifecycleDays),
          mrProcessingDays: branch.mrProcessingDays !== null
            ? this.roundToOneDecimal(branch.mrProcessingDays)
            : null,
          lastCommitDate: branch.lastCommitDate,
          commitsBehind: branch.commitsBehind,
          author: branch.author,
          mrId: branch.mrId
        }))
      })
    }

    if (output.namingCompliance) {
      Object.assign(formattedOutput, {
        namingCompliance: {
          pattern: output.namingCompliance.pattern,
          compliant: output.namingCompliance.compliant,
          nonCompliant: output.namingCompliance.nonCompliant,
          complianceRate: this.roundToOneDecimal(output.namingCompliance.complianceRate)
        }
      })
    }

    if (output.periodComparison) {
      Object.assign(formattedOutput, {
        periodComparison: {
          period1: {
            label: output.periodComparison.period1.label,
            startDate: output.periodComparison.period1.startDate.toISOString(),
            endDate: output.periodComparison.period1.endDate.toISOString(),
            totalBranches: output.periodComparison.period1.totalBranches,
            avgLifecycleDays: this.roundToOneDecimal(output.periodComparison.period1.avgLifecycleDays),
            medianLifecycleDays: this.roundToOneDecimal(output.periodComparison.period1.medianLifecycleDays),
            maxLifecycleDays: this.roundToOneDecimal(output.periodComparison.period1.maxLifecycleDays),
            avgMrProcessingDays: this.roundToOneDecimal(output.periodComparison.period1.avgMrProcessingDays)
          },
          period2: {
            label: output.periodComparison.period2.label,
            startDate: output.periodComparison.period2.startDate.toISOString(),
            endDate: output.periodComparison.period2.endDate.toISOString(),
            totalBranches: output.periodComparison.period2.totalBranches,
            avgLifecycleDays: this.roundToOneDecimal(output.periodComparison.period2.avgLifecycleDays),
            medianLifecycleDays: this.roundToOneDecimal(output.periodComparison.period2.medianLifecycleDays),
            maxLifecycleDays: this.roundToOneDecimal(output.periodComparison.period2.maxLifecycleDays),
            avgMrProcessingDays: this.roundToOneDecimal(output.periodComparison.period2.avgMrProcessingDays)
          },
          changes: {
            avgLifecycleDaysChange: this.roundToOneDecimal(output.periodComparison.changes.avgLifecycleDaysChange),
            avgLifecycleTrend: output.periodComparison.changes.avgLifecycleTrend,
            medianLifecycleDaysChange: this.roundToOneDecimal(output.periodComparison.changes.medianLifecycleDaysChange),
            totalBranchesChange: output.periodComparison.changes.totalBranchesChange
          }
        }
      })
    }

    // 使用 JSON.stringify 格式化，縮排 2 格
    return JSON.stringify(formattedOutput, null, 2)
  }

  /**
   * 四捨五入至小數點後 1 位
   *
   * @param value - 原始數值
   * @returns 四捨五入後的數值
   */
  private roundToOneDecimal(value: number): number {
    return Math.round(value * 10) / 10
  }
}
