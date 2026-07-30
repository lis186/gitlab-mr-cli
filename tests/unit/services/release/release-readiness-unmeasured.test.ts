import { describe, it, expect } from 'vitest'
import {
  ReleaseAnalyzer,
  type IGitLabClient,
} from '../../../../src/services/release/release-analyzer.js'
import type { CacheService } from '../../../../src/services/cache/cache-service.js'
import type { Release } from '../../../../src/models/release.js'

/**
 * analyzeReadiness 對「未測量發布」的處理
 *
 * 沒有前一個標籤時（例如查詢範圍內最舊的發布），calculateTimeMetrics 的
 * lastMergeDate 預設等於 tagDate，freeze_days 因此是合成的 0 而不是實測值。
 * 舊行為把它送進 assessFreezePeriod，被判成「風險過高：當天發布」critical，
 * 並灌進 criticalCount 與「發現當天發布情況」建議——對使用者是假警報。
 *
 * analyzeReadiness 是同步方法且只吃 Release[]，所以這裡直接構造資料，
 * 不需要 mock GitLab client 或快取。
 */
describe('analyzeReadiness 未測量發布', () => {
  /** analyzeReadiness 不碰 client 與 cache，給空 stub 即可 */
  function makeAnalyzer(): ReleaseAnalyzer {
    return new ReleaseAnalyzer({} as IGitLabClient, {
      cacheService: {} as CacheService,
    })
  }

  function makeRelease(overrides: Partial<Release> & { tag: string }): Release {
    return {
      commit_sha: `sha-${overrides.tag}`,
      date: new Date('2026-07-16T00:00:00Z'),
      type: 'major',
      mr_list: [],
      mr_count: 0,
      total_loc_additions: 0,
      total_loc_deletions: 0,
      total_loc_changes: 0,
      freeze_days: 2,
      health_level: 'healthy',
      ...overrides,
    }
  }

  it('無前一個標籤的 major 不進凍結期評估，也不產生假 critical', () => {
    const releases: Release[] = [
      makeRelease({ tag: 'AppStore26.7.0', freeze_days: 2, mr_count: 4, previous_release_tag: 'AppStore26.6.0' }),
      // 最舊的發布：無前序，freeze_days 的 0 是合成值
      makeRelease({ tag: 'AppStore26.6.0', freeze_days: 0, health_level: null }),
    ]

    const result = makeAnalyzer().analyzeReadiness(releases)

    expect(result.freezePeriodAssessment).toHaveLength(1)
    expect(result.freezePeriodAssessment[0]?.release.tag).toBe('AppStore26.7.0')
    expect(result.summary.criticalCount).toBe(0)
    expect(result.summary.recommendation).not.toContain('當天發布')
  })

  it('有前一個標籤而凍結期真的是 0 天時，仍然要報 critical', () => {
    // 這條守住修法的精確度：判斷依據是「有沒有測量基準」，
    // 不是「freeze_days 等不等於 0」。若誤改成後者，本測試會紅。
    //
    // mr_count 必須 > 0：真正的當天發布代表有 MR 在打標籤當天合併，
    // 0 筆 MR 的 0 天是合成值而非實測值（見上一條測試）。
    const releases: Release[] = [
      makeRelease({ tag: 'AppStore26.7.0', freeze_days: 0, mr_count: 5, previous_release_tag: 'AppStore26.6.0' }),
      makeRelease({ tag: 'AppStore26.6.1', freeze_days: 2, mr_count: 3, previous_release_tag: 'AppStore26.6.0' }),
    ]

    const result = makeAnalyzer().analyzeReadiness(releases)

    expect(result.freezePeriodAssessment).toHaveLength(2)
    expect(result.summary.criticalCount).toBe(1)
    expect(result.summary.recommendation).toContain('當天發布')
  })

  it('有前一個標籤但區間內 0 筆 MR 時也不得評估（重打標籤／查詢失敗）', () => {
    // lastMergeDate 只在查到 MR 時才被覆寫，所以 0 筆 MR 的 freeze_days
    // 同樣是合成的 0。守衛若只看 previous_release_tag 會漏掉這條路徑。
    const releases: Release[] = [
      makeRelease({ tag: 'AppStore26.7.0', freeze_days: 2, mr_count: 4, previous_release_tag: 'AppStore26.6.0' }),
      makeRelease({ tag: 'AppStore26.6.1', freeze_days: 0, mr_count: 0, previous_release_tag: 'AppStore26.6.0' }),
    ]

    const result = makeAnalyzer().analyzeReadiness(releases)

    expect(result.freezePeriodAssessment).toHaveLength(1)
    expect(result.freezePeriodAssessment[0]?.release.tag).toBe('AppStore26.7.0')
    expect(result.summary.criticalCount).toBe(0)
    expect(result.summary.recommendation).not.toContain('當天發布')
  })

  it('平均凍結期不把合成的 0 算進分子或分母', () => {
    const releases: Release[] = [
      makeRelease({ tag: 'AppStore26.7.0', freeze_days: 2, mr_count: 4, previous_release_tag: 'AppStore26.6.0' }),
      makeRelease({ tag: 'AppStore26.6.0', freeze_days: 3, mr_count: 6, previous_release_tag: 'AppStore26.5.0' }),
      makeRelease({ tag: 'AppStore26.5.0', freeze_days: 0, health_level: null }),
    ]

    const result = makeAnalyzer().analyzeReadiness(releases)

    // 只有兩筆可評估：(2 + 3) / 2 = 2.5。
    // 舊行為會算成 (2 + 3 + 0) / 3 ≈ 1.67。
    expect(result.summary.avgFreezeDays).toBe(2.5)
  })

  it('全部 major 都未測量時回報資料不足，而非一片 critical', () => {
    const releases: Release[] = [
      makeRelease({ tag: 'AppStore26.7.0', freeze_days: 0, health_level: null }),
      makeRelease({ tag: 'AppStore26.6.0', freeze_days: 0, health_level: null }),
    ]

    const result = makeAnalyzer().analyzeReadiness(releases)

    expect(result.freezePeriodAssessment).toHaveLength(0)
    expect(result.summary.criticalCount).toBe(0)
    expect(result.summary.avgFreezeDays).toBe(0)
    expect(result.summary.recommendation).toBe('無足夠資料進行評估')
  })

  it('非 major 發布維持不評估', () => {
    const releases: Release[] = [
      makeRelease({ tag: 'AppStore26.7.1', type: 'hotfix', freeze_days: 0, mr_count: 1, previous_release_tag: 'AppStore26.7.0' }),
      makeRelease({ tag: 'AppStore26.7.0', freeze_days: 2, mr_count: 4, previous_release_tag: 'AppStore26.6.0' }),
    ]

    const result = makeAnalyzer().analyzeReadiness(releases)

    expect(result.freezePeriodAssessment).toHaveLength(1)
    expect(result.freezePeriodAssessment[0]?.release.type).toBe('major')
  })
})
