import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger } from '../../../src/utils/logger.js'
import ReleaseAnalyze from '../../../src/commands/release/analyze.js'

// 刻意不用真實 token 的 glpat- 前綴：那會讓 scripts/check-secrets.sh 對這個
// 檔案永遠報警，久了大家就開始忽略掃描器。遮蔽是按欄位名做的，不看格式。
const SENTINEL = 'SENTINEL-TOKEN-DO-NOT-LEAK-9x7'

/**
 * token 不得進入日誌
 *
 * 迴歸保護：analyze 命令原本以 JSON.stringify(flags) dump 整包參數，
 * 而 flags 含 GitLab token，導致 -v 時憑證明文寫進輸出。
 * 這裡走命令的真實流程（--show-config 會在分析前 return），
 * 監看 logger 收到的所有引數，確保哨兵值不出現。
 */
describe('release:analyze token redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('verbose 模式下不得將 token 寫入日誌', async () => {
    const logged: string[] = []
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => String(a)).join(' '))
      })
    }

    const command = new ReleaseAnalyze(['--project', 'example/mobile-app'], {} as never)

    vi.spyOn(command as unknown as { parse: () => unknown }, 'parse').mockResolvedValue({
      flags: {
        project: 'example/mobile-app',
        token: SENTINEL,
        host: 'https://gitlab.example.com',
        output: 'table',
        json: false,
        verbose: true,
        'show-config': true,
        'target-branch': 'main',
        'no-cache': false,
      },
    } as never)

    // --show-config 會印出設定後直接 return，不會真的呼叫 API
    vi.spyOn(command as unknown as { log: () => void }, 'log').mockImplementation(() => {})

    await command.run().catch(() => {
      // 沒有真實配置檔時可能提早結束；參數 dump 在那之前就已發生
    })

    const all = logged.join('\n')

    expect(all).not.toContain(SENTINEL)
    // 確認 dump 真的發生過，否則這個測試會空過
    expect(all).toContain('<redacted>')
  })
})
