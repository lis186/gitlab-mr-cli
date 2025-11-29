/**
 * 合併事件模型
 *
 * 代表單次合併到主幹的事件
 */

/**
 * 合併事件
 *
 * 代表單次合併到主幹的事件
 *
 * @example
 * ```typescript
 * const mergeEvent: MergeEvent = {
 *   mr_id: "123",
 *   title: "Add feature X",
 *   merged_at: new Date("2025-10-13T14:30:00Z"),
 *   source_branch: "feature/add-x",
 *   target_branch: "develop",
 *   author: "user@example.com",
 *   loc_additions: 150,
 *   loc_deletions: 50,
 *   loc_changes: 200,
 *   associated_release_tag: "AppStore25.10.0"
 * };
 * ```
 */
export interface MergeEvent {
  /** Merge Request ID */
  mr_id: string;

  /** MR 標題 */
  title: string;

  /** 合併時間 */
  merged_at: Date;

  /** 來源分支 */
  source_branch: string;

  /** 目標分支 */
  target_branch: string;

  /** 作者 */
  author: string;

  /** LOC 新增 */
  loc_additions: number;

  /** LOC 刪除 */
  loc_deletions: number;

  /** LOC 變更總計 */
  loc_changes: number;

  /** 所屬發布標籤（若已發布） */
  associated_release_tag?: string;
}

/**
 * 計算 LOC 變更總計
 *
 * @param additions - LOC 新增數
 * @param deletions - LOC 刪除數
 * @returns LOC 變更總計
 */
export function calculateLocChanges(additions: number, deletions: number): number {
  return additions + deletions;
}

/**
 * 驗證合併事件物件
 *
 * @param mergeEvent - 合併事件物件
 * @param defaultBranch - 預期的目標分支（可選）
 * @returns 驗證錯誤訊息陣列，若為空陣列則驗證通過
 */
export function validateMergeEvent(
  mergeEvent: MergeEvent,
  defaultBranch?: string
): string[] {
  const errors: string[] = [];

  // merged_at 必須為有效日期
  if (isNaN(mergeEvent.merged_at.getTime())) {
    errors.push('Invalid merged_at date');
  }

  // loc_* >= 0
  if (mergeEvent.loc_additions < 0) {
    errors.push('LOC additions cannot be negative');
  }
  if (mergeEvent.loc_deletions < 0) {
    errors.push('LOC deletions cannot be negative');
  }
  if (mergeEvent.loc_changes < 0) {
    errors.push('LOC changes cannot be negative');
  }

  // 驗證 loc_changes 計算正確
  const expectedChanges = mergeEvent.loc_additions + mergeEvent.loc_deletions;
  if (mergeEvent.loc_changes !== expectedChanges) {
    errors.push(
      `LOC changes mismatch: expected ${expectedChanges}, got ${mergeEvent.loc_changes}`
    );
  }

  // 驗證 target_branch（如果提供了 defaultBranch）
  if (defaultBranch && mergeEvent.target_branch !== defaultBranch) {
    errors.push(
      `Target branch mismatch: expected ${defaultBranch}, got ${mergeEvent.target_branch}`
    );
  }

  return errors;
}

/**
 * 判斷合併事件是否屬於特定發布
 *
 * @param mergeEvent - 合併事件物件
 * @param releaseTag - 發布標籤
 * @returns 是否屬於該發布
 */
export function belongsToRelease(mergeEvent: MergeEvent, releaseTag: string): boolean {
  return mergeEvent.associated_release_tag === releaseTag;
}

/**
 * 判斷合併事件是否在指定時間範圍內
 *
 * @param mergeEvent - 合併事件物件
 * @param startDate - 開始時間
 * @param endDate - 結束時間
 * @returns 是否在時間範圍內
 */
export function isInTimeRange(
  mergeEvent: MergeEvent,
  startDate: Date,
  endDate: Date
): boolean {
  const mergedTime = mergeEvent.merged_at.getTime();
  return mergedTime >= startDate.getTime() && mergedTime <= endDate.getTime();
}
