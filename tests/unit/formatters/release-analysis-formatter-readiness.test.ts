import { describe, it, expect } from 'vitest'
import {
  formatReleaseAnalysis,
  type ReleaseAnalysisOutput,
} from '../../../src/formatters/release-analysis-formatter.js'
import type { Release } from '../../../src/models/release.js'

/**
 * 發布準備度區塊在 0 筆可評估時的呈現
 *
 * 舊行為用 `freezePeriodAssessment.length > 0` 守衛整個區塊，而
 * `summary.recommendation` 在那個 if 之內，所以 0 筆時整段「發布準備度分析」
 * 從報告裡消失，使用者不會知道它為什麼不見了 —— 而 analyzer 端其實已經
 * 準備好了 `'無足夠資料進行評估'` 這句話。
 *
 * 0 筆變得容易發生的原因：凍結期評估現在會跳過沒有測量基準的發布
 *（無前一個標籤，或區間內 0 筆 MR），所以查詢範圍內只有一個 major
 * 或全部 major 都無基準時就會是 0 筆。
 *
 * 同時 0 筆時**不能**印平均凍結期與健康評級：那些 0 是「沒有樣本」，
 * 不是「量到 0 天 / 0 個健康」，印出來會被當成實測值。
 */
describe('formatReleaseAnalysis 的發布準備度區塊', () => {
  function makeRelease(tag: string): Release {
    return {
      tag,
      commit_sha: `sha-${tag}`,
      date: new Date('2026-07-16T00:00:00Z'),
      type: 'major',
      mr_list: ['1'],
      mr_count: 1,
      total_loc_additions: 100,
      total_loc_deletions: 20,
      total_loc_changes: 120,
      freeze_days: 2,
      health_level: 'healthy',
    }
  }

  /** 只填 formatter 實際會讀到的欄位 */
  function makeOutput(
    readiness?: ReleaseAnalysisOutput['readiness']
  ): ReleaseAnalysisOutput {
    return {
      project: { path: 'group/project', name: 'project' },
      analysisDate: '2026-07-30',
      timeRange: { since: '2026-06-01', until: '2026-07-30' },
      configSource: 'cli',
      configName: 'test-config',
      releases: [makeRelease('v1.1.0')],
      metrics: {
        average_mr_count: 1,
        average_loc_changes: 120,
        level: 'healthy',
        recommendation: '發布批量健康',
      },
      readiness,
    }
  }

  const SECTION = '發布準備度分析'

  it('0 筆可評估時仍要印出區塊與說明，不得整段消失', () => {
    const out = formatReleaseAnalysis(
      makeOutput({
        freezePeriodAssessment: [],
        summary: {
          avgFreezeDays: 0,
          healthyCount: 0,
          warningCount: 0,
          criticalCount: 0,
          recommendation: '無足夠資料進行評估',
        },
      })
    )

    expect(out).toContain(SECTION)
    expect(out).toContain('無足夠資料進行評估')
  })

  it('0 筆可評估時不得印出平均凍結期與健康評級（那些 0 是沒有樣本）', () => {
    const out = formatReleaseAnalysis(
      makeOutput({
        freezePeriodAssessment: [],
        summary: {
          avgFreezeDays: 0,
          healthyCount: 0,
          warningCount: 0,
          criticalCount: 0,
          recommendation: '無足夠資料進行評估',
        },
      })
    )

    expect(out).not.toContain('平均凍結期')
    expect(out).not.toContain('健康評級')
    expect(out).not.toContain('分析發布數')
  })

  it('有可評估發布時照原樣印出摘要數字', () => {
    const out = formatReleaseAnalysis(
      makeOutput({
        freezePeriodAssessment: [
          {
            release: makeRelease('v1.1.0'),
            freezeDays: 2,
            assessment: '健康範圍（1-3 天）',
            healthLevel: 'healthy',
          },
        ],
        summary: {
          avgFreezeDays: 2,
          healthyCount: 1,
          warningCount: 0,
          criticalCount: 0,
          recommendation: '發布準備流程健康，維持當前實踐',
        },
      })
    )

    expect(out).toContain(SECTION)
    expect(out).toContain('分析發布數')
    expect(out).toContain('平均凍結期')
    expect(out).toContain('健康評級')
    expect(out).toContain('發布準備流程健康，維持當前實踐')
  })

  it('有問題的發布仍列在「需要關注的發布」下', () => {
    const out = formatReleaseAnalysis(
      makeOutput({
        freezePeriodAssessment: [
          {
            release: makeRelease('v1.2.0'),
            freezeDays: 0,
            assessment: '風險過高：當天發布，測試時間不足',
            healthLevel: 'critical',
          },
        ],
        summary: {
          avgFreezeDays: 0,
          healthyCount: 0,
          warningCount: 0,
          criticalCount: 1,
          recommendation: '發現當天發布情況，建議增加測試緩衝時間至少 1-2 天',
        },
      })
    )

    expect(out).toContain('需要關注的發布')
    expect(out).toContain('v1.2.0')
    expect(out).toContain('風險過高：當天發布，測試時間不足')
  })

  it('沒有 readiness 資料時不印這個區塊（維持向後相容）', () => {
    const out = formatReleaseAnalysis(makeOutput(undefined))

    expect(out).not.toContain(SECTION)
  })
})
