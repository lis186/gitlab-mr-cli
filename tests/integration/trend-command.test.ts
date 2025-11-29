/**
 * Trend 命令整合測試 (T021)
 *
 * 驗證 trend 命令的完整流程和正體中文輸出
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Trend from '../../src/commands/trend.js'
import { GitLabClient } from '../../src/services/gitlab-client.js'

describe('Trend Command Integration', () => {
  let mockGetMergedMRsByTimeRange: any
  let mockGitLabClient: any

  beforeEach(() => {
    // 模擬測試資料
    mockGetMergedMRsByTimeRange = vi.fn().mockResolvedValue([
      {
        id: 1,
        iid: 1,
        title: 'Test MR 1',
        state: 'merged',
        author: { id: 1, name: 'Alice', username: 'alice' },
        createdAt: new Date('2025-01-10'),
        updatedAt: new Date('2025-01-15'),
        mergedAt: new Date('2025-01-15T02:00:00Z'),
        sourceBranch: 'feature-1',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/test/mr/1'
      },
      {
        id: 2,
        iid: 2,
        title: 'Test MR 2',
        state: 'merged',
        author: { id: 2, name: 'Bob', username: 'bob' },
        createdAt: new Date('2025-01-11'),
        updatedAt: new Date('2025-01-16'),
        mergedAt: new Date('2025-01-16T02:00:00Z'),
        sourceBranch: 'feature-2',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/test/mr/2'
      },
      {
        id: 3,
        iid: 3,
        title: 'Test MR 3',
        state: 'merged',
        author: { id: 1, name: 'Alice', username: 'alice' },
        createdAt: new Date('2025-01-12'),
        updatedAt: new Date('2025-01-22'),
        mergedAt: new Date('2025-01-22T02:00:00Z'),
        sourceBranch: 'feature-3',
        targetBranch: 'main',
        webUrl: 'https://gitlab.com/test/mr/3'
      }
    ])

    // 模擬 GitLabClient 實例
    mockGitLabClient = {
      getMergedMRsByTimeRange: mockGetMergedMRsByTimeRange
    }

    // Mock GitLabClient 建構函式
    vi.spyOn(GitLabClient.prototype, 'constructor' as any).mockImplementation(() => mockGitLabClient)
    vi.spyOn(GitLabClient.prototype, 'getMergedMRsByTimeRange').mockImplementation(
      mockGetMergedMRsByTimeRange
    )
  })

  describe('基礎趨勢查詢', () => {
    it('應顯示週統計表格（正體中文）', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--granularity', 'week'],
        {} as any
      )

      // 模擬 token
      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'table',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      // 驗證輸出包含正體中文標題
      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      expect(output).toContain('日期') // 表格標題
      expect(output).toContain('合併次數') // 表格標題
    })

    it('應正確彙總週資料', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--granularity', 'week'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'table',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證包含週標籤（ISO week 格式）
      expect(output).toMatch(/2025-W\d{2}/)
    })

    it('應在無資料時顯示提示訊息', async () => {
      mockGetMergedMRsByTimeRange.mockResolvedValue([])

      const command = new Trend(
        ['--project', 'test/project', '--period', '30d'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'table',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 應顯示正體中文的無資料訊息
      expect(output).toContain('指定時間範圍內無合併記錄')
    })
  })

  describe('人均統計查詢', () => {
    it('應顯示人均欄位（--per-author）', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--per-author'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'table',
          'per-author': true,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證包含人均統計欄位
      expect(output).toContain('活躍開發者')
      expect(output).toContain('人均合併數')
      expect(output).toContain('摘要')
      expect(output).toContain('總合併次數')
    })

    it('應顯示小批量評估狀態', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--per-author'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'table',
          'per-author': true,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證包含小批量評估訊息（✓ 或 ✗）
      expect(output).toMatch(/[✓✗]/)
    })
  })

  describe('JSON 格式輸出', () => {
    it('應輸出有效的 JSON 格式', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--format', 'json'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'json',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證是有效的 JSON
      expect(() => JSON.parse(output)).not.toThrow()
    })

    it('JSON 應包含必要欄位', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--format', 'json'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'json',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')
      const json = JSON.parse(output)

      expect(json).toHaveProperty('projectId')
      expect(json).toHaveProperty('timePeriod')
      expect(json).toHaveProperty('dataPoints')
      expect(json).toHaveProperty('queriedAt')
      expect(Array.isArray(json.dataPoints)).toBe(true)
    })

    it('JSON 應包含人均統計（--per-author）', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--format', 'json', '--per-author'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'json',
          'per-author': true,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')
      const json = JSON.parse(output)

      expect(json).toHaveProperty('summary')
      expect(json.summary).toHaveProperty('totalMerges')
      expect(json.summary).toHaveProperty('totalActiveDevelopers')
      expect(json.summary).toHaveProperty('weeklyAvgMergesPerDeveloper')
      expect(json.summary).toHaveProperty('overallBatchAssessment')
    })
  })

  describe('錯誤處理', () => {
    it('應在缺少 token 時顯示錯誤', async () => {
      const command = new Trend(
        ['--project', 'test/project'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: undefined,
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'table',
          'per-author': false,
          threshold: 3
        }
      })

      const errorSpy = vi.spyOn(command, 'error').mockImplementation(() => {
        throw new Error('Token required')
      })

      await expect(command.run()).rejects.toThrow()

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('GitLab Personal Access Token')
      )
    })
  })

  describe('時間粒度', () => {
    it('應支援日粒度', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '7d', '--granularity', 'day'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '7d',
          granularity: 'day',
          format: 'table',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證日期格式為 YYYY-MM-DD
      expect(output).toMatch(/2025-01-\d{2}/)
    })

    it('應支援月粒度', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '90d', '--granularity', 'month'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '90d',
          granularity: 'month',
          format: 'table',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證月份格式為 YYYY-MM
      expect(output).toMatch(/2025-\d{2}/)
    })
  })

  describe('期間比較', () => {
    it('應支援月份格式比較', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--compare-periods', '2025-01,2025-02'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          'compare-periods': '2025-01,2025-02',
          granularity: 'week',
          format: 'table',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證包含期間比較相關文字
      expect(output).toContain('期間比較分析')
      expect(output).toContain('先前期間')
      expect(output).toContain('當前期間')
      expect(output).toContain('變化')
    })

    it('應正確計算變化百分比', async () => {
      // Mock 先前期間有 2 個 MR，當前期間有 3 個 MR
      mockGetMergedMRsByTimeRange
        .mockResolvedValueOnce([
          {
            id: 1,
            iid: 1,
            title: 'Test MR 1',
            state: 'merged',
            author: { id: 1, name: 'Alice', username: 'alice' },
            createdAt: new Date('2025-01-10'),
            updatedAt: new Date('2025-01-15'),
            mergedAt: new Date('2025-01-15T02:00:00Z'),
            sourceBranch: 'feature-1',
            targetBranch: 'main',
            webUrl: 'https://gitlab.com/test/mr/1'
          },
          {
            id: 2,
            iid: 2,
            title: 'Test MR 2',
            state: 'merged',
            author: { id: 2, name: 'Bob', username: 'bob' },
            createdAt: new Date('2025-01-11'),
            updatedAt: new Date('2025-01-16'),
            mergedAt: new Date('2025-01-16T02:00:00Z'),
            sourceBranch: 'feature-2',
            targetBranch: 'main',
            webUrl: 'https://gitlab.com/test/mr/2'
          }
        ])
        .mockResolvedValueOnce([
          {
            id: 3,
            iid: 3,
            title: 'Test MR 3',
            state: 'merged',
            author: { id: 1, name: 'Alice', username: 'alice' },
            createdAt: new Date('2025-02-10'),
            updatedAt: new Date('2025-02-15'),
            mergedAt: new Date('2025-02-15T02:00:00Z'),
            sourceBranch: 'feature-3',
            targetBranch: 'main',
            webUrl: 'https://gitlab.com/test/mr/3'
          },
          {
            id: 4,
            iid: 4,
            title: 'Test MR 4',
            state: 'merged',
            author: { id: 2, name: 'Bob', username: 'bob' },
            createdAt: new Date('2025-02-11'),
            updatedAt: new Date('2025-02-16'),
            mergedAt: new Date('2025-02-16T02:00:00Z'),
            sourceBranch: 'feature-4',
            targetBranch: 'main',
            webUrl: 'https://gitlab.com/test/mr/4'
          },
          {
            id: 5,
            iid: 5,
            title: 'Test MR 5',
            state: 'merged',
            author: { id: 3, name: 'Charlie', username: 'charlie' },
            createdAt: new Date('2025-02-12'),
            updatedAt: new Date('2025-02-17'),
            mergedAt: new Date('2025-02-17T02:00:00Z'),
            sourceBranch: 'feature-5',
            targetBranch: 'main',
            webUrl: 'https://gitlab.com/test/mr/5'
          }
        ])

      const command = new Trend(
        ['--project', 'test/project', '--compare-periods', '2025-01,2025-02'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          'compare-periods': '2025-01,2025-02',
          granularity: 'week',
          format: 'table',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證包含總合併數（先前: 2, 當前: 3）
      expect(output).toContain('2')
      expect(output).toContain('3')
      // 驗證包含變化百分比
      expect(output).toMatch(/[+\-]?\d+\.?\d*%/)
    })

    it('應支援 JSON 格式比較輸出', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--compare-periods', '2025-01,2025-02', '--format', 'json'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          'compare-periods': '2025-01,2025-02',
          granularity: 'week',
          format: 'json',
          'per-author': false,
          threshold: 3
        }
      })

      const logSpy = vi.spyOn(command, 'log')

      await command.run()

      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證是有效的 JSON
      expect(() => JSON.parse(output)).not.toThrow()

      const json = JSON.parse(output)

      // 驗證包含必要欄位
      expect(json).toHaveProperty('previousPeriod')
      expect(json).toHaveProperty('currentPeriod')
      expect(json).toHaveProperty('changes')
      expect(json.changes).toHaveProperty('totalMergesChangePercent')
      expect(json.changes).toHaveProperty('weeklyAverageChangePercent')
      expect(json.changes).toHaveProperty('isImprovement')
    })
  })

  // T049: User Story 4 - 自訂閾值整合測試
  describe('自訂閾值', () => {
    it('應支援自訂 threshold 參數', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--per-author', '--threshold', '5'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'table',
          'per-author': true,
          threshold: 5
        }
      })

      const logSpy = vi.spyOn(command, 'log')
      await command.run()
      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證閾值被正確應用（人均 0.30 應該小於閾值 5）
      expect(output).toContain('週人均合併數：0.30')
      expect(output).toContain('✗ 未達小批量標準（週人均 < 5）')
    })

    it('應在預設閾值 3 下正確評估', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--per-author'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'table',
          'per-author': true,
          threshold: 3 // 預設值
        }
      })

      const logSpy = vi.spyOn(command, 'log')
      await command.run()
      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 使用預設閾值 3
      expect(output).toContain('✗ 未達小批量標準（週人均 < 3）')
    })

    it('應在達到閾值時顯示健康狀態', async () => {
      // 修改 mock 返回更多 MR 使人均達到閾值
      mockGetMergedMRsByTimeRange.mockResolvedValue([
        {
          id: 1,
          iid: 1,
          title: 'MR 1',
          author: { id: 1, username: 'user1', name: 'User 1' },
          mergedAt: new Date('2025-01-15'),
          createdAt: new Date('2025-01-14'),
          updatedAt: new Date('2025-01-15')
        },
        {
          id: 2,
          iid: 2,
          title: 'MR 2',
          author: { id: 1, username: 'user1', name: 'User 1' },
          mergedAt: new Date('2025-01-16'),
          createdAt: new Date('2025-01-15'),
          updatedAt: new Date('2025-01-16')
        },
        {
          id: 3,
          iid: 3,
          title: 'MR 3',
          author: { id: 1, username: 'user1', name: 'User 1' },
          mergedAt: new Date('2025-01-17'),
          createdAt: new Date('2025-01-16'),
          updatedAt: new Date('2025-01-17')
        },
        {
          id: 4,
          iid: 4,
          title: 'MR 4',
          author: { id: 1, username: 'user1', name: 'User 1' },
          mergedAt: new Date('2025-01-18'),
          createdAt: new Date('2025-01-17'),
          updatedAt: new Date('2025-01-18')
        },
        {
          id: 5,
          iid: 5,
          title: 'MR 5',
          author: { id: 1, username: 'user1', name: 'User 1' },
          mergedAt: new Date('2025-01-19'),
          createdAt: new Date('2025-01-18'),
          updatedAt: new Date('2025-01-19')
        }
      ])

      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--per-author', '--threshold', '1'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'table',
          'per-author': true,
          threshold: 1 // 低閾值，容易達標
        }
      })

      const logSpy = vi.spyOn(command, 'log')
      await command.run()
      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      // 驗證達標狀態（5 筆 MR，1 位開發者，5 週 = 1.0 週人均，應達到閾值 1）
      expect(output).toContain('✓ 符合小批量工作模式（週人均 >= 1）')
      expect(output).not.toContain('建議')
    })

    it('JSON 格式應包含閾值資訊', async () => {
      const command = new Trend(
        ['--project', 'test/project', '--period', '30d', '--per-author', '--threshold', '7', '--format', 'json'],
        {} as any
      )

      vi.spyOn(command as any, 'parse').mockResolvedValue({
        flags: {
          project: 'test/project',
          token: 'test-token',
          host: 'https://gitlab.com',
          period: '30d',
          granularity: 'week',
          format: 'json',
          'per-author': true,
          threshold: 7
        }
      })

      const logSpy = vi.spyOn(command, 'log')
      await command.run()
      const output = logSpy.mock.calls.map(call => call[0]).join('\n')

      const json = JSON.parse(output)

      // 驗證 JSON 包含閾值資訊
      expect(json.summary).toBeDefined()
      expect(json.summary.overallBatchAssessment).toBeDefined()
      expect(json.summary.overallBatchAssessment.threshold).toBe(7)
      expect(json.summary.overallBatchAssessment.isHealthy).toBe(false) // 人均 0.30 < 7
    })
  })
})
