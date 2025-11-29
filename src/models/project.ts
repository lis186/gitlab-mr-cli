/**
 * GitLab 專案識別類型
 * 可以是數字 ID 或專案路徑（namespace/project）
 */
export type ProjectIdentifier = number | string

/**
 * 專案配置介面
 */
export interface ProjectConfig {
  /** 專案識別（ID 或路徑） */
  identifier: ProjectIdentifier

  /** GitLab 伺服器 URL（選用，預設為 gitlab.com） */
  host?: string

  /** Personal Access Token */
  token: string
}
