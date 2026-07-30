import { describe, it, expect, vi, afterEach } from 'vitest'
import { Logger } from '../../../src/utils/logger.js'

/**
 * Logger 輸出流向測試
 *
 * 迴歸保護：診斷日誌若寫進 stdout，會污染 --json 的輸出使其無法被解析。
 * 所有等級的日誌都必須走 stderr，stdout 只保留給命令本身的輸出。
 *
 * 這裡斷言「用了哪個 console 方法」而非直接監看 process.stdout，
 * 因為 vitest 會接管 console，攔不到底層的 stream 寫入。
 * Node 的對應關係：log/debug/info → stdout，warn/error → stderr。
 */
describe('Logger 輸出流向', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** 監看所有 console 方法，區分寫 stdout 與寫 stderr 兩組 */
  function spyConsole() {
    const toStdout = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
    ]
    const toStderr = [
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ]

    return {
      stdoutCalls: () => toStdout.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
      stderrCalls: () => toStderr.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
    }
  }

  it('debug 不得寫入 stdout', () => {
    const c = spyConsole()
    const logger = new Logger({ verbose: true })

    logger.debug('除錯訊息')

    expect(c.stdoutCalls()).toBe(0)
    expect(c.stderrCalls()).toBeGreaterThan(0)
  })

  it('info 不得寫入 stdout', () => {
    const c = spyConsole()
    const logger = new Logger()

    logger.info('一般訊息')

    expect(c.stdoutCalls()).toBe(0)
    expect(c.stderrCalls()).toBeGreaterThan(0)
  })

  it('warn 與 error 應維持在 stderr', () => {
    const c = spyConsole()
    const logger = new Logger()

    logger.warn('警告訊息')
    logger.error('錯誤訊息', new Error('原始錯誤'))

    expect(c.stdoutCalls()).toBe(0)
    expect(c.stderrCalls()).toBeGreaterThan(0)
  })

  it('apiCall 等衍生方法同樣不得寫入 stdout', () => {
    const c = spyConsole()
    const logger = new Logger({ verbose: true })

    logger.apiCall('GET', '/projects/1/merge_requests', { page: 1 })
    logger.apiResponse('GET', '/projects/1/merge_requests', 200)
    logger.performance('取得 MR 列表', 120)

    expect(c.stdoutCalls()).toBe(0)
    expect(c.stderrCalls()).toBeGreaterThan(0)
  })

  it('verbose 關閉時 debug 完全不輸出', () => {
    const c = spyConsole()
    const logger = new Logger({ verbose: false })

    logger.debug('不該出現的訊息')

    expect(c.stdoutCalls()).toBe(0)
    expect(c.stderrCalls()).toBe(0)
  })
})
