import { MergeRequest } from '../models/merge-request.js'

/**
 * JSON 格式化器
 *
 * 將 MR 列表格式化為 JSON 輸出，適合腳本處理與 API 整合
 */
export class JsonFormatter {
  /**
   * 格式化 MR 列表為 JSON
   *
   * @param mergeRequests - MR 列表
   * @returns 格式化後的 JSON 字串
   */
  format(mergeRequests: MergeRequest[]): string {
    const output = {
      total: mergeRequests.length,
      mergeRequests: mergeRequests.map(mr => ({
        id: mr.id,
        iid: mr.iid,
        title: mr.title,
        state: mr.state,
        author: {
          id: mr.author.id,
          name: mr.author.name,
          username: mr.author.username
        },
        createdAt: mr.createdAt.toISOString(),
        updatedAt: mr.updatedAt.toISOString(),
        sourceBranch: mr.sourceBranch,
        targetBranch: mr.targetBranch,
        webUrl: mr.webUrl
      }))
    }

    return JSON.stringify(output, null, 2)
  }
}
