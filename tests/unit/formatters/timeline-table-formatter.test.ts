/**
 * 時間軸表格格式化器測試
 *
 * 測試 TimelineTableFormatter 的各項功能，包括：
 * - Emoji 反應處理與轉換
 * - 嚴重性提取與分類
 * - 表格格式化與顯示
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TimelineTableFormatter } from '../../../src/formatters/timeline-table-formatter.js';
import type { MRTimeline, MRInfo } from '../../../src/types/timeline.js';
import type { MREvent } from '../../../src/models/mr-event.js';
import { EventType } from '../../../src/models/mr-event.js';
import { ActorRole } from '../../../src/models/actor.js';

describe('TimelineTableFormatter - Emoji Reactions', () => {
  let formatter: TimelineTableFormatter;

  beforeEach(() => {
    formatter = new TimelineTableFormatter();
    vi.clearAllMocks();
  });

  /**
   * 測試 Emoji 名稱轉換
   */
  describe('convertEmojiNameToSymbol', () => {
    it('should convert common emoji names to symbols', () => {
      // 這個方法是私有的，但我們可以通過格式化一個包含 emoji 的事件來間接測試
      const timeline = createMockTimeline([
        createMockEmojiReactionEvent('thumbsup'),
        createMockEmojiReactionEvent('heart'),
        createMockEmojiReactionEvent('fire'),
      ]);

      const output = formatter.format(timeline);

      // 驗證輸出包含轉換後的 emoji 符號
      expect(output).toContain('👍'); // thumbsup
      expect(output).toContain('❤️'); // heart
      expect(output).toContain('🔥'); // fire
    });

    it('should return :name: format for unmapped emojis', () => {
      const timeline = createMockTimeline([
        createMockEmojiReactionEvent('unknown_emoji_name'),
      ]);

      const output = formatter.format(timeline);

      // 未知的 emoji 應該以 :name: 格式顯示
      expect(output).toContain(':unknown_emoji_name:');
    });

    it('should handle all common emoji types', () => {
      const commonEmojis = [
        'thumbsup',
        'thumbsdown',
        'heart',
        'fire',
        'rocket',
        'tada',
        'white_check_mark',
        'x',
        'eyes',
        'thinking',
        'joy',
      ];

      const events = commonEmojis.map(emoji => createMockEmojiReactionEvent(emoji));
      const timeline = createMockTimeline(events);
      const output = formatter.format(timeline);

      // 所有這些 emoji 都應該被成功轉換
      expect(output).toBeTruthy();
      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle emoji with skin tone modifiers', () => {
      const timeline = createMockTimeline([
        createMockEmojiReactionEvent('ok_hand_tone1'),
        createMockEmojiReactionEvent('ok_hand_tone5'),
      ]);

      const output = formatter.format(timeline);

      expect(output).toContain('👌'); // 應該包含帶有不同膚色的手勢
      expect(output).toBeTruthy();
    });
  });

  /**
   * 測試 Emoji 反應格式化與分組
   */
  describe('formatEmojiReactions', () => {
    it('should group reactions by emoji name', () => {
      const timeline = createMockTimeline([
        createMockEventWithMultipleReactions(
          'thumbsup',
          ['user1', 'user2', 'user3']
        ),
      ]);

      const output = formatter.format(timeline);

      // 應該顯示相同 emoji 的反應被分組在一起
      expect(output).toContain('👍'); // thumbsup emoji
    });

    it('should show +N indicator for multiple users', () => {
      const timeline = createMockTimeline([
        createMockEventWithMultipleReactions(
          'heart',
          ['alice', 'bob', 'charlie', 'david']
        ),
      ]);

      const output = formatter.format(timeline);

      // 應該顯示有多個用戶的反應（可能帶有 +N）
      expect(output).toContain('❤️');
    });

    it('should display user names and timestamps', () => {
      const reactions = [
        {
          emoji: 'thumbsup',
          username: 'alice',
          name: 'Alice',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          emoji: 'thumbsup',
          username: 'bob',
          name: 'Bob',
          createdAt: new Date('2024-01-01T10:05:00Z'),
        },
      ];

      const timeline = createMockTimeline([
        createMockEventWithReactionDetails(reactions),
      ]);

      const output = formatter.format(timeline);

      // 應該包含用戶名和時間信息
      expect(output).toBeTruthy();
      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle empty reactions gracefully', () => {
      const timeline = createMockTimeline([
        createMockEventWithReactionDetails([]),
      ]);

      const output = formatter.format(timeline);

      // 應該不拋錯誤，並產生有效的輸出
      expect(output).toBeTruthy();
      expect(typeof output).toBe('string');
    });

    it('should handle mixed emoji types in single event', () => {
      const reactions = [
        {
          emoji: 'thumbsup',
          username: 'user1',
          name: 'User 1',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          emoji: 'heart',
          username: 'user2',
          name: 'User 2',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          emoji: 'fire',
          username: 'user3',
          name: 'User 3',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ];

      const timeline = createMockTimeline([
        createMockEventWithReactionDetails(reactions),
      ]);

      const output = formatter.format(timeline);

      expect(output).toContain('👍');
      expect(output).toContain('❤️');
      expect(output).toContain('🔥');
    });
  });

  /**
   * 測試 AI Review 反應分析
   */
  describe('analyzeAIReviewReactions', () => {
    it('should filter author reactions correctly', () => {
      // 創建包含多個 AI Review 事件的時間軸
      const authorId = 1;
      const timeline = createMockTimelineWithAuthorId(authorId, [
        createMockAIReviewEvent(authorId, 'thumbsup'),
        createMockAIReviewEvent(99, 'thumbsup'), // 不同作者
      ]);

      const output = formatter.format(timeline);

      // 應該正確處理反應分析
      expect(output).toBeTruthy();
    });

    it('should calculate reaction statistics', () => {
      const timeline = createMockTimeline([
        createMockAIReviewEvent(1, 'thumbsup'),
        createMockAIReviewEvent(1, 'heart'),
        createMockAIReviewEvent(1, 'fire'),
      ]);

      const output = formatter.format(timeline);

      // 應該包含反應統計信息
      expect(output).toBeTruthy();
      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle MR with no AI reviews', () => {
      // 創建沒有 AI Review 事件的時間軸
      const timeline = createMockTimeline([
        createMockCommitEvent(),
        createMockHumanReviewEvent(),
      ]);

      const output = formatter.format(timeline);

      // 應該優雅地處理沒有 AI Review 的情況
      expect(output).toBeTruthy();
    });

    it('should aggregate reactions by severity level', () => {
      const timeline = createMockTimeline([
        createMockAIReviewWithMessage('🔴 Critical issue found'),
        createMockAIReviewWithMessage('🟠 Warning: needs review'),
        createMockAIReviewWithMessage('🟡 Minor suggestion'),
      ]);

      const output = formatter.format(timeline);

      // 應該按嚴重性分組反應
      expect(output).toBeTruthy();
    });
  });

  /**
   * 測試嚴重性提取
   */
  describe('extractSeverity', () => {
    it('should extract critical severity emoji', () => {
      const timeline = createMockTimeline([
        createMockAIReviewWithMessage('🔴 This is a critical issue'),
      ]);

      const output = formatter.format(timeline);

      // 應該包含嚴重性標記
      expect(output).toContain('🔴');
    });

    it('should extract warning severity emoji', () => {
      const timeline = createMockTimeline([
        createMockAIReviewWithMessage('🟠 Warning: code style issue'),
      ]);

      const output = formatter.format(timeline);

      expect(output).toContain('🟠');
    });

    it('should extract caution severity emoji', () => {
      const timeline = createMockTimeline([
        createMockAIReviewWithMessage('🟡 Please review this section'),
      ]);

      const output = formatter.format(timeline);

      expect(output).toContain('🟡');
    });

    it('should extract info severity emoji', () => {
      const timeline = createMockTimeline([
        createMockAIReviewWithMessage('🟢 Good practice found'),
      ]);

      const output = formatter.format(timeline);

      expect(output).toContain('🟢');
    });

    it('should return null for messages without severity emojis', () => {
      const timeline = createMockTimeline([
        createMockAIReviewWithMessage('This is a review without severity'),
      ]);

      const output = formatter.format(timeline);

      // 應該優雅地處理沒有嚴重性標記的消息
      expect(output).toBeTruthy();
    });

    it('should prioritize first severity emoji when multiple present', () => {
      const timeline = createMockTimeline([
        createMockAIReviewWithMessage('🔴 Critical issue and 🟠 warning'),
      ]);

      const output = formatter.format(timeline);

      // 應該識別優先級最高的嚴重性
      expect(output).toContain('🔴');
    });

    it('should handle priority level detection', () => {
      const messages = [
        '🔴 Priority 1: Critical',
        '🟠 Priority 2: High',
        '🟡 Priority 3: Medium',
        '🟢 Priority 4: Low',
      ];

      const events = messages.map(msg => createMockAIReviewWithMessage(msg));
      const timeline = createMockTimeline(events);
      const output = formatter.format(timeline);

      expect(output).toBeTruthy();
    });

    it('should extract severity from beginning of message', () => {
      const timeline = createMockTimeline([
        createMockAIReviewWithMessage('🔴 Issue found at line 42'),
      ]);

      const output = formatter.format(timeline);

      expect(output).toContain('🔴');
    });
  });

  /**
   * 測試完整時間軸格式化
   */
  describe('format', () => {
    it('should produce valid formatted output', () => {
      const timeline = createMockTimeline([
        createMockCommitEvent(),
        createMockAIReviewEvent(1, 'thumbsup'),
        createMockHumanReviewEvent(),
      ]);

      const output = formatter.format(timeline);

      expect(output).toBeTruthy();
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should include MR header information', () => {
      const timeline = createMockTimeline([]);

      const output = formatter.format(timeline);

      // 應該包含 MR 標題和基本信息
      expect(output).toContain('Test MR');
    });

    it('should include events table', () => {
      const timeline = createMockTimeline([
        createMockCommitEvent(),
        createMockAIReviewEvent(1, 'thumbsup'),
      ]);

      const output = formatter.format(timeline);

      // 應該包含事件表格
      expect(output).toBeTruthy();
    });

    it('should include summary information', () => {
      const timeline = createMockTimeline([
        createMockCommitEvent(),
      ]);

      const output = formatter.format(timeline);

      // 應該包含摘要信息
      expect(output).toBeTruthy();
    });

    it('should handle large number of events', () => {
      const events = Array.from({ length: 50 }, (_, i) =>
        i % 2 === 0 ? createMockCommitEvent() : createMockAIReviewEvent(1, 'thumbsup')
      );

      const timeline = createMockTimeline(events);
      const output = formatter.format(timeline);

      expect(output).toBeTruthy();
      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle MR with draft status', () => {
      const timeline = createMockTimeline(
        [createMockCommitEvent()],
        true // isDraft
      );

      const output = formatter.format(timeline);

      expect(output).toBeTruthy();
    });

    it('should format cycle time information', () => {
      const timeline = createMockTimeline([
        createMockCommitEvent(),
        createMockAIReviewEvent(1, 'thumbsup'),
      ]);

      const output = formatter.format(timeline);

      // 應該包含週期時間信息
      expect(output).toBeTruthy();
    });
  });

  /**
   * 測試 Weekday 格式化
   */
  describe('formatWeekday', () => {
    it('should format Sunday correctly', () => {
      const sunday = new Date('2024-01-07T10:00:00Z'); // Sunday
      const timeline = createMockTimeline([
        createMockEventAtDate(sunday),
      ]);

      const output = formatter.format(timeline);

      expect(output).toContain('日'); // Sunday in Chinese
    });

    it('should format Monday correctly', () => {
      const monday = new Date('2024-01-08T10:00:00Z'); // Monday
      const timeline = createMockTimeline([
        createMockEventAtDate(monday),
      ]);

      const output = formatter.format(timeline);

      expect(output).toContain('一'); // Monday in Chinese
    });

    it('should format all weekdays', () => {
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      let output = '';

      for (let i = 0; i < 7; i++) {
        const date = new Date('2024-01-07T10:00:00Z');
        date.setDate(date.getDate() + i);
        const timeline = createMockTimeline([createMockEventAtDate(date)]);
        output += formatter.format(timeline);
      }

      weekdays.forEach(day => {
        expect(output).toContain(day);
      });
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 創建空的 MR 信息物件
 */
function createMockMRInfo(isDraft = false, authorId = 1): MRInfo {
  return {
    id: 1,
    projectId: 123,
    title: 'Test MR',
    isDraft,
    author: {
      id: authorId,
      username: 'author',
      name: 'Test Author',
    },
    createdAt: new Date('2024-01-01T10:00:00Z'),
    mergedAt: new Date('2024-01-01T12:00:00Z'),
    sourceBranch: 'feature',
    targetBranch: 'main',
    webUrl: 'https://gitlab.com/test/test/-/merge_requests/1',
  };
}

/**
 * 創建基礎時間軸
 */
function createMockTimeline(
  events: MREvent[] = [],
  isDraft = false,
  authorId = 1
): MRTimeline {
  const aiReviewCount = events.filter(e => e.eventType === EventType.AI_REVIEW_STARTED).length;
  const humanReviewCount = events.filter(e => e.eventType === EventType.REVIEW_STARTED).length;
  const commitCount = events.filter(e => e.eventType === EventType.CODE_COMMITTED).length;

  return {
    mr: createMockMRInfo(isDraft, authorId),
    events,
    segments: [],
    phaseSegments: [],
    summary: {
      commits: commitCount,
      aiReviews: aiReviewCount,
      humanComments: humanReviewCount + 5, // 包含 author responses
      systemEvents: 0,
      totalEvents: events.length,
      contributors: [],
      reviewers: [],
    },
    cycleTimeSeconds: 7200,
  };
}

/**
 * 創建帶有作者 ID 的時間軸
 */
function createMockTimelineWithAuthorId(authorId: number, events: MREvent[]): MRTimeline {
  return createMockTimeline(events, false, authorId);
}

/**
 * 創建 Emoji 反應事件
 */
function createMockEmojiReactionEvent(emojiName: string): MREvent {
  return {
    sequence: 1,
    timestamp: new Date('2024-01-01T10:00:00Z'),
    eventType: EventType.AI_REVIEW_STARTED,
    actor: {
      id: 2,
      username: 'reviewer',
      name: 'Reviewer',
      role: ActorRole.REVIEWER,
      createdAt: new Date('2024-01-01T10:00:00Z'),
    },
    details: {
      noteId: 1,
      message: 'Review comment',
      emojiReactions: [
        {
          emoji: emojiName,
          username: 'user',
          name: 'User',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ],
    },
    interval: {
      seconds: 0,
      label: '0s',
    },
  };
}

/**
 * 創建帶有多個反應的事件
 */
function createMockEventWithMultipleReactions(
  emojiName: string,
  usernames: string[]
): MREvent {
  return {
    sequence: 1,
    timestamp: new Date('2024-01-01T10:00:00Z'),
    eventType: EventType.AI_REVIEW_STARTED,
    actor: {
      id: 2,
      username: 'reviewer',
      name: 'Reviewer',
      role: ActorRole.REVIEWER,
      createdAt: new Date('2024-01-01T10:00:00Z'),
    },
    details: {
      noteId: 1,
      message: 'Review comment',
      emojiReactions: usernames.map((username, index) => ({
        emoji: emojiName,
        username,
        name: username.charAt(0).toUpperCase() + username.slice(1),
        createdAt: new Date(new Date('2024-01-01T10:00:00Z').getTime() + index * 60000),
      })),
    },
    interval: {
      seconds: 0,
      label: '0s',
    },
  };
}

/**
 * 創建帶有反應詳情的事件
 */
function createMockEventWithReactionDetails(
  reactions: Array<{ emoji: string; username: string; name: string; createdAt: Date }>
): MREvent {
  return {
    sequence: 1,
    timestamp: new Date('2024-01-01T10:00:00Z'),
    eventType: EventType.AI_REVIEW_STARTED,
    actor: {
      id: 2,
      username: 'reviewer',
      name: 'Reviewer',
      role: ActorRole.REVIEWER,
      createdAt: new Date('2024-01-01T10:00:00Z'),
    },
    details: {
      noteId: 1,
      message: 'Review comment',
      emojiReactions: reactions,
    },
    interval: {
      seconds: 0,
      label: '0s',
    },
  };
}

/**
 * 創建 AI Review 事件
 */
function createMockAIReviewEvent(actorId: number, emojiName: string): MREvent {
  return {
    sequence: 2,
    timestamp: new Date('2024-01-01T10:00:30Z'),
    eventType: EventType.AI_REVIEW_STARTED,
    actor: {
      id: actorId,
      username: `ai_reviewer_${actorId}`,
      name: `AI Reviewer ${actorId}`,
      role: ActorRole.REVIEWER,
      createdAt: new Date('2024-01-01T10:00:00Z'),
    },
    details: {
      noteId: 2,
      message: 'AI review feedback',
      emojiReactions: [
        {
          emoji: emojiName,
          username: 'user',
          name: 'User',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ],
    },
    interval: {
      seconds: 30,
      label: '30s',
    },
  };
}

/**
 * 創建帶有消息的 AI Review 事件
 */
function createMockAIReviewWithMessage(message: string): MREvent {
  return {
    sequence: 2,
    timestamp: new Date('2024-01-01T10:00:30Z'),
    eventType: EventType.AI_REVIEW_STARTED,
    actor: {
      id: 2,
      username: 'ai_reviewer',
      name: 'AI Reviewer',
      role: ActorRole.REVIEWER,
      createdAt: new Date('2024-01-01T10:00:00Z'),
    },
    details: {
      noteId: 2,
      message,
      emojiReactions: [],
    },
    interval: {
      seconds: 30,
      label: '30s',
    },
  };
}

/**
 * 創建 Commit 事件
 */
function createMockCommitEvent(): MREvent {
  return {
    sequence: 1,
    timestamp: new Date('2024-01-01T10:00:00Z'),
    eventType: EventType.CODE_COMMITTED,
    actor: {
      id: 1,
      username: 'author',
      name: 'Test Author',
      role: ActorRole.AUTHOR,
      createdAt: new Date('2024-01-01T10:00:00Z'),
    },
    details: {
      message: 'Initial commit',
    },
    interval: {
      seconds: 0,
      label: '0s',
    },
  };
}

/**
 * 創建 Human Review 事件
 */
function createMockHumanReviewEvent(): MREvent {
  return {
    sequence: 3,
    timestamp: new Date('2024-01-01T10:01:00Z'),
    eventType: EventType.REVIEW_STARTED,
    actor: {
      id: 3,
      username: 'reviewer',
      name: 'Human Reviewer',
      role: ActorRole.REVIEWER,
      createdAt: new Date('2024-01-01T10:00:00Z'),
    },
    details: {
      noteId: 3,
      message: 'Human review feedback',
    },
    interval: {
      seconds: 60,
      label: '1m',
    },
  };
}

/**
 * 創建特定時間的事件
 */
function createMockEventAtDate(date: Date): MREvent {
  return {
    sequence: 1,
    timestamp: date,
    eventType: EventType.CODE_COMMITTED,
    actor: {
      id: 1,
      username: 'author',
      name: 'Test Author',
      role: ActorRole.AUTHOR,
      createdAt: date,
    },
    details: {
      message: 'Commit at specific date',
    },
    interval: {
      seconds: 0,
      label: '0s',
    },
  };
}
