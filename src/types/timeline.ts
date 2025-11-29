/**
 * MR 時間軸分析型別定義
 *
 * MR 時間軸分析功能的核心型別定義。
 * 包含時間軸輸出、MR 資訊及相關資料結構的介面。
 */

import type { MREvent } from '../models/mr-event.js';
import type { TimeSegment, PhaseSegment } from '../models/time-segment.js';
import type { MRSummary } from '../models/mr-summary.js';
import type { Actor } from '../models/actor.js';

/**
 * 單一 MR 的完整時間軸分析結果
 */
export interface MRTimeline {
  mr: MRInfo;
  events: MREvent[];
  segments: TimeSegment[];
  phaseSegments: PhaseSegment[];  // High-level phase breakdown
  summary: MRSummary;
  cycleTimeSeconds: number;
}

/**
 * MR 基本資訊
 */
export interface MRInfo {
  id: number;                    // MR IID
  projectId: number;             // 專案 ID
  title: string;                 // MR 標題
  isDraft: boolean;              // Draft 狀態
  author: Actor;                 // MR 作者
  createdAt: Date;               // 建立時間
  mergedAt: Date | null;         // 合併時間（null 表示未合併）
  sourceBranch: string;          // 來源分支名稱
  targetBranch: string;          // 目標分支名稱
  webUrl: string;                // MR 網址
  changesCount?: number;         // 變更檔案數（來自 API）
}

/**
 * 時間軸分析輸出格式（用於 JSON 序列化）
 */
export interface TimelineOutput {
  version: string;               // 輸出格式版本
  timestamp: Date;               // 分析執行時間
  timelines: MRTimeline[];       // MR 時間軸陣列
}

/**
 * 時間軸分析服務選項
 */
export interface TimelineAnalysisOptions {
  projectId: number;
  mrIid: number;
  aiBotsConfig?: string[];       // 自訂 AI Bot 使用者名稱
}

/**
 * 批次分析選項
 */
export interface BatchAnalysisOptions {
  projectId: number;
  mrIids: number[];
  aiBotsConfig?: string[];
  batchSize?: number;
}

/**
 * GitLab API Note (評論) 物件類型
 * 簡化版，只包含我們實際使用的欄位
 */
export interface GitLabNote {
  id: number;
  body: string;
  author: {
    id: number;
    username: string;
    name: string;
  };
  created_at: string;
  system: boolean;
}

/**
 * GitLab API Commit 物件類型
 */
export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  created_at: string;
  parent_ids: string[];
  web_url: string;
}

/**
 * GitLab API Pipeline 物件類型
 */
export interface GitLabPipeline {
  id: number;
  iid: number;
  project_id: number;
  sha: string;
  ref: string;
  status: string;
  created_at: string;
  updated_at: string;
  web_url: string;
}

/**
 * GitLab API Award Emoji (Emoji Reaction) 物件類型
 * GitLab API Award Emoji 物件類型
 */
export interface GitLabAwardEmoji {
  id: number;
  name: string;
  user: {
    id: number;
    username: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
  awardable_id: number;
  awardable_type: string;
}

/**
 * Emoji Reaction 摘要資訊（用於事件顯示）
 */
export interface EmojiReaction {
  emoji: string;
  username: string;
  name: string;
  createdAt: Date;
}
