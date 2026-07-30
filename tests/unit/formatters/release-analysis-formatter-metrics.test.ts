import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import chalk from 'chalk'
import {
  formatReleaseAnalysis,
  type ReleaseAnalysisOutput,
} from '../../../src/formatters/release-analysis-formatter.js'
import type { Release } from '../../../src/models/release.js'

/**
 * 總體批量指標的呈現
 *
 * 兩個問題：
 *
 * 1. 批量健康度改以「平均新增行數」為優先判準後，表格從未印出這個數字 ——
 *    formatter 自己重複宣告了一份 metrics 型別，加欄位時漏改它。
 *    現在改為引用 HealthMetrics['batch_size'] 這個單一來源。
 *
 * 2. 每個數字都套用整體等級的顏色，會讓人以為那個數字落在該等級。
 *    整體等級其實是各維度取最差的結果，所以「平均 LOC 變更 9000」被染成綠色、
 *    同時健康度顯示紅色的情況是可能的 —— 畫面自相矛盾。
 *    現在只有「健康度等級」上色。
 *
 * chalk 在非 TTY 下 level = 0（顏色是 no-op），所以驗證上色行為必須強制開啟。
 */
describe('formatReleaseAnalysis 的總體批量指標', () => {
  const originalLevel = chalk.level

  beforeAll(() => {
    chalk.level = 1
  })

  afterAll(() => {
    chalk.level = originalLevel
  })

  const RED = '[31m'
  const GREEN = '[32m'

  function makeRelease(): Release {
    return {
      tag: 'v1.1.0',
      commit_sha: 'sha-1',
      date: new Date('2026-07-16T00:00:00Z'),
      type: 'major',
      mr_list: ['1'],
      mr_count: 1,
      total_loc_additions: 3000,
      total_loc_deletions: 6000,
      total_loc_changes: 9000,
      freeze_days: 2,
      health_level: 'healthy',
    }
  }

  function makeOutput(
    metrics: Partial<ReleaseAnalysisOutput['metrics']>
  ): ReleaseAnalysisOutput {
    return {
      project: { path: 'group/project', name: 'project' },
      analysisDate: '2026-07-30',
      timeRange: { since: '2026-06-01', until: '2026-07-30' },
      configSource: 'cli',
      configName: 'test-config',
      releases: [makeRelease()],
      metrics: {
        average_mr_count: 12,
        average_loc_changes: 9000,
        level: 'healthy',
        recommendation: '發布批量健康',
        ...metrics,
      },
    }
  }

  /** 取出含指定標籤的那一行 */
  function lineWith(output: string, label: string): string {
    const line = output.split('\n').find((l) => l.includes(label))
    expect(line, `找不到含「${label}」的行`).toBeDefined()
    return line as string
  }

  it('有 average_loc_additions 時必須印出來（判定依據不能不見）', () => {
    const out = formatReleaseAnalysis(makeOutput({ average_loc_additions: 3000 }))

    expect(out).toContain('平均新增行數')
    expect(lineWith(out, '平均新增行數')).toContain('3000')
  })

  it('沒有 average_loc_additions 時不印該行（維持向後相容）', () => {
    const out = formatReleaseAnalysis(makeOutput({}))

    expect(out).not.toContain('平均新增行數')
    expect(out).toContain('平均 LOC 變更')
  })

  it('平均 LOC 變更要標明它是新增＋刪除，避免與新增行數混淆', () => {
    const out = formatReleaseAnalysis(makeOutput({ average_loc_additions: 3000 }))

    expect(lineWith(out, '平均 LOC 變更')).toContain('新增＋刪除')
  })

  it('個別數字不得套用整體等級的顏色', () => {
    const out = formatReleaseAnalysis(
      makeOutput({ average_loc_additions: 3000, level: 'critical' })
    )

    // 整體是 critical（紅），但三個數字都不該被染紅
    expect(lineWith(out, '平均 MR 數量')).not.toContain(RED)
    expect(lineWith(out, '平均新增行數')).not.toContain(RED)
    expect(lineWith(out, '平均 LOC 變更')).not.toContain(RED)
  })

  it('健康度等級本身仍要上色', () => {
    const critical = formatReleaseAnalysis(makeOutput({ level: 'critical' }))
    expect(lineWith(critical, '健康度等級')).toContain(RED)

    const healthy = formatReleaseAnalysis(makeOutput({ level: 'healthy' }))
    expect(lineWith(healthy, '健康度等級')).toContain(GREEN)
  })

  it('建議文字照原樣輸出（它負責說明是哪個維度觸發的）', () => {
    const out = formatReleaseAnalysis(
      makeOutput({
        average_loc_additions: 12000,
        level: 'critical',
        recommendation: '發布批量過大 — 平均新增 12000 行（門檻 > 10000）',
      })
    )

    expect(out).toContain('平均新增 12000 行（門檻 > 10000）')
  })
})
