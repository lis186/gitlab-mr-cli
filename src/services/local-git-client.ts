/**
 * 本地 Git 客戶端實作
 *
 * 提供本地 Git repository 的高效能分支比較功能
 * 使用 git rev-list 命令計算 commits behind，相較 API 模式快 95%
 *
 * @module services/local-git-client
 */

import { execSync } from 'child_process'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { GIT_SETTINGS } from '../constants/commit-analysis.js'
import type {
  LocalGitClientConfig,
  RepoValidationResult,
} from '../types/branch-health.js'

// ============================================================================
// 錯誤類別
// ============================================================================

/**
 * Git 錯誤基礎類別
 */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode?: number,
    public readonly stderr?: string
  ) {
    super(message)
    this.name = 'GitError'
  }
}

/**
 * Git 命令超時錯誤
 */
export class GitTimeoutError extends GitError {
  constructor(command: string, timeout: number) {
    super(`Git 命令逾時（${timeout}ms）: ${command}`, command)
    this.name = 'GitTimeoutError'
  }
}

/**
 * 分支不存在錯誤
 */
export class BranchNotFoundError extends GitError {
  constructor(branch: string, command: string) {
    super(`分支 '${branch}' 在 repository 中不存在`, command)
    this.name = 'BranchNotFoundError'
  }
}

/**
 * Repository 無效錯誤
 */
export class InvalidRepoError extends Error {
  constructor(
    public readonly repoPath: string,
    public readonly reason: string
  ) {
    super(`無效的 Git repository 於 '${repoPath}': ${reason}`)
    this.name = 'InvalidRepoError'
  }
}

// ============================================================================
// LocalGitClient 實作
// ============================================================================

/**
 * 本地 Git 客戶端
 *
 * 實作契約介面 ILocalGitClient（contracts/local-git-client.interface.ts）
 */
export class LocalGitClient {
  private repoPath: string
  private expectedProjectId: string
  private baseBranch: string
  private gitTimeout: number
  private validated: boolean = false
  private validationResult: RepoValidationResult | null = null

  constructor(config: LocalGitClientConfig) {
    this.repoPath = config.repoPath
    this.expectedProjectId = config.expectedProjectId
    this.baseBranch = config.baseBranch || 'main'
    // Issue #4: Increased default timeout from 5s to 10s for large repositories
    this.gitTimeout = config.gitTimeout || GIT_SETTINGS.DEFAULT_GIT_TIMEOUT
  }

  /**
   * 驗證 repository 是否有效且安全
   *
   * 檢查項目：
   * 1. 路徑格式（防止路徑遍歷攻擊）
   * 2. .git 目錄存在性
   * 3. Remote origin URL 匹配
   * 4. FETCH_HEAD 修改時間（警告但不阻擋）
   */
  async validateRepo(): Promise<RepoValidationResult> {
    const warnings: string[] = []
    let error: string | null = null
    let isValid = true
    let remoteOriginUrl: string | null = null
    let lastFetchDate: Date | null = null

    try {
      // 1. 驗證路徑格式（防止路徑遍歷）
      if (this.repoPath.includes('..')) {
        error = '路徑包含 ".."，疑似路徑遍歷攻擊'
        isValid = false
        this.validationResult = {
          isValid,
          remoteOriginUrl: null,
          lastFetchDate: null,
          warnings,
          error,
        }
        return this.validationResult
      }

      // 2. 檢查 .git 目錄存在性
      const gitDir = join(this.repoPath, '.git')
      if (!existsSync(gitDir)) {
        error = '找不到 .git 目錄'
        isValid = false
        this.validationResult = {
          isValid,
          remoteOriginUrl: null,
          lastFetchDate: null,
          warnings,
          error,
        }
        return this.validationResult
      }

      // 3. 驗證 remote origin URL 匹配
      try {
        remoteOriginUrl = await this.getRemoteOriginUrl()

        // 檢查 URL 是否包含專案識別符
        if (!remoteOriginUrl.includes(this.expectedProjectId)) {
          warnings.push(
            `Remote origin URL 不包含預期的專案識別符 '${this.expectedProjectId}'`
          )
          // 不設為無效，但發出警告
        }
      } catch (err) {
        error = `無法取得 remote origin URL: ${
          err instanceof Error ? err.message : String(err)
        }`
        isValid = false
      }

      // 4. 檢查 FETCH_HEAD 修改時間
      if (isValid) {
        lastFetchDate = this.checkLastFetchDate()
        if (lastFetchDate) {
          const daysSinceFetch = Math.floor(
            (Date.now() - lastFetchDate.getTime()) / (1000 * 60 * 60 * 24)
          )
          if (daysSinceFetch > 7) {
            warnings.push(
              `本地 repository 上次 fetch 為 ${daysSinceFetch} 天前，資料可能過時`
            )
          }
        }
      }
    } catch (err) {
      error = `驗證過程發生錯誤: ${
        err instanceof Error ? err.message : String(err)
      }`
      isValid = false
    }

    this.validated = isValid
    this.validationResult = {
      isValid,
      remoteOriginUrl,
      lastFetchDate,
      warnings,
      error,
    }

    return this.validationResult
  }

  /**
   * 清理分支名稱以防止 shell 命令注入
   * Git 分支名稱應只包含字母、數字、-、_、/、.
   *
   * @param branchName - 原始分支名稱
   * @returns 清理後的分支名稱
   * @throws Error - 如果分支名稱包含非法字元
   */
  private sanitizeBranchName(branchName: string): string {
    // Git 分支名稱的合法字元：字母、數字、-、_、/、.
    // 防止命令注入：拒絕包含 shell 特殊字元的分支名稱
    const dangerousChars = /[;$`|&()<>{}\[\]*?~^:\\"\s]/

    if (dangerousChars.test(branchName)) {
      throw new Error(
        `Invalid branch name "${branchName}": contains potentially dangerous characters. ` +
        `Branch names should only contain letters, numbers, -, _, /, and .`
      )
    }

    return branchName
  }

  /**
   * 計算分支落後基準分支的 commits 數量
   *
   * 使用 Git 命令：git rev-list --count <baseBranch>..origin/<branch>
   *
   * @param branch - 目標分支名稱
   * @param baseBranch - 基準分支名稱（預設使用 config.baseBranch）
   * @returns Commits 數量
   * @throws GitCommandError - Git 命令執行失敗
   * @throws GitTimeoutError - 命令超時
   * @throws BranchNotFoundError - 分支不存在
   */
  async getCommitsBehind(
    branch: string,
    baseBranch?: string
  ): Promise<number> {
    const base = baseBranch || this.baseBranch

    // Sanitize branch names to prevent command injection (Security Fix)
    const safeBranch = this.sanitizeBranchName(branch)
    const safeBase = this.sanitizeBranchName(base)

    const command = `git rev-list --count ${safeBase}..origin/${safeBranch}`

    try {
      const output = execSync(command, {
        cwd: this.repoPath,
        encoding: 'utf8',
        timeout: this.gitTimeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const count = parseInt(output.trim(), 10)
      if (isNaN(count)) {
        throw new GitError(
          `無法解析 commits 數量: ${output}`,
          command,
          0,
          output
        )
      }

      return count
    } catch (err: any) {
      // 處理超時
      if (err.killed && err.signal === 'SIGTERM') {
        throw new GitTimeoutError(command, this.gitTimeout)
      }

      // 處理分支不存在
      const stderr = err.stderr?.toString() || ''
      if (
        stderr.includes('bad revision') ||
        stderr.includes('unknown revision') ||
        stderr.includes('ambiguous argument')
      ) {
        throw new BranchNotFoundError(branch, command)
      }

      // 一般 Git 錯誤
      throw new GitError(
        `Git 命令執行失敗: ${stderr || err.message}`,
        command,
        err.status,
        stderr
      )
    }
  }

  /**
   * 批次計算多個分支落後的 commits 數量
   *
   * 使用並發批次處理（每批次 10 個分支）
   *
   * @param branches - 分支名稱清單
   * @param baseBranch - 基準分支名稱
   * @param onWarning - 警告訊息回調（Issue #3: 替代 console.warn）
   * @returns Map<分支名稱, commits 數量 | null>（null 表示失敗）
   */
  async getBatchCommitsBehind(
    branches: string[],
    baseBranch?: string,
    onWarning?: (message: string) => void
  ): Promise<Map<string, number | null>> {
    const results = new Map<string, number | null>()
    const batchSize = 10

    for (let i = 0; i < branches.length; i += batchSize) {
      const batch = branches.slice(i, i + batchSize)

      const batchPromises = batch.map(async (branch) => {
        try {
          const count = await this.getCommitsBehind(branch, baseBranch)
          return { branch, count }
        } catch (err) {
          // Issue #3: Use onWarning callback instead of console.warn
          const errorMsg = err instanceof Error ? err.message : String(err)
          onWarning?.(`分支 '${branch}' 計算失敗: ${errorMsg}`)
          return { branch, count: null }
        }
      })

      const batchResults = await Promise.allSettled(batchPromises)

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.set(result.value.branch, result.value.count)
        } else {
          // Promise.allSettled 的 rejected 情況（不應發生，因為已在內部 catch）
          // Issue #3: Use onWarning callback instead of console.error
          const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason)
          onWarning?.(`批次處理發生未預期錯誤: ${errorMsg}`)
        }
      })
    }

    return results
  }

  /**
   * 檢查本地 repository 最後 fetch 日期
   *
   * 讀取 .git/FETCH_HEAD 檔案的修改時間戳
   *
   * @returns 最後 fetch 日期，若 FETCH_HEAD 不存在則返回 null
   */
  checkLastFetchDate(): Date | null {
    const fetchHeadPath = join(this.repoPath, '.git', 'FETCH_HEAD')

    if (!existsSync(fetchHeadPath)) {
      return null // 新 clone 從未 fetch
    }

    try {
      const stats = statSync(fetchHeadPath)
      return stats.mtime
    } catch (err) {
      // Issue #3: Removed console.warn - caller (validateRepo) handles this via warnings array
      // Error is silently handled by returning null
      return null
    }
  }

  /**
   * 取得 remote origin URL
   *
   * 執行：git config --get remote.origin.url
   *
   * @returns Remote origin URL
   * @throws GitError - 無法取得 remote origin
   */
  async getRemoteOriginUrl(): Promise<string> {
    const command = 'git config --get remote.origin.url'

    try {
      const output = execSync(command, {
        cwd: this.repoPath,
        encoding: 'utf8',
        timeout: this.gitTimeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      return output.trim()
    } catch (err: any) {
      const stderr = err.stderr?.toString() || ''
      throw new GitError(
        `無法取得 remote origin URL: ${stderr || err.message}`,
        command,
        err.status,
        stderr
      )
    }
  }

  /**
   * 獲取 commits 列表（用於 commit-analysis）
   *
   * @param options - 查詢選項
   * @returns Commit 資料陣列
   */
  async getCommitList(options: {
    branch?: string
    since?: Date
    until?: Date
    limit?: number
  }): Promise<Array<{
    sha: string
    author: string
    authorEmail: string
    timestamp: Date
    message: string
    parentIds: string[]
  }>> {
    const branch = options.branch || this.baseBranch
    const safeBranch = this.sanitizeBranchName(branch)

    // 構建 git log 命令
    // Format: SHA|author|email|timestamp|message|parents
    let command = `git log ${safeBranch} --pretty=format:"%H|%an|%ae|%aI|%s|%P"`

    if (options.since) {
      command += ` --since="${options.since.toISOString()}"`
    }

    if (options.until) {
      command += ` --until="${options.until.toISOString()}"`
    }

    if (options.limit) {
      command += ` -n ${options.limit}`
    }

    try {
      const output = execSync(command, {
        cwd: this.repoPath,
        encoding: 'utf8',
        timeout: this.gitTimeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const lines = output.trim().split('\n').filter(line => line.length > 0)

      return lines.map(line => {
        const parts = line.split('|')
        if (parts.length < 5) {
          throw new GitError(
            `無法解析 commit 資料: ${line}`,
            command,
            0,
            line
          )
        }

        return {
          sha: parts[0] || '',
          author: parts[1] || '',
          authorEmail: parts[2] || '',
          timestamp: new Date(parts[3] || ''),
          message: parts[4] || '',
          parentIds: parts[5] ? parts[5].split(' ') : [],
        }
      })
    } catch (err: any) {
      if (err.killed && err.signal === 'SIGTERM') {
        throw new GitTimeoutError(command, this.gitTimeout)
      }

      const stderr = err.stderr?.toString() || ''
      throw new GitError(
        `Git log 命令執行失敗: ${stderr || err.message}`,
        command,
        err.status,
        stderr
      )
    }
  }

  /**
   * 獲取單個 commit 的 diff 統計（用於 LOC 計算）
   *
   * @param sha - Commit SHA
   * @returns Diff 統計資訊
   */
  async getCommitDiff(sha: string): Promise<{
    filesChanged: number
    additions: number
    deletions: number
    loc: number
  }> {
    // 安全檢查：SHA 應只包含 hex 字元
    if (!/^[0-9a-fA-F]+$/.test(sha)) {
      throw new Error(`Invalid SHA format: ${sha}`)
    }

    const command = `git show --numstat --format="" ${sha}`

    try {
      const output = execSync(command, {
        cwd: this.repoPath,
        encoding: 'utf8',
        timeout: this.gitTimeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let additions = 0
      let deletions = 0
      let filesChanged = 0

      const lines = output.trim().split('\n')

      for (const line of lines) {
        if (!line.trim()) continue

        // Format: additions deletions filename
        const parts = line.split(/\s+/)
        if (parts.length < 3) continue

        const add = parts[0]
        const del = parts[1]

        // TypeScript 檢查：確保元素存在
        if (!add || !del) continue

        // 跳過二進位檔案（顯示為 "-"）
        if (add === '-' || del === '-') continue

        const addNum = parseInt(add, 10)
        const delNum = parseInt(del, 10)

        if (!isNaN(addNum) && !isNaN(delNum)) {
          additions += addNum
          deletions += delNum
          filesChanged++
        }
      }

      const loc = additions + deletions

      return {
        filesChanged,
        additions,
        deletions,
        loc,
      }
    } catch (err: any) {
      if (err.killed && err.signal === 'SIGTERM') {
        throw new GitTimeoutError(command, this.gitTimeout)
      }

      const stderr = err.stderr?.toString() || ''
      throw new GitError(
        `Git show 命令執行失敗: ${stderr || err.message}`,
        command,
        err.status,
        stderr
      )
    }
  }

  /**
   * 檢查 repository 是否已驗證且有效
   *
   * @returns 是否有效
   */
  isValid(): boolean {
    return this.validated && this.validationResult?.isValid === true
  }
}

// ============================================================================
// 工廠函數
// ============================================================================

/**
 * 建立並驗證 LocalGitClient 實例
 *
 * @param config - 客戶端配置
 * @returns LocalGitClient 實例
 * @throws InvalidRepoError - Repository 驗證失敗
 */
export async function createLocalGitClient(
  config: LocalGitClientConfig
): Promise<LocalGitClient> {
  const client = new LocalGitClient(config)
  const validation = await client.validateRepo()

  if (!validation.isValid) {
    throw new InvalidRepoError(config.repoPath, validation.error || '未知錯誤')
  }

  return client
}
