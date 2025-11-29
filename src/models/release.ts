/**
 * 發布模型
 *
 * 代表單次產品發布，彙整所有相關數據
 */

/**
 * 健康度等級
 */
export type HealthLevel = 'healthy' | 'warning' | 'critical';

/**
 * 發布
 *
 * 代表單次產品發布，彙整所有相關數據
 *
 * @example
 * ```typescript
 * const release: Release = {
 *   tag: "AppStore25.10.5",
 *   commit_sha: "a1b2c3d4...",
 *   date: new Date("2025-10-15T10:00:00Z"),
 *   type: "hotfix",
 *   mr_list: ["123", "124", "125"],
 *   mr_count: 3,
 *   total_loc_additions: 450,
 *   total_loc_deletions: 200,
 *   total_loc_changes: 650,
 *   interval_days: 30,
 *   freeze_days: 2,
 *   health_level: "healthy",
 *   previous_release_tag: "AppStore25.9.0"
 * };
 * ```
 */
export interface Release {
  /** 發布標籤名稱 */
  tag: string;

  /** 對應的 commit SHA */
  commit_sha: string;

  /** 發布時間 */
  date: Date;

  /** 發布類型 */
  type: string;

  /** 包含的 MR ID 清單 */
  mr_list: string[];

  /** MR 數量 */
  mr_count: number;

  /** 總 LOC 新增 */
  total_loc_additions: number;

  /** 總 LOC 刪除 */
  total_loc_deletions: number;

  /** 總 LOC 變更（additions + deletions） */
  total_loc_changes: number;

  /** 與上次發布的間隔天數 */
  interval_days?: number;

  /** 代碼凍結期長度（最後一次合併到發布的天數） */
  freeze_days: number;

  /** 健康度等級（僅當發布類型配置 evaluate_batch_size = true 時才計算） */
  health_level: HealthLevel | null;

  /** 上一個發布標籤 */
  previous_release_tag?: string;
}

/**
 * 計算總 LOC 變更
 *
 * @param additions - LOC 新增數
 * @param deletions - LOC 刪除數
 * @returns 總 LOC 變更數
 */
export function calculateTotalLocChanges(additions: number, deletions: number): number {
  return additions + deletions;
}

/**
 * 計算健康度等級
 *
 * 根據 MR 數量判斷健康度等級
 *
 * @param mrCount - MR 數量
 * @param thresholds - 閾值設定（可選）
 * @returns 健康度等級
 */
export function calculateHealthLevel(
  mrCount: number,
  thresholds?: { healthy: number; warning: number; critical: number }
): HealthLevel {
  const { healthy = 50, warning = 100 } = thresholds || {};

  if (mrCount < healthy) {
    return 'healthy';
  }
  if (mrCount <= warning) {
    return 'warning';
  }
  return 'critical';
}

/**
 * 計算發布間隔天數
 *
 * @param currentDate - 當前發布日期
 * @param previousDate - 上次發布日期
 * @returns 間隔天數
 */
export function calculateIntervalDays(currentDate: Date, previousDate: Date): number {
  const diffMs = currentDate.getTime() - previousDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 計算代碼凍結期天數
 *
 * @param lastMergeDate - 最後一次合併日期
 * @param releaseDate - 發布日期
 * @returns 凍結期天數
 */
export function calculateFreezeDays(lastMergeDate: Date, releaseDate: Date): number {
  const diffMs = releaseDate.getTime() - lastMergeDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 驗證發布物件
 *
 * @param release - 發布物件
 * @returns 驗證錯誤訊息陣列，若為空陣列則驗證通過
 */
export function validateRelease(release: Release): string[] {
  const errors: string[] = [];

  // tag 不可為空字串
  if (!release.tag || release.tag.trim() === '') {
    errors.push('Tag cannot be empty');
  }

  // date 必須為有效日期
  if (isNaN(release.date.getTime())) {
    errors.push('Invalid date');
  }

  // mr_count >= 0
  if (release.mr_count < 0) {
    errors.push('MR count cannot be negative');
  }

  // total_loc_* >= 0
  if (release.total_loc_additions < 0) {
    errors.push('Total LOC additions cannot be negative');
  }
  if (release.total_loc_deletions < 0) {
    errors.push('Total LOC deletions cannot be negative');
  }
  if (release.total_loc_changes < 0) {
    errors.push('Total LOC changes cannot be negative');
  }

  // freeze_days >= 0
  if (release.freeze_days < 0) {
    errors.push('Freeze days cannot be negative');
  }

  // 驗證 total_loc_changes 計算正確
  const expectedChanges = release.total_loc_additions + release.total_loc_deletions;
  if (release.total_loc_changes !== expectedChanges) {
    errors.push(
      `Total LOC changes mismatch: expected ${expectedChanges}, got ${release.total_loc_changes}`
    );
  }

  return errors;
}
