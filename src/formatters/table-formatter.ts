import Table from 'cli-table3'
import chalk from 'chalk'
import { MergeRequest, MergeRequestState } from '../models/merge-request.js'

/**
 * 表格格式化器
 *
 * 將 MR 列表格式化為 CLI 表格輸出
 */
export class TableFormatter {
  /**
   * MR 狀態對應的顏色映射
   */
  private static readonly STATE_COLORS = {
    [MergeRequestState.OPENED]: chalk.green,
    [MergeRequestState.MERGED]: chalk.blue,
    [MergeRequestState.CLOSED]: chalk.red
  }

  /**
   * MR 狀態對應的正體中文文字
   */
  private static readonly STATE_TEXT = {
    [MergeRequestState.OPENED]: '開啟中',
    [MergeRequestState.MERGED]: '已合併',
    [MergeRequestState.CLOSED]: '已關閉'
  }

  /**
   * 格式化 MR 列表為表格
   *
   * @param mergeRequests - MR 列表
   * @param formatDate - 日期格式化函數
   * @returns 格式化後的表格字串
   */
  format(
    mergeRequests: MergeRequest[],
    formatDate: (date: Date) => string
  ): string {
    // 建立表格
    const table = new Table({
      head: [
        chalk.bold('IID'),
        chalk.bold('標題'),
        chalk.bold('作者'),
        chalk.bold('狀態'),
        chalk.bold('建立時間')
      ],
      colWidths: [8, 50, 20, 12, 20]
    })

    // 填入資料
    for (const mr of mergeRequests) {
      const colorFn = TableFormatter.STATE_COLORS[mr.state]
      const stateText = TableFormatter.STATE_TEXT[mr.state]

      table.push([
        mr.iid.toString(),
        mr.title.length > 47 ? mr.title.substring(0, 47) + '...' : mr.title,
        mr.author.name,
        colorFn(stateText),
        formatDate(mr.createdAt)
      ])
    }

    return table.toString()
  }
}
