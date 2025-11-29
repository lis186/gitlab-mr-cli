/**
 * 日期工具函式
 *
 * 提供時間範圍解析、日期驗證等功能
 */

import { zhTW } from '../i18n/zh-TW.js'

/**
 * 時間範圍解析結果
 */
export interface ParsedPeriod {
  startDate: Date
  endDate: Date
}

/**
 * 解析時間範圍字串（例如：30d, 90d, 6m, 1y）
 * @param period 時間範圍字串
 * @returns ParsedPeriod
 * @throws Error 如果格式無效
 */
export function parsePeriod(period: string): ParsedPeriod {
  const match = period.match(/^(\d+)([dmy])$/)

  if (!match || !match[1] || !match[2]) {
    throw new Error(zhTW.trend.errors.invalidPeriod)
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  const endDate = new Date()
  endDate.setHours(23, 59, 59, 999) // 設定為當天結束時間

  const startDate = new Date(endDate)

  switch (unit) {
    case 'd': // 天
      startDate.setDate(startDate.getDate() - value + 1)
      break
    case 'm': // 月
      startDate.setMonth(startDate.getMonth() - value)
      break
    case 'y': // 年
      startDate.setFullYear(startDate.getFullYear() - value)
      break
  }

  startDate.setHours(0, 0, 0, 0) // 設定為當天開始時間

  return { startDate, endDate }
}

/**
 * 解析 ISO 8601 日期字串
 * @param dateString 日期字串（例如：2025-01-01）
 * @returns Date
 * @throws Error 如果格式無效
 */
export function parseISODate(dateString: string): Date {
  const date = new Date(dateString)

  if (isNaN(date.getTime())) {
    throw new Error(zhTW.trend.errors.invalidDateFormat)
  }

  return date
}

/**
 * 驗證日期範圍
 * @param startDate 開始日期
 * @param endDate 結束日期
 * @throws Error 如果結束日期早於開始日期
 */
export function validateDateRange(startDate: Date, endDate: Date): void {
  if (endDate < startDate) {
    throw new Error(zhTW.trend.errors.invalidDateRange)
  }
}

/**
 * 計算天數差異
 * @param startDate 開始日期
 * @param endDate 結束日期
 * @returns 天數
 */
export function getDaysDifference(startDate: Date, endDate: Date): number {
  const diff = endDate.getTime() - startDate.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1
}

/**
 * 正規化日期為當天開始時間（UTC 00:00:00）
 * 用於日期範圍查詢的開始日期，確保從該天的第一毫秒開始
 * @param dateString 日期字串（例如：2025-01-01）
 * @returns Date 正規化後的日期（UTC 00:00:00.000）
 * @example
 * normalizeStartOfDay('2025-10-15') // 2025-10-15T00:00:00.000Z
 */
export function normalizeStartOfDay(dateString: string): Date {
  const date = new Date(dateString);
  // Explicitly set to start of day in UTC for robustness and symmetry with normalizeEndOfDay
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/**
 * 正規化日期為當天結束時間（UTC 23:59:59.999）
 * 用於日期範圍查詢的結束日期，確保包含該天的所有記錄
 * @param dateString 日期字串（例如：2025-01-01）
 * @returns Date 正規化後的日期（UTC 23:59:59.999）
 * @example
 * normalizeEndOfDay('2025-10-15') // 2025-10-15T23:59:59.999Z
 */
export function normalizeEndOfDay(dateString: string): Date {
  const date = new Date(dateString);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

/**
 * 比較期間解析結果
 */
export interface ParsedComparePeriods {
  previousPeriod: ParsedPeriod
  currentPeriod: ParsedPeriod
}

/**
 * 解析比較期間字串（逗號分隔的兩個期間）
 * @param comparePeriodsString 比較期間字串（例如：2025-09,2025-10 或 30d,60d）
 * @returns ParsedComparePeriods
 * @throws Error 如果格式無效
 */
export function parseComparePeriods(comparePeriodsString: string): ParsedComparePeriods {
  const parts = comparePeriodsString.split(',').map(s => s.trim())

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('比較期間格式錯誤：必須提供兩個期間，以逗號分隔（例如：2025-09,2025-10 或 30d,60d）')
  }

  const previousStr = parts[0]
  const currentStr = parts[1]

  // 嘗試解析為期間格式（30d, 60d）
  let previousPeriod: ParsedPeriod
  let currentPeriod: ParsedPeriod

  const isPeriodFormat = /^\d+[dmy]$/.test(previousStr) && /^\d+[dmy]$/.test(currentStr)
  const isMonthFormat = /^\d{4}-\d{2}$/.test(previousStr) && /^\d{4}-\d{2}$/.test(currentStr)

  if (isPeriodFormat) {
    // 相對時間格式（例如：30d,60d）
    previousPeriod = parsePeriod(previousStr)
    currentPeriod = parsePeriod(currentStr)
  } else if (isMonthFormat) {
    // 月份格式（例如：2025-09,2025-10）
    previousPeriod = parseMonthPeriod(previousStr)
    currentPeriod = parseMonthPeriod(currentStr)
  } else {
    throw new Error('比較期間格式錯誤：支援相對時間（30d,60d）或月份（2025-09,2025-10）')
  }

  return { previousPeriod, currentPeriod }
}

/**
 * 解析月份字串為時間範圍
 * @param monthString 月份字串（例如：2025-09）
 * @returns ParsedPeriod
 * @throws Error 如果格式無效
 */
function parseMonthPeriod(monthString: string): ParsedPeriod {
  const match = monthString.match(/^(\d{4})-(\d{2})$/)

  if (!match || !match[1] || !match[2]) {
    throw new Error(`月份格式錯誤：${monthString}（應為 YYYY-MM 格式）`)
  }

  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)

  if (month < 1 || month > 12) {
    throw new Error(`月份範圍錯誤：${month}（應為 1-12）`)
  }

  // 該月的第一天 00:00:00
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0)

  // 該月的最後一天 23:59:59
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)

  return { startDate, endDate }
}
