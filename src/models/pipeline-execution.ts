/**
 * Pipeline 執行模型
 *
 * 代表單次 CI/CD pipeline 執行記錄
 */

/**
 * Pipeline 執行狀態
 */
export type PipelineStatus = 'success' | 'failed' | 'canceled' | 'skipped';

/**
 * Pipeline 執行
 *
 * 代表單次 CI/CD pipeline 執行記錄
 *
 * @example
 * ```typescript
 * const pipeline: PipelineExecution = {
 *   id: 12345,
 *   status: "success",
 *   ref: "develop",
 *   sha: "a1b2c3d4...",
 *   created_at: new Date("2025-10-15T10:00:00Z"),
 *   finished_at: new Date("2025-10-15T10:15:00Z"),
 *   duration_seconds: 900
 * };
 * ```
 */
export interface PipelineExecution {
  /** Pipeline ID */
  id: number;

  /** 執行狀態 */
  status: PipelineStatus;

  /** 分支或標籤名稱 */
  ref: string;

  /** Commit SHA */
  sha: string;

  /** 開始時間 */
  created_at: Date;

  /** 結束時間 */
  finished_at?: Date;

  /** 執行時長（秒） */
  duration_seconds?: number;
}

/**
 * 計算 Pipeline 執行時長
 *
 * @param createdAt - 開始時間
 * @param finishedAt - 結束時間
 * @returns 執行時長（秒），若未結束則返回 undefined
 */
export function calculateDurationSeconds(
  createdAt: Date,
  finishedAt?: Date
): number | undefined {
  if (!finishedAt) {
    return undefined;
  }

  const durationMs = finishedAt.getTime() - createdAt.getTime();
  return Math.floor(durationMs / 1000);
}

/**
 * 驗證 Pipeline 執行物件
 *
 * @param pipeline - Pipeline 執行物件
 * @returns 驗證錯誤訊息陣列，若為空陣列則驗證通過
 */
export function validatePipelineExecution(pipeline: PipelineExecution): string[] {
  const errors: string[] = [];

  // status 必須為定義的枚舉值之一
  const validStatuses: PipelineStatus[] = ['success', 'failed', 'canceled', 'skipped'];
  if (!validStatuses.includes(pipeline.status)) {
    errors.push(`Invalid status: ${pipeline.status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  // created_at 必須為有效日期
  if (isNaN(pipeline.created_at.getTime())) {
    errors.push('Invalid created_at date');
  }

  // created_at 必須早於或等於 finished_at
  if (pipeline.finished_at) {
    if (isNaN(pipeline.finished_at.getTime())) {
      errors.push('Invalid finished_at date');
    } else if (pipeline.created_at.getTime() > pipeline.finished_at.getTime()) {
      errors.push('created_at must be earlier than or equal to finished_at');
    }
  }

  // duration_seconds >= 0
  if (pipeline.duration_seconds !== undefined && pipeline.duration_seconds < 0) {
    errors.push('duration_seconds cannot be negative');
  }

  // 驗證 duration_seconds 計算正確（如果兩個時間都存在）
  if (pipeline.finished_at && pipeline.duration_seconds !== undefined) {
    const expectedDuration = calculateDurationSeconds(
      pipeline.created_at,
      pipeline.finished_at
    );
    if (expectedDuration !== undefined && Math.abs(pipeline.duration_seconds - expectedDuration) > 1) {
      errors.push(
        `Duration mismatch: expected ${expectedDuration}s, got ${pipeline.duration_seconds}s`
      );
    }
  }

  return errors;
}

/**
 * 判斷 Pipeline 是否成功
 *
 * @param pipeline - Pipeline 執行物件
 * @returns 是否成功
 */
export function isPipelineSuccess(pipeline: PipelineExecution): boolean {
  return pipeline.status === 'success';
}

/**
 * 判斷 Pipeline 是否失敗
 *
 * @param pipeline - Pipeline 執行物件
 * @returns 是否失敗
 */
export function isPipelineFailed(pipeline: PipelineExecution): boolean {
  return pipeline.status === 'failed';
}
