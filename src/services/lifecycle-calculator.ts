/**
 * 生命週期計算器
 *
 * 計算分支的雙重生命週期指標（總生命週期時間、MR 處理時間）
 *
 * @module services/lifecycle-calculator
 */

import type { Branch, BranchLifecycle } from '../types/branch-health.js'

/**
 * 計算兩個日期之間的天數差
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const diffMs = end.getTime() - start.getTime()
  return Math.floor(diffMs / msPerDay)
}

/**
 * 計算分支生命週期指標
 *
 * @param branch - 分支資訊
 * @param mr - 關聯的 MR（若存在）
 * @param threshold - 過時判定閾值（天）
 * @returns 分支生命週期
 */
export function calculateLifecycle(
  branch: Branch,
  mr: any | null,
  threshold: number = 30
): BranchLifecycle {
  const now = new Date()

  // 總生命週期：從分支建立到現在
  const totalLifecycleDays = daysBetween(branch.createdDate, now)

  // MR 處理時間：從 MR 建立到最後提交
  let mrProcessingDays: number | null = null
  if (mr && mr.created_at) {
    const mrCreatedDate = new Date(mr.created_at)
    mrProcessingDays = daysBetween(mrCreatedDate, branch.lastCommitDate)
  }

  // 判定是否過時
  const isStale = totalLifecycleDays > threshold

  return {
    branchName: branch.name,
    totalLifecycleDays,
    mrProcessingDays,
    createdDate: branch.createdDate,
    lastUpdatedDate: branch.lastCommitDate,
    isStale,
    staleThreshold: threshold,
  }
}

/**
 * 批次計算多個分支的生命週期
 *
 * @param branchesWithMRs - 分支與 MR 的關聯資料
 * @param threshold - 過時判定閾值
 * @returns 生命週期陣列
 */
export function calculateLifecycles(
  branchesWithMRs: Array<{ branch: any; mergeRequest: any | null }>,
  threshold: number = 30
): BranchLifecycle[] {
  return branchesWithMRs.map(({ branch, mergeRequest }) => {
    // 轉換 GitLab API 格式到 Branch 型別
    const branchData: Branch = {
      name: branch.name,
      lastCommitDate: new Date(branch.commit.committed_date),
      createdDate: mergeRequest?.created_at
        ? new Date(mergeRequest.created_at)
        : new Date(branch.commit.committed_date), // 降級：使用首次 commit 日期
      mergeRequestId: mergeRequest?.iid || null,
      author: branch.commit.author_name,
      protected: branch.protected || false,
    }

    return calculateLifecycle(branchData, mergeRequest, threshold)
  })
}
