/**
 * 將 Date 物件格式化為易讀的字串
 *
 * 格式: YYYY-MM-DD HH:mm
 *
 * @param date - 待格式化的日期
 * @returns 格式化後的日期字串
 *
 * @example
 * formatDate(new Date('2024-01-15T10:30:00Z'))
 * // => '2024-01-15 10:30'
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}
