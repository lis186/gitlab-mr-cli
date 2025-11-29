import { ProjectIdentifier } from '../models/project.js'
import { AppError, ErrorType } from '../models/error.js'

/**
 * 從使用者輸入解析專案識別
 *
 * 支援格式：
 * - 數字 ID: "12345"
 * - 專案路徑: "gitlab-org/gitlab"
 * - 完整 URL: "https://gitlab.com/gitlab-org/gitlab"
 *
 * @param input - 使用者輸入的專案識別字串
 * @returns 解析結果，包含 identifier 與選用的 host
 * @throws AppError 當輸入格式無效時
 */
export function parseProjectIdentifier(input: string): {
  identifier: ProjectIdentifier
  host?: string
} {
  // T046: 驗證輸入不為空
  if (!input || input.trim().length === 0) {
    throw new AppError(
      ErrorType.INVALID_INPUT,
      '專案識別不可為空'
    )
  }

  const trimmedInput = input.trim()

  // 若為純數字，視為專案 ID（保持字串格式）
  if (/^\d+$/.test(trimmedInput)) {
    return { identifier: trimmedInput }
  }

  // 若為 URL 格式，解析 host 與路徑
  try {
    const url = new URL(trimmedInput)
    const pathMatch = url.pathname.match(/^\/(.+)$/)
    if (pathMatch && pathMatch[1]) {
      // 移除 .git 後綴（如果存在）
      const identifier = pathMatch[1].replace(/\.git$/, '')
      return {
        identifier,
        host: `${url.protocol}//${url.host}`
      }
    }
  } catch {
    // 不是有效的 URL，繼續下一步
  }

  // 視為專案路徑（namespace/project，支援多層子群組）
  if (/^[^/]+(?:\/[^/]+)+$/.test(trimmedInput)) {
    return { identifier: trimmedInput }
  }

  // T046: 無效的專案識別格式
  throw new AppError(
    ErrorType.INVALID_INPUT,
    `無效的專案識別格式：${trimmedInput}`
  )
}
