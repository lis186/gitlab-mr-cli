import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import yaml from 'js-yaml'
import { ThresholdsSchema } from '../../../src/types/release-config.js'

/**
 * 出貨設定檔的閾值必須含 loc_additions，且要能通過 schema 而不被丟掉
 *
 * 這個檔案存在的原因：批量健康度改以「新增行數」為主要判準之後，若沒有任何
 * 設定檔範例帶 loc_additions，該判準在預設安裝下永遠不會生效——使用者要自己
 * 手改 YAML 才會啟用，而 YAML 裡沒有範例可抄。
 *
 * 兩種退化都要抓到：
 *   1. 有人從設定檔移除 loc_additions
 *   2. 有人動了 schema，使 loc_additions 在載入時被 zod strip 掉
 *
 * 第 2 種在這個 repo 有實際先例：release_interval_days 與 code_freeze_days
 * 寫在設定檔裡但不在 ThresholdsSchema 內，載入時被靜默丟棄，而凍結期評估
 * 其實讀的是硬編碼常數。光看「驗證通過」不足以證明欄位有生效。
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** 所有會被使用者拿去抄或直接套用的設定檔 */
const SHIPPED_CONFIGS = [
  'src/presets/semver.example.yml',
  'src/presets/mobile-app.example.yml',
  'src/presets/date-based.example.yml',
  '.gitlab-analysis.example.yml',
  'examples/gitlab-configs/.gitlab-analysis-ios.yml',
  'examples/gitlab-configs/.gitlab-analysis-android.yml',
]

function loadThresholds(relativePath: string): Record<string, any> {
  const raw = readFileSync(resolve(repoRoot, relativePath), 'utf8')
  const parsed = yaml.load(raw) as any
  return parsed?.analysis?.thresholds
}

describe('出貨設定檔的 loc_additions', () => {
  it.each(SHIPPED_CONFIGS)('%s 應定義 loc_additions', (relativePath) => {
    const thresholds = loadThresholds(relativePath)

    expect(thresholds).toBeDefined()
    expect(thresholds.loc_additions).toBeDefined()
    expect(thresholds.loc_additions).toEqual({
      healthy: expect.any(Number),
      warning: expect.any(Number),
      critical: expect.any(Number),
    })
  })

  it.each(SHIPPED_CONFIGS)('%s 的 loc_additions 通過 schema 後不得被丟棄', (relativePath) => {
    const result = ThresholdsSchema.safeParse(loadThresholds(relativePath))

    expect(result.success).toBe(true)
    // zod 預設會 strip 未知欄位；若 loc_additions 哪天被移出 schema，
    // safeParse 仍會成功，但欄位會從結果裡消失 —— 這一行就是要抓那個情況
    expect(result.success && result.data.loc_additions).toBeDefined()
  })

  it.each(SHIPPED_CONFIGS)(
    '%s 的 loc_additions 不得比 loc_changes 嚴格（升級不應讓既有專案突然降級）',
    (relativePath) => {
      const thresholds = loadThresholds(relativePath)
      const additions = thresholds.loc_additions
      const changes = thresholds.loc_changes

      // additions 必然不大於 additions + deletions，所以只要閾值不更小，
      // 改用 loc_additions 判定就不會比原本的 loc_changes 更嚴格
      if (changes) {
        expect(additions.healthy).toBeGreaterThanOrEqual(changes.healthy)
        expect(additions.warning).toBeGreaterThanOrEqual(changes.warning)
      }
    }
  )
})
