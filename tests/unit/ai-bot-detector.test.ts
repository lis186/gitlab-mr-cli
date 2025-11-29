/**
 * AIBotDetector 單元測試
 *
 * 測試三層檢測策略：
 * 1. 可設定清單
 * 2. 使用者名稱模式匹配
 * 3. 時間窗口規則
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AIBotDetector } from '../../src/services/ai-bot-detector.js';

describe('AIBotDetector', () => {
  let detector: AIBotDetector;

  beforeEach(() => {
    detector = new AIBotDetector();
  });

  describe('第一層：可設定清單檢測', () => {
    it('應識別建構時設定的 AI Bot', () => {
      const customDetector = new AIBotDetector(['custom-bot', 'my-ai-reviewer']);

      expect(customDetector.isAIBot('custom-bot')).toBe(true);
      expect(customDetector.isAIBot('my-ai-reviewer')).toBe(true);
    });

    it('應能動態新增 AI Bot', () => {
      detector.addConfiguredBot('new-bot');

      expect(detector.isAIBot('new-bot')).toBe(true);
    });

    it('應能移除 AI Bot', () => {
      // 使用不會被模式匹配的使用者名稱
      detector.addConfiguredBot('temp-user-123');
      expect(detector.isAIBot('temp-user-123')).toBe(true);

      detector.removeConfiguredBot('temp-user-123');
      expect(detector.isAIBot('temp-user-123')).toBe(false);
    });

    it('應能取得所有已設定的 AI Bot', () => {
      const customDetector = new AIBotDetector(['bot1', 'bot2']);
      customDetector.addConfiguredBot('bot3');

      const bots = customDetector.getConfiguredBots();

      expect(bots).toHaveLength(3);
      expect(bots).toContain('bot1');
      expect(bots).toContain('bot2');
      expect(bots).toContain('bot3');
    });
  });

  describe('第零層：CI Bot 排除（優先級最高）', () => {
    it('不應將 "Gitlab CI Bot" 識別為 AI Bot', () => {
      // 雖然 "Gitlab CI Bot" 包含 "bot" 關鍵字，但應被明確排除
      expect(detector.isAIBot('Gitlab CI Bot')).toBe(false);
      expect(detector.isAIBot('gitlab ci bot')).toBe(false);
      expect(detector.isAIBot('GITLAB CI BOT')).toBe(false);
    });

    it('不應將 "Jenkins" 識別為 AI Bot', () => {
      expect(detector.isAIBot('Jenkins')).toBe(false);
      expect(detector.isAIBot('jenkins')).toBe(false);
      expect(detector.isAIBot('JENKINS')).toBe(false);
    });

    it('不應將 "gitlab-bot" 識別為 AI Bot', () => {
      expect(detector.isAIBot('gitlab-bot')).toBe(false);
      expect(detector.isAIBot('GitLab-Bot')).toBe(false);
      expect(detector.isAIBot('GITLAB-BOT')).toBe(false);
    });

    it('不應將 "ci-bot" 識別為 AI Bot', () => {
      expect(detector.isAIBot('ci-bot')).toBe(false);
      expect(detector.isAIBot('CI-Bot')).toBe(false);
      expect(detector.isAIBot('CI-BOT')).toBe(false);
    });

    it('不應將 "build bot" 識別為 AI Bot', () => {
      expect(detector.isAIBot('build bot')).toBe(false);
      expect(detector.isAIBot('Build Bot')).toBe(false);
      expect(detector.isAIBot('BUILD BOT')).toBe(false);
    });

    it('不應將 "project-ci-bot" 識別為 AI Bot', () => {
      // 專案特定 CI Bot
      expect(detector.isAIBot('project-ci-bot')).toBe(false);
      expect(detector.isAIBot('COMPANY_CI_BUILD')).toBe(false);
    });

    it('應能取得 CI Bot 使用者名稱清單', () => {
      const ciBots = AIBotDetector.getCIBotUsernames();

      expect(ciBots).toBeDefined();
      expect(ciBots.length).toBeGreaterThan(0);
      expect(ciBots).toContain('gitlab ci bot');
      expect(ciBots).toContain('jenkins');
      expect(ciBots).toContain('ci-bot');
    });

    it('CI Bot 排除應優先於可設定清單', () => {
      // 即使在可設定清單中，CI Bot 仍應被排除
      const customDetector = new AIBotDetector(['Gitlab CI Bot']);

      // 第零層（CI Bot 排除）優先級高於第一層（可設定清單）
      expect(customDetector.isAIBot('Gitlab CI Bot')).toBe(false);
    });
  });

  describe('第二層：使用者名稱模式匹配檢測', () => {
    it('應識別包含 "bot" 的使用者名稱（不區分大小寫），但排除 CI Bot', () => {
      // 這些應該被識別為 AI Bot
      expect(detector.isAIBot('code-review-bot')).toBe(true);
      expect(detector.isAIBot('BOT-reviewer')).toBe(true);

      // CI Bot 應被排除（即使包含 "bot"）
      expect(detector.isAIBot('gitlab ci bot')).toBe(false);
      expect(detector.isAIBot('jenkins')).toBe(false);
    });

    it('應識別包含 "ai" 的使用者名稱（不區分大小寫）', () => {
      expect(detector.isAIBot('ai-reviewer')).toBe(true);
      expect(detector.isAIBot('AI-Code-Review')).toBe(true);
      expect(detector.isAIBot('smart-ai')).toBe(true);
    });

    it('應識別包含 "automated" 的使用者名稱', () => {
      expect(detector.isAIBot('automated-review')).toBe(true);
      expect(detector.isAIBot('Automated-Checker')).toBe(true);
    });

    it('應識別常見 AI Bot 名稱', () => {
      expect(detector.isAIBot('coderabbit')).toBe(true);
      expect(detector.isAIBot('copilot')).toBe(true);
      expect(detector.isAIBot('dependabot')).toBe(true);
      expect(detector.isAIBot('renovate')).toBe(true);
      expect(detector.isAIBot('CodeRabbit')).toBe(true); // 不區分大小寫
    });

    it('不應將正常使用者誤判為 AI Bot', () => {
      expect(detector.isAIBot('john.doe')).toBe(false);
      expect(detector.isAIBot('alice.smith')).toBe(false);
      expect(detector.isAIBot('bob.jones')).toBe(false);
      expect(detector.isAIBot('reviewer-123')).toBe(false);
    });

    it('應避免誤判包含模式關鍵字但作為子字串的正常使用者', () => {
      // 這些不應該被識別為 AI Bot（避免誤判）
      expect(detector.isAIBot('robotics-expert')).toBe(false); // 包含 "bot" 但不是獨立單詞
      expect(detector.isAIBot('hair-stylist')).toBe(false); // 包含 "ai" 但不是標準格式
      expect(detector.isAIBot('chairman')).toBe(false); // 名字中包含 "ai"
      expect(detector.isAIBot('waiter')).toBe(false); // 包含 "ai" 但不是標準格式
    });
  });

  describe('第五層：時間窗口規則檢測（明確啟用時）', () => {
    it('預設時間窗口為 0（禁用），不會觸發時間窗口檢測', () => {
      const mrCreated = new Date('2025-10-30T10:00:00Z');
      const commentTime = new Date('2025-10-30T10:05:00Z'); // 5 分鐘後

      // 預設情況下不會因時間窗口被檢測為 AI Bot
      expect(detector.isAIBot('unknown-user', commentTime, mrCreated)).toBe(false);
    });

    it('啟用時間窗口時，應識別 MR 建立後 10 分鐘內的評論為 AI Bot', () => {
      const detectorWithTimeWindow = new AIBotDetector([], 10); // 10 分鐘窗口
      const mrCreated = new Date('2025-10-30T10:00:00Z');
      const commentTime = new Date('2025-10-30T10:05:00Z'); // 5 分鐘後

      expect(detectorWithTimeWindow.isAIBot('unknown-user', commentTime, mrCreated)).toBe(true);
    });

    it('啟用時間窗口時，應識別 MR 建立後 10 分鐘整的評論為 AI Bot', () => {
      const detectorWithTimeWindow = new AIBotDetector([], 10); // 10 分鐘窗口
      const mrCreated = new Date('2025-10-30T10:00:00Z');
      const commentTime = new Date('2025-10-30T10:10:00Z'); // 剛好 10 分鐘

      expect(detectorWithTimeWindow.isAIBot('unknown-user', commentTime, mrCreated)).toBe(true);
    });

    it('不應將 MR 建立後超過 10 分鐘的評論識別為 AI Bot', () => {
      const mrCreated = new Date('2025-10-30T10:00:00Z');
      const commentTime = new Date('2025-10-30T10:11:00Z'); // 11 分鐘後

      expect(detector.isAIBot('unknown-user', commentTime, mrCreated)).toBe(false);
    });

    it('不應將 MR 建立前的評論識別為 AI Bot', () => {
      const mrCreated = new Date('2025-10-30T10:00:00Z');
      const commentTime = new Date('2025-10-30T09:55:00Z'); // 建立前 5 分鐘

      expect(detector.isAIBot('unknown-user', commentTime, mrCreated)).toBe(false);
    });

    it('若未提供時間資訊，不應使用時間窗口規則', () => {
      expect(detector.isAIBot('unknown-user')).toBe(false);
    });
  });

  describe('三層檢測策略整合測試', () => {
    it('第一層（設定清單）優先順序最高', () => {
      detector.addConfiguredBot('special-user');
      const mrCreated = new Date('2025-10-30T10:00:00Z');
      const commentTime = new Date('2025-10-30T11:00:00Z'); // 超過時間窗口

      // 即使超過時間窗口且無模式匹配，仍應識別為 AI Bot
      expect(detector.isAIBot('special-user', commentTime, mrCreated)).toBe(true);
    });

    it('第二層（模式匹配）次優先', () => {
      const mrCreated = new Date('2025-10-30T10:00:00Z');
      const commentTime = new Date('2025-10-30T11:00:00Z'); // 超過時間窗口

      // 即使超過時間窗口，只要匹配模式仍應識別為 AI Bot
      expect(detector.isAIBot('code-bot', commentTime, mrCreated)).toBe(true);
    });

    it('第五層（時間窗口）作為最後檢測手段（需明確啟用）', () => {
      const detectorWithTimeWindow = new AIBotDetector([], 10); // 明確啟用 10 分鐘窗口
      const mrCreated = new Date('2025-10-30T10:00:00Z');
      const commentTime = new Date('2025-10-30T10:08:00Z'); // 8 分鐘內

      // 無設定清單、無模式匹配、無內容特徵、評論長度不足，但在時間窗口內
      expect(detectorWithTimeWindow.isAIBot('fast-reviewer', commentTime, mrCreated)).toBe(true);
    });

    it('預設禁用時間窗口，避免誤判快速人類審查者', () => {
      const mrCreated = new Date('2025-10-30T10:00:00Z');
      const commentTime = new Date('2025-10-30T10:02:00Z'); // 2 分鐘內

      // 預設情況下，快速評論不會被誤判為 AI Bot
      expect(detector.isAIBot('john.doe', commentTime, mrCreated)).toBe(false);

      // 只有明確啟用時間窗口時，才會進行時間窗口檢測
      const detectorWithTimeWindow = new AIBotDetector([], 10);
      expect(detectorWithTimeWindow.isAIBot('john.doe', commentTime, mrCreated)).toBe(true);
    });
  });

  describe('邊界情況與錯誤處理', () => {
    it('應處理空字串使用者名稱', () => {
      expect(detector.isAIBot('')).toBe(false);
    });

    it('應處理特殊字元使用者名稱', () => {
      expect(detector.isAIBot('user@example.com')).toBe(false);
      expect(detector.isAIBot('user-123_test')).toBe(false);
    });

    it('應處理 Unicode 字元使用者名稱', () => {
      expect(detector.isAIBot('使用者123')).toBe(false);
      expect(detector.isAIBot('bot_使用者')).toBe(true); // 包含 "bot_" (符合實際 GitLab 命名慣例)
    });

    it('應取得正確的預設時間窗口值（0 = 禁用）', () => {
      expect(AIBotDetector.getDefaultTimeWindowMs()).toBe(0); // 預設禁用
    });

    it('應允許自訂時間窗口', () => {
      const detector = new AIBotDetector([], 5); // 5 分鐘
      expect(detector.getTimeWindowMs()).toBe(5 * 60 * 1000);
    });

    it('應使用預設時間窗口（0）當未提供參數時', () => {
      const detector = new AIBotDetector();
      expect(detector.getTimeWindowMs()).toBe(0); // 預設禁用
    });

    it('應取得正確的模式清單', () => {
      const patterns = AIBotDetector.getPatterns();

      expect(patterns).toBeDefined();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.test('bot'))).toBe(true);
      expect(patterns.some((p) => p.test('ai-bot'))).toBe(true); // 使用標準 AI Bot 格式
    });
  });

  describe('第三層：評論內容模式檢測（邊界情況）', () => {
    it('應在 AI 模式匹配比例剛好達到閾值時判定為 AI Bot（邊界）', () => {
      const threshold = AIBotDetector.getAIPatternThreshold();

      // 5 個評論中 3 個匹配 AI 特徵 = 60% > 50% 閾值
      const samples = [
        'normal comment',
        'another normal one',
        '📋 Code Review 審查結果',  // AI 特徵
        '## 建議',                    // AI 特徵
        '| **檔案** | **問題** |',    // AI 特徵
      ];

      expect(detector.isAIBot('test-user', undefined, undefined, 100, samples)).toBe(true);
    });

    it('應在 AI 模式匹配比例剛好低於閾值時判定為非 AI Bot', () => {
      // 5 個評論中 2 個匹配 AI 特徵 = 40% < 50% 閾值
      const samples = [
        'normal comment',
        'another normal one',
        'yet another',
        '📋 Code Review 審查結果',  // AI 特徵
        '## 建議',                    // AI 特徵
      ];

      expect(detector.isAIBot('test-user', undefined, undefined, 100, samples)).toBe(false);
    });

    it('應在樣本評論為空時不觸發內容模式檢測', () => {
      // 雖然平均長度很短（不觸發長度檢測），但樣本為空時內容模式檢測應返回 false
      expect(detector.isAIBot('test-user', undefined, undefined, 100, [])).toBe(false);
    });

    it('應處理僅有系統評論的使用者（平均長度 = 0）', () => {
      // 平均長度 0，無樣本評論
      expect(detector.isAIBot('system-only-user', undefined, undefined, 0, [])).toBe(false);
    });
  });

  describe('第四層：評論長度檢測（邊界情況）', () => {
    it('應在評論長度剛好達到閾值時判定為 AI Bot', () => {
      const threshold = AIBotDetector.getCommentLengthThreshold();

      // 剛好等於閾值：應判定為 AI Bot
      expect(detector.isAIBot('test-user', undefined, undefined, threshold, ['sample'])).toBe(true);
    });

    it('應在評論長度略高於閾值時判定為 AI Bot', () => {
      const threshold = AIBotDetector.getCommentLengthThreshold();

      // 略高於閾值
      expect(detector.isAIBot('test-user', undefined, undefined, threshold + 1, ['sample'])).toBe(true);
    });

    it('應在評論長度略低於閾值時判定為非 AI Bot', () => {
      const threshold = AIBotDetector.getCommentLengthThreshold();

      // 略低於閾值
      expect(detector.isAIBot('test-user', undefined, undefined, threshold - 1, ['sample'])).toBe(false);
    });
  });
});
