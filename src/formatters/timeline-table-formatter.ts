/**
 * MR 時間軸表格格式化器
 *
 * 將 MR 時間軸分析結果格式化為終端表格輸出
 */

import Table from 'cli-table3';
import chalk from 'chalk';
import type { MRTimeline } from '../types/timeline.js';
import type { MREvent } from '../models/mr-event.js';
import { EventType as EventTypeEnum } from '../models/mr-event.js';
import { ActorRole } from '../models/actor.js';
import { TimeCalculator } from '../lib/time-calculator.js';
import { logger } from '../utils/logger.js';
import {
  TIMELINE_EVENTS_TABLE_COL_WIDTHS,
  AI_REACTIONS_TABLE_COL_WIDTHS,
  STATS_SUMMARY_TABLE_COL_WIDTHS,
  CHINESE_WEEKDAYS,
  EMOJI_SEVERITY_MAP,
  SEVERITY_PRIORITY_ORDER,
  MESSAGE_PREFIX_LENGTH,
} from '../config/timeline-formatter-constants.js';

/**
 * 時間軸表格格式化器
 */
export class TimelineTableFormatter {
  private readonly timeCalculator: TimeCalculator;

  constructor() {
    this.timeCalculator = new TimeCalculator();
  }

  /**
   * 格式化 MR 時間軸為終端輸出
   *
   * @param timeline - MR 時間軸資料
   * @returns 格式化字串
   */
  format(timeline: MRTimeline): string {
    const output: string[] = [];

    // 1. MR 基本資訊
    output.push(this.formatMRHeader(timeline));

    // 2. 事件時間軸表格
    output.push(this.formatEventsTable(timeline.events, timeline.mr.isDraft));

    // 3. 統計摘要
    output.push(this.formatSummary(timeline));

    // 4. 週期時間摘要
    output.push(this.formatCycleTimeSummary(timeline));

    return output.join('\n');
  }

  /**
   * T019: 格式化 MR 標頭資訊
   */
  private formatMRHeader(timeline: MRTimeline): string {
    const { mr } = timeline;
    const output: string[] = [];

    output.push(chalk.bold.cyan('\n═══════════════════════════════════════════════'));
    output.push(chalk.bold.white(`  MR !${mr.id}: ${mr.title}`));
    output.push(chalk.bold.cyan('═══════════════════════════════════════════════'));
    output.push('');
    output.push(chalk.gray(`  作者: ${mr.author.name} (@${mr.author.username})`));
    output.push(chalk.gray(`  分支: ${mr.sourceBranch} → ${mr.targetBranch}`));
    output.push(chalk.gray(`  建立: ${this.timeCalculator.formatDateTime(mr.createdAt)}`));
    if (mr.mergedAt) {
      output.push(chalk.gray(`  合併: ${this.timeCalculator.formatDateTime(mr.mergedAt)}`));
    } else {
      output.push(chalk.yellow('  狀態: 未合併'));
    }
    output.push(chalk.gray(`  連結: ${mr.webUrl}`));
    output.push('');

    return output.join('\n');
  }

  /**
   * T019-T021: 格式化事件時間軸表格（按階段分組）
   */
  private formatEventsTable(events: MREvent[], isDraft: boolean): string {
    if (events.length === 0) {
      return chalk.yellow('⚠ 此 MR 沒有事件記錄');
    }

    // 按階段分組事件
    const phases = this.groupEventsByPhase(events);
    const output: string[] = [];
    output.push('\n' + chalk.bold('事件時間軸：'));

    // 追蹤第一次出現的 review 事件（用於區分 First vs 後續）
    const reviewTracker = {
      hasSeenAIReview: false,
      hasSeenHumanReview: false,
    };

    // 開發階段 (Dev)
    if (phases.development.length > 0) {
      output.push('\n' + chalk.bold.cyan('═══ 開發階段 (Dev) ═══'));
      output.push(this.formatPhaseEvents(phases.development, isDraft, reviewTracker));
    }

    // 等待審查階段 (Wait)
    if (phases.wait.length > 0) {
      output.push('\n' + chalk.bold.yellow('═══ 等待審查 (Wait) ═══'));
      output.push(this.formatPhaseEvents(phases.wait, isDraft, reviewTracker));
    }

    // 審查階段 (Review)
    if (phases.review.length > 0) {
      output.push('\n' + chalk.bold.green('═══ 審查階段 (Review) ═══'));
      output.push(this.formatPhaseEvents(phases.review, isDraft, reviewTracker));
    }

    // 合併階段 (Merge)
    if (phases.merge.length > 0) {
      output.push('\n' + chalk.bold.blue('═══ 合併階段 (Merge) ═══'));
      output.push(this.formatPhaseEvents(phases.merge, isDraft, reviewTracker));
    }

    return output.join('\n');
  }

  /**
   * 按階段分組事件（對應四階段模型：Dev / Wait / Review / Merge）
   */
  private groupEventsByPhase(events: MREvent[]): {
    development: MREvent[];
    wait: MREvent[];
    review: MREvent[];
    merge: MREvent[];
  } {
    const development: MREvent[] = [];
    const wait: MREvent[] = [];
    const review: MREvent[] = [];
    const merge: MREvent[] = [];

    // 找到關鍵事件的索引
    const mrReadyIndex = events.findIndex(
      (e) => e.eventType === EventTypeEnum.MARKED_AS_READY || e.eventType === EventTypeEnum.MR_CREATED
    );
    const firstReviewIndex = events.findIndex(
      (e) => e.eventType === EventTypeEnum.AI_REVIEW_STARTED || e.eventType === EventTypeEnum.HUMAN_REVIEW_STARTED
    );
    const mergedIndex = events.findIndex((e) => e.eventType === EventTypeEnum.MERGED);

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!;

      if (mergedIndex !== -1 && i >= mergedIndex) {
        // Merge 階段：Merged 及之後
        merge.push(event);
      } else if (event.eventType === EventTypeEnum.APPROVED) {
        // Approved 事件永遠屬於 Review 階段（即使沒有其他 review 事件）
        review.push(event);
      } else if (firstReviewIndex !== -1 && i >= firstReviewIndex) {
        // Review 階段：First Review 之後的所有事件（直到 Approved）
        review.push(event);
      } else if (mrReadyIndex !== -1 && i >= mrReadyIndex) {
        // Wait 階段：從 MR Ready 開始（包含 MR Ready 事件）到 First Review 或 Approved 之前
        wait.push(event);
      } else {
        // Dev 階段：開始到 MR Ready 之前（不包含 MR Ready 事件）
        development.push(event);
      }
    }

    return { development, wait, review, merge };
  }

  /**
   * 格式化單一階段的事件
   */
  private formatPhaseEvents(
    events: MREvent[],
    isDraft: boolean,
    reviewTracker: { hasSeenAIReview: boolean; hasSeenHumanReview: boolean }
  ): string {
    const table = new Table({
      head: [
        chalk.bold('#'),
        chalk.bold('時間'),
        chalk.bold('星期'),
        chalk.bold('操作者'),
        chalk.bold('角色'),
        chalk.bold('事件類型'),
        chalk.bold('間隔'),
      ],
      colWidths: [...TIMELINE_EVENTS_TABLE_COL_WIDTHS],
      wordWrap: true,
      style: {
        head: [],
        border: ['gray'],
      },
    });

    for (const event of events) {
      table.push([
        event.sequence.toString(),
        this.timeCalculator.formatDateTime(event.timestamp),
        this.formatWeekday(event.timestamp),
        `${event.actor.name}\n@${event.actor.username}`,
        this.formatRoleBadge(event.actor.role),
        this.formatEventType(event, isDraft, reviewTracker),
        this.formatInterval(event.intervalToNext),
      ]);
    }

    return table.toString();
  }

  /**
   * 格式化星期幾
   *
   * @param date - 日期時間
   * @returns 星期幾的中文簡稱
   */
  private formatWeekday(date: Date): string {
    const dayIndex = date.getDay();
    return CHINESE_WEEKDAYS[dayIndex] || '';
  }

  /**
   * T020: 格式化角色標籤
   *
   * @param role - 操作者角色
   * @returns 格式化的角色標籤
   */
  private formatRoleBadge(role: ActorRole): string {
    switch (role) {
      case ActorRole.AUTHOR:
        return chalk.blue('✍️  作者');
      case ActorRole.AI_REVIEWER:
        return chalk.magenta('🤖 AI審查者');
      case ActorRole.REVIEWER:
        return chalk.green('👤 審查者');
      case ActorRole.SYSTEM:
        return chalk.gray('⚙️  系統');
      default:
        return chalk.gray('❓ 未知');
    }
  }

  /**
   * 格式化事件類型（加入前綴標籤）
   */
  private formatEventType(
    event: MREvent,
    isDraft: boolean,
    reviewTracker: { hasSeenAIReview: boolean; hasSeenHumanReview: boolean }
  ): string {
    // 根據事件類型加入前綴
    let prefix = '';
    let displayName: string = event.eventType;

    switch (event.eventType) {
      case 'Branch Created':
        prefix = chalk.cyan('[BR] ');
        break;
      case 'Code Committed':
        prefix = chalk.cyan('[C] ');
        break;
      case 'Commit Pushed':
        prefix = chalk.cyan('[C+] ');
        break;
      case 'MR Created':
        // 區分 Draft MR Created vs Ready MR Created
        if (isDraft) {
          prefix = chalk.yellow('[MR📝] ');
          displayName = 'Draft MR Created';
        } else {
          prefix = chalk.white('[MR] ');
          displayName = 'MR Created';
        }
        break;
      case 'Marked as Draft':
        prefix = chalk.yellow('[DRAFT] ');
        break;
      case 'Marked as Ready':
        prefix = chalk.cyan('[READY] ');
        break;
      case 'AI Review Started':
        prefix = chalk.magenta('[AI] ');
        // 區分第一次和後續的 AI Review
        if (!reviewTracker.hasSeenAIReview) {
          displayName = 'First AI Review';
          reviewTracker.hasSeenAIReview = true;
        } else {
          displayName = 'AI Review Comment';
        }
        break;
      case 'Human Review Started':
        prefix = chalk.green('[R] ');
        // 區分第一次和後續的 Human Review
        if (!reviewTracker.hasSeenHumanReview) {
          displayName = 'First Human Review';
          reviewTracker.hasSeenHumanReview = true;
        } else {
          displayName = 'Review Comment';
        }
        break;
      case 'CI Bot Response':
        prefix = chalk.gray('[CI-BOT] ');
        break;
      case 'Author Response':
        prefix = chalk.blue('[A] ');
        break;
      case 'Approved':
        prefix = chalk.green('[✓] ');
        break;
      case 'Merged':
        prefix = chalk.yellow('[M] ');
        break;
      case 'Pipeline Success':
        prefix = chalk.green('[CI✓] ');
        break;
      case 'Pipeline Failed':
        prefix = chalk.red('[CI✗] ');
        break;
      default:
        prefix = '';
    }

    let typeStr: string = prefix + displayName;

    // 如果有計數資訊，加入顯示
    if (event.details?.count !== undefined) {
      typeStr = typeStr + chalk.gray(` (${event.details.count} 項)`);
    }

    // 如果有分支名稱（Branch Created 事件），顯示分支名稱
    if (event.details?.branchName) {
      const shortBranch = this.truncateMessage(event.details.branchName, 30);
      typeStr = typeStr + chalk.gray(`\n${shortBranch}`);
    }

    // T072: 如果有訊息，顯示前 30 字元（安全處理非 ASCII 字元）
    if (event.details?.message) {
      const shortMsg = this.truncateMessage(event.details.message, 30);
      typeStr = typeStr + chalk.gray(`\n${shortMsg}...`);
    }

    // 如果有 emoji reactions，顯示
    if (event.details?.emojiReactions && event.details.emojiReactions.length > 0) {
      const reactionSummary = this.formatEmojiReactions(event.details.emojiReactions);
      typeStr = typeStr + `\n${reactionSummary}`;
    }

    return typeStr;
  }

  /**
   * T021: 格式化時間間隔
   *
   * @param intervalSeconds - 時間間隔（秒數）
   * @returns 格式化字串
   */
  private formatInterval(intervalSeconds?: number): string {
    if (intervalSeconds === undefined) {
      return chalk.gray('─');
    }

    const formatted = this.timeCalculator.formatDuration(intervalSeconds);

    // 根據時間長度使用不同顏色
    if (intervalSeconds < 3600) {
      // < 1 小時：綠色
      return chalk.green(`➜ ${formatted}`);
    } else if (intervalSeconds < 86400) {
      // < 1 天：黃色
      return chalk.yellow(`➜ ${formatted}`);
    } else {
      // >= 1 天：紅色
      return chalk.red(`➜ ${formatted}`);
    }
  }

  /**
   * 格式化統計摘要
   */
  private formatSummary(timeline: MRTimeline): string {
    const { summary, mr } = timeline;
    const output: string[] = [];

    output.push('');
    output.push(chalk.bold.cyan('統計摘要：'));
    output.push('');

    // T068: 無 commit 的 MR 顯示提示
    if (summary.commits === 0) {
      output.push(chalk.yellow('⚠️  此 MR 目前沒有 commit - 等待開發者推送程式碼'));
      output.push('');
    }

    // T069: 未合併的 MR 顯示提示
    if (!mr.mergedAt) {
      output.push(chalk.yellow('ℹ️  此 MR 尚未合併 - 時間軸可能持續更新'));
      output.push('');
    }

    const statsTable = new Table({
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 2, 'padding-right': 2, border: ['gray'] },
    });

    statsTable.push(
      [chalk.bold('💾 Commits:'), summary.commits === 0 ? chalk.yellow('0 (等待推送)') : summary.commits.toString()],
      [chalk.bold('🤖 AI Reviews:'), summary.aiReviews.toString()],
      [chalk.bold('💬 Human Comments:'), summary.humanComments.toString()],
      [chalk.bold('⚙️  System Events:'), summary.systemEvents.toString()],
      [chalk.bold('📊 Total Events:'), summary.totalEvents.toString()],
      [
        chalk.bold('👥 Contributors:'),
        `${summary.contributors.length} (${summary.contributors.map((c) => c.name).join(', ')})`,
      ],
      [
        chalk.bold('🔍 Reviewers:'),
        summary.reviewers.length > 0
          ? `${summary.reviewers.length} (${summary.reviewers.map((r) => r.name).join(', ')})`
          : chalk.gray('無'),
      ]
    );

    output.push(statsTable.toString());

    // 添加 AI Review 反應統計
    const aiReviewReactionStats = this.formatAIReviewReactionStats(timeline);
    if (aiReviewReactionStats) {
      output.push(aiReviewReactionStats);
    }

    return output.join('\n');
  }

  /**
   * 格式化週期時間摘要
   */
  private formatCycleTimeSummary(timeline: MRTimeline): string {
    if (timeline.cycleTimeSeconds === 0) {
      return '';
    }

    const output: string[] = [];
    output.push('');
    output.push(chalk.bold.cyan('週期時間：'));
    output.push('');

    // T069: 未合併的 MR 顯示「至今」
    const timeLabel = timeline.mr.mergedAt
      ? '總時長'
      : '至今時長';
    const timeNote = timeline.mr.mergedAt
      ? ''
      : chalk.gray(' (持續進行中)');

    output.push(
      `  ${timeLabel}: ${chalk.bold.green(this.timeCalculator.formatDuration(timeline.cycleTimeSeconds))}${timeNote}`
    );

    // 顯示階段分布 (Dev/Wait/Review/Merge)
    if (timeline.phaseSegments && timeline.phaseSegments.length > 0) {
      output.push('');
      output.push(chalk.bold.cyan('階段分布：'));
      output.push('');
      output.push(this.formatPhaseSegmentsTable(timeline.phaseSegments));
    }

    output.push('');

    return output.join('\n');
  }

  /**
   * 格式化階段分布表格 (Dev/Wait/Review/Merge)
   */
  private formatPhaseSegmentsTable(phaseSegments: import('../models/time-segment.js').PhaseSegment[]): string {
    const table = new Table({
      head: [
        chalk.bold('階段'),
        chalk.bold('時長'),
        chalk.bold('佔比'),
        chalk.bold('進度條'),
      ],
      colWidths: [...AI_REACTIONS_TABLE_COL_WIDTHS],
      wordWrap: true,
      style: {
        head: [],
        border: ['gray'],
      },
    });

    for (const segment of phaseSegments) {
      table.push([
        this.formatPhaseName(segment.phase),
        this.timeCalculator.formatDuration(segment.durationSeconds),
        `${segment.percentage.toFixed(1)}%`,
        this.generateProgressBar(segment.percentage),
      ]);
    }

    return table.toString();
  }

  /**
   * 格式化階段名稱
   */
  private formatPhaseName(phase: string): string {
    switch (phase) {
      case 'Dev':
        return chalk.cyan('Dev');
      case 'Wait':
        return chalk.yellow('Wait');
      case 'Review':
        return chalk.green('Review');
      case 'Merge':
        return chalk.blue('Merge');
      default:
        return phase;
    }
  }

  /**
   * T072: 安全截斷訊息（處理非 ASCII 字元）
   *
   * @param message - 原始訊息
   * @param maxLength - 最大字元數
   * @returns 截斷後的訊息
   */
  private truncateMessage(message: string, maxLength: number): string {
    // 移除前後空白
    const trimmed = message.trim();

    // 如果訊息長度在限制內，直接返回
    if (trimmed.length <= maxLength) {
      return trimmed;
    }

    // 安全截斷：使用 substring（JavaScript 已正確處理 Unicode）
    // 確保不會在 surrogate pairs 中間截斷
    let truncated = trimmed.substring(0, maxLength);

    // 如果最後一個字元是高位代理（surrogate high），移除它以避免破壞 emoji
    const lastCharCode = truncated.charCodeAt(truncated.length - 1);
    if (lastCharCode >= 0xd800 && lastCharCode <= 0xdbff) {
      truncated = truncated.substring(0, truncated.length - 1);
    }

    return truncated;
  }

  /**
   * 格式化 emoji reactions
   *
   * @param reactions - Emoji reactions 列表
   * @returns 格式化字串
   */
  private formatEmojiReactions(
    reactions: Array<{ emoji: string; username: string; name: string; createdAt: Date }>
  ): string {
    // 按 emoji 分組統計
    const emojiGroups = new Map<string, Array<{ username: string; createdAt: Date }>>();

    for (const reaction of reactions) {
      if (!emojiGroups.has(reaction.emoji)) {
        emojiGroups.set(reaction.emoji, []);
      }
      emojiGroups.get(reaction.emoji)!.push({
        username: reaction.username,
        createdAt: reaction.createdAt,
      });
    }

    // 格式化為簡潔的顯示（每個 emoji 一行）
    const lines: string[] = [];
    for (const [emojiName, users] of emojiGroups) {
      // 取第一個使用者和時間
      const firstUser = users[0]!;
      const timeStr = this.timeCalculator.formatDateTime(firstUser.createdAt).split(' ')[1] || ''; // 只取時間部分

      // 如果有多個使用者按同一個 emoji，顯示數量
      const userInfo = users.length > 1
        ? `@${firstUser.username} +${users.length - 1}`
        : `@${firstUser.username}`;

      // 轉換 emoji 名稱為實際符號
      const emojiSymbol = this.convertEmojiNameToSymbol(emojiName);

      // 格式: 👤 @username emoji time
      lines.push(chalk.gray(`👤 ${userInfo} ${emojiSymbol} ${timeStr}`));
    }

    return lines.join('\n');
  }

  /**
   * T031: 產生視覺化進度條
   *
   * @param percentage - 百分比（0-100）
   * @returns 24 字元寬的進度條
   */
  private generateProgressBar(percentage: number): string {
    const barWidth = 24;
    const filledLength = Math.round((percentage / 100) * barWidth);
    const emptyLength = barWidth - filledLength;

    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(emptyLength);

    // 根據百分比著色
    if (percentage >= 30) {
      // 超過 30% 的段落用紅色標示（可能是瓶頸）
      return chalk.red(filled) + chalk.gray(empty);
    } else if (percentage >= 20) {
      // 20-30% 用黃色
      return chalk.yellow(filled) + chalk.gray(empty);
    } else {
      // < 20% 用綠色
      return chalk.green(filled) + chalk.gray(empty);
    }
  }

  /**
   * 將 emoji 名稱轉換為實際的 emoji 符號
   *
   * @param emojiName - GitLab emoji 名稱（如 'thumbsup', 'eyes'）
   * @returns emoji 符號（如 '👍', '👀'）
   */
  private convertEmojiNameToSymbol(emojiName: string): string {
    // 常見 GitLab emoji 名稱到 Unicode emoji 的映射
    const emojiMap: Record<string, string> = {
      // 手勢
      'thumbsup': '👍',
      'thumbsdown': '👎',
      '+1': '👍',
      '-1': '👎',
      'ok_hand': '👌',
      'ok_hand_tone1': '👌🏻',
      'ok_hand_tone2': '👌🏼',
      'ok_hand_tone3': '👌🏽',
      'ok_hand_tone4': '👌🏾',
      'ok_hand_tone5': '👌🏿',
      'clap': '👏',
      'wave': '👋',
      'raised_hand': '✋',
      'pray': '🙏',
      'muscle': '💪',
      'point_up': '☝️',
      'v': '✌️',

      // 表情
      'smile': '😄',
      'smiley': '😃',
      'grinning': '😀',
      'blush': '😊',
      'heart_eyes': '😍',
      'kissing_heart': '😘',
      'laughing': '😆',
      'stuck_out_tongue_winking_eye': '😜',
      'stuck_out_tongue': '😛',
      'sunglasses': '😎',
      'thinking': '🤔',
      'confused': '😕',
      'worried': '😟',
      'slightly_frowning_face': '🙁',
      'frowning': '☹️',
      'cry': '😢',
      'sob': '😭',
      'angry': '😠',
      'rage': '😡',
      'triumph': '😤',
      'disappointed': '😞',
      'sweat': '😓',
      'tired_face': '😫',
      'weary': '😩',
      'joy': '😂',
      'rofl': '🤣',
      'no_mouth': '😶',
      'neutral_face': '😐',
      'expressionless': '😑',
      'hushed': '😯',
      'flushed': '😳',
      'disappointed_relieved': '😥',
      'grimacing': '😬',
      'unamused': '😒',
      'roll_eyes': '🙄',
      'smirk': '😏',
      'zipper_mouth': '🤐',
      'mask': '😷',
      'face_with_thermometer': '🤒',
      'sleeping': '😴',
      'zzz': '💤',
      'sweat_smile': '😅',
      'relieved': '😌',
      'upside_down': '🙃',
      'innocent': '😇',
      'eyes': '👀',
      'eye': '👁️',

      // 心形
      'heart': '❤️',
      'yellow_heart': '💛',
      'green_heart': '💚',
      'blue_heart': '💙',
      'purple_heart': '💜',
      'black_heart': '🖤',
      'white_heart': '🤍',
      'orange_heart': '🧡',
      'brown_heart': '🤎',
      'sparkling_heart': '💖',
      'heartpulse': '💗',
      'heartbeat': '💓',
      'revolving_hearts': '💞',
      'two_hearts': '💕',

      // 符號
      'x': '❌',
      'heavy_check_mark': '✔️',
      'white_check_mark': '✅',
      'checkmark': '✓',
      'heavy_multiplication_x': '✖️',
      'question': '❓',
      'exclamation': '❗',
      'warning': '⚠️',
      'bangbang': '‼️',
      'star': '⭐',
      'fire': '🔥',
      'zap': '⚡',
      'boom': '💥',
      'sparkles': '✨',
      'tada': '🎉',
      'rocket': '🚀',
      'trophy': '🏆',
      'crown': '👑',
      '100': '💯',

      // 其他
      'bulb': '💡',
      'book': '📖',
      'memo': '📝',
      'pencil': '✏️',
      'pushpin': '📌',
      'link': '🔗',
      'mag': '🔍',
      'lock': '🔒',
      'unlock': '🔓',
      'key': '🔑',
      'bug': '🐛',
      'construction': '🚧',
      'tool': '🔧',
      'hammer': '🔨',
      'package': '📦',
      'gift': '🎁',
      'bell': '🔔',
      'loudspeaker': '📢',
      'speech_balloon': '💬',
      'thought_balloon': '💭',
    };

    if (!(emojiName in emojiMap)) {
      logger.debug(`Unmapped emoji name: ${emojiName}`);
    }

    return emojiMap[emojiName] || `:${emojiName}:`;
  }

  /**
   * 格式化 AI Review 反應統計
   *
   * @param timeline - MR 時間軸資料
   * @returns 格式化的統計字串，如果沒有 AI Review 則返回空字串
   */
  private formatAIReviewReactionStats(timeline: MRTimeline): string {
    const { events, summary, mr } = timeline;

    // 如果沒有 AI Review，不顯示統計
    if (summary.aiReviews === 0) {
      return '';
    }

    // 收集所有 AI Review 事件及其 emoji 反應
    // 使用 actor.role 判斷而非 eventType，因為 hybrid reviewer 可能顯示為 Human Review
    const aiReviewEvents = events.filter(
      (event) => {
        const eventTypeStr = String(event.eventType);
        return (
          (eventTypeStr.includes('Review') || eventTypeStr.includes('AI')) &&
          event.actor.role === 'AI Reviewer' &&
          event.details?.noteId !== undefined &&  // 必須有 noteId 才能有 emoji reactions
          event.details.noteId > 0  // 驗證 noteId 為有效的正整數
        );
      }
    );

    if (aiReviewEvents.length === 0) {
      return '';
    }

    // 分析 emoji 反應
    const reactionStats = this.analyzeAIReviewReactions(aiReviewEvents, mr.author.username);

    // 檢查是否有嚴重程度標記
    const hasSeverityTags = this.checkSeverityTags(aiReviewEvents);

    if (hasSeverityTags) {
      // 方案三：按嚴重程度分組統計
      return this.formatReactionStatsBySeverity(reactionStats, mr.author.username);
    } else {
      // 方案二：Emoji 排行榜（降級呈現）
      return this.formatReactionStatsSimple(reactionStats, mr.author.username);
    }
  }

  /**
   * 分析 AI Review 的 emoji 反應
   */
  private analyzeAIReviewReactions(
    aiReviewEvents: MREvent[],
    authorUsername: string
  ): AIReviewReactionStats {
    const stats: AIReviewReactionStats = {
      totalAIReviews: aiReviewEvents.length,
      reactionsCount: 0,
      emojiCounts: new Map(),
      severityBreakdown: new Map(),
    };

    for (const event of aiReviewEvents) {
      // 取得事件的嚴重程度
      const severity = this.extractSeverity(event.details?.message || '');

      // 過濾出作者的 emoji 反應
      const authorReactions = (event.details?.emojiReactions || []).filter(
        (reaction) => reaction.username === authorUsername
      );

      if (authorReactions.length > 0) {
        stats.reactionsCount++;

        // 統計每個 emoji 的使用次數
        for (const reaction of authorReactions) {
          const currentCount = stats.emojiCounts.get(reaction.emoji) || 0;
          stats.emojiCounts.set(reaction.emoji, currentCount + 1);

          // 按嚴重程度分組
          if (severity) {
            if (!stats.severityBreakdown.has(severity)) {
              stats.severityBreakdown.set(severity, {
                count: 0,
                emojiCounts: new Map(),
              });
            }
            const severityData = stats.severityBreakdown.get(severity)!;
            severityData.count++;
            const emojiCount = severityData.emojiCounts.get(reaction.emoji) || 0;
            severityData.emojiCounts.set(reaction.emoji, emojiCount + 1);
          }
        }
      } else if (severity) {
        // 沒有反應的 AI Review，但有嚴重程度標記
        if (!stats.severityBreakdown.has(severity)) {
          stats.severityBreakdown.set(severity, {
            count: 0,
            emojiCounts: new Map(),
          });
        }
      }
    }

    return stats;
  }

  /**
   * 將 Emoji 轉換為嚴重程度級別
   *
   * @param emoji - Emoji 符號
   * @returns 對應的嚴重程度級別，或 null
   */
  private mapEmojiToSeverity(emoji: string): SeverityLevel | null {
    const severity = EMOJI_SEVERITY_MAP[emoji as keyof typeof EMOJI_SEVERITY_MAP];
    return severity ? (severity as SeverityLevel) : null;
  }

  /**
   * 從 AI Review comment 中提取嚴重程度標記
   *
   * 使用優先級匹配：優先檢測行首或標題位置的 emoji，
   * 避免誤判內文中用於其他目的的 emoji（如示例或說明）
   */
  private extractSeverity(message: string): SeverityLevel | null {
    // Priority 1: 檢測行首的 emoji（最可靠）
    // Match emoji at the start of a line (most reliable)
    const lineStartMatch = message.match(/^(🔴|🟠|🟡|🟢)/m);
    if (lineStartMatch && lineStartMatch[1]) {
      const severity = this.mapEmojiToSeverity(lineStartMatch[1]);
      if (severity) return severity;
    }

    // Priority 2: 檢測標題格式（如 "### 🔴 Critical Issue"）
    // Match emoji in heading format
    const headingMatch = message.match(/^#{1,6}\s*(🔴|🟠|🟡|🟢)/m);
    if (headingMatch && headingMatch[1]) {
      const severity = this.mapEmojiToSeverity(headingMatch[1]);
      if (severity) return severity;
    }

    // Priority 3: 檢測前 MESSAGE_PREFIX_LENGTH 個字符內的 emoji（可能是嚴重程度標記）
    // Match emoji in first N characters (likely severity indicator)
    const prefix = message.slice(0, MESSAGE_PREFIX_LENGTH);
    for (const emoji of SEVERITY_PRIORITY_ORDER) {
      if (prefix.includes(emoji)) {
        const severity = this.mapEmojiToSeverity(emoji);
        if (severity) return severity;
      }
    }

    // Priority 4: 整個訊息中搜尋（最後的手段）
    // Fallback: search entire message
    for (const emoji of SEVERITY_PRIORITY_ORDER) {
      if (message.includes(emoji)) {
        const severity = this.mapEmojiToSeverity(emoji);
        if (severity) return severity;
      }
    }

    return null;
  }

  /**
   * 檢查是否有任何 AI Review 包含嚴重程度標記
   */
  private checkSeverityTags(aiReviewEvents: MREvent[]): boolean {
    return aiReviewEvents.some((event) => {
      const message = event.details?.message || '';
      return this.extractSeverity(message) !== null;
    });
  }

  /**
   * 方案三：按嚴重程度分組統計（有嚴重程度標記時使用）
   */
  private formatReactionStatsBySeverity(
    stats: AIReviewReactionStats,
    _authorUsername: string
  ): string {
    const output: string[] = [];
    output.push('');
    output.push(chalk.bold.cyan('AI Review 反應分析：'));
    output.push('');

    const table = new Table({
      head: [
        chalk.bold('嚴重程度'),
        chalk.bold('數量'),
        chalk.bold('作者反應'),
      ],
      colWidths: [...STATS_SUMMARY_TABLE_COL_WIDTHS],
      wordWrap: true,
      style: {
        head: [],
        border: ['gray'],
      },
    });

    // 定義嚴重程度順序和顯示名稱
    const severityOrder: Array<{ key: SeverityLevel; label: string; emoji: string }> = [
      { key: 'critical', label: 'Critical', emoji: '🔴' },
      { key: 'warning', label: 'Warning', emoji: '🟠' },
      { key: 'caution', label: 'Caution', emoji: '🟡' },
      { key: 'info', label: 'Info', emoji: '🟢' },
    ];

    let hasOther = false;
    let otherCount = 0;
    const otherEmojis = new Map<string, number>();

    // 計算 "Other" 類別的統計
    const totalWithSeverity = Array.from(stats.severityBreakdown.values())
      .reduce((sum, data) => sum + data.count, 0);

    if (stats.reactionsCount > totalWithSeverity) {
      hasOther = true;
      otherCount = stats.reactionsCount - totalWithSeverity;

      // 計算 Other 類別的 emoji 分布（從總計中減去已分類的）
      for (const [emoji, count] of stats.emojiCounts) {
        let countedInSeverity = 0;
        for (const severityData of stats.severityBreakdown.values()) {
          countedInSeverity += severityData.emojiCounts.get(emoji) || 0;
        }
        const otherEmojiCount = count - countedInSeverity;
        if (otherEmojiCount > 0) {
          otherEmojis.set(emoji, otherEmojiCount);
        }
      }
    }

    // 填充表格
    for (const { key, label, emoji } of severityOrder) {
      const severityData = stats.severityBreakdown.get(key);
      if (severityData && severityData.count > 0) {
        const reactionSummary = this.formatEmojiSummary(severityData.emojiCounts, severityData.count);
        table.push([
          `${emoji} ${label}`,
          severityData.count.toString(),
          reactionSummary,
        ]);
      }
    }

    // 添加 Other 類別
    if (hasOther) {
      const reactionSummary = this.formatEmojiSummary(otherEmojis, otherCount);
      table.push([
        `⚪ Other`,
        otherCount.toString(),
        reactionSummary,
      ]);
    }

    output.push(table.toString());

    // 添加洞察
    const insight = this.generateInsight(stats, hasOther ? otherCount : 0);
    if (insight) {
      output.push('');
      const insightTable = new Table({
        chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
        style: { 'padding-left': 2, 'padding-right': 2, border: ['gray'] },
      });
      insightTable.push([chalk.yellow(`💡 洞察：${insight}`)]);
      output.push(insightTable.toString());
    }

    return output.join('\n');
  }

  /**
   * 方案二：Emoji 排行榜（無嚴重程度標記時使用）
   */
  private formatReactionStatsSimple(
    stats: AIReviewReactionStats,
    authorUsername: string
  ): string {
    const output: string[] = [];
    output.push('');

    // 建立標題
    const titleTable = new Table({
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 2, 'padding-right': 2, border: ['gray'] },
    });
    titleTable.push([chalk.bold.cyan(`📊 AI Review 反應 Emoji 統計 (@${authorUsername})`)]);
    output.push(titleTable.toString());

    if (stats.reactionsCount === 0) {
      const noReactionTable = new Table({
        chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
        style: { 'padding-left': 2, 'padding-right': 2, border: ['gray'] },
      });
      noReactionTable.push([
        chalk.gray(`📝 總計`),
        chalk.gray(`${stats.totalAIReviews} 個 AI reviews，0 次 emoji 反應 (0%)`),
      ]);
      output.push(noReactionTable.toString());
      return output.join('\n');
    }

    // 排序 emoji（按使用次數降序）
    const sortedEmojis = Array.from(stats.emojiCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    const emojiTable = new Table({
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 2, 'padding-right': 2, border: ['gray'] },
    });

    // 顯示 emoji 排行榜
    for (const [emojiName, count] of sortedEmojis) {
      const emojiSymbol = this.convertEmojiNameToSymbol(emojiName);
      const barLength = Math.ceil((count / sortedEmojis[0]![1]) * 8); // 最多 8 個方塊
      const bar = '█'.repeat(barLength);
      emojiTable.push([
        emojiSymbol,
        `${bar} ${count} 次`,
      ]);
    }

    // 空行
    emojiTable.push(['', '']);

    // 總計和回應率
    const responseRate = ((stats.reactionsCount / stats.totalAIReviews) * 100).toFixed(0);
    emojiTable.push([
      chalk.bold('📝 總計'),
      `${stats.totalAIReviews} 個 AI reviews，${stats.reactionsCount} 次 emoji 反應 (${responseRate}%)`,
    ]);

    // 提示訊息
    emojiTable.push([
      chalk.yellow('💡 提示'),
      chalk.yellow('無法偵測嚴重程度標記，顯示簡化統計'),
    ]);

    output.push(emojiTable.toString());

    return output.join('\n');
  }

  /**
   * 格式化 emoji 摘要（用於嚴重程度表格）
   */
  private formatEmojiSummary(emojiCounts: Map<string, number>, totalCount: number): string {
    if (emojiCounts.size === 0) {
      return chalk.gray('無反應');
    }

    const sortedEmojis = Array.from(emojiCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    const parts: string[] = [];
    const sentimentSummary = this.categorizeSentiments(emojiCounts, totalCount);

    for (const [emojiName, count] of sortedEmojis) {
      const emojiSymbol = this.convertEmojiNameToSymbol(emojiName);
      parts.push(`${emojiSymbol} ${count}`);
    }

    return `${parts.join(', ')}  ${sentimentSummary}`;
  }

  /**
   * 將 emoji 反應分類為情緒並生成摘要
   */
  private categorizeSentiments(emojiCounts: Map<string, number>, totalCount: number): string {
    let positive = 0;
    let neutral = 0;
    let negative = 0;

    const positiveEmojis = ['thumbsup', '+1', 'ok_hand', 'ok_hand_tone1', 'ok_hand_tone2',
                           'ok_hand_tone3', 'ok_hand_tone4', 'ok_hand_tone5', 'clap',
                           'heart', 'white_check_mark', 'heavy_check_mark'];
    const neutralEmojis = ['eyes', 'thinking', 'eye'];
    const negativeEmojis = ['thumbsdown', '-1', 'x', 'heavy_multiplication_x'];

    for (const [emojiName, count] of emojiCounts) {
      if (positiveEmojis.includes(emojiName)) {
        positive += count;
      } else if (neutralEmojis.includes(emojiName)) {
        neutral += count;
      } else if (negativeEmojis.includes(emojiName)) {
        negative += count;
      } else {
        neutral += count; // 預設歸類為中立
      }
    }

    const parts: string[] = [];
    if (positive > 0) {
      const percent = Math.round((positive / totalCount) * 100);
      parts.push(`${percent}% 接受`);
    }
    if (neutral > 0) {
      const percent = Math.round((neutral / totalCount) * 100);
      parts.push(`${percent}% 考慮`);
    }
    if (negative > 0) {
      const percent = Math.round((negative / totalCount) * 100);
      parts.push(`${percent}% 不同意`);
    }

    return parts.length > 0 ? `(${parts.join(', ')})` : '';
  }

  /**
   * 生成洞察訊息
   */
  private generateInsight(stats: AIReviewReactionStats, otherCount: number): string {
    const insights: string[] = [];

    // 分析各嚴重程度的接受度
    const criticalData = stats.severityBreakdown.get('critical');
    const infoData = stats.severityBreakdown.get('info');

    if (infoData && infoData.count > 0) {
      const infoPositive = this.countPositiveReactions(infoData.emojiCounts);
      const infoAcceptRate = Math.round((infoPositive / infoData.count) * 100);
      if (infoAcceptRate >= 80) {
        insights.push(`作者對低嚴重度建議接受度高 (${infoAcceptRate}%)`);
      }
    }

    if (criticalData && criticalData.count > 0) {
      const criticalPositive = this.countPositiveReactions(criticalData.emojiCounts);
      const criticalNegative = this.countNegativeReactions(criticalData.emojiCounts);
      if (criticalNegative > criticalPositive) {
        insights.push(`對 Critical 建議持保留態度 (${Math.round((criticalNegative / criticalData.count) * 100)}% 不同意)，可能需要進一步討論`);
      }
    }

    if (otherCount > 0) {
      insights.push(`${otherCount} 個評論未標記嚴重程度`);
    }

    return insights.join('，');
  }

  /**
   * 計算正面反應數量
   */
  private countPositiveReactions(emojiCounts: Map<string, number>): number {
    const positiveEmojis = ['thumbsup', '+1', 'ok_hand', 'ok_hand_tone1', 'ok_hand_tone2',
                           'ok_hand_tone3', 'ok_hand_tone4', 'ok_hand_tone5', 'clap'];
    let count = 0;
    for (const [emoji, num] of emojiCounts) {
      if (positiveEmojis.includes(emoji)) {
        count += num;
      }
    }
    return count;
  }

  /**
   * 計算負面反應數量
   */
  private countNegativeReactions(emojiCounts: Map<string, number>): number {
    const negativeEmojis = ['thumbsdown', '-1', 'x', 'heavy_multiplication_x'];
    let count = 0;
    for (const [emoji, num] of emojiCounts) {
      if (negativeEmojis.includes(emoji)) {
        count += num;
      }
    }
    return count;
  }
}

/**
 * AI Review 反應統計資料結構
 */
interface AIReviewReactionStats {
  totalAIReviews: number;
  reactionsCount: number;
  emojiCounts: Map<string, number>;
  severityBreakdown: Map<SeverityLevel, {
    count: number;
    emojiCounts: Map<string, number>;
  }>;
}

/**
 * 嚴重程度等級
 */
type SeverityLevel = 'critical' | 'warning' | 'caution' | 'info';
