import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ReleaseAnalyzer,
  type IGitLabClient,
  type GitLabTag,
} from '../../../../src/services/release/release-analyzer.js'
import type { CacheService } from '../../../../src/services/cache/cache-service.js'
import type { ReleaseConfiguration } from '../../../../src/types/release-config.js'
import { logger } from '../../../../src/utils/logger.js'

/**
 * ReleaseAnalyzer 迴歸測試（走完整分析流程，不直接呼叫內部方法）
 *
 * 這些測試刻意經過 analyzeBatchSize 的整條路徑，因為以下三個修復
 * 在「只單測內部函式」的情況下退回原狀也不會被抓到：
 *
 * 1. evaluate_batch_size 曾以 release_types 的 name（「正式月度發布」）
 *    比對 classifyReleaseType 回傳的 key（major），永遠不匹配，健康度恆為 null。
 * 2. 快取以 JSON 儲存，merged_at 讀回是字串，calculateFreezeDays 對字串
 *    呼叫 .getTime() 會拋錯，又被 batch 的 skip 策略吞掉，導致 release 靜默消失。
 * 3. buildReleases 只取 successes、丟棄 failures，使上述靜默消失無跡可循。
 */
describe('ReleaseAnalyzer 迴歸（完整流程）', () => {
  let gitlabClient: IGitLabClient
  let cache: CacheService

  const TAGS: GitLabTag[] = [
    { name: 'AppStore26.7.0', commit: { id: 'sha-267', committed_date: '2026-07-16T00:00:00Z' } },
    { name: 'AppStore26.6.0', commit: { id: 'sha-266', committed_date: '2026-06-17T00:00:00Z' } },
  ]

  /** 只填分析流程實際會讀到的欄位 */
  function makeConfig(): ReleaseConfiguration {
    return {
      name: 'test-config',
      description: '測試用配置',
      tag: {
        pattern: '^(?:AppStore|v)(\\d{2})\\.(\\d{1,2})\\.(\\d+)$',
        groups: { year: 1, month: 2, patch: 3 },
      },
      release_types: {
        // key 是 major，name 刻意用中文：兩者不同才能抓到 key/name 混淆
        major: {
          name: '正式月度發布',
          description: '每月固定發布',
          priority: 1,
          evaluate_batch_size: true,
          rules: [{ field: 'patch', operator: 'equals', value: 0 }],
        },
        minor: {
          name: '小版本更新',
          description: '其他',
          priority: 99,
          evaluate_batch_size: false,
          rules: [],
        },
      },
      analysis: {
        default_branch: 'develop',
        thresholds: {
          mr_count: { healthy: 50, warning: 100, critical: 100 },
          loc_additions: { healthy: 5000, warning: 10000, critical: 10000 },
        },
        pipeline_history_days: 90,
      },
    } as unknown as ReleaseConfiguration
  }

  beforeEach(() => {
    gitlabClient = {
      getTags: vi.fn().mockResolvedValue(TAGS),
      getMergeRequestsBetweenCommits: vi.fn().mockResolvedValue([
        {
          iid: 101,
          title: 'chore: update translations',
          merged_at: '2026-07-10T00:00:00.000Z',
          merged_by: { username: 'dev-a' },
          source_branch: 'dev-a/i18n',
          target_branch: 'develop',
        },
      ]),
      getMergeRequestChanges: vi.fn().mockResolvedValue({ additions: 120, deletions: 30 }),
    }

    // 預設為「快取全空」，個別測試再覆寫 get
    cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as CacheService
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function analyzer(): ReleaseAnalyzer {
    return new ReleaseAnalyzer(gitlabClient, { cacheService: cache })
  }

  it('evaluate_batch_size 應真的生效並產生 health_level（key/name 混淆迴歸）', async () => {
    const result = await analyzer().analyzeBatchSize({
      projectId: 'group/project',
      config: makeConfig(),
    })

    const major = result.releases.find((r) => r.tag === 'AppStore26.7.0')

    expect(major).toBeDefined()
    expect(major!.type).toBe('major')
    // 若改回用 name 比對 key，這裡會是 null
    expect(major!.health_level).not.toBeNull()
    expect(major!.health_level).toBe('healthy')
  })

  it('快取命中時 merged_at 應還原為 Date，release 不得消失（JSON hydration 迴歸）', async () => {
    // 模擬 JSON 快取讀回的樣子：merged_at 是字串而非 Date
    cache.get = vi.fn(async (key: Record<string, unknown>) => {
      if (key.type === 'mr_list') {
        return [
          {
            mr_iid: 101,
            title: 'chore: update translations',
            merged_at: '2026-07-10T00:00:00.000Z',
            merged_by: 'dev-a',
            source_branch: 'dev-a/i18n',
            target_branch: 'develop',
            loc_additions: 120,
            loc_deletions: 30,
            loc_changes: 150,
          },
        ]
      }
      return null
    }) as unknown as CacheService['get']

    const result = await analyzer().analyzeBatchSize({
      projectId: 'group/project',
      config: makeConfig(),
    })

    const major = result.releases.find((r) => r.tag === 'AppStore26.7.0')

    // 沒有 hydration 的話 calculateFreezeDays 會對字串呼叫 getTime() 而拋錯，
    // 該 release 會被 skip 策略吞掉而整筆消失
    expect(major).toBeDefined()
    expect(Number.isFinite(major!.freeze_days)).toBe(true)
    expect(major!.mr_count).toBe(1)
  })

  it('release 分析失敗時應留下含 tag 名稱的警告（靜默跳過迴歸）', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    // 讓 mr_list 快取回非陣列，觸發 cached.map 拋 TypeError
    cache.get = vi.fn(async (key: Record<string, unknown>) => {
      if (key.type === 'mr_list') {
        return { corrupted: true }
      }
      return null
    }) as unknown as CacheService['get']

    const result = await analyzer().analyzeBatchSize({
      projectId: 'group/project',
      config: makeConfig(),
    })

    // 26.7.0 會讀到損壞快取而失敗被跳過；
    // 26.6.0 是最舊的 tag，沒有 previousTag 就不查 MR，因此碰不到快取而存活
    expect(result.releases.map((r) => r.tag)).toEqual(['AppStore26.6.0'])

    const warnings = warnSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(warnings).toContain('已跳過')
    expect(warnings).toContain('AppStore26.7.0')
  })

  it('任一 MR 變更統計失敗時不得寫入 mr_list 快取（降級污染迴歸）', async () => {
    gitlabClient.getMergeRequestChanges = vi
      .fn()
      .mockRejectedValue(new Error('GitLab 500'))

    await analyzer().analyzeBatchSize({
      projectId: 'group/project',
      config: makeConfig(),
    })

    const cachedTypes = (cache.set as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
      (c) => (c[0] as Record<string, unknown>).type
    )

    // mr_changes 與 mr_list 都不應該被寫入（行數是降級的 0）
    expect(cachedTypes).not.toContain('mr_list')
    expect(cachedTypes).not.toContain('mr_changes')
  })

  /**
   * 兩個 MR、只有一個持續失敗，且交換失敗的位置 —— 抓「只看第一筆或最後一筆」的寫法。
   * 失敗以 iid 判定而非呼叫次數：wrapApiCall 有 maxRetries: 2，
   * 用次數判定會在重試時意外成功。
   */
  it.each([
    ['第一筆失敗', 1],
    ['最後一筆失敗', 2],
  ])('%s 時仍不得寫入 mr_list 快取', async (_label, failingIid) => {
    gitlabClient.getMergeRequestsBetweenCommits = vi.fn().mockResolvedValue([
      {
        iid: 1,
        title: 'first',
        merged_at: '2026-07-10T00:00:00Z',
        source_branch: 'a',
        target_branch: 'develop',
      },
      {
        iid: 2,
        title: 'second',
        merged_at: '2026-07-11T00:00:00Z',
        source_branch: 'b',
        target_branch: 'develop',
      },
    ])

    gitlabClient.getMergeRequestChanges = vi.fn(async (iid: number) => {
      if (iid === failingIid) throw new Error('GitLab 500')
      return { additions: 10, deletions: 5 }
    })

    await analyzer().analyzeBatchSize({
      projectId: 'group/project',
      config: makeConfig(),
    })

    const cachedTypes = (cache.set as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
      (c) => (c[0] as Record<string, unknown>).type
    )

    expect(cachedTypes).not.toContain('mr_list')
  })

  it('沒有 projectId 時降級仍不得寫入任何快取', async () => {
    gitlabClient.getMergeRequestChanges = vi.fn().mockRejectedValue(new Error('GitLab 500'))

    const events = await analyzer().getMergeRequestsBetweenReleases({
      fromTag: 'AppStore26.6.0',
      toTag: 'AppStore26.7.0',
      fromSha: 'sha-266',
      toSha: 'sha-267',
      targetBranch: 'develop',
      // 刻意不給 projectId
    })

    expect(events).toHaveLength(1)
    expect(events[0]!.loc_changes).toBe(0)
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('快取鍵必須帶上 schemaVersion，舊版鍵不得命中', async () => {
    await analyzer().analyzeBatchSize({
      projectId: 'group/project',
      config: makeConfig(),
    })

    const getKeys = (cache.get as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
      (c) => c[0] as Record<string, unknown>
    )
    const setKeys = (cache.set as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
      (c) => c[0] as Record<string, unknown>
    )

    const versioned = [...getKeys, ...setKeys].filter(
      (k) => k.type === 'mr_list' || k.type === 'mr_changes'
    )

    expect(versioned.length).toBeGreaterThan(0)
    for (const key of versioned) {
      expect(key.schemaVersion).toBe(2)
    }
  })

  it('總體 metrics.level 應納入新增行數維度（低 MR、高新增）', async () => {
    // 只有 1 個 MR（平均 MR 遠低於 healthy 50），但新增行數爆表
    gitlabClient.getMergeRequestChanges = vi
      .fn()
      .mockResolvedValue({ additions: 20000, deletions: 0 })

    const result = await analyzer().analyzeBatchSize({
      projectId: 'group/project',
      config: makeConfig(),
    })

    // 若總體只看 averageMRCount，這裡會是 healthy
    expect(result.metrics.level).toBe('critical')
    expect(result.metrics.average_loc_additions).toBe(20000)
  })

  it('專案中真的沒有更舊標籤時不得評為健康', async () => {
    const result = await analyzer().analyzeBatchSize({
      projectId: 'group/project',
      config: makeConfig(),
    })

    const oldest = result.releases.find((r) => r.tag === 'AppStore26.6.0')

    // 沒有任何更舊的標籤可界定 MR 區間，0 MR 是「未測量」而非「批量很小」
    expect(oldest).toBeDefined()
    expect(oldest!.mr_count).toBe(0)
    expect(oldest!.health_level).toBeNull()
  })

  it('前一個標籤落在 since 之前時，範圍內最舊的發布仍須被測量', async () => {
    // 三個標籤，查詢範圍只涵蓋後兩個；26.6.0 的前序 26.5.0 在範圍外
    gitlabClient.getTags = vi.fn().mockResolvedValue([
      { name: 'AppStore26.7.0', commit: { id: 'sha-267', committed_date: '2026-07-16T00:00:00Z' } },
      { name: 'AppStore26.6.0', commit: { id: 'sha-266', committed_date: '2026-06-17T00:00:00Z' } },
      { name: 'AppStore26.5.0', commit: { id: 'sha-265', committed_date: '2026-05-07T00:00:00Z' } },
    ])

    const result = await analyzer().analyzeBatchSize({
      projectId: 'group/project',
      config: makeConfig(),
      since: new Date('2026-06-01T00:00:00Z'),
      until: new Date('2026-07-28T00:00:00Z'),
    })

    // 範圍外的 26.5.0 不應出現在輸出
    expect(result.releases.map((r) => r.tag)).toEqual(['AppStore26.7.0', 'AppStore26.6.0'])

    const oldestInRange = result.releases.find((r) => r.tag === 'AppStore26.6.0')

    // 若只用範圍內標籤找前序，這裡會是 0 MR / null
    expect(oldestInRange!.mr_count).toBe(1)
    expect(oldestInRange!.health_level).not.toBeNull()
    expect(oldestInRange!.previous_release_tag).toBe('AppStore26.5.0')
  })
})
