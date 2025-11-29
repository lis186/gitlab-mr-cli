/**
 * MR 事件模型
 *
 * 代表 MR 生命週期中的關鍵事件
 */

import type { Actor } from './actor.js';

/**
 * MR 生命週期中的事件類型
 *
 * @remarks
 * 事件類型按時間順序排列，優先級由 getEventTypePriority() 定義
 */
export enum EventType {
  /** 分支建立 - 基於最早的 commit 時間推斷 */
  BRANCH_CREATED = 'Branch Created',

  /** 程式碼提交 (MR 建立前) - 開發階段的 commits */
  CODE_COMMITTED = 'Code Committed',

  /** MR 建立 */
  MR_CREATED = 'MR Created',

  /** 標記為 Draft - Ready → Draft 狀態轉換 */
  MARKED_AS_DRAFT = 'Marked as Draft',

  /** 標記為 Ready - Draft → Ready 狀態轉換 */
  MARKED_AS_READY = 'Marked as Ready',

  /** Commit 推送 (MR 建立後) - 審查階段的 commits */
  COMMIT_PUSHED = 'Commit Pushed',

  /** AI 審查開始 */
  AI_REVIEW_STARTED = 'AI Review Started',

  /** 人工審查開始 */
  HUMAN_REVIEW_STARTED = 'Human Review Started',

  /** CI Bot 回應 */
  CI_BOT_RESPONSE = 'CI Bot Response',

  /** 作者回應 */
  AUTHOR_RESPONSE = 'Author Response',

  /** 已批准 */
  APPROVED = 'Approved',

  /** 已合併 */
  MERGED = 'Merged',

  /** Pipeline 成功 */
  PIPELINE_SUCCESS = 'Pipeline Success',

  /** Pipeline 失敗 */
  PIPELINE_FAILED = 'Pipeline Failed',
}

/**
 * 特定事件類型的可選詳細資訊
 */
export interface EventDetails {
  count?: number;          // 建議或評論的數量
  commitSha?: string;      // Commit SHA（用於 commit 事件）
  pipelineId?: number;     // Pipeline ID（用於 pipeline 事件）
  branchName?: string;     // 分支名稱（用於 Branch Created 事件）
  message?: string;        // 額外訊息
  noteId?: number;         // Note ID（用於 review 事件，關聯 emoji reactions）
  emojiReactions?: Array<{  // Emoji 反應列表
    emoji: string;
    username: string;
    name: string;
    createdAt: Date;
  }>;
}

/**
 * MR 事件 - 代表時間軸中的單一事件
 */
export interface MREvent {
  sequence: number;              // 事件序號（從 1 開始）
  timestamp: Date;               // 事件發生時間
  actor: Actor;                  // 執行該事件的操作者
  eventType: EventType;          // 事件類型
  details?: EventDetails;        // 可選的事件詳細資訊
  intervalToNext?: number;       // 距離下一個事件的時間間隔（秒數）
}

/**
 * 驗證 MR 事件
 */
export function validateMREvent(event: MREvent): boolean {
  if (event.sequence <= 0) {
    return false;
  }

  if (!(event.timestamp instanceof Date) || isNaN(event.timestamp.getTime())) {
    return false;
  }

  if (event.intervalToNext !== undefined && event.intervalToNext < 0) {
    return false;
  }

  return true;
}

/**
 * 依時間戳比較兩個事件（用於排序）
 */
export function compareEventsByTimestamp(a: MREvent, b: MREvent): number {
  const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();

  // 若時間戳相同，使用事件類型優先順序
  if (timeDiff === 0) {
    return getEventTypePriority(a.eventType) - getEventTypePriority(b.eventType);
  }

  return timeDiff;
}

/**
 * 同時事件的事件類型優先順序
 * 數字越小優先順序越高
 */
function getEventTypePriority(eventType: EventType): number {
  const priorities: Record<EventType, number> = {
    [EventType.BRANCH_CREATED]: 1,
    [EventType.CODE_COMMITTED]: 2,
    [EventType.MR_CREATED]: 3,
    [EventType.MARKED_AS_DRAFT]: 4,
    [EventType.MARKED_AS_READY]: 5,
    [EventType.COMMIT_PUSHED]: 6,
    [EventType.AI_REVIEW_STARTED]: 7,
    [EventType.HUMAN_REVIEW_STARTED]: 8,
    [EventType.CI_BOT_RESPONSE]: 9,
    [EventType.AUTHOR_RESPONSE]: 10,
    [EventType.APPROVED]: 11,
    [EventType.MERGED]: 12,
    [EventType.PIPELINE_SUCCESS]: 13,
    [EventType.PIPELINE_FAILED]: 14,
  };

  return priorities[eventType] || 999;
}
