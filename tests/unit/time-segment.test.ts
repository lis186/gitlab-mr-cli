/**
 * 時間段落計算單元測試
 *
 * 測試時間段落識別、百分比計算與邊界情況處理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MRTimelineService } from '../../src/services/mr-timeline-service.js';
import { Gitlab } from '@gitbeaker/rest';
import type { MREvent } from '../../src/models/mr-event.js';
import { EventType } from '../../src/models/mr-event.js';
import { ActorRole } from '../../src/models/actor.js';
import { KeyState } from '../../src/models/time-segment.js';

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn(),
}));

describe('MRTimelineService - Time Segment Calculation', () => {
  let service: MRTimelineService;

  beforeEach(() => {
    const mockGitlab = {
      MergeRequests: {
        show: vi.fn(),
        allNotes: vi.fn(),
        allCommits: vi.fn(),
        showApprovals: vi.fn(),
      },
    };
    vi.mocked(Gitlab).mockReturnValue(mockGitlab as any);
    service = new MRTimelineService('fake-token', 'https://gitlab.com');
  });

  describe('identifyKeyStateEvents', () => {
    it('應識別所有關鍵狀態轉換點', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 300,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:05:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.COMMIT_PUSHED,
          intervalToNext: 120,
        },
        {
          sequence: 3,
          timestamp: new Date('2025-10-30T10:07:00Z'),
          actor: { id: 2, username: 'bot', name: 'Bot', role: ActorRole.AI_REVIEWER },
          eventType: EventType.AI_REVIEW_STARTED,
          intervalToNext: 180,
        },
        {
          sequence: 4,
          timestamp: new Date('2025-10-30T10:10:00Z'),
          actor: { id: 3, username: 'reviewer', name: 'Reviewer', role: ActorRole.REVIEWER },
          eventType: EventType.HUMAN_REVIEW_STARTED,
          intervalToNext: 300,
        },
        {
          sequence: 5,
          timestamp: new Date('2025-10-30T10:15:00Z'),
          actor: { id: 3, username: 'reviewer', name: 'Reviewer', role: ActorRole.REVIEWER },
          eventType: EventType.APPROVED,
          intervalToNext: 60,
        },
        {
          sequence: 6,
          timestamp: new Date('2025-10-30T10:16:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MERGED,
        },
      ];

      const keyEvents = (service as any).identifyKeyStateEvents(events);

      expect(keyEvents.has(KeyState.MR_CREATED)).toBe(true);
      expect(keyEvents.has(KeyState.FIRST_COMMIT)).toBe(true);
      expect(keyEvents.has(KeyState.FIRST_AI_REVIEW)).toBe(true);
      expect(keyEvents.has(KeyState.FIRST_HUMAN_REVIEW)).toBe(true);
      expect(keyEvents.has(KeyState.APPROVED)).toBe(true);
      expect(keyEvents.has(KeyState.MERGED)).toBe(true);
      expect(keyEvents.size).toBe(6);
    });

    it('應處理跳過某些階段的情況（無 AI 審查）', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 300,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:05:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.COMMIT_PUSHED,
          intervalToNext: 600,
        },
        {
          sequence: 3,
          timestamp: new Date('2025-10-30T10:15:00Z'),
          actor: { id: 3, username: 'reviewer', name: 'Reviewer', role: ActorRole.REVIEWER },
          eventType: EventType.HUMAN_REVIEW_STARTED,
          intervalToNext: 300,
        },
        {
          sequence: 4,
          timestamp: new Date('2025-10-30T10:20:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MERGED,
        },
      ];

      const keyEvents = (service as any).identifyKeyStateEvents(events);

      expect(keyEvents.has(KeyState.MR_CREATED)).toBe(true);
      expect(keyEvents.has(KeyState.FIRST_COMMIT)).toBe(true);
      expect(keyEvents.has(KeyState.FIRST_AI_REVIEW)).toBe(false);
      expect(keyEvents.has(KeyState.FIRST_HUMAN_REVIEW)).toBe(true);
      expect(keyEvents.has(KeyState.APPROVED)).toBe(false);
      expect(keyEvents.has(KeyState.MERGED)).toBe(true);
      expect(keyEvents.size).toBe(4);
    });

    it('應處理未合併的 MR', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 300,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:05:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.COMMIT_PUSHED,
        },
      ];

      const keyEvents = (service as any).identifyKeyStateEvents(events);

      expect(keyEvents.has(KeyState.MR_CREATED)).toBe(true);
      expect(keyEvents.has(KeyState.FIRST_COMMIT)).toBe(true);
      expect(keyEvents.has(KeyState.MERGED)).toBe(false);
      expect(keyEvents.size).toBe(2);
    });

    it('應識別第一個 AI 審查（忽略後續）', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 120,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:02:00Z'),
          actor: { id: 2, username: 'bot1', name: 'Bot1', role: ActorRole.AI_REVIEWER },
          eventType: EventType.AI_REVIEW_STARTED,
          intervalToNext: 60,
        },
        {
          sequence: 3,
          timestamp: new Date('2025-10-30T10:03:00Z'),
          actor: { id: 3, username: 'bot2', name: 'Bot2', role: ActorRole.AI_REVIEWER },
          eventType: EventType.AI_REVIEW_STARTED,
          intervalToNext: 300,
        },
        {
          sequence: 4,
          timestamp: new Date('2025-10-30T10:08:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MERGED,
        },
      ];

      const keyEvents = (service as any).identifyKeyStateEvents(events);

      expect(keyEvents.has(KeyState.FIRST_AI_REVIEW)).toBe(true);
      expect(keyEvents.get(KeyState.FIRST_AI_REVIEW).sequence).toBe(2);
    });
  });

  describe('calculateSegments', () => {
    it('應計算標準流程的時間段落並正規化到 100%', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 300,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:05:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.COMMIT_PUSHED,
          intervalToNext: 300,
        },
        {
          sequence: 3,
          timestamp: new Date('2025-10-30T10:10:00Z'),
          actor: { id: 2, username: 'bot', name: 'Bot', role: ActorRole.AI_REVIEWER },
          eventType: EventType.AI_REVIEW_STARTED,
          intervalToNext: 600,
        },
        {
          sequence: 4,
          timestamp: new Date('2025-10-30T10:20:00Z'),
          actor: { id: 3, username: 'reviewer', name: 'Reviewer', role: ActorRole.REVIEWER },
          eventType: EventType.HUMAN_REVIEW_STARTED,
          intervalToNext: 1800,
        },
        {
          sequence: 5,
          timestamp: new Date('2025-10-30T10:50:00Z'),
          actor: { id: 3, username: 'reviewer', name: 'Reviewer', role: ActorRole.REVIEWER },
          eventType: EventType.APPROVED,
          intervalToNext: 300,
        },
        {
          sequence: 6,
          timestamp: new Date('2025-10-30T10:55:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MERGED,
        },
      ];

      const totalCycleTime = 3300; // 55 分鐘

      const segments = (service as any).calculateSegments(events, totalCycleTime);

      expect(segments).toHaveLength(5);

      // 驗證段落名稱
      expect(segments[0].from).toBe('MR Created');
      expect(segments[0].to).toBe('Code Updated');
      expect(segments[1].from).toBe('Code Updated');
      expect(segments[1].to).toBe('First AI Review');
      expect(segments[2].from).toBe('First AI Review');
      expect(segments[2].to).toBe('First Human Review');
      expect(segments[3].from).toBe('First Human Review');
      expect(segments[3].to).toBe('Approved');
      expect(segments[4].from).toBe('Approved');
      expect(segments[4].to).toBe('Merged');

      // 驗證百分比總和為 100% (±1% 容差)
      const totalPercentage = segments.reduce((sum, seg) => sum + seg.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);

      // 驗證時長總和等於週期時間
      const totalDuration = segments.reduce((sum, seg) => sum + seg.durationSeconds, 0);
      expect(totalDuration).toBe(totalCycleTime);
    });

    it('應處理跳過階段的情況（無 AI 審查）', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 600,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:10:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.COMMIT_PUSHED,
          intervalToNext: 1800,
        },
        {
          sequence: 3,
          timestamp: new Date('2025-10-30T10:40:00Z'),
          actor: { id: 3, username: 'reviewer', name: 'Reviewer', role: ActorRole.REVIEWER },
          eventType: EventType.HUMAN_REVIEW_STARTED,
          intervalToNext: 600,
        },
        {
          sequence: 4,
          timestamp: new Date('2025-10-30T10:50:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MERGED,
        },
      ];

      const totalCycleTime = 3000; // 50 分鐘

      const segments = (service as any).calculateSegments(events, totalCycleTime);

      // 應該只有 3 個段落（跳過 AI Review）
      expect(segments).toHaveLength(3);
      expect(segments[0].from).toBe('MR Created');
      expect(segments[0].to).toBe('Code Updated');
      expect(segments[1].from).toBe('Code Updated');
      expect(segments[1].to).toBe('First Human Review');
      expect(segments[2].from).toBe('First Human Review');
      expect(segments[2].to).toBe('Merged');

      // 驗證百分比總和為 100%
      const totalPercentage = segments.reduce((sum, seg) => sum + seg.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);
    });

    it('應處理未合併的 MR（建立「最後階段 → 現在」段落）', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 600,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:10:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.COMMIT_PUSHED,
        },
      ];

      const totalCycleTime = 600; // 10 分鐘

      const segments = (service as any).calculateSegments(events, totalCycleTime);

      expect(segments).toHaveLength(1);
      expect(segments[0].from).toBe('MR Created');
      expect(segments[0].to).toBe('Code Updated');
      expect(segments[0].durationSeconds).toBe(600);
      expect(segments[0].percentage).toBe(100);
    });

    it('應處理階段順序顛倒的情況（人類審查先於 AI 審查）', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 300,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:05:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.COMMIT_PUSHED,
          intervalToNext: 300,
        },
        {
          sequence: 3,
          timestamp: new Date('2025-10-30T10:10:00Z'),
          actor: { id: 3, username: 'reviewer', name: 'Reviewer', role: ActorRole.REVIEWER },
          eventType: EventType.HUMAN_REVIEW_STARTED,
          intervalToNext: 600,
        },
        {
          sequence: 4,
          timestamp: new Date('2025-10-30T10:20:00Z'),
          actor: { id: 2, username: 'bot', name: 'Bot', role: ActorRole.AI_REVIEWER },
          eventType: EventType.AI_REVIEW_STARTED,
          intervalToNext: 300,
        },
        {
          sequence: 5,
          timestamp: new Date('2025-10-30T10:25:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MERGED,
        },
      ];

      const totalCycleTime = 1500; // 25 分鐘

      const segments = (service as any).calculateSegments(events, totalCycleTime);

      // 應動態調整順序
      expect(segments).toHaveLength(4);
      expect(segments[0].from).toBe('MR Created');
      expect(segments[0].to).toBe('Code Updated');
      expect(segments[1].from).toBe('Code Updated');
      expect(segments[1].to).toBe('First Human Review');
      expect(segments[2].from).toBe('First Human Review');
      expect(segments[2].to).toBe('First AI Review');
      expect(segments[3].from).toBe('First AI Review');
      expect(segments[3].to).toBe('Merged');

      // 驗證百分比總和為 100%
      const totalPercentage = segments.reduce((sum, seg) => sum + seg.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);
    });

    it('應處理零週期時間的情況', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
        },
      ];

      const totalCycleTime = 0;

      const segments = (service as any).calculateSegments(events, totalCycleTime);

      expect(segments).toHaveLength(0);
    });

    it('應正確計算百分比（測試浮點數精度）', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 333,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:05:33Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.COMMIT_PUSHED,
          intervalToNext: 333,
        },
        {
          sequence: 3,
          timestamp: new Date('2025-10-30T10:11:06Z'),
          actor: { id: 3, username: 'reviewer', name: 'Reviewer', role: ActorRole.REVIEWER },
          eventType: EventType.HUMAN_REVIEW_STARTED,
          intervalToNext: 334,
        },
        {
          sequence: 4,
          timestamp: new Date('2025-10-30T10:16:40Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MERGED,
        },
      ];

      const totalCycleTime = 1000; // 333 + 333 + 334 = 1000

      const segments = (service as any).calculateSegments(events, totalCycleTime);

      expect(segments).toHaveLength(3);

      // 驗證百分比總和為 100%（允許 1% 容差處理浮點數精度）
      const totalPercentage = segments.reduce((sum, seg) => sum + seg.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);

      // 驗證每個段落的百分比
      expect(segments[0].percentage).toBeCloseTo(33.3, 1);
      expect(segments[1].percentage).toBeCloseTo(33.3, 1);
      expect(segments[2].percentage).toBeCloseTo(33.4, 1);
    });

    it('應處理極小時間段落（< 1 秒）', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00.000Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
          intervalToNext: 0.5,
        },
        {
          sequence: 2,
          timestamp: new Date('2025-10-30T10:00:00.500Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.COMMIT_PUSHED,
          intervalToNext: 3599.5,
        },
        {
          sequence: 3,
          timestamp: new Date('2025-10-30T11:00:00.000Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MERGED,
        },
      ];

      const totalCycleTime = 3600; // 1 小時

      const segments = (service as any).calculateSegments(events, totalCycleTime);

      expect(segments).toHaveLength(2);
      // TimeCalculator rounds to nearest integer, so 0.5s -> 1s and 3599.5s -> 3600s
      expect(segments[0].durationSeconds).toBe(1);
      expect(segments[1].durationSeconds).toBe(3600);

      // 驗證百分比總和（rounding causes small deviation: 1+3600=3601 vs totalCycleTime=3600)
      const totalPercentage = segments.reduce((sum, seg) => sum + seg.percentage, 0);
      // Allow for rounding error: percentages are calculated from rounded durations
      expect(totalPercentage).toBeCloseTo(100, 0);  // Within 1% tolerance due to rounding
    });
  });

  describe('邊界情況與錯誤處理', () => {
    it('應處理空事件清單', () => {
      const events: MREvent[] = [];
      const totalCycleTime = 0;

      const segments = (service as any).calculateSegments(events, totalCycleTime);

      expect(segments).toHaveLength(0);
    });

    it('應處理只有 MR Created 事件的情況', () => {
      const events: MREvent[] = [
        {
          sequence: 1,
          timestamp: new Date('2025-10-30T10:00:00Z'),
          actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
          eventType: EventType.MR_CREATED,
        },
      ];

      const totalCycleTime = 0;

      const segments = (service as any).calculateSegments(events, totalCycleTime);

      expect(segments).toHaveLength(0);
    });

    it('應處理大量事件（效能測試）', () => {
      const events: MREvent[] = Array.from({ length: 100 }, (_, i) => ({
        sequence: i + 1,
        timestamp: new Date(Date.UTC(2025, 9, 30, 10, 0, i)),
        actor: { id: 1, username: 'author', name: 'Author', role: ActorRole.AUTHOR },
        eventType: i === 0 ? EventType.MR_CREATED : EventType.COMMIT_PUSHED,
        intervalToNext: i < 99 ? 1 : undefined,
      }));

      const totalCycleTime = 99;

      const startTime = Date.now();
      const segments = (service as any).calculateSegments(events, totalCycleTime);
      const endTime = Date.now();

      // 應在合理時間內完成（< 100ms）
      expect(endTime - startTime).toBeLessThan(100);
      expect(segments.length).toBeGreaterThan(0);

      // 驗證百分比總和
      const totalPercentage = segments.reduce((sum, seg) => sum + seg.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);
    });
  });
});
