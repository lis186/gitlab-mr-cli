import { MergeRequestState } from '../models/merge-request.js'
import { ProjectIdentifier } from '../models/project.js'

/**
 * 驗證字串是否為有效的 MR 狀態
 *
 * @param state - 待驗證的狀態字串
 * @returns 是否為有效的 MR 狀態
 */
export function isValidMRState(state: string): state is MergeRequestState {
  return Object.values(MergeRequestState).includes(state as MergeRequestState)
}

/**
 * 驗證是否為有效的專案識別
 *
 * @param identifier - 待驗證的專案識別
 * @returns 是否為有效的專案識別
 */
export function isValidProjectIdentifier(identifier: ProjectIdentifier): boolean {
  // 數字 ID：必須為正整數
  if (typeof identifier === 'number') {
    return Number.isInteger(identifier) && identifier > 0
  }

  // 字串路徑：必須符合 namespace/project 格式
  if (typeof identifier === 'string') {
    return /^[^/]+\/[^/]+$/.test(identifier)
  }

  return false
}
