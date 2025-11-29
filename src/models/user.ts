/**
 * GitLab 使用者模型
 */
export interface User {
  /** 使用者 ID */
  id: number

  /** 顯示名稱 */
  name: string

  /** 使用者帳號 */
  username: string

  /** 頭像 URL（選用） */
  avatarUrl?: string
}
