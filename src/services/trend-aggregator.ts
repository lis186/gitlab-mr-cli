/**
 * 趨勢彙總服務
 *
 * 負責將 MR 資料按時間粒度彙總，生成趨勢資料點
 */

import { startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, format } from 'date-fns'
import { MergeRequest } from '../models/merge-request.js'
import { TimeGranularity, TrendDataPoint, TrendDataPointImpl } from '../models/trend.js'

/**
 * 按時間粒度彙總 MR 資料
 * @param mergeRequests MR 列表
 * @param granularity 時間粒度
 * @returns 趨勢資料點陣列（按時間排序）
 */
export function aggregateByGranularity(
  mergeRequests: MergeRequest[],
  granularity: TimeGranularity
): TrendDataPoint[] {
  // 1. 按時間粒度分組
  const groups = new Map<string, MergeRequest[]>()

  for (const mr of mergeRequests) {
    if (!mr.mergedAt) continue // 跳過缺少 mergedAt 的 MR

    const key = getTimeKey(mr.mergedAt, granularity)
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(mr)
  }

  // 2. 將每個分組轉換為 TrendDataPoint
  const dataPoints: TrendDataPoint[] = []

  for (const [timeKey, mrs] of groups.entries()) {
    const { start, end, label } = parseTimeKey(timeKey, granularity)

    // 計算活躍開發者
    const activeDeveloperIds = new Set<number>()
    for (const mr of mrs) {
      activeDeveloperIds.add(mr.author.id)
    }

    const dataPoint = new TrendDataPointImpl(
      label,
      start,
      end,
      mrs.length,
      activeDeveloperIds
    )

    dataPoints.push(dataPoint)
  }

  // 3. 按時間排序（從舊到新）
  dataPoints.sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())

  return dataPoints
}

/**
 * 取得時間鍵（用於分組）
 * @param date 日期
 * @param granularity 時間粒度
 * @returns 時間鍵字串
 */
function getTimeKey(date: Date, granularity: TimeGranularity): string {
  switch (granularity) {
    case TimeGranularity.DAY:
      return format(startOfDay(date), 'yyyy-MM-dd')
    case TimeGranularity.WEEK:
      // ISO week：週一為一週開始
      return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    case TimeGranularity.MONTH:
      return format(startOfMonth(date), 'yyyy-MM')
  }
}

/**
 * 解析時間鍵，取得時間範圍和顯示標籤
 * @param timeKey 時間鍵
 * @param granularity 時間粒度
 * @returns 時間範圍和標籤
 */
function parseTimeKey(
  timeKey: string,
  granularity: TimeGranularity
): { start: Date; end: Date; label: string } {
  switch (granularity) {
    case TimeGranularity.DAY: {
      const date = new Date(timeKey)
      return {
        start: startOfDay(date),
        end: endOfDay(date),
        label: timeKey
      }
    }
    case TimeGranularity.WEEK: {
      const date = new Date(timeKey)
      const start = startOfWeek(date, { weekStartsOn: 1 })
      const end = endOfWeek(date, { weekStartsOn: 1 })
      return {
        start,
        end,
        label: format(start, "yyyy-'W'ww") // ISO week format: 2025-W42
      }
    }
    case TimeGranularity.MONTH: {
      const parts = timeKey.split('-')
      const year = parts[0] || ''
      const month = parts[1] || ''
      const date = new Date(parseInt(year), parseInt(month) - 1, 1)
      return {
        start: startOfMonth(date),
        end: endOfMonth(date),
        label: timeKey
      }
    }
  }
}
