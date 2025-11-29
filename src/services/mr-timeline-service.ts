/**
 * MR 時間軸分析服務
 *
 * 負責分析單一 MR 的完整時間軸，包括事件收集、角色分類、時間間隔計算等
 */

import type { Gitlab } from '@gitbeaker/rest';
import type { MRTimeline, MRInfo, GitLabNote } from '../types/timeline.js';
import type { MREvent, EventType } from '../models/mr-event.js';
import type { Actor, ActorRole } from '../models/actor.js';
import type { TimeSegment, PhaseSegment } from '../models/time-segment.js';
import type { MRSummary } from '../models/mr-summary.js';
import { AIBotDetector } from './ai-bot-detector.js';
import { TimeCalculator } from '../lib/time-calculator.js';
import { ErrorClassifier } from '../lib/error-handler.js';
import { compareEventsByTimestamp } from '../models/mr-event.js';
import { ActorRole as ActorRoleEnum } from '../models/actor.js';
import { EventType as EventTypeEnum } from '../models/mr-event.js';
import { KeyState, Phase } from '../models/time-segment.js';
import { createEmptySummary, deduplicateActors, excludeAuthor } from '../models/mr-summary.js';
import { logger } from '../utils/logger.js';
import { isHybridReviewer, shouldClassifyAsAIReview, getHybridReviewerConfig } from '../config/hybrid-reviewers.js';

/** 訊息內容顯示的最大長度（字元數） */
const MAX_MESSAGE_LENGTH = 100;

/** 時間比較容差（毫秒）- 用於處理時鐘同步問題 */
const TIME_TOLERANCE_MS = 5000; // 5 秒

/** Draft 標記字串模式 - 用於檢測 "Marked as Draft" 事件 */
const DRAFT_MARKERS = ['marked as draft', 'marked this merge request as draft', 'marked as a draft'] as const;

/** Ready 標記字串模式 - 用於檢測 "Marked as Ready" 事件
 * 注意：GitLab API 可能返回帶有 markdown 格式的內容，如 "marked this merge request as **ready**"
 * 因此需要移除 markdown 符號後再比對
 */
const READY_MARKERS = ['marked as ready', 'marked this merge request as ready'] as const;

/**
 * MR 時間軸分析服務
 */
export class MRTimelineService {
  private readonly gitlabClient: InstanceType<typeof Gitlab>;
  private readonly aiBotDetector: AIBotDetector;
  private readonly timeCalculator: TimeCalculator;

  /**
   * 建立 MRTimelineService 實例
   *
   * @param gitlabClient - GitLab API 客戶端
   * @param aiBotsConfig - 可選的自訂 AI Bot 使用者名稱清單
   */
  constructor(gitlabClient: InstanceType<typeof Gitlab>, aiBotsConfig?: string[]) {
    this.gitlabClient = gitlabClient;
    this.aiBotDetector = new AIBotDetector(aiBotsConfig);
    this.timeCalculator = new TimeCalculator();
  }

  /**
   * 分析單一 MR 的完整時間軸
   *
   * @param projectId - 專案 ID
   * @param mrIid - MR IID
   * @param options - 可選參數
   * @returns MR 時間軸分析結果
   */
  async analyze(
    projectId: number | string,
    mrIid: number,
    options: { verbose?: boolean } = {}
  ): Promise<MRTimeline> {
    const { verbose = false } = options;
    const startTime = Date.now();
    const perfLog: Record<string, number> = {};

    try {
      // T067: Fail-fast - 立即拋出 API 錯誤
      // 1. 獲取 MR 基本資訊
      const apiStart = Date.now();
      const mrData = await this.gitlabClient.MergeRequests.show(projectId, mrIid);
      perfLog['API: Get MR'] = Date.now() - apiStart;

      // 2. 獲取所有事件資料
      const fetchStart = Date.now();
      const [commits, notesRaw, pipelines] = await Promise.all([
        this.gitlabClient.MergeRequests.allCommits(projectId, mrIid),
        this.gitlabClient.MergeRequestNotes.all(projectId, mrIid),
        this.gitlabClient.MergeRequests.allPipelines(projectId, mrIid).catch(() => []),
      ]);
      perfLog['API: Fetch Events'] = Date.now() - fetchStart;

      // 將 GitLab API 類型轉換為我們的 GitLabNote 類型（含型別驗證）
      const notes: GitLabNote[] = (notesRaw ?? []).map((note) => ({
        id: note.id,
        body: note.body,
        author: {
          id: note.author.id,
          username: note.author.username,
          name: note.author.name,
        },
        created_at: String(note.created_at),
        system: Boolean(note.system),
      }));

      // 2.5. 獲取所有 notes 的 emoji reactions
      const emojiStart = Date.now();
      const noteEmojiReactions = await this.fetchEmojiReactions(projectId, mrIid, notes);
      perfLog['API: Fetch Emoji Reactions'] = Date.now() - emojiStart;

      // 3. 聚合評論數據（用於 AI Bot 檢測）
      const aggregateStart = Date.now();
      const userCommentData = this.aggregateUserComments(notes);
      perfLog['Aggregate Comments'] = Date.now() - aggregateStart;

      // 4. 建立 MRInfo（需要評論數據進行完整的 AI Bot 檢測）
      const buildInfoStart = Date.now();
      const mrInfo = this.buildMRInfo(mrData, userCommentData);
      perfLog['Build MR Info'] = Date.now() - buildInfoStart;

      // 5. 建立事件列表
      const buildEventsStart = Date.now();
      const events = this.buildEvents(mrData, commits, notes, pipelines, noteEmojiReactions);
      perfLog['Build Events'] = Date.now() - buildEventsStart;

      // 5. 計算時間間隔
      const calcIntervalsStart = Date.now();
      this.calculateIntervals(events);
      perfLog['Calculate Intervals'] = Date.now() - calcIntervalsStart;

      // 6. 計算週期時間
      // T069: 未合併的 MR 使用最後一個事件時間
      let cycleTimeSeconds = 0;
      if (events.length > 0) {
        const endTime = mrData.merged_at
          ? new Date(mrData.merged_at as string)
          : events[events.length - 1]!.timestamp; // 使用最後一個事件時間

        cycleTimeSeconds = this.timeCalculator.calculateInterval(
          new Date(mrData.created_at as string),
          endTime
        );
      }

      // 7. 建立時間段落（Phase 4: User Story 2）
      const segmentsStart = Date.now();
      const segments = this.calculateSegments(events, cycleTimeSeconds);
      perfLog['Calculate Segments'] = Date.now() - segmentsStart;

      // 8. 建立統計摘要
      const summaryStart = Date.now();
      const summary = this.calculateSummary(events, mrInfo.author.id);
      perfLog['Calculate Summary'] = Date.now() - summaryStart;

      // 9. 計算階段時間分布
      const phaseStart = Date.now();
      const phaseSegments = this.calculatePhaseSegments(events, cycleTimeSeconds);
      perfLog['Calculate Phase Segments'] = Date.now() - phaseStart;

      // T075: 輸出效能日誌
      const totalTime = Date.now() - startTime;
      if (verbose) {
        logger.debug('\n⏱️  效能分析：');
        logger.debug(`   總時長: ${totalTime}ms`);
        logger.debug(`   事件數量: ${events.length}`);
        logger.debug('\n   詳細計時：');
        for (const [step, time] of Object.entries(perfLog)) {
          const percentage = ((time / totalTime) * 100).toFixed(1);
          logger.debug(`   - ${step}: ${time}ms (${percentage}%)`);
        }
        logger.debug('');
      }

      return {
        mr: mrInfo,
        events,
        segments,
        phaseSegments,
        summary,
        cycleTimeSeconds,
      };
    } catch (error: any) {
      // T067: Fail-fast 策略 - 立即拋出結構化錯誤
      if (error.response?.status === 404) {
        throw ErrorClassifier.createNotFoundError('MR', mrIid);
      }
      // 其他錯誤直接拋出，讓上層統一處理
      throw error;
    }
  }

  /**
   * T014: 建立 MR 基本資訊
   *
   * @param mrData - GitLab MR API 回應資料
   * @param userCommentData - 使用者評論數據（用於 AI Bot 檢測）
   * @returns MRInfo
   */
  buildMRInfo(
    mrData: any,
    userCommentData?: Map<string, { avgLength: number; samples: string[]; firstCommentTime?: Date }>
  ): MRInfo {
    const mrCreatedAt = new Date(mrData.created_at);
    const commentData = userCommentData?.get(mrData.author.username);

    const author: Actor = {
      id: mrData.author.id,
      username: mrData.author.username,
      name: mrData.author.name,
      role: ActorRoleEnum.AUTHOR,
      isAIBot: this.aiBotDetector.isAIBot(
        mrData.author.username,
        mrCreatedAt,
        mrCreatedAt,
        commentData?.avgLength,
        commentData?.samples
      ),
    };

    return {
      id: mrData.iid,
      projectId: mrData.project_id,
      title: mrData.title,
      isDraft: mrData.draft || mrData.work_in_progress,
      author,
      createdAt: new Date(mrData.created_at),
      mergedAt: mrData.merged_at ? new Date(mrData.merged_at) : null,
      sourceBranch: mrData.source_branch,
      targetBranch: mrData.target_branch,
      webUrl: mrData.web_url,
      changesCount: Number(mrData.changes_count) || 0,
    };
  }

  /**
   * 獲取所有 notes 的 emoji reactions
   *
   * @param projectId - 專案 ID
   * @param mrIid - MR IID
   * @param notes - 評論列表
   * @returns Note ID → Emoji Reactions 的對應表
   */
  private async fetchEmojiReactions(
    projectId: number | string,
    mrIid: number,
    notes: GitLabNote[]
  ): Promise<Map<number, Array<{ emoji: string; username: string; name: string; createdAt: Date }>>> {
    const noteEmojiMap = new Map<number, Array<{ emoji: string; username: string; name: string; createdAt: Date }>>();

    // 只獲取非系統評論的 emoji reactions
    const userNotes = notes.filter(note => !note.system);

    // 批次獲取所有 emoji reactions（並發處理以提升效能）
    await Promise.all(
      userNotes.map(async (note) => {
        try {
          const emojis = await this.gitlabClient.MergeRequestNoteAwardEmojis.all(
            projectId,
            mrIid,
            note.id
          );

          if (emojis && emojis.length > 0) {
            noteEmojiMap.set(
              note.id,
              emojis.map((emoji: any) => ({
                emoji: emoji.name,
                username: emoji.user.username,
                name: emoji.user.name,
                createdAt: new Date(emoji.created_at),
              }))
            );
          }
        } catch (error) {
          // 忽略無法獲取 emoji reactions 的 note（可能是權限問題或 note 已刪除）
          logger.debug(`Failed to fetch emoji reactions for note ${note.id}: ${error}`);
        }
      })
    );

    return noteEmojiMap;
  }

  /**
   * T015: 建立並排序所有 MR 事件
   *
   * @param mrData - MR 資料
   * @param commits - Commit 列表
   * @param notes - 評論列表（包含系統事件如 Approved, Draft/Ready）
   * @param pipelines - Pipeline 列表
   * @param noteEmojiReactions - Note ID → Emoji Reactions 的對應表
   * @returns 排序後的事件列表
   */
  buildEvents(
    mrData: any,
    commits: any[],
    notes: any[],
    pipelines: any[],
    noteEmojiReactions: Map<number, Array<{ emoji: string; username: string; name: string; createdAt: Date }>>
  ): MREvent[] {
    const events: MREvent[] = [];
    const mrCreatedAt = new Date(mrData.created_at);

    // 預先聚合所有使用者的評論數據（用於 AI Bot 檢測層級 3 和 4）
    const userCommentData = this.aggregateUserComments(notes);

    // 檢測混合審查者的審查爆發模式
    const burstNoteIds = this.detectReviewBursts(notes, userCommentData);

    // T068: Edge case - 無 commit 的 MR（將在 formatter 中顯示提示訊息）
    // 此處不拋出錯誤，讓分析繼續進行

    // 1. Branch Created 事件（基於第一個 commit 的時間）
    // 注意：空 MR（無 commit）不會產生 Branch Created 事件，時間軸將從 MR Created 開始
    if (commits.length > 0) {
      // 找到最早的 commit（authored_date 最小的）
      const earliestCommit = commits.reduce((earliest, commit) => {
        const currentTime = new Date(commit.authored_date || commit.created_at).getTime();
        const earliestTime = new Date(earliest.authored_date || earliest.created_at).getTime();
        return currentTime < earliestTime ? commit : earliest;
      });

      const branchCreatedTime = new Date(earliestCommit.authored_date || earliestCommit.created_at);

      // 使用最早 commit 的作者作為 Branch Created 事件的作者
      // 因為分支可能由不同於 MR 作者的人建立（協作情境）
      const earliestCommitAuthorEmail = (earliestCommit.author_email || '').toLowerCase();
      const emailUsername = earliestCommitAuthorEmail.split('@')[0];
      const mrAuthorUsername = (mrData.author.username || '').toLowerCase();
      const isEarliestCommitByMRAuthor =
        emailUsername && mrAuthorUsername && emailUsername === mrAuthorUsername;

      const branchCreator = isEarliestCommitByMRAuthor
        ? mrData.author
        : {
            id: -1,
            username: earliestCommit.author_name || 'unknown',
            name: earliestCommit.author_name || 'Unknown',
          };

      events.push({
        sequence: 0,
        timestamp: branchCreatedTime,
        actor: this.createActor(branchCreator, ActorRoleEnum.AUTHOR, branchCreatedTime, mrCreatedAt, userCommentData),
        eventType: EventTypeEnum.BRANCH_CREATED,
        details: {
          branchName: mrData.source_branch || 'unknown',
        },
      });
    }

    // 2. MR Created 事件
    events.push({
      sequence: 0, // 暫時使用 0，稍後重新編號
      timestamp: mrCreatedAt,
      actor: this.createActor(mrData.author, ActorRoleEnum.AUTHOR, mrCreatedAt, mrCreatedAt, userCommentData),
      eventType: EventTypeEnum.MR_CREATED,
    });

    // 3. Commit 事件
    for (const commit of commits) {
      // 使用 authored_date 而非 created_at 來顯示真實開發時間
      // authored_date: 開發者實際 commit 的時間
      // created_at: GitLab 收到 push 的時間（批次 push 時會相同）
      const commitTime = new Date(commit.authored_date || commit.created_at);
      // GitLab commit API 返回 author_email，從中提取 username 比對
      const commitAuthorEmail = (commit.author_email || '').toLowerCase();
      const emailUsername = commitAuthorEmail.split('@')[0]; // 提取 email @ 之前的部分
      const mrAuthorUsername = (mrData.author.username || '').toLowerCase();
      const isCommitByMRAuthor =
        emailUsername && mrAuthorUsername && emailUsername === mrAuthorUsername;

      // 如果是 MR author 的 commit，使用 MR author 資料（包含完整 ID）
      const commitActor = isCommitByMRAuthor
        ? mrData.author
        : {
            id: -1, // 使用 -1 表示非 GitLab 使用者（避免與 0 系統事件混淆）
            username: commit.author_name || commit.committer_name || 'unknown',
            name: commit.author_name || commit.committer_name || 'Unknown',
          };

      // 根據時間判斷事件類型：MR 建立前 = Code Committed，MR 建立後 = Commit Pushed
      // 加入 5 秒容差以處理伺服器時鐘同步問題（參考 009-fix-review-time-calculation）
      const eventType = (commitTime.getTime() + TIME_TOLERANCE_MS) < mrCreatedAt.getTime()
        ? EventTypeEnum.CODE_COMMITTED
        : EventTypeEnum.COMMIT_PUSHED;

      events.push({
        sequence: 0,
        timestamp: commitTime,
        actor: this.createActor(commitActor, ActorRoleEnum.AUTHOR, commitTime, mrCreatedAt, userCommentData),
        eventType,
        details: {
          commitSha: commit.id,
          message: commit.title || commit.message,
        },
      });
    }

    // 3. 評論事件（AI Review、Human Review 或 Approved）
    // Notes are requested with sort=asc from the API, but we keep defensive sorting
    // here in case API behavior changes or pagination issues occur.
    // The hasEarlierAIReview check requires processing notes in chronological order.
    const sortedNotes = notes.sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Track the first non-hybrid AI review timestamp to optimize hybrid reviewer classification
    // This avoids O(n²) scanning of the events array for every note
    let firstNonHybridAIReviewTime: Date | null = null;

    for (const note of sortedNotes) {
      const noteTime = new Date(note.created_at);

      // 處理系統事件：Approved
      if (note.system && note.body === 'approved this merge request') {
        const commentData = userCommentData.get(note.author.username);
        const isAIBot = this.aiBotDetector.isAIBot(
          note.author.username,
          noteTime,
          mrCreatedAt,
          commentData?.avgLength,
          commentData?.samples
        );
        const role = isAIBot ? ActorRoleEnum.AI_REVIEWER : ActorRoleEnum.REVIEWER;

        events.push({
          sequence: 0,
          timestamp: noteTime,
          actor: this.createActor(note.author, role, noteTime, mrCreatedAt, userCommentData),
          eventType: EventTypeEnum.APPROVED,
        });
        continue;
      }

      // 處理系統事件：Marked as Ready / Marked as Draft
      // 移除 markdown 符號（如 **ready**）以確保正確匹配
      if (note.system) {
        const cleanedBody = note.body.replace(/\*\*/g, '').toLowerCase();

        if (READY_MARKERS.some(marker => cleanedBody.includes(marker))) {
          events.push({
            sequence: 0,
            timestamp: noteTime,
            actor: this.createActor(note.author, ActorRoleEnum.AUTHOR, noteTime, mrCreatedAt, userCommentData),
            eventType: EventTypeEnum.MARKED_AS_READY,
          });
          continue;
        }

        if (DRAFT_MARKERS.some(marker => cleanedBody.includes(marker))) {
          events.push({
            sequence: 0,
            timestamp: noteTime,
            actor: this.createActor(note.author, ActorRoleEnum.AUTHOR, noteTime, mrCreatedAt, userCommentData),
            eventType: EventTypeEnum.MARKED_AS_DRAFT,
          });
          continue;
        }
      }

      // 跳過其他系統評論
      if (note.system) continue;

      const commentData = userCommentData.get(note.author.username);
      const isAIBot = this.aiBotDetector.isAIBot(
        note.author.username,
        noteTime,
        mrCreatedAt,
        commentData?.avgLength,
        commentData?.samples
      );

      const isAuthor = note.author.id === mrData.author.id;
      const role = this.classifyActorRole(note.author, isAIBot, isAuthor);

      // 事件類型判斷（內容優先策略）
      // 1. 先檢查留言內容是否為 CI Bot 自動通知
      // 2. 再檢查是否為 AI Bot
      // 3. 再檢查是否為作者
      // 4. 最後才判定為人工審查
      let eventType: EventType;
      if (this.isCIBotComment(note.body)) {
        eventType = EventTypeEnum.CI_BOT_RESPONSE;
      } else if (isAIBot) {
        // Special handling for hybrid reviewers (reviewers who do both AI-assisted and manual reviews)
        if (isHybridReviewer(note.author.username)) {
          // Calculate response time from MR creation to this review comment
          // Note: This measures total wait time, not time since last commit
          // Rationale: AI-assisted reviews typically respond quickly after MR creation,
          // while manual reviews take longer regardless of subsequent commits
          //
          // Edge case: Reviews after 8+ hours (e.g., overnight) may still be AI-assisted
          // if the reviewer started work first thing in the morning. However, empirical
          // data shows this is rare - most legitimate AI reviews happen within minutes.
          const responseTimeSeconds = (noteTime.getTime() - mrCreatedAt.getTime()) / 1000;

          // Check if there's already an AI review from another (non-hybrid) reviewer
          // Use cached timestamp instead of scanning events array (O(1) vs O(n))
          const hasEarlierAIReview = firstNonHybridAIReviewTime !== null &&
                                      firstNonHybridAIReviewTime < noteTime;

          // Check if this note is part of a burst pattern
          const isBurstReview = burstNoteIds.has(note.id);

          if (shouldClassifyAsAIReview(note.author.username, responseTimeSeconds, hasEarlierAIReview, isBurstReview)) {
            eventType = EventTypeEnum.AI_REVIEW_STARTED;
          } else {
            eventType = EventTypeEnum.HUMAN_REVIEW_STARTED;
          }
        } else {
          eventType = EventTypeEnum.AI_REVIEW_STARTED;
          // Track the first non-hybrid AI review for hybrid reviewer classification
          if (firstNonHybridAIReviewTime === null) {
            firstNonHybridAIReviewTime = noteTime;
          }
        }
      } else if (isAuthor) {
        eventType = EventTypeEnum.AUTHOR_RESPONSE;
      } else {
        eventType = EventTypeEnum.HUMAN_REVIEW_STARTED;
      }

      // 獲取此 note 的 emoji reactions
      const emojiReactions = noteEmojiReactions.get(note.id) || [];

      events.push({
        sequence: 0,
        timestamp: noteTime,
        actor: this.createActor(note.author, role, noteTime, mrCreatedAt, userCommentData),
        eventType,
        details: {
          noteId: note.id > 0 ? note.id : undefined,  // Validate noteId is positive
          message: note.body.substring(0, MAX_MESSAGE_LENGTH),
          emojiReactions: emojiReactions.length > 0 ? emojiReactions : undefined,
        },
      });
    }

    // 4. Pipeline 事件
    for (const pipeline of pipelines) {
      // 只記錄 success 和 failed 狀態
      if (pipeline.status === 'success' || pipeline.status === 'failed') {
        const pipelineTime = new Date(pipeline.updated_at || pipeline.created_at);
        const eventType =
          pipeline.status === 'success' ? EventTypeEnum.PIPELINE_SUCCESS : EventTypeEnum.PIPELINE_FAILED;

        events.push({
          sequence: 0,
          timestamp: pipelineTime,
          actor: this.createActor(
            { id: 0, username: 'gitlab-ci', name: 'GitLab CI' },
            ActorRoleEnum.SYSTEM,
            pipelineTime,
            mrCreatedAt,
            userCommentData
          ),
          eventType,
          details: {
            pipelineId: pipeline.id,
            message: `Pipeline #${pipeline.iid}`,
          },
        });
      }
    }

    // 5. Merged 事件
    if (mrData.merged_at) {
      events.push({
        sequence: 0,
        timestamp: new Date(mrData.merged_at),
        actor: this.createActor(
          mrData.merged_by || mrData.author,
          ActorRoleEnum.AUTHOR,
          new Date(mrData.merged_at),
          mrCreatedAt,
          userCommentData
        ),
        eventType: EventTypeEnum.MERGED,
      });
    }

    // T077: 排序事件、去重、重新編號
    events.sort(compareEventsByTimestamp);

    // 去除完全重複的事件（相同時間戳、類型、操作者）
    const deduplicatedEvents = this.deduplicateEvents(events);

    // 重新編號
    deduplicatedEvents.forEach((event, index) => {
      event.sequence = index + 1;
    });

    return deduplicatedEvents;
  }

  /**
   * T077: 事件去重
   *
   * 根據時間戳、事件類型、操作者 ID 去除重複事件。
   * 如果兩個事件有相同的時間戳、類型和操作者，視為重複並移除。
   * 用於處理 GitLab API 可能返回的重複事件（如同一個 commit 在不同 API 端點出現）。
   *
   * @param events - 原始事件陣列
   * @returns 去重後的事件陣列
   *
   * @example
   * ```typescript
   * const events = [
   *   { timestamp: new Date('2024-01-01T10:00:00Z'), eventType: 'Commit Pushed', actor: { id: 1, ... } },
   *   { timestamp: new Date('2024-01-01T10:00:00Z'), eventType: 'Commit Pushed', actor: { id: 1, ... } }, // 重複
   *   { timestamp: new Date('2024-01-01T11:00:00Z'), eventType: 'Human Review', actor: { id: 2, ... } },
   * ];
   * const deduplicated = this.deduplicateEvents(events);
   * // 結果：2 個事件（第一個 commit 被保留，重複的被移除）
   * ```
   */
  private deduplicateEvents(events: MREvent[]): MREvent[] {
    const seen = new Set<string>();
    const result: MREvent[] = [];

    for (const event of events) {
      // 建立唯一鍵：時間戳 + 事件類型 + 操作者ID
      const key = `${event.timestamp.getTime()}_${event.eventType}_${event.actor.id}`;

      if (!seen.has(key)) {
        seen.add(key);
        result.push(event);
      }
    }

    return result;
  }

  /**
   * T016: 分類操作者角色
   *
   * @param user - 使用者資料
   * @param isAIBot - 是否為 AI Bot
   * @param isAuthor - 是否為作者
   * @returns ActorRole
   */
  classifyActorRole(user: any, isAIBot: boolean, isAuthor: boolean): ActorRole {
    // 作者優先規則：即使是 AI Bot，若為作者，角色應為 AUTHOR
    if (isAuthor) {
      return ActorRoleEnum.AUTHOR;
    }

    // AI Bot 識別
    if (isAIBot) {
      return ActorRoleEnum.AI_REVIEWER;
    }

    // 系統事件（無 user_id）
    if (!user || !user.id) {
      return ActorRoleEnum.SYSTEM;
    }

    // 其他人類審查者
    return ActorRoleEnum.REVIEWER;
  }

  /**
   * Detect review bursts for hybrid reviewers
   *
   * A burst is defined as multiple reviews from the same user within a short time window,
   * which is a strong indicator of AI-assisted review.
   *
   * @param notes - Sorted notes array
   * @param userCommentData - User comment metadata for AI bot detection
   * @returns Set of note IDs that are part of a burst
   */
  private detectReviewBursts(
    notes: any[],
    userCommentData: Map<string, { avgLength: number; samples: string[] }>
  ): Set<number> {
    const burstNoteIds = new Set<number>();

    // Group notes by author
    const notesByAuthor = new Map<string, Array<{ id: number; timestamp: Date }>>();

    for (const note of notes) {
      // Skip system notes
      if (note.system) continue;

      const username = note.author.username;
      const noteTime = new Date(note.created_at);

      // Check if this user is a hybrid reviewer with burst detection enabled
      const config = getHybridReviewerConfig(username);
      if (!config || !config.burstDetection) continue;

      // Check if this is a review note (not just a comment)
      const commentData = userCommentData.get(username);
      const isAIBot = this.aiBotDetector.isAIBot(
        username,
        noteTime,
        noteTime, // Use note time as reference
        commentData?.avgLength,
        commentData?.samples
      );

      if (!isAIBot) continue;

      if (!notesByAuthor.has(username)) {
        notesByAuthor.set(username, []);
      }

      notesByAuthor.get(username)!.push({
        id: note.id,
        timestamp: noteTime,
      });
    }

    // Analyze each author's notes for burst patterns
    for (const [username, userNotes] of notesByAuthor) {
      const config = getHybridReviewerConfig(username);
      if (!config?.burstDetection) continue;

      const { minReviewCount, timeWindowSeconds } = config.burstDetection;

      // Use sliding window to detect bursts
      for (let i = 0; i < userNotes.length; i++) {
        const windowStart = userNotes[i]!.timestamp;
        const windowEnd = new Date(windowStart.getTime() + timeWindowSeconds * 1000);

        // Count reviews within this window
        const reviewsInWindow: number[] = [];
        for (let j = i; j < userNotes.length; j++) {
          const note = userNotes[j]!;
          if (note.timestamp <= windowEnd) {
            reviewsInWindow.push(note.id);
          } else {
            break;
          }
        }

        // If we found a burst, mark all notes in it
        if (reviewsInWindow.length >= minReviewCount) {
          reviewsInWindow.forEach(id => burstNoteIds.add(id));
        }
      }
    }

    return burstNoteIds;
  }

  /**
   * 檢測是否為 CI/CD Bot 的自動留言
   *
   * CI/CD Bot 通常會發送自動化的留言來回報建置狀態，這些留言包含特定的模式：
   * - Jenkins 的自動回報 ("**Jenkins says:**")
   * - CI 狀態通知 ("CI started", "CI passed", "CI failed")
   * - Build 編號引用 ("[Build #123]", "Build number 123")
   * - LGTM 自動通過標記 ("LGTM :+1:")
   *
   * @param body - 留言內容
   * @returns 是否為 CI Bot 留言
   *
   * @example
   * ```typescript
   * isCIBotComment(":man_in_tuxedo_tone1: **Jenkins says:** CI started")  // true
   * isCIBotComment("**Jenkins says:** LGTM :+1:")                          // true
   * isCIBotComment("[Build #123](https://ci.example.com)")                 // true
   * isCIBotComment("This looks good to me")                                // false
   * ```
   */
  private isCIBotComment(body: string): boolean {
    const ciBotPatterns = [
      /\*\*Jenkins says:\*\*/i,           // Jenkins 自動回報
      /CI (started|passed|failed)/i,     // 通用 CI 訊息
      /Build number \d+/i,                // Build 編號
      /LGTM\s*:[\+\-]1:/,                 // Jenkins LGTM 標記
      /\[Build\s+#\d+\]/i,                // Build 連結格式
      /Pipeline\s+#\d+/i,                 // GitLab Pipeline 編號
      /pipeline\s+(passed|failed|succeeded|running)/i, // Pipeline 狀態
      /Coverage:\s+\d+/i,                 // Coverage 報告
      /\bMerge Request Test\b/i,          // MR 測試標題
      /successfully deployed/i,           // 部署成功訊息
      /\bCI\/CD\b/i,                      // CI/CD 關鍵字
      /^added\s+\d+\s+commit/i,           // Commit 追蹤訊息
      /^Pipeline for \w+/i,               // "Pipeline for branch_name"
      /🤖.*AI Code Review/i,              // AI Code Review Bot
      /\*\*Android AI Code Review\*\*/i,  // Android AI Code Review
      /\*\*iOS AI Code Review\*\*/i,      // iOS AI Code Review
    ];

    return ciBotPatterns.some(pattern => pattern.test(body));
  }

  /**
   * T017: 計算事件之間的時間間隔
   *
   * @param events - 事件列表（必須已排序）
   */
  calculateIntervals(events: MREvent[]): void {
    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i]!;
      const next = events[i + 1]!;

      current.intervalToNext = this.timeCalculator.calculateInterval(
        current.timestamp,
        next.timestamp
      );
    }

    // 最後一個事件沒有 intervalToNext
    if (events.length > 0) {
      events[events.length - 1]!.intervalToNext = undefined;
    }
  }

  /**
   * 聚合所有使用者的評論數據（用於 AI Bot 檢測）
   * Aggregates user comment data for AI bot detection
   *
   * @param notes - 評論列表 / Comment list
   * @returns 使用者評論數據對應表 (username -> { avgLength, samples, firstCommentTime })
   */
  private aggregateUserComments(
    notes: GitLabNote[]
  ): Map<string, { avgLength: number; samples: string[]; firstCommentTime?: Date }> {
    const userComments = new Map<string, { lengths: number[]; bodies: string[]; firstTime?: Date }>();

    // 收集每個使用者的評論長度和內容
    for (const note of notes) {
      // 只處理非系統評論
      if (note.system) continue;

      const username = note.author.username;
      const noteTime = new Date(note.created_at);

      if (!userComments.has(username)) {
        userComments.set(username, { lengths: [], bodies: [], firstTime: noteTime });
      }

      const data = userComments.get(username)!;
      data.lengths.push(note.body.length);
      data.bodies.push(note.body);

      // 更新最早評論時間
      if (!data.firstTime || noteTime < data.firstTime) {
        data.firstTime = noteTime;
      }
    }

    // 計算平均長度並限制樣本數量
    const result = new Map<string, { avgLength: number; samples: string[]; firstCommentTime?: Date }>();
    for (const [username, data] of userComments.entries()) {
      // Guard against division by zero (edge case: user only has system comments)
      const avgLength = data.lengths.length > 0
        ? data.lengths.reduce((sum, len) => sum + len, 0) / data.lengths.length
        : 0;
      // 只保留前 5 個評論作為樣本（足夠進行模式檢測）
      const samples = data.bodies.slice(0, 5);

      result.set(username, {
        avgLength,
        samples,
        firstCommentTime: data.firstTime,
      });
    }

    return result;
  }

  /**
   * 建立 Actor 物件
   *
   * @param user - 使用者資料
   * @param role - 角色
   * @param eventTime - 事件時間
   * @param mrCreatedAt - MR 建立時間
   * @param userCommentData - 使用者評論數據（用於 AI Bot 檢測）
   * @returns Actor
   */
  private createActor(
    user: any,
    role: ActorRole,
    eventTime: Date,
    mrCreatedAt: Date,
    userCommentData?: Map<string, { avgLength: number; samples: string[]; firstCommentTime?: Date }>
  ): Actor {
    if (!user || !user.id) {
      return {
        id: 0,
        username: 'system',
        name: 'System',
        role: ActorRoleEnum.SYSTEM,
        isAIBot: false,
      };
    }

    // 從聚合數據中提取該使用者的評論資訊（用於 AI Bot 檢測層級 3 和 4）
    const commentData = userCommentData?.get(user.username);
    const isAIBot = this.aiBotDetector.isAIBot(
      user.username,
      eventTime,
      mrCreatedAt,
      commentData?.avgLength,
      commentData?.samples
    );

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role,
      isAIBot,
    };
  }

  /**
   * T026: 識別關鍵狀態事件
   *
   * @param events - 所有事件
   * @returns 關鍵狀態事件對應表
   */
  private identifyKeyStateEvents(events: MREvent[]): Map<string, MREvent> {
    const keyStates = new Map<string, MREvent>();

    for (const event of events) {
      // MR Created - 總是第一個事件
      if (event.eventType === EventTypeEnum.MR_CREATED) {
        keyStates.set(KeyState.MR_CREATED, event);
      }

      // Marked as Ready - 處理 Draft MR 轉為 Ready 的事件
      if (event.eventType === EventTypeEnum.MARKED_AS_READY) {
        keyStates.set(KeyState.MARKED_AS_READY, event);
      }

      // First Commit - 第一個 commit 事件
      if (event.eventType === EventTypeEnum.COMMIT_PUSHED && !keyStates.has(KeyState.FIRST_COMMIT)) {
        keyStates.set(KeyState.FIRST_COMMIT, event);
      }

      // First AI Review - 第一個 AI 審查事件
      if (event.eventType === EventTypeEnum.AI_REVIEW_STARTED && !keyStates.has(KeyState.FIRST_AI_REVIEW)) {
        keyStates.set(KeyState.FIRST_AI_REVIEW, event);
      }

      // First Human Review - 第一個人工審查事件
      if (event.eventType === EventTypeEnum.HUMAN_REVIEW_STARTED && !keyStates.has(KeyState.FIRST_HUMAN_REVIEW)) {
        keyStates.set(KeyState.FIRST_HUMAN_REVIEW, event);
      }

      // Approved - 批准事件
      if (event.eventType === EventTypeEnum.APPROVED) {
        keyStates.set(KeyState.APPROVED, event);
      }

      // Merged - 合併事件
      if (event.eventType === EventTypeEnum.MERGED) {
        keyStates.set(KeyState.MERGED, event);
      }
    }

    return keyStates;
  }

  /**
   * T027-T029: 計算時間段落
   *
   * 動態產生時間段落，只包含實際發生的階段
   * 處理邊界情況：跳過的階段、順序顛倒、未合併的 MR
   *
   * @param events - 所有事件
   * @param totalCycleTimeSeconds - 總週期時間（秒數）
   * @returns 時間段落陣列
   */
  private calculateSegments(events: MREvent[], totalCycleTimeSeconds: number): TimeSegment[] {
    if (events.length === 0 || totalCycleTimeSeconds === 0) {
      return [];
    }

    const keyStates = this.identifyKeyStateEvents(events);
    const segments: TimeSegment[] = [];

    // 定義階段順序（按預期發生順序）
    const stageOrder = [
      KeyState.MR_CREATED,
      KeyState.MARKED_AS_READY,
      KeyState.FIRST_COMMIT,
      KeyState.FIRST_AI_REVIEW,
      KeyState.FIRST_HUMAN_REVIEW,
      KeyState.APPROVED,
      KeyState.MERGED,
    ];

    // 找出實際發生的階段，並按時間順序排序（而非預設順序）
    const occurredEvents: Array<{ stage: string; event: MREvent }> = [];
    for (const stage of stageOrder) {
      if (keyStates.has(stage)) {
        occurredEvents.push({ stage, event: keyStates.get(stage)! });
      }
    }

    // T029: 按實際時間順序排序（處理順序顛倒的情況）
    occurredEvents.sort((a, b) => a.event.timestamp.getTime() - b.event.timestamp.getTime());

    // 若沒有合併，加入 CURRENT 作為最後階段
    const lastEvent = events[events.length - 1];
    const isMerged = keyStates.has(KeyState.MERGED);

    // 建立時間段落
    for (let i = 0; i < occurredEvents.length - 1; i++) {
      const fromEvent = occurredEvents[i]!.event;
      const toEvent = occurredEvents[i + 1]!.event;

      const durationSeconds = this.timeCalculator.calculateInterval(
        fromEvent.timestamp,
        toEvent.timestamp
      );

      segments.push({
        from: this.mapEventTypeToKeyState(fromEvent.eventType),
        to: this.mapEventTypeToKeyState(toEvent.eventType),
        fromEvent,
        toEvent,
        durationSeconds,
        percentage: 0, // 稍後計算
      });
    }

    if (!isMerged && occurredEvents.length > 0) {
      // 未合併的 MR：最後一個階段 → Current
      const lastStateEvent = occurredEvents[occurredEvents.length - 1]!.event;

      // 只有當最後一個關鍵狀態事件不是最後一個事件時，才需要產生「Last Event → Current」段落
      if (lastEvent && lastStateEvent.timestamp.getTime() !== lastEvent.timestamp.getTime()) {
        segments.push({
          from: this.mapEventTypeToKeyState(lastStateEvent.eventType),
          to: KeyState.CURRENT,
          fromEvent: lastStateEvent,
          toEvent: lastEvent,
          durationSeconds: this.timeCalculator.calculateInterval(
            lastStateEvent.timestamp,
            lastEvent.timestamp
          ),
          percentage: 0, // 稍後計算
        });
      }
    }

    // T028: 計算百分比並驗證總和為 100%
    if (totalCycleTimeSeconds > 0) {
      for (const segment of segments) {
        segment.percentage = (segment.durationSeconds / totalCycleTimeSeconds) * 100;
      }

      // 驗證百分比總和（允許 1% 容差）
      const totalPercentage = segments.reduce((sum, seg) => sum + seg.percentage, 0);
      const tolerance = 1.0;

      if (Math.abs(totalPercentage - 100) > tolerance) {
        // 正規化百分比以確保總和為 100%
        const adjustmentFactor = 100 / totalPercentage;
        for (const segment of segments) {
          segment.percentage *= adjustmentFactor;
        }
      }
    }

    return segments;
  }

  /**
   * 計算階段時間分布 (Dev/Wait/Review/Merge)
   *
   * @param events - 事件列表
   * @param totalCycleTimeSeconds - 總週期時間
   * @returns 階段時間分布列表
   */
  private calculatePhaseSegments(events: MREvent[], totalCycleTimeSeconds: number): PhaseSegment[] {
    if (events.length === 0 || totalCycleTimeSeconds === 0) {
      return [];
    }

    const keyStates = this.identifyKeyStateEvents(events);
    const phaseSegments: PhaseSegment[] = [];

    // 找到關鍵事件
    const branchCreatedEvent = events.find(e => e.eventType === EventTypeEnum.BRANCH_CREATED);
    const mrCreatedEvent = keyStates.get(KeyState.MR_CREATED);
    const markedAsReadyEvent = keyStates.get(KeyState.MARKED_AS_READY);
    const firstAIReviewEvent = keyStates.get(KeyState.FIRST_AI_REVIEW);
    const firstHumanReviewEvent = keyStates.get(KeyState.FIRST_HUMAN_REVIEW);
    const approvedEvent = keyStates.get(KeyState.APPROVED);
    const mergedEvent = keyStates.get(KeyState.MERGED);
    const lastEvent = events[events.length - 1]!;

    // 確定 MR Ready 時間（必須存在）
    const mrReadyEvent = markedAsReadyEvent || mrCreatedEvent;
    if (!mrReadyEvent) {
      return []; // 無法計算階段
    }

    // 確定第一個 review 時間（MR Created 之後的第一個 review）
    let firstReviewEvent: MREvent | undefined;

    // 比較 AI Review 和 Human Review，找出最早的（且在 MR Created 之後）
    // 注意：使用 MR Created 而非 MR Ready，因為 Draft MR 可能在標記為 Ready 之前就有 Review
    const mrCreatedTime = mrCreatedEvent?.timestamp.getTime() || 0;
    const aiReviewAfterCreated = firstAIReviewEvent && firstAIReviewEvent.timestamp.getTime() > mrCreatedTime;
    const humanReviewAfterCreated = firstHumanReviewEvent && firstHumanReviewEvent.timestamp.getTime() > mrCreatedTime;

    if (aiReviewAfterCreated && humanReviewAfterCreated) {
      firstReviewEvent = firstAIReviewEvent!.timestamp <= firstHumanReviewEvent!.timestamp
        ? firstAIReviewEvent
        : firstHumanReviewEvent;
    } else if (aiReviewAfterCreated) {
      firstReviewEvent = firstAIReviewEvent;
    } else if (humanReviewAfterCreated) {
      firstReviewEvent = firstHumanReviewEvent;
    }

    // 決定 Dev 階段的結束點和 Wait 階段的開始點
    // 對於 Draft MR，如果 First Review 早於 Marked as Ready，
    // 則 Dev 結束於 MR Created，Wait 開始於 MR Created（忽略 Marked as Ready）
    const devEndEvent =
      firstReviewEvent && firstReviewEvent.timestamp < mrReadyEvent.timestamp
        ? mrCreatedEvent!
        : mrReadyEvent;

    // Phase 1: Dev (Branch Created → Dev End Point)
    const devStartEvent = branchCreatedEvent || mrCreatedEvent;
    if (devStartEvent && devEndEvent && devStartEvent.timestamp < devEndEvent.timestamp) {
      const duration = this.timeCalculator.calculateInterval(
        devStartEvent.timestamp,
        devEndEvent.timestamp
      );
      phaseSegments.push({
        phase: Phase.DEV,
        durationSeconds: duration,
        percentage: 0, // 稍後計算
        fromEvent: devStartEvent,
        toEvent: devEndEvent,
      });
    }

    // Phase 2: Wait (Dev End Point → First Review)
    const waitEndEvent = firstReviewEvent || approvedEvent || lastEvent;
    if (waitEndEvent) {
      const duration = this.timeCalculator.calculateInterval(
        devEndEvent.timestamp,  // 使用 devEndEvent，確保與 Dev 階段銜接
        waitEndEvent.timestamp
      );
      phaseSegments.push({
        phase: Phase.WAIT,
        durationSeconds: duration,
        percentage: 0,
        fromEvent: devEndEvent,
        toEvent: waitEndEvent,
      });
    }

    // Phase 3: Review (First Review → Approved or Current)
    if (firstReviewEvent) {
      const reviewEndEvent = approvedEvent || lastEvent;
      const duration = this.timeCalculator.calculateInterval(
        firstReviewEvent.timestamp,
        reviewEndEvent.timestamp
      );
      phaseSegments.push({
        phase: Phase.REVIEW,
        durationSeconds: duration,
        percentage: 0,
        fromEvent: firstReviewEvent,
        toEvent: reviewEndEvent,
      });
    }

    // Phase 4: Merge (Approved → Merged)
    if (approvedEvent && mergedEvent) {
      const duration = this.timeCalculator.calculateInterval(
        approvedEvent.timestamp,
        mergedEvent.timestamp
      );
      phaseSegments.push({
        phase: Phase.MERGE,
        durationSeconds: duration,
        percentage: 0,
        fromEvent: approvedEvent,
        toEvent: mergedEvent,
      });
    }

    // 計算百分比
    if (totalCycleTimeSeconds > 0) {
      for (const segment of phaseSegments) {
        segment.percentage = (segment.durationSeconds / totalCycleTimeSeconds) * 100;
      }

      // 驗證並正規化百分比
      const totalPercentage = phaseSegments.reduce((sum, seg) => sum + seg.percentage, 0);
      if (totalPercentage > 0 && Math.abs(totalPercentage - 100) > 1.0) {
        const adjustmentFactor = 100 / totalPercentage;
        for (const segment of phaseSegments) {
          segment.percentage *= adjustmentFactor;
        }
      }
    }

    return phaseSegments;
  }

  /**
   * 將事件類型映射到關鍵狀態
   */
  private mapEventTypeToKeyState(eventType: EventType): KeyState {
    switch (eventType) {
      case EventTypeEnum.MR_CREATED:
        return KeyState.MR_CREATED;
      case EventTypeEnum.MARKED_AS_READY:
        return KeyState.MARKED_AS_READY;
      case EventTypeEnum.COMMIT_PUSHED:
        return KeyState.FIRST_COMMIT;
      case EventTypeEnum.AI_REVIEW_STARTED:
        return KeyState.FIRST_AI_REVIEW;
      case EventTypeEnum.HUMAN_REVIEW_STARTED:
        return KeyState.FIRST_HUMAN_REVIEW;
      case EventTypeEnum.APPROVED:
        return KeyState.APPROVED;
      case EventTypeEnum.MERGED:
        return KeyState.MERGED;
      default:
        return KeyState.CURRENT; // 預設返回 CURRENT
    }
  }

  /**
   * 計算統計摘要（用於 Phase 5: User Story 3）
   *
   * @param events - 事件列表
   * @param authorId - 作者 ID
   * @returns MRSummary
   */
  private calculateSummary(events: MREvent[], authorId: number): MRSummary {
    const summary = createEmptySummary();

    const allActors: Actor[] = [];

    // 找到 Approved 和 Merge 事件的時間，用於排除 Review 截止時間後的 Review
    // 優先使用 Approved 時間（批准後不應再有 Review），若無則降級使用 Merge 時間
    const approvedEvent = events.find(e => e.eventType === EventTypeEnum.APPROVED);
    const approvedTime = approvedEvent ? approvedEvent.timestamp : null;
    const mergeEvent = events.find(e => e.eventType === EventTypeEnum.MERGED);
    const mergeTime = mergeEvent ? mergeEvent.timestamp : null;

    // Review 截止時間：優先使用 Approved，若無則使用 Merge
    const reviewCutoffTime = approvedTime || mergeTime;

    // 初始化 commentBreakdown 計數器
    const commentBreakdown = {
      humanReviewComments: 0,
      aiComments: 0,
      authorResponses: 0,
      ciBotComments: 0,
    };

    for (const event of events) {
      allActors.push(event.actor);

      // 排除 Review 截止時間後的 Review 事件
      // - 優先在 Approved 後停止（批准後不應再有 Review）
      // - 若無 Approved，則在 Merge 後停止（合併後的 Review 無意義）
      const isReviewEvent =
        event.eventType === EventTypeEnum.AI_REVIEW_STARTED ||
        event.eventType === EventTypeEnum.HUMAN_REVIEW_STARTED;

      if (isReviewEvent && reviewCutoffTime && event.timestamp > reviewCutoffTime) {
        // 跳過 Review 截止時間後的 Review 事件
        continue;
      }

      switch (event.eventType) {
        case EventTypeEnum.CODE_COMMITTED:
        case EventTypeEnum.COMMIT_PUSHED:
          summary.commits++;
          break;
        case EventTypeEnum.AI_REVIEW_STARTED:
          summary.aiReviews++;
          commentBreakdown.aiComments++;
          break;
        case EventTypeEnum.HUMAN_REVIEW_STARTED:
          summary.humanComments++;
          commentBreakdown.humanReviewComments++;
          break;
        case EventTypeEnum.AUTHOR_RESPONSE:
          summary.humanComments++;
          commentBreakdown.authorResponses++;
          break;
        case EventTypeEnum.CI_BOT_RESPONSE:
          commentBreakdown.ciBotComments++;
          // CI Bot comments 不計入 humanComments，也不計入 totalEvents (當作噪音)
          break;
        case EventTypeEnum.PIPELINE_SUCCESS:
        case EventTypeEnum.PIPELINE_FAILED:
          summary.systemEvents++;
          break;
      }
    }

    summary.totalEvents = events.length;
    summary.contributors = deduplicateActors(allActors);
    summary.reviewers = excludeAuthor(
      summary.contributors.filter((a) => a.role === ActorRoleEnum.REVIEWER || a.role === ActorRoleEnum.AI_REVIEWER),
      authorId
    );

    // 加入 commentBreakdown 詳細資訊
    summary.commentBreakdown = commentBreakdown;

    return summary;
  }
}
