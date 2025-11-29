/**
 * 時間計算工具函數
 *
 * 提供時間差計算、格式化等功能，用於 MR 週期時間分析
 *
 * @module utils/time-utils
 */

import { AppError, ErrorType } from '../models/error.js'

/**
 * 計算兩個時間戳之間的小時差
 *
 * @param startTime - 開始時間（ISO 8601 格式）
 * @param endTime - 結束時間（ISO 8601 格式）
 * @returns 小時差（保留兩位小數）
 *
 * @example
 * ```typescript
 * const hours = calculateHours('2025-10-20T10:00:00Z', '2025-10-20T14:30:00Z')
 * // hours = 4.5
 * ```
 */
export function calculateHours(startTime: string, endTime: string): number {
  const start = new Date(startTime)
  const end = new Date(endTime)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('無效的時間格式')
  }

  if (end < start) {
    throw new Error('結束時間不可早於開始時間')
  }

  const milliseconds = end.getTime() - start.getTime()
  const hours = milliseconds / (1000 * 60 * 60)

  return Math.round(hours * 100) / 100 // 保留兩位小數
}

/**
 * 格式化小時數為人類可讀的字串
 *
 * @param hours - 小時數
 * @returns 格式化字串（例如：「4.5h」、「2d 3h」）
 *
 * @example
 * ```typescript
 * formatDuration(4.5)    // '4.5h'
 * formatDuration(28)     // '1d 4h'
 * formatDuration(168)    // '1w'
 * ```
 */
export function formatDuration(hours: number): string {
  if (hours < 0) {
    throw new Error('小時數不可為負值')
  }

  // 小於 24 小時，直接顯示小時
  if (hours < 24) {
    return `${hours.toFixed(1)}h`
  }

  // 24-168 小時（1-7 天），顯示「天 + 小時」
  if (hours < 168) {
    const days = Math.floor(hours / 24)
    const remainingHours = Math.round(hours % 24)

    if (remainingHours === 0) {
      return `${days}d`
    }
    return `${days}d ${remainingHours}h`
  }

  // 大於等於 168 小時（7 天），顯示「週」
  const weeks = Math.floor(hours / 168)
  const remainingDays = Math.round((hours % 168) / 24)

  if (remainingDays === 0) {
    return `${weeks}w`
  }
  return `${weeks}w ${remainingDays}d`
}

/**
 * 將日期轉換為 YYYY-MM-DD 格式
 *
 * @param date - 日期物件或 ISO 字串
 * @returns YYYY-MM-DD 格式字串
 *
 * @example
 * ```typescript
 * formatDate(new Date('2025-10-26T10:30:00Z'))
 * // '2025-10-26'
 * ```
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date

  if (isNaN(d.getTime())) {
    throw new Error('無效的日期格式')
  }

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * 計算日期範圍（預設為過去 N 天）
 *
 * @param days - 天數（預設 30）
 * @returns 開始日期與結束日期
 *
 * @example
 * ```typescript
 * const { since, until } = getDateRange(30)
 * // since: 30 天前的日期
 * // until: 今天
 * ```
 */
export function getDateRange(days: number = 30): { since: string; until: string } {
  const until = new Date()
  const since = new Date()
  since.setDate(since.getDate() - days)

  return {
    since: formatDate(since),
    until: formatDate(until),
  }
}

/**
 * 將日期字串正規化為完整的 UTC 日期物件
 *
 * 確保日期字串（YYYY-MM-DD 格式）被正確解析為涵蓋完整一天的時間範圍：
 * - start: 當天開始時間（00:00:00.000Z）
 * - end: 當天結束時間（23:59:59.999Z）
 *
 * 這解決了使用 `new Date('YYYY-MM-DD')` 時只會取得當天 00:00:00 的問題，
 * 導致查詢當天或日期範圍時遺漏大部分資料。
 *
 * **重要**: 所有日期都以 UTC 時區處理，確保跨時區一致性
 *
 * @param dateStr - 日期字串（格式：YYYY-MM-DD，UTC 時區）
 * @param type - 日期類型：'start'（開始時間）或 'end'（結束時間）
 * @returns Date 物件（UTC 時區）
 * @throws {AppError} 當日期字串為空、格式無效或日期無效時
 *
 * @example
 * ```typescript
 * // 查詢 2025-11-05 當天的資料
 * const since = normalizeDateString('2025-11-05', 'start')
 * // => 2025-11-05T00:00:00.000Z
 *
 * const until = normalizeDateString('2025-11-05', 'end')
 * // => 2025-11-05T23:59:59.999Z
 *
 * // 時間窗口：24 小時（而非 0 毫秒）
 * ```
 */
export function normalizeDateString(dateStr: string, type: 'start' | 'end'): Date {
  if (!dateStr) {
    throw new AppError(
      ErrorType.INVALID_INPUT,
      '日期字串不可為空'
    )
  }

  // 移除可能已存在的時間部分（如果有的話）
  const dateOnly = dateStr.split('T')[0]!

  // 驗證日期格式（YYYY-MM-DD）
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new AppError(
      ErrorType.INVALID_INPUT,
      `無效的日期格式: ${dateStr}（預期格式：YYYY-MM-DD）`
    )
  }

  // 提取原始輸入的年、月、日
  const [inputYear, inputMonth, inputDay] = dateOnly.split('-').map(Number)

  // 先用 00:00:00.000Z 驗證日期是否有效（避免 23:59:59.999Z 滾動到下一天）
  const testDate = new Date(`${dateOnly}T00:00:00.000Z`)

  // 驗證日期是否有效
  if (isNaN(testDate.getTime())) {
    throw new AppError(
      ErrorType.INVALID_INPUT,
      `無效的日期: ${dateStr}`
    )
  }

  // 驗證日期沒有被自動調整（例如 2025-02-30 → 2025-03-02）
  if (
    testDate.getUTCFullYear() !== inputYear ||
    testDate.getUTCMonth() + 1 !== inputMonth ||  // getUTCMonth() 返回 0-11
    testDate.getUTCDate() !== inputDay
  ) {
    throw new AppError(
      ErrorType.INVALID_INPUT,
      `無效的日期: ${dateStr}（日期不存在或超出範圍）`
    )
  }

  // 日期有效後，根據類型附加適當的時間
  const timeStr = type === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z'
  const fullDateStr = dateOnly + timeStr
  const date = new Date(fullDateStr)

  return date
}

/**
 * 驗證日期範圍的有效性
 *
 * 確保開始日期不晚於結束日期，避免無效的查詢範圍。
 * 內部使用 normalizeDateString 進行日期解析，因此也會驗證日期格式和有效性。
 *
 * **重要**: 所有日期都以 UTC 時區處理
 *
 * @param sinceStr - 開始日期字串（格式：YYYY-MM-DD，UTC 時區）
 * @param untilStr - 結束日期字串（格式：YYYY-MM-DD，UTC 時區）
 * @throws {AppError} 當日期格式無效、日期無效或開始日期晚於結束日期時
 *
 * @example
 * ```typescript
 * validateDateRange('2025-01-01', '2025-12-31') // OK
 * validateDateRange('2025-12-31', '2025-01-01') // 拋出 AppError
 * validateDateRange('invalid', '2025-12-31')    // 拋出 AppError
 * ```
 */
export function validateDateRange(sinceStr: string, untilStr: string): void {
  const since = normalizeDateString(sinceStr, 'start')
  const until = normalizeDateString(untilStr, 'end')

  if (since.getTime() > until.getTime()) {
    throw new AppError(
      ErrorType.INVALID_INPUT,
      `無效的日期範圍: 開始日期（${sinceStr}）不能晚於結束日期（${untilStr}）`
    )
  }
}
