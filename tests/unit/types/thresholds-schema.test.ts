import { describe, it, expect } from 'vitest'
import { ThresholdsSchema } from '../../../src/types/release-config.js'

/**
 * 閾值 schema 驗證測試
 *
 * loc_additions 新增時原本只驗證非負，反序設定（healthy > warning）會通過驗證，
 * 造成 warning 區間不可達。這裡確保序關係有被強制。
 */
describe('ThresholdsSchema', () => {
  const validMrCount = { healthy: 50, warning: 100, critical: 100 }

  it('應接受正序的 loc_additions', () => {
    const result = ThresholdsSchema.safeParse({
      mr_count: validMrCount,
      loc_additions: { healthy: 5000, warning: 10000, critical: 10000 },
    })

    expect(result.success).toBe(true)
  })

  it('應拒絕 healthy > warning 的 loc_additions', () => {
    const result = ThresholdsSchema.safeParse({
      mr_count: validMrCount,
      loc_additions: { healthy: 10000, warning: 5000, critical: 10000 },
    })

    expect(result.success).toBe(false)
  })

  it('應拒絕 warning > critical 的 loc_additions', () => {
    const result = ThresholdsSchema.safeParse({
      mr_count: validMrCount,
      loc_additions: { healthy: 1000, warning: 9000, critical: 5000 },
    })

    expect(result.success).toBe(false)
  })

  it('應拒絕負數閾值', () => {
    const result = ThresholdsSchema.safeParse({
      mr_count: validMrCount,
      loc_additions: { healthy: -1, warning: 5000, critical: 10000 },
    })

    expect(result.success).toBe(false)
  })

  it('loc_additions 為選填，未提供時仍應通過', () => {
    const result = ThresholdsSchema.safeParse({ mr_count: validMrCount })

    expect(result.success).toBe(true)
  })
})
