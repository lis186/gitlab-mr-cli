/**
 * CycleTimeCalculator 單元測試
 *
 * 測試 MR 週期時間計算的核心邏輯
 */

import { describe, it, expect } from 'vitest'
import { CycleTimeCalculator } from '../../src/services/cycle-time-calculator.js'
import type { GitLabMR, GitLabCommit, GitLabNote } from '../../src/services/cycle-time-calculator.js'

describe('CycleTimeCalculator', () => {
  describe('calculate()', () => {
    it('應正確計算基本的四階段時間', () => {
      const mr: GitLabMR = {
        iid: 123,
        title: 'Test MR',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/123',
        created_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-03T10:00:00Z',
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-01-01T10:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-01-02T12:00:00Z',
          system: false,
          body: 'First review comment',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      expect(metrics.mr.iid).toBe(123)
      expect(metrics.stages.codingTime).toBeGreaterThan(0) // 1天 = 24小時
      expect(metrics.stages.pickupTime).toBeGreaterThan(0) // 2小時
      expect(metrics.stages.reviewTime).toBe(0) // 只有一個審查評論
      expect(metrics.stages.mergeTime).toBeGreaterThan(0) // ~22小時
    })

    it('應處理沒有審查的 MR', () => {
      const mr: GitLabMR = {
        iid: 124,
        title: 'No Review MR',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/124',
        created_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-03T10:00:00Z',
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-01-01T10:00:00Z' },
      ]

      const notes: GitLabNote[] = [] // 沒有審查評論

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      expect(metrics.stages.pickupTime).toBeNull()
      expect(metrics.stages.reviewTime).toBeNull()
      expect(metrics.stages.mergeTime).toBeGreaterThan(0) // 從建立到合併
    })

    it('應在時間倒序時觸發警告並返回 0', () => {
      const warnings: string[] = []
      const onWarning = (msg: string) => warnings.push(msg)

      const mr: GitLabMR = {
        iid: 125,
        title: 'Time Reversal MR',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/125',
        created_at: '2024-01-01T10:00:00Z', // MR 建立時間
        merged_at: '2024-01-03T10:00:00Z',
      }

      // commit 時間晚於 MR 建立時間（rebase/amend 情況）
      const commits: GitLabCommit[] = [
        { created_at: '2024-01-02T10:00:00Z' },
      ]

      const notes: GitLabNote[] = []

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes, { onWarning })

      expect(metrics.stages.codingTime).toBe(0)
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0]).toContain('MR !125')
      expect(warnings[0]).toContain('時間倒序')
    })

    it('應在未合併時拋出錯誤', () => {
      const mr: GitLabMR = {
        iid: 126,
        title: 'Unmerged MR',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/126',
        created_at: '2024-01-02T10:00:00Z',
        merged_at: null, // 未合併
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-01-01T10:00:00Z' },
      ]

      const notes: GitLabNote[] = []

      expect(() => {
        CycleTimeCalculator.calculate(mr, commits, notes)
      }).toThrow('尚未合併')
    })

    it('應在沒有 commits 時拋出錯誤', () => {
      const mr: GitLabMR = {
        iid: 127,
        title: 'No Commits MR',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/127',
        created_at: '2024-01-02T10:00:00Z',
        merged_at: '2024-01-03T10:00:00Z',
      }

      const commits: GitLabCommit[] = [] // 沒有 commits

      const notes: GitLabNote[] = []

      expect(() => {
        CycleTimeCalculator.calculate(mr, commits, notes)
      }).toThrow('沒有 commits')
    })

    it('應正確處理 Draft MR（只計算 Marked as Ready 之後的審查）', () => {
      const mr: GitLabMR = {
        iid: 128,
        title: 'Draft MR Test',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/128',
        created_at: '2024-01-01T09:00:00Z', // MR 建立
        merged_at: '2024-01-01T16:00:00Z',   // 合併
        draft: true,                          // Draft MR
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-01-01T08:00:00Z' }, // 首個 commit
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-01-01T09:05:00Z',
          system: false,
          body: 'Early comment during draft',
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T14:00:00Z',
          system: true,
          body: 'marked this merge request as ready',
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T15:00:00Z',
          system: false,
          body: 'First review after ready',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // Pickup Time 應該從 Marked as Ready (14:00) 到首次審查 (15:00) = 1 小時
      expect(metrics.stages.pickupTime).toBe(1)

      // 驗證不會包含 Draft 期間的評論
      expect(metrics.stages.codingTime).toBeGreaterThan(0)
      expect(metrics.stages.reviewTime).toBe(0) // 只有一個審查評論
    })

    it('應正確處理 Draft MR 從未標記為 Ready 的情況', () => {
      const mr: GitLabMR = {
        iid: 129,
        title: 'Draft MR never marked ready',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/129',
        created_at: '2024-01-01T09:00:00Z',
        merged_at: '2024-01-01T16:00:00Z',
        draft: true, // Draft MR
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-01-01T08:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-01-01T10:00:00Z',
          system: false,
          body: 'Comment during draft',
          noteable_type: 'MergeRequest',
        },
        // 沒有 "marked as ready" 事件
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // Draft MR 從未標記為 Ready，不應計入任何審查時間
      expect(metrics.stages.pickupTime).toBeNull()
      expect(metrics.stages.reviewTime).toBeNull()
      expect(metrics.timestamps.firstReviewAt).toBeNull()
      expect(metrics.timestamps.lastReviewAt).toBeNull()
    })

    it('應避免誤判包含 "ready" 子字串的系統訊息', () => {
      const mr: GitLabMR = {
        iid: 130,
        title: 'False positive test',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/130',
        created_at: '2024-01-01T09:00:00Z',
        merged_at: '2024-01-01T16:00:00Z',
        draft: true,
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-01-01T08:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-01-01T10:00:00Z',
          system: true,
          body: 'User remarked as ready for deployment', // ❌ 不應匹配
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T14:00:00Z',
          system: true,
          body: 'marked this merge request as ready', // ✅ 應該匹配
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T15:00:00Z',
          system: false,
          body: 'LGTM',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // 應該只識別出正確的 "marked as ready" 事件（14:00）
      expect(metrics.stages.pickupTime).toBe(1) // 從 14:00 到 15:00
      expect(metrics.timestamps.firstReviewAt).toBe('2024-01-01T15:00:00Z')
    })

    it('應處理 Draft → Ready → Draft → Ready 多次切換', () => {
      const mr: GitLabMR = {
        iid: 131,
        title: 'Multiple ready/draft transitions',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/131',
        created_at: '2024-01-01T09:00:00Z',
        merged_at: '2024-01-01T20:00:00Z',
        draft: true,
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-01-01T08:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-01-01T10:00:00Z',
          system: true,
          body: 'marked this merge request as ready', // 第一次 ready
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T11:00:00Z',
          system: false,
          body: 'First review',
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T12:00:00Z',
          system: true,
          body: 'marked as draft', // 又變回 draft
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T14:00:00Z',
          system: true,
          body: 'marked this merge request as ready', // 第二次 ready
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T15:00:00Z',
          system: false,
          body: 'Second review',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // 應該使用「第一次」marked as ready 的時間（10:00）
      // Pickup Time = 11:00 - 10:00 = 1 小時
      expect(metrics.stages.pickupTime).toBe(1)
      expect(metrics.timestamps.firstReviewAt).toBe('2024-01-01T11:00:00Z')

      // Review Time 應該包含從首次審查到最後審查
      expect(metrics.timestamps.lastReviewAt).toBe('2024-01-01T15:00:00Z')
    })

    it('應支援舊版 GitLab API 的 work_in_progress 欄位', () => {
      const mr: GitLabMR = {
        iid: 132,
        title: 'Legacy WIP MR',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/132',
        created_at: '2024-01-01T09:00:00Z',
        merged_at: '2024-01-01T16:00:00Z',
        work_in_progress: true, // 舊版 Draft 欄位（GitLab < 13.2）
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-01-01T08:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-01-01T10:00:00Z',
          system: false,
          body: 'Early comment during WIP',
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T14:00:00Z',
          system: true,
          body: 'marked this merge request as ready',
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T15:00:00Z',
          system: false,
          body: 'First review after ready',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // 應該與 draft 欄位行為一致
      expect(metrics.stages.pickupTime).toBe(1) // 從 14:00 到 15:00
      expect(metrics.timestamps.firstReviewAt).toBe('2024-01-01T15:00:00Z')
    })

    it('應正確檢測帶有 markdown 格式的 "Marked as Ready" 事件', () => {
      const mr: GitLabMR = {
        iid: 133,
        title: 'Markdown formatted ready event',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/133',
        created_at: '2024-01-01T09:00:00Z',
        merged_at: '2024-01-01T16:00:00Z',
        draft: true,
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-01-01T08:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-01-01T10:00:00Z',
          system: false,
          body: 'Early comment during draft',
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T14:00:00Z',
          system: true,
          body: 'marked this merge request as **ready**', // ✓ 帶有 markdown 格式
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-01-01T15:00:00Z',
          system: false,
          body: 'First review after ready',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // 應該正確識別帶有 ** 的 ready 事件
      expect(metrics.stages.pickupTime).toBe(1) // 從 14:00 到 15:00
      expect(metrics.timestamps.firstReviewAt).toBe('2024-01-01T15:00:00Z')
    })
  })

  describe('calculateCodingTime()', () => {
    it('應正確計算正常的 Coding Time', () => {
      const codingTime = CycleTimeCalculator.calculateCodingTime(
        '2024-01-01T10:00:00Z',
        '2024-01-02T10:00:00Z',
        123
      )

      expect(codingTime).toBe(24) // 24小時
    })

    it('應在時間倒序時返回 0', () => {
      const codingTime = CycleTimeCalculator.calculateCodingTime(
        '2024-01-02T10:00:00Z', // commit 晚於
        '2024-01-01T10:00:00Z', // MR 建立
        123
      )

      expect(codingTime).toBe(0)
    })

    it('應在時間倒序時觸發警告', () => {
      const warnings: string[] = []
      const onWarning = (msg: string) => warnings.push(msg)

      CycleTimeCalculator.calculateCodingTime(
        '2024-01-02T10:00:00Z',
        '2024-01-01T10:00:00Z',
        123,
        onWarning
      )

      expect(warnings.length).toBe(1)
      expect(warnings[0]).toContain('MR !123')
      expect(warnings[0]).toContain('Coding Time 設為 0')
    })
  })

  describe('calculatePickupTime()', () => {
    it('應正確計算正常的 Pickup Time (一般 MR)', () => {
      const pickupTime = CycleTimeCalculator.calculatePickupTime(
        '2024-01-01T10:00:00Z',
        '2024-01-01T12:00:00Z',
        null, // 不是 Draft MR
        123
      )

      expect(pickupTime).toBe(2) // 2小時
    })

    it('應正確計算 Draft MR 的 Pickup Time（從 Marked as Ready 開始）', () => {
      const pickupTime = CycleTimeCalculator.calculatePickupTime(
        '2024-01-01T10:00:00Z', // MR 建立
        '2024-01-01T15:00:00Z', // 首次審查
        '2024-01-01T14:00:00Z', // Marked as Ready
        123
      )

      expect(pickupTime).toBe(1) // 從 14:00 到 15:00 = 1小時
    })

    it('應在時間倒序時返回 0 並觸發警告', () => {
      const warnings: string[] = []
      const onWarning = (msg: string) => warnings.push(msg)

      const pickupTime = CycleTimeCalculator.calculatePickupTime(
        '2024-01-01T12:00:00Z', // MR 建立
        '2024-01-01T10:00:00Z', // 審查早於建立
        null,
        123,
        onWarning
      )

      expect(pickupTime).toBe(0)
      expect(warnings.length).toBe(1)
      expect(warnings[0]).toContain('Pickup Time 設為 0')
    })
  })

  describe('calculateReviewTime()', () => {
    it('應正確計算正常的 Review Time', () => {
      const reviewTime = CycleTimeCalculator.calculateReviewTime(
        '2024-01-01T10:00:00Z',
        '2024-01-01T14:00:00Z',
        123
      )

      expect(reviewTime).toBe(4) // 4小時
    })

    it('應在時間倒序時返回 0 並觸發警告', () => {
      const warnings: string[] = []
      const onWarning = (msg: string) => warnings.push(msg)

      const reviewTime = CycleTimeCalculator.calculateReviewTime(
        '2024-01-01T14:00:00Z', // 首次審查
        '2024-01-01T10:00:00Z', // 最後審查早於首次
        123,
        onWarning
      )

      expect(reviewTime).toBe(0)
      expect(warnings.length).toBe(1)
      expect(warnings[0]).toContain('Review Time 設為 0')
    })
  })

  describe('calculateMergeTime()', () => {
    it('應正確計算正常的 Merge Time', () => {
      const mergeTime = CycleTimeCalculator.calculateMergeTime(
        '2024-01-01T10:00:00Z',
        '2024-01-02T10:00:00Z',
        123
      )

      expect(mergeTime).toBe(24) // 24小時
    })

    it('應在時間倒序時返回 0 並觸發警告', () => {
      const warnings: string[] = []
      const onWarning = (msg: string) => warnings.push(msg)

      const mergeTime = CycleTimeCalculator.calculateMergeTime(
        '2024-01-02T10:00:00Z', // 最後事件
        '2024-01-01T10:00:00Z', // 合併早於事件
        123,
        onWarning
      )

      expect(mergeTime).toBe(0)
      expect(warnings.length).toBe(1)
      expect(warnings[0]).toContain('Merge Time 設為 0')
    })
  })

  describe('合併後評論過濾 (Feature 009)', () => {
    it('應排除合併後的 Bot 留言', () => {
      const mr: GitLabMR = {
        iid: 200,
        title: 'Post-merge comments MR',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/200',
        created_at: '2024-10-02T14:00:00Z',
        merged_at: '2024-10-02T15:00:00Z', // 合併時間
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-10-02T13:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-10-02T14:30:00Z', // 合併前留言
          system: false,
          body: 'LGTM',
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-10-02T15:00:10Z', // 合併後留言（10秒後，超過寬容範圍）
          system: false,
          body: 'Pipeline #123 passed',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // lastReviewAt 應為合併前的最後一則留言
      expect(metrics.timestamps.lastReviewAt).toBe('2024-10-02T14:30:00Z')
      expect(metrics.timestamps.lastReviewAt).not.toBe('2024-10-02T15:00:10Z')
    })

    it('應處理只有合併後留言的 MR', () => {
      const mr: GitLabMR = {
        iid: 201,
        title: 'Only post-merge comments',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/201',
        created_at: '2024-10-02T14:00:00Z',
        merged_at: '2024-10-02T15:00:00Z',
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-10-02T13:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-10-02T15:00:10Z', // 全部都是合併後留言（超過 5 秒寬容範圍）
          system: false,
          body: 'Pipeline passed',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // 應該沒有審查時間（因為超過寬容範圍）
      expect(metrics.timestamps.firstReviewAt).toBeNull()
      expect(metrics.timestamps.lastReviewAt).toBeNull()
      expect(metrics.stages.pickupTime).toBeNull()
      expect(metrics.stages.reviewTime).toBeNull()
    })

    it('應保留合併時間戳相同的留言', () => {
      const mr: GitLabMR = {
        iid: 202,
        title: 'Same timestamp as merge',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/202',
        created_at: '2024-10-02T14:00:00Z',
        merged_at: '2024-10-02T15:00:00Z',
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-10-02T13:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-10-02T15:00:00Z', // 時間戳與 merged_at 完全相同
          system: false,
          body: 'LGTM',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // 應該被保留（使用 <= 而非 <）
      expect(metrics.timestamps.firstReviewAt).toBe('2024-10-02T15:00:00Z')
      expect(metrics.timestamps.lastReviewAt).toBe('2024-10-02T15:00:00Z')
    })

    it('應處理無任何評論的 MR（向後相容性）', () => {
      const mr: GitLabMR = {
        iid: 203,
        title: 'No comments at all',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/203',
        created_at: '2024-10-02T14:00:00Z',
        merged_at: '2024-10-02T15:00:00Z',
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-10-02T13:00:00Z' },
      ]

      const notes: GitLabNote[] = [] // 空陣列

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // 應該保持向後相容
      expect(metrics.timestamps.firstReviewAt).toBeNull()
      expect(metrics.timestamps.lastReviewAt).toBeNull()
      expect(metrics.stages.pickupTime).toBeNull()
      expect(metrics.stages.reviewTime).toBeNull()
    })

    it('應處理時鐘同步問題（< 5 秒誤差）', () => {
      const mr: GitLabMR = {
        iid: 204,
        title: 'Clock sync issue within tolerance',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/204',
        created_at: '2024-10-02T14:00:00Z',
        merged_at: '2024-10-02T15:00:00Z',
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-10-02T13:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-10-02T14:30:00Z', // 正常合併前留言
          system: false,
          body: 'LGTM',
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-10-02T15:00:03Z', // 合併後 3 秒（在 5 秒寬容範圍內）
          system: false,
          body: 'Approved',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // 3 秒誤差應被接受（時鐘同步問題）
      expect(metrics.timestamps.firstReviewAt).toBe('2024-10-02T14:30:00Z')
      expect(metrics.timestamps.lastReviewAt).toBe('2024-10-02T15:00:03Z') // 應被保留
    })

    it('應排除超過寬容時間的評論（> 5 秒）', () => {
      const mr: GitLabMR = {
        iid: 205,
        title: 'Comment beyond tolerance',
        author: { name: 'Test User' },
        web_url: 'https://gitlab.com/test/project/-/merge_requests/205',
        created_at: '2024-10-02T14:00:00Z',
        merged_at: '2024-10-02T15:00:00Z',
      }

      const commits: GitLabCommit[] = [
        { created_at: '2024-10-02T13:00:00Z' },
      ]

      const notes: GitLabNote[] = [
        {
          created_at: '2024-10-02T14:30:00Z', // 正常合併前留言
          system: false,
          body: 'LGTM',
          noteable_type: 'MergeRequest',
        },
        {
          created_at: '2024-10-02T15:00:06Z', // 合併後 6 秒（超過 5 秒寬容範圍）
          system: false,
          body: 'Pipeline passed',
          noteable_type: 'MergeRequest',
        },
      ]

      const metrics = CycleTimeCalculator.calculate(mr, commits, notes)

      // 6 秒誤差應被排除（這是真正的合併後評論）
      expect(metrics.timestamps.firstReviewAt).toBe('2024-10-02T14:30:00Z')
      expect(metrics.timestamps.lastReviewAt).toBe('2024-10-02T14:30:00Z') // 不包含 6 秒後的評論
      expect(metrics.timestamps.lastReviewAt).not.toBe('2024-10-02T15:00:06Z')
    })
  })
})
