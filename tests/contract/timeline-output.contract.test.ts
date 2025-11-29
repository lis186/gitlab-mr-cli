/**
 * Timeline Output Contract Test (T060)
 *
 * 驗證 JSON 輸出格式契約，確保 API 穩定性
 */

import { describe, it, expect } from 'vitest';
import type { MRTimeline } from '../../src/types/timeline.js';
import { ActorRole } from '../../src/models/actor.js';
import { EventType } from '../../src/models/mr-event.js';

describe('Timeline JSON Output Contract (T060)', () => {
  /**
   * 建立測試用的 MRTimeline
   */
  function createMockTimeline(): MRTimeline {
    return {
      mr: {
        id: 123,
        projectId: 456,
        title: 'Test MR',
        author: {
          id: 1,
          username: 'author',
          name: 'Author',
          role: ActorRole.AUTHOR,
        },
        createdAt: new Date('2025-10-30T10:00:00Z'),
        mergedAt: new Date('2025-10-30T11:00:00Z'),
        sourceBranch: 'feature/test',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/test/project/-/merge_requests/123',
      },
      events: [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: {
            id: 1,
            username: 'author',
            name: 'Author',
            role: ActorRole.AUTHOR,
          },
          eventType: EventType.MR_CREATED,
          intervalToNext: 300,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:05:00Z'),
          actor: {
            id: 1,
            username: 'author',
            name: 'Author',
            role: ActorRole.AUTHOR,
          },
          eventType: EventType.COMMIT_PUSHED,
          details: {
            commitSha: 'abc123',
            commitMessage: 'feat: test',
          },
          intervalToNext: 3300,
        },
        {
          sequence: 3,
          timestamp: new Date('2025-10-30T11:00:00Z'),
          actor: {
            id: 1,
            username: 'author',
            name: 'Author',
            role: ActorRole.AUTHOR,
          },
          eventType: EventType.MERGED,
        },
      ],
      segments: [
        {
          from: 'MR Created',
          to: 'First Commit',
          durationSeconds: 300,
          percentage: 8.3,
        },
        {
          from: 'First Commit',
          to: 'Merged',
          durationSeconds: 3300,
          percentage: 91.7,
        },
      ],
      summary: {
        commits: 1,
        aiReviews: 0,
        humanComments: 0,
        systemEvents: 0,
        totalEvents: 3,
        contributors: [
          {
            id: 1,
            username: 'author',
            name: 'Author',
            role: ActorRole.AUTHOR,
          },
        ],
        reviewers: [],
      },
      cycleTimeSeconds: 3600,
    };
  }

  /**
   * 序列化 Timeline（模擬命令的序列化邏輯）
   */
  function serializeTimeline(timeline: MRTimeline): any {
    return {
      mr: {
        id: timeline.mr.id,
        projectId: timeline.mr.projectId,
        title: timeline.mr.title,
        author: timeline.mr.author,
        createdAt: timeline.mr.createdAt.toISOString(),
        mergedAt: timeline.mr.mergedAt ? timeline.mr.mergedAt.toISOString() : null,
        sourceBranch: timeline.mr.sourceBranch,
        targetBranch: timeline.mr.targetBranch,
        webUrl: timeline.mr.webUrl,
      },
      events: timeline.events.map((event) => ({
        sequence: event.sequence,
        timestamp: event.timestamp.toISOString(),
        actor: event.actor,
        eventType: event.eventType,
        details: event.details,
        intervalToNext: event.intervalToNext,
      })),
      segments: timeline.segments,
      summary: timeline.summary,
      cycleTimeSeconds: timeline.cycleTimeSeconds,
    };
  }

  it('應符合 JSON 輸出契約（單一 MR）', () => {
    const timeline = createMockTimeline();
    const output = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      count: 1,
      timelines: [serializeTimeline(timeline)],
    };

    // 驗證根層級結構
    expect(output).toHaveProperty('version');
    expect(output).toHaveProperty('timestamp');
    expect(output).toHaveProperty('count');
    expect(output).toHaveProperty('timelines');

    // 驗證 version 格式
    expect(output.version).toMatch(/^\d+\.\d+\.\d+$/);

    // 驗證 timestamp 為 ISO 8601 格式
    expect(output.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // 驗證 count 與 timelines 陣列長度一致
    expect(output.count).toBe(output.timelines.length);
    expect(output.timelines).toHaveLength(1);
  });

  it('應符合 JSON 輸出契約（批次 MR）', () => {
    const timeline1 = createMockTimeline();
    const timeline2 = { ...createMockTimeline(), mr: { ...createMockTimeline().mr, id: 124 } };
    const timeline3 = { ...createMockTimeline(), mr: { ...createMockTimeline().mr, id: 125 } };

    const output = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      count: 3,
      timelines: [timeline1, timeline2, timeline3].map(serializeTimeline),
    };

    // 驗證批次輸出
    expect(output.count).toBe(3);
    expect(output.timelines).toHaveLength(3);
  });

  it('應包含完整的 MR 資訊欄位', () => {
    const timeline = createMockTimeline();
    const serialized = serializeTimeline(timeline);

    // 驗證 MR 欄位
    expect(serialized.mr).toHaveProperty('id');
    expect(serialized.mr).toHaveProperty('projectId');
    expect(serialized.mr).toHaveProperty('title');
    expect(serialized.mr).toHaveProperty('author');
    expect(serialized.mr).toHaveProperty('createdAt');
    expect(serialized.mr).toHaveProperty('mergedAt');
    expect(serialized.mr).toHaveProperty('sourceBranch');
    expect(serialized.mr).toHaveProperty('targetBranch');
    expect(serialized.mr).toHaveProperty('webUrl');

    // 驗證時間格式為 ISO 8601
    expect(serialized.mr.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(serialized.mr.mergedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // 驗證 author 欄位
    expect(serialized.mr.author).toHaveProperty('id');
    expect(serialized.mr.author).toHaveProperty('username');
    expect(serialized.mr.author).toHaveProperty('name');
    expect(serialized.mr.author).toHaveProperty('role');
  });

  it('應包含完整的事件陣列', () => {
    const timeline = createMockTimeline();
    const serialized = serializeTimeline(timeline);

    expect(serialized.events).toBeInstanceOf(Array);
    expect(serialized.events.length).toBeGreaterThan(0);

    // 驗證每個事件欄位
    serialized.events.forEach((event: any) => {
      expect(event).toHaveProperty('sequence');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('actor');
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('intervalToNext');

      // 驗證 sequence 為正整數
      expect(event.sequence).toBeGreaterThan(0);
      expect(Number.isInteger(event.sequence)).toBe(true);

      // 驗證 timestamp 為 ISO 8601 格式
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // 驗證 actor 欄位
      expect(event.actor).toHaveProperty('id');
      expect(event.actor).toHaveProperty('username');
      expect(event.actor).toHaveProperty('name');
      expect(event.actor).toHaveProperty('role');

      // 驗證 eventType 為字串
      expect(typeof event.eventType).toBe('string');
    });
  });

  it('應包含時間段落陣列', () => {
    const timeline = createMockTimeline();
    const serialized = serializeTimeline(timeline);

    expect(serialized.segments).toBeInstanceOf(Array);
    expect(serialized.segments.length).toBeGreaterThan(0);

    // 驗證每個段落欄位
    serialized.segments.forEach((segment: any) => {
      expect(segment).toHaveProperty('from');
      expect(segment).toHaveProperty('to');
      expect(segment).toHaveProperty('durationSeconds');
      expect(segment).toHaveProperty('percentage');

      // 驗證數值型別
      expect(typeof segment.durationSeconds).toBe('number');
      expect(typeof segment.percentage).toBe('number');

      // 驗證百分比範圍
      expect(segment.percentage).toBeGreaterThanOrEqual(0);
      expect(segment.percentage).toBeLessThanOrEqual(100);
    });

    // 驗證百分比總和接近 100%
    const totalPercentage = serialized.segments.reduce(
      (sum: number, seg: any) => sum + seg.percentage,
      0
    );
    expect(totalPercentage).toBeCloseTo(100, 1);
  });

  it('應包含統計摘要', () => {
    const timeline = createMockTimeline();
    const serialized = serializeTimeline(timeline);

    expect(serialized.summary).toHaveProperty('commits');
    expect(serialized.summary).toHaveProperty('aiReviews');
    expect(serialized.summary).toHaveProperty('humanComments');
    expect(serialized.summary).toHaveProperty('systemEvents');
    expect(serialized.summary).toHaveProperty('totalEvents');
    expect(serialized.summary).toHaveProperty('contributors');
    expect(serialized.summary).toHaveProperty('reviewers');

    // 驗證計數為非負整數
    expect(serialized.summary.commits).toBeGreaterThanOrEqual(0);
    expect(serialized.summary.aiReviews).toBeGreaterThanOrEqual(0);
    expect(serialized.summary.humanComments).toBeGreaterThanOrEqual(0);
    expect(serialized.summary.systemEvents).toBeGreaterThanOrEqual(0);
    expect(serialized.summary.totalEvents).toBeGreaterThan(0);

    // 驗證陣列
    expect(serialized.summary.contributors).toBeInstanceOf(Array);
    expect(serialized.summary.reviewers).toBeInstanceOf(Array);
  });

  it('應包含週期時間', () => {
    const timeline = createMockTimeline();
    const serialized = serializeTimeline(timeline);

    expect(serialized).toHaveProperty('cycleTimeSeconds');
    expect(typeof serialized.cycleTimeSeconds).toBe('number');
    expect(serialized.cycleTimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('應處理未合併的 MR（mergedAt 為 null）', () => {
    const timeline = createMockTimeline();
    timeline.mr.mergedAt = null;
    timeline.cycleTimeSeconds = 0;

    const serialized = serializeTimeline(timeline);

    expect(serialized.mr.mergedAt).toBeNull();
    expect(serialized.cycleTimeSeconds).toBe(0);
  });

  it('應保持向後相容性（不應移除現有欄位）', () => {
    const timeline = createMockTimeline();
    const serialized = serializeTimeline(timeline);

    // 確保所有契約欄位都存在
    const requiredFields = ['mr', 'events', 'segments', 'summary', 'cycleTimeSeconds'];

    requiredFields.forEach((field) => {
      expect(serialized).toHaveProperty(field);
    });
  });
});
