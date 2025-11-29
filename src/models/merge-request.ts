import { User } from './user.js'

/**
 * Merge Request 狀態列舉
 */
export enum MergeRequestState {
  /** 開啟中 */
  OPENED = 'opened',

  /** 已合併 */
  MERGED = 'merged',

  /** 已關閉 */
  CLOSED = 'closed'
}

/**
 * Merge Request 資料模型
 */
export interface MergeRequest {
  /** MR ID */
  id: number

  /** MR IID（專案內的序號） */
  iid: number

  /** MR 標題 */
  title: string

  /** MR 描述（選用） */
  description?: string

  /** MR 狀態 */
  state: MergeRequestState

  /** 作者資訊 */
  author: User

  /** 建立時間 */
  createdAt: Date

  /** 更新時間 */
  updatedAt: Date

  /** 合併時間（僅已合併的 MR 才有） */
  mergedAt?: Date | null

  /** 來源分支 */
  sourceBranch: string

  /** 目標分支 */
  targetBranch: string

  /** GitLab 網頁連結 */
  webUrl: string

  /** 變更檔案數量（Feature 007） */
  changesCount?: string | number
}

/**
 * GitLab API 回應介面（部分欄位）
 */
interface GitLabMR {
  id: number
  iid: number
  title: string
  description?: string | null
  state: string
  author: {
    id: number
    name: string
    username: string
    avatar_url?: string | null
  }
  created_at: string
  updated_at: string
  merged_at?: string | null
  source_branch: string
  target_branch: string
  web_url: string
  changes_count?: string | number
}

/**
 * 從 GitLab API 回應轉換為應用程式 MergeRequest 模型
 *
 * @param apiData - GitLab API 回應資料
 * @returns 轉換後的 MergeRequest 物件
 */
export function fromGitLabAPI(apiData: GitLabMR): MergeRequest {
  return {
    id: apiData.id,
    iid: apiData.iid,
    title: apiData.title,
    description: apiData.description ?? undefined,
    state: apiData.state as MergeRequestState,
    author: {
      id: apiData.author.id,
      name: apiData.author.name,
      username: apiData.author.username,
      avatarUrl: apiData.author.avatar_url ?? undefined
    },
    createdAt: new Date(apiData.created_at),
    updatedAt: new Date(apiData.updated_at),
    mergedAt: apiData.merged_at ? new Date(apiData.merged_at) : null,
    sourceBranch: apiData.source_branch,
    targetBranch: apiData.target_branch,
    webUrl: apiData.web_url,
    changesCount: apiData.changes_count
  }
}
