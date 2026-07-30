import { describe, it, expect, beforeEach } from 'vitest'
import {
  ReleaseAnalyzer,
  type IGitLabClient,
} from '../../../../src/services/release/release-analyzer.js'
import type { ReleaseConfiguration } from '../../../../src/types/release-config.js'

/**
 * 發布健康度判斷測試
 *
 * 背景：批量風險原本以 loc_changes（additions + deletions）評估，
 * 會把「大規模刪除」判成和「大批量新功能」同級 —— 但前者通常是清技術債。
 * 一次淨刪數千行的重構，加總可能高達近萬，在舊邏輯下與大批新功能無法區分。
 *
 * 現在改以 loc_additions 為優先，並保留 loc_changes 作為向後相容的退路。
 */
describe('ReleaseAnalyzer.calculateReleaseHealth', () => {
  let analyzer: ReleaseAnalyzer

  beforeEach(() => {
    analyzer = new ReleaseAnalyzer({} as unknown as IGitLabClient)
  })

  /** 只組出健康度需要的 thresholds 片段 */
  function thresholds(
    partial: Partial<ReleaseConfiguration['analysis']['thresholds']>
  ): ReleaseConfiguration['analysis']['thresholds'] {
    return {
      mr_count: { healthy: 50, warning: 100, critical: 100 },
      ...partial,
    } as ReleaseConfiguration['analysis']['thresholds']
  }

  it('大規模刪除不應被判為高風險（loc_additions 優先）', () => {
    // 清技術債的情境：新增中等、刪除很多 → +3000 / -6000，加總 9000
    const level = analyzer.calculateReleaseHealth({
      mrCount: 20,
      locChanges: 9000,
      locAdditions: 3000,
      thresholds: thresholds({
        loc_changes: { healthy: 5000, warning: 10000, critical: 10000 },
        loc_additions: { healthy: 5000, warning: 10000, critical: 10000 },
      }),
    })

    // 加總 9000 會落在 warning；新增只有 3000，應為 healthy
    expect(level).toBe('healthy')
  })

  it('大批量新增仍應被判為 critical', () => {
    // 大批新功能的情境：新增遠多於刪除 → +11000 / -1800
    const level = analyzer.calculateReleaseHealth({
      mrCount: 22,
      locChanges: 12800,
      locAdditions: 11000,
      thresholds: thresholds({
        loc_additions: { healthy: 5000, warning: 10000, critical: 10000 },
      }),
    })

    expect(level).toBe('critical')
  })

  it('未設定 loc_additions 時應退回 loc_changes（向後相容）', () => {
    const level = analyzer.calculateReleaseHealth({
      mrCount: 20,
      locChanges: 9000,
      locAdditions: 3000,
      thresholds: thresholds({
        loc_changes: { healthy: 5000, warning: 10000, critical: 10000 },
      }),
    })

    // 沒有 loc_additions，只能用加總 9000 → warning
    expect(level).toBe('warning')
  })

  it('未設定任何 LOC 閾值時只依 mr_count 判斷', () => {
    const level = analyzer.calculateReleaseHealth({
      mrCount: 20,
      locChanges: 999999,
      locAdditions: 999999,
      thresholds: thresholds({}),
    })

    // mr_count 20 < 50 → healthy，LOC 再大也不參與判斷
    expect(level).toBe('healthy')
  })

  it('應取各維度中最嚴重的等級', () => {
    // MR 數健康，但新增行數爆表
    const level = analyzer.calculateReleaseHealth({
      mrCount: 10,
      locChanges: 20000,
      locAdditions: 20000,
      thresholds: thresholds({
        loc_additions: { healthy: 5000, warning: 10000, critical: 10000 },
      }),
    })

    expect(level).toBe('critical')
  })

  it('MR 數過多時即使新增行數健康也應反映出來', () => {
    const level = analyzer.calculateReleaseHealth({
      mrCount: 120,
      locChanges: 100,
      locAdditions: 100,
      thresholds: thresholds({
        loc_additions: { healthy: 5000, warning: 10000, critical: 10000 },
      }),
    })

    // mr_count 120 > warning(100) → critical
    expect(level).toBe('critical')
  })

  it('locAdditions 未傳入時應退回使用 locChanges 的值', () => {
    const level = analyzer.calculateReleaseHealth({
      mrCount: 10,
      locChanges: 12000,
      thresholds: thresholds({
        loc_additions: { healthy: 5000, warning: 10000, critical: 10000 },
      }),
    })

    expect(level).toBe('critical')
  })

  /**
   * 邊界契約：calculateHealthLevel 用的是 `< healthy` 而非 `<= healthy`，
   * 因此剛好等於 healthy 的值算 warning。這裡把現況釘住，
   * 避免日後有人在不知情下改動比較符號。
   */
  describe('閾值邊界', () => {
    const t = thresholds({
      loc_additions: { healthy: 5000, warning: 10000, critical: 10000 },
    })

    it('新增行數剛好等於 healthy 時為 warning（< healthy 才算健康）', () => {
      expect(
        analyzer.calculateReleaseHealth({ mrCount: 1, locChanges: 5000, locAdditions: 5000, thresholds: t })
      ).toBe('warning')
    })

    it('新增行數比 healthy 少 1 時為 healthy', () => {
      expect(
        analyzer.calculateReleaseHealth({ mrCount: 1, locChanges: 4999, locAdditions: 4999, thresholds: t })
      ).toBe('healthy')
    })

    it('新增行數剛好等於 warning 時仍為 warning', () => {
      expect(
        analyzer.calculateReleaseHealth({ mrCount: 1, locChanges: 10000, locAdditions: 10000, thresholds: t })
      ).toBe('warning')
    })

    it('新增行數超過 warning 時為 critical', () => {
      expect(
        analyzer.calculateReleaseHealth({ mrCount: 1, locChanges: 10001, locAdditions: 10001, thresholds: t })
      ).toBe('critical')
    })

    it('MR 數剛好等於 healthy 時為 warning', () => {
      expect(
        analyzer.calculateReleaseHealth({ mrCount: 50, locChanges: 0, locAdditions: 0, thresholds: t })
      ).toBe('warning')
    })
  })
})
