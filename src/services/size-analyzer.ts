/**
 * MR 規模分析服務
 * Feature: 007-mr-size-analysis
 */

import { GitLabClient } from './gitlab-client.js'
import { MergeRequest } from '../models/merge-request.js'
import {
  MRSizeMetrics,
  SizeDistribution,
  CategoryStats,
  HealthMetrics,
  SizeCategory,
  OversizedMR,
} from '../types/mr-size.js'
import {
  categorizeMRSize,
  HEALTH_GOALS,
  MIN_SAMPLE_SIZE,
  exceedsFileThreshold,
  exceedsLOCThreshold,
} from '../models/size-category.js'
import { calculateTotalChanges } from '../utils/diff-parser.js'
import { processBatchItems } from '../utils/batch-processor.js'

/**
 * MR 規模分析器
 * 負責取得 MR 資料、計算規模、產生統計分析
 */
export class SizeAnalyzer {
  constructor(private gitlabClient: GitLabClient) {}

  /**
   * 分析 MR 列表的規模
   * 批次取得每個 MR 的 diff 並計算規模分類
   *
   * @param mrs - MR 列表
   * @param options - 選項（進度回呼、警告回呼）
   * @returns MR 規模指標列表
   */
  async analyzeMRSizes(
    mrs: MergeRequest[],
    options?: {
      batchSize?: number
      onProgress?: (processed: number, total: number) => void
      onWarning?: (message: string) => void
    }
  ): Promise<MRSizeMetrics[]> {
    const batchSize = options?.batchSize || 10

    // 批次處理 MR，取得每個 MR 的 diff 統計
    const result = await processBatchItems(
      mrs,
      async (mr) => {
        try {
          // 取得 MR 的 diffs
          const diffs = await this.gitlabClient.getMergeRequestDiffs(mr.iid, {
            onWarning: options?.onWarning,
          })

          // 計算行數變更
          const { additions, deletions } = calculateTotalChanges(diffs)

          // 取得檔案數（從 MR 的 changes_count 欄位）
          // 注意：changes_count 可能是字串格式，需要轉換
          const fileCount = parseInt(String(mr.changesCount || 0), 10)

          // 計算總變更行數
          const totalChanges = additions + deletions

          // 分類規模
          const category = categorizeMRSize(fileCount, totalChanges)

          // 建立 MRSizeMetrics
          const sizeMetrics: MRSizeMetrics = {
            iid: mr.iid,
            title: mr.title,
            author: mr.author.name,
            mergedAt: mr.mergedAt!,
            fileCount,
            additions,
            deletions,
            totalChanges,
            category,
            webUrl: mr.webUrl,
          }

          return sizeMetrics
        } catch (error) {
          // 處理單一 MR 失敗的情況
          if (options?.onWarning) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            options.onWarning(`⚠️  無法取得 MR !${mr.iid} 的 diff 資料：${errorMsg}`)
          }
          throw error // 拋出錯誤，讓 batch processor 記錄為失敗
        }
      },
      {
        batchSize,
        onProgress: options?.onProgress,
        errorHandling: 'skip', // 跳過失敗的 MR，繼續處理其他 MR
      }
    )

    // 如果有失敗的項目，顯示警告
    if (result.failures.length > 0 && options?.onWarning) {
      options.onWarning(
        `⚠️  ${result.failures.length} 個 MR 無法取得 diff 資料，已排除於分析之外`
      )
    }

    return result.successes
  }

  /**
   * 計算規模分佈統計
   *
   * @param mrs - MR 規模指標列表
   * @returns 規模分佈統計
   */
  calculateDistribution(mrs: MRSizeMetrics[]): SizeDistribution {
    const total = mrs.length

    // 統計各類別數量
    const categoryCounts = mrs.reduce(
      (acc, mr) => {
        acc[mr.category]++
        return acc
      },
      {
        [SizeCategory.XS]: 0,
        [SizeCategory.S]: 0,
        [SizeCategory.M]: 0,
        [SizeCategory.L]: 0,
        [SizeCategory.XL]: 0,
      } as Record<SizeCategory, number>
    )

    // 計算百分比
    const byCategory = Object.entries(categoryCounts).reduce(
      (acc, [cat, count]) => {
        acc[cat as SizeCategory] = {
          count,
          percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0,
        }
        return acc
      },
      {} as Record<SizeCategory, CategoryStats>
    )

    // 計算健康度指標
    const healthMetrics = this.calculateHealthMetrics(mrs)

    return {
      total,
      byCategory,
      healthMetrics,
    }
  }

  /**
   * 計算團隊健康度指標
   *
   * @param mrs - MR 規模指標列表
   * @returns 健康度指標
   */
  calculateHealthMetrics(mrs: MRSizeMetrics[]): HealthMetrics {
    if (mrs.length === 0) {
      return {
        smallOrLessPercent: 0,
        xlPercent: 0,
        meetsGoals: false,
      }
    }

    const total = mrs.length

    // 計算 XS + S 的數量
    const smallOrLess = mrs.filter(
      (mr) => mr.category === SizeCategory.XS || mr.category === SizeCategory.S
    ).length

    // 計算 XL 的數量
    const xl = mrs.filter((mr) => mr.category === SizeCategory.XL).length

    const smallOrLessPercent = parseFloat(((smallOrLess / total) * 100).toFixed(1))
    const xlPercent = parseFloat(((xl / total) * 100).toFixed(1))

    // 檢查是否達成健康度目標
    const meetsGoals =
      smallOrLessPercent >= HEALTH_GOALS.smallOrLessPercent && xlPercent < HEALTH_GOALS.xlPercent

    return {
      smallOrLessPercent,
      xlPercent,
      meetsGoals,
    }
  }

  /**
   * 篩選過大的 MR（L 和 XL 類別）
   *
   * @param mrs - MR 規模指標列表
   * @returns 過大 MR 列表（按規模排序：XL > L，同類別內按行數降序）
   */
  filterOversizedMRs(mrs: MRSizeMetrics[]): OversizedMR[] {
    return mrs
      .filter((mr) => mr.category === SizeCategory.L || mr.category === SizeCategory.XL)
      .map((mr) => ({
        iid: mr.iid,
        title: mr.title,
        author: mr.author,
        category: mr.category as 'L' | 'XL',
        fileCount: mr.fileCount,
        totalChanges: mr.totalChanges,
        exceedsFileThreshold: exceedsFileThreshold(mr.fileCount, mr.category as 'L' | 'XL'),
        exceedsLOCThreshold: exceedsLOCThreshold(mr.totalChanges, mr.category as 'L' | 'XL'),
        webUrl: mr.webUrl,
      }))
      .sort((a, b) => {
        // 先按類別排序（XL > L）
        if (a.category !== b.category) {
          return a.category === 'XL' ? -1 : 1
        }
        // 同類別內按總變更行數排序（大到小）
        return b.totalChanges - a.totalChanges
      })
  }

  /**
   * 檢查樣本數是否不足
   *
   * @param count - MR 數量
   * @returns 是否樣本數不足
   */
  hasLowSample(count: number): boolean {
    return count < MIN_SAMPLE_SIZE
  }
}
