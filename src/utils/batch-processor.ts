/**
 * 並發批次處理工具
 *
 * 提供批次並發執行功能，用於處理大量分支查詢
 * 使用 Promise.allSettled 確保部分失敗不影響整體執行
 *
 * @module utils/batch-processor
 */

/**
 * 批次處理選項
 */
export interface BatchProcessOptions {
  /** 批次大小（預設 10） */
  batchSize?: number
  /** 進度回呼 */
  onProgress?: (processed: number, total: number) => void
  /** 錯誤處理策略 */
  errorHandling?: 'skip' | 'throw'
}

/**
 * 批次處理結果
 */
export interface BatchResult<T> {
  /** 成功的結果 */
  successes: T[]
  /** 失敗的項目（帶錯誤訊息） */
  failures: Array<{ index: number; error: Error }>
  /** 總處理數 */
  total: number
  /** 成功數 */
  successCount: number
  /** 失敗數 */
  failureCount: number
}

/**
 * 批次處理項目清單
 *
 * 將項目分批並發執行，使用 Promise.allSettled 確保部分失敗不影響其他項目
 *
 * @param items - 要處理的項目清單
 * @param processor - 處理函數
 * @param options - 批次處理選項
 * @returns 批次處理結果
 *
 * @example
 * ```typescript
 * const branches = ['feat/a', 'feat/b', 'feat/c']
 * const result = await processBatchItems(
 *   branches,
 *   async (branch) => gitClient.getCommitsBehind(branch),
 *   {
 *     batchSize: 10,
 *     onProgress: (processed, total) => console.log(`${processed}/${total}`)
 *   }
 * )
 * ```
 */
export async function processBatchItems<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: BatchProcessOptions = {}
): Promise<BatchResult<R>> {
  const { batchSize = 10, onProgress, errorHandling = 'skip' } = options

  const successes: R[] = []
  const failures: Array<{ index: number; error: Error }> = []
  let processed = 0

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchStartIndex = i

    // 並發執行批次
    const batchPromises = batch.map((item, batchIndex) =>
      processor(item, batchStartIndex + batchIndex)
    )

    const batchResults = await Promise.allSettled(batchPromises)

    // 處理結果
    batchResults.forEach((result, batchIndex) => {
      const globalIndex = batchStartIndex + batchIndex

      if (result.status === 'fulfilled') {
        successes.push(result.value)
      } else {
        const error =
          result.reason instanceof Error
            ? result.reason
            : new Error(String(result.reason))

        failures.push({ index: globalIndex, error })

        // 若策略為 throw，拋出第一個錯誤
        if (errorHandling === 'throw') {
          throw error
        }
      }
    })

    // 更新進度
    processed += batch.length
    if (onProgress) {
      onProgress(processed, items.length)
    }
  }

  return {
    successes,
    failures,
    total: items.length,
    successCount: successes.length,
    failureCount: failures.length,
  }
}

/**
 * 簡化版批次處理（僅返回成功結果）
 *
 * @param items - 要處理的項目清單
 * @param processor - 處理函數
 * @param options - 批次處理選項
 * @returns 成功結果陣列
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: BatchProcessOptions = {}
): Promise<R[]> {
  const result = await processBatchItems(items, processor, options)
  return result.successes
}
