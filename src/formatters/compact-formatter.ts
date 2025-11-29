import { MergeRequest, MergeRequestState } from '../models/merge-request.js'

/**
 * 簡潔格式化器
 *
 * 將 MR 列表格式化為簡潔的一行一個 MR 格式，適合快速瀏覽與 grep 處理
 */
export class CompactFormatter {
  /**
   * MR 狀態對應的正體中文文字
   */
  private static readonly STATE_TEXT = {
    [MergeRequestState.OPENED]: '開啟中',
    [MergeRequestState.MERGED]: '已合併',
    [MergeRequestState.CLOSED]: '已關閉'
  }

  /**
   * 格式化 MR 列表為簡潔格式
   *
   * @param mergeRequests - MR 列表
   * @param formatDate - 日期格式化函數
   * @returns 格式化後的字串
   */
  format(
    mergeRequests: MergeRequest[],
    formatDate: (date: Date) => string
  ): string {
    const lines: string[] = []

    // 格式化每個 MR
    for (const mr of mergeRequests) {
      const stateText = CompactFormatter.STATE_TEXT[mr.state]
      const date = formatDate(mr.createdAt)

      // 第一行：!{iid}  [{狀態}] {標題} ({作者}, {日期})
      lines.push(
        `!${mr.iid}  [${stateText}] ${mr.title} (${mr.author.name}, ${date})`
      )

      // 第二行：縮排 + MR 網頁連結
      lines.push(`     ${mr.webUrl}`)

      // 空行分隔
      lines.push('')
    }

    // 移除最後一個空行
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }

    // 加上總計訊息
    if (mergeRequests.length > 0) {
      lines.push('')
      lines.push(`總計：${mergeRequests.length} 個 Merge Requests`)
    }

    return lines.join('\n')
  }
}
