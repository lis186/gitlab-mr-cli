/**
 * Branch Health 命令 - 分支生命週期分析與效能優化
 *
 * 基於 specs/003-branch-lifecycle-optimized/contracts/command-contract.md
 */

import { Command, Flags } from '@oclif/core'
import { calculateLifecycles } from '../services/lifecycle-calculator.js'
import { calculateStatistics } from '../utils/statistics.js'
import { ProgressBar, createBranchFetchProgressBar, createStaleBranchProgressBar } from '../utils/progress-bar.js'
import { AppError, ErrorType } from '../models/error.js'
import { ErrorFormatter } from '../utils/error-formatter.js'

/**
 * Branch Health 命令
 *
 * 追蹤 GitLab 專案中未合併分支的健康度指標
 * - 總生命週期時間
 * - MR 處理時間
 * - Commits behind
 * - 命名規範驗證
 * - 時間段趨勢比較
 */
export default class BranchHealth extends Command {
  static description =
    '分析 GitLab 專案的分支健康度（存活時間、MR 處理時間、過時分支、命名規範、時間段趨勢）'

  static examples = [
    // US1: 基本健康度摘要
    '<%= config.bin %> <%= command.id %> --project example/mobile-app',
    '<%= config.bin %> <%= command.id %> --project 12345 --format json',

    // US2: 過時分支分析
    '<%= config.bin %> <%= command.id %> --project example/mobile-app --show-stale',
    '<%= config.bin %> <%= command.id %> --project 12345 --show-stale --threshold 60',

    // US3: 命名規範檢查
    '<%= config.bin %> <%= command.id %> --project example/mobile-app --check-naming --pattern "^(feature|bugfix|hotfix)/"',

    // US4: 時間段比較
    '<%= config.bin %> <%= command.id %> --project example/mobile-app --compare-periods "2025-09,2025-10"',
    '<%= config.bin %> <%= command.id %> --project 12345 --compare-periods "30d,60d"',

    // 效能優化
    '<%= config.bin %> <%= command.id %> --project example/mobile-app --local-repo /path/to/repo',
    '<%= config.bin %> <%= command.id %> --project 12345 --limit 150',
  ]

  static flags = {
    // ========================================================================
    // 必要參數
    // ========================================================================

    project: Flags.string({
      char: 'p',
      description: 'GitLab 專案識別符（路徑或 ID，如 example/mobile-app 或 12345）',
      required: false,
      env: 'GITLAB_PROJECT',
    }),

    // ========================================================================
    // 認證參數
    // ========================================================================

    token: Flags.string({
      char: 't',
      description: 'GitLab Personal Access Token（或透過環境變數 GITLAB_TOKEN 設定）',
      env: 'GITLAB_TOKEN',
    }),

    host: Flags.string({
      char: 'h',
      description: 'GitLab 伺服器 URL（預設: https://gitlab.com）',
      env: 'GITLAB_HOST',
      default: 'https://gitlab.com',
    }),

    // ========================================================================
    // 輸出控制
    // ========================================================================

    format: Flags.string({
      char: 'f',
      description: '輸出格式（table|json，預設 table）',
      options: ['table', 'json'],
      default: 'table',
    }),

    limit: Flags.integer({
      char: 'l',
      description: '分析的最大分支數量（預設 150，保護 server 效能）',
    }),

    // ========================================================================
    // 效能優化
    // ========================================================================

    'local-repo': Flags.string({
      description: '本地 Git repository 路徑（用於加速分支比較）',
    }),

    // ========================================================================
    // 功能旗標
    // ========================================================================

    'show-stale': Flags.boolean({
      description: '顯示過時分支分析（Top 10），包含 commits behind',
      default: false,
    }),

    threshold: Flags.integer({
      description: '過時分支的閾值（天，預設 30）',
      default: 30,
    }),

    'check-naming': Flags.boolean({
      description: '檢查分支命名規範',
      default: false,
    }),

    pattern: Flags.string({
      description: '命名規範的正則表達式（需搭配 --check-naming）',
    }),

    'compare-periods': Flags.string({
      description: '比較兩個時間段的健康度指標（逗號分隔，如 "2025-09,2025-10" 或 "30d,60d"）',
    }),

    // ========================================================================
    // 除錯與進階選項
    // ========================================================================

    verbose: Flags.boolean({
      char: 'v',
      description: '顯示詳細除錯資訊',
      default: false,
    }),

    'base-branch': Flags.string({
      description: '基準分支名稱（用於 commits behind 計算，預設 "main"）',
      default: 'main',
    }),
  }

  // ========================================================================
  // 輔助方法
  // ========================================================================

  /**
   * 建立 GitLab 客戶端
   */
  private async createGitLabClient(flags: any): Promise<any> {
    const { GitLabClient } = await import('../services/gitlab-client.js')
    return new GitLabClient({
      identifier: flags.project,
      token: flags.token!,
      host: flags.host,
    })
  }

  /**
   * 自動偵測本地 Git repository（FR-008, FR-009）
   *
   * @param projectId - GitLab 專案識別符
   * @param explicitPath - 明確指定的路徑（--local-repo）
   * @returns 本地 Git 客戶端或 null
   */
  private async autoDetectLocalGit(
    projectId: string,
    explicitPath?: string
  ): Promise<any | null> {
    const { LocalGitClient } = await import('../services/local-git-client.js')

    // 如果明確指定路徑，使用該路徑
    if (explicitPath) {
      try {
        const client = new LocalGitClient({
          repoPath: explicitPath,
          expectedProjectId: projectId,
          baseBranch: 'main',
        })

        const validation = await client.validateRepo()
        if (validation.isValid) {
          this.log(`✓ 使用本地 Git repository: ${explicitPath}`)

          // 檢查是否過時（FR-021）
          if (validation.warnings.length > 0) {
            validation.warnings.forEach(warning => this.warn(warning))
          }

          return client
        } else {
          this.warn(`⚠️  本地 Git 驗證失敗: ${validation.error}`)
          this.warn('降級為 API 模式')
          return null
        }
      } catch (error) {
        this.warn(`⚠️  無法使用本地 Git: ${error}`)
        return null
      }
    }

    // 自動偵測當前目錄
    const currentDir = process.cwd()
    try {
      const client = new LocalGitClient({
        repoPath: currentDir,
        expectedProjectId: projectId,
        baseBranch: 'main',
      })

      const validation = await client.validateRepo()
      if (validation.isValid) {
        this.log(`✓ 自動偵測到本地 Git repository: ${currentDir}`)

        // 檢查是否過時（FR-021）
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(warning => this.warn(warning))
        }

        return client
      }
    } catch (error) {
      // 靜默失敗，不顯示錯誤（因為這是自動偵測）
    }

    return null
  }

  /**
   * 計算分支生命週期
   */
  private calculateLifecyclesWrapper(branchesWithMRs: any[], threshold: number): any[] {
    return calculateLifecycles(branchesWithMRs, threshold)
  }

  /**
   * 計算健康度統計
   */
  private calculateStatisticsWrapper(lifecycles: any[]): any {
    return calculateStatistics(lifecycles)
  }

  /**
   * 轉換為輸出格式 BranchHealthDetail[]
   */
  private convertToBranchDetails(branchesWithMRs: any[], lifecycles: any[]): any[] {
    return lifecycles.map((lifecycle, index) => {
      const branchData = branchesWithMRs[index]
      return {
        name: lifecycle.branchName,
        lifecycleDays: lifecycle.totalLifecycleDays,
        mrProcessingDays: lifecycle.mrProcessingDays,
        lastCommitDate: lifecycle.lastUpdatedDate.toISOString(),
        author: branchData.branch.commit.author_name,
        mrId: lifecycle.isStale ? null : branchData.mergeRequest?.iid || null,
      }
    })
  }

  /**
   * 輸出結果（表格或 JSON）
   * 包含 T023（效能提示）和 T024（效能統計）
   */
  private async outputResults(
    flags: any,
    branchDetails: any[],
    statistics: any,
    executionTime: string,
    totalBranches: number,
    analyzedBranches: number,
    wasLimited: boolean,
    _isDefaultLimit: boolean, // 保留供未來使用
    optimizationMode: 'local-git' | 'api-batch' | 'api-serial'
  ): Promise<void> {
    const avgSpeed = (analyzedBranches / parseFloat(executionTime)).toFixed(1)

    if (flags.format === 'json') {
      // JSON 輸出
      const { BranchHealthJsonFormatter } = await import(
        '../formatters/branch-health-json-formatter.js'
      )
      const formatter = new BranchHealthJsonFormatter()

      const output = {
        metadata: {
          command: 'branch-health',
          project: flags.project,
          timestamp: new Date().toISOString(),
          executionTime: `${executionTime}s`,
          optimization: optimizationMode, // T021: 動態偵測優化模式
        },
        statistics,
        branches: branchDetails,
      }

      this.log(formatter.format(output))
    } else {
      // 表格輸出
      const { BranchHealthFormatter } = await import(
        '../formatters/branch-health-formatter.js'
      )
      const formatter = new BranchHealthFormatter()

      this.log(formatter.format(branchDetails, statistics))

      // T024: 效能統計顯示
      this.log('')
      this.log('─'.repeat(60))
      this.log(`⏱️  執行時間: ${executionTime} 秒`)
      this.log(`📊 分析速度: ${avgSpeed} 分支/秒`)
      this.log(`📁 分析分支: ${analyzedBranches}/${totalBranches}`)
      this.log(`🚀 優化模式: ${optimizationMode}`)

      // T023: 效能提示顯示（僅在未使用本地 Git 且未被 limit 截斷時顯示）
      if (optimizationMode !== 'local-git' && !wasLimited && analyzedBranches >= 50) {
        this.log('')
        this.log('💡 效能提示：')
        this.log('   使用 --local-repo 可加速 90-95%（本地 Git 優化）')
        this.log(`   範例: --local-repo ${process.cwd()}`)
        this.log('   或在專案目錄執行命令以自動偵測')
      }
    }
  }

  /**
   * 執行命令
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(BranchHealth)

    // ========================================================================
    // 參數驗證
    // ========================================================================

    // 驗證 project 存在
    if (!flags.project) {
      this.error(
        '請提供專案識別（使用 --project 或設定環境變數 GITLAB_PROJECT）'
      )
    }

    // 驗證 token 存在
    if (!flags.token) {
      this.error(
        '請提供 GitLab Personal Access Token（使用 --token 或設定環境變數 GITLAB_TOKEN）'
      )
    }

    // 驗證 limit 參數（若提供）
    if (flags.limit !== undefined && flags.limit < 1) {
      this.error('limit 參數必須 >= 1')
    }

    // 驗證 threshold 參數
    if (flags.threshold < 1) {
      this.error('threshold 參數必須 >= 1')
    }

    // 驗證 --check-naming 必須搭配 --pattern
    if (flags['check-naming'] && !flags.pattern) {
      this.error('--check-naming 必須搭配 --pattern 參數')
    }

    // 驗證 --pattern 的正則表達式格式
    if (flags.pattern) {
      try {
        new RegExp(flags.pattern)
      } catch (err) {
        this.error(`無效的正則表達式: ${flags.pattern}\n範例: "^(feature|bugfix|hotfix)/"`)
      }
    }

    // 驗證 --compare-periods 格式
    if (flags['compare-periods']) {
      const parts = flags['compare-periods'].split(',').map((s) => s.trim())
      if (parts.length !== 2) {
        this.error(
          '比較期間格式錯誤：必須提供兩個期間，以逗號分隔（例如：2025-09,2025-10 或 30d,60d）'
        )
      }
    }

    // ========================================================================
    // US1 實作：分支健康度摘要
    // ========================================================================

    const startTime = Date.now()

    try {
      // 步驟 1: 建立 GitLab 客戶端
      const gitlabClient = await this.createGitLabClient(flags)

      // 步驟 1.5: 自動偵測本地 Git（T021）
      const localGitClient = await this.autoDetectLocalGit(
        flags.project,
        flags['local-repo']
      )
      const optimizationMode: 'local-git' | 'api-batch' | 'api-serial' = localGitClient
        ? 'local-git'
        : 'api-batch'

      if (localGitClient && flags.verbose) {
        this.log(`使用優化模式: ${optimizationMode}`)
      }

      // 步驟 2: 確定查詢限制（保護 server）
      const queryLimit = flags.limit ?? 150 // 預設 150 個分支
      const isDefaultLimit = !flags.limit

      // 步驟 3: 查詢未合併分支與 MRs
      if (isDefaultLimit) {
        this.log(`正在查詢未合併分支（預設最多 ${queryLimit} 個，使用 --limit 調整）...`)
      } else {
        this.log(`正在查詢未合併分支（限制 ${queryLimit} 個）...`)
      }

      // Progress bar for branch fetching (FR-014)
      const skipProgress = flags.format === 'json'
      let fetchProgressBar: ProgressBar | undefined
      let progressBarInitialized = false // Prevent race condition

      const branchesWithMRs = await gitlabClient.getBranchesWithMRs({
        batchSize: 10,
        limit: queryLimit,
        onProgress: (processed: number, total: number) => {
          // Initialize progress bar on first call (when we know total)
          // Issue #1: Defensive programming to ensure single initialization
          if (!progressBarInitialized && !skipProgress) {
            progressBarInitialized = true
            fetchProgressBar = createBranchFetchProgressBar(total, skipProgress)
            fetchProgressBar.start()
          }

          // Update progress
          fetchProgressBar?.update(processed)

          // Verbose logging (in addition to progress bar)
          if (flags.verbose) {
            this.log(`處理進度: ${processed}/${total} 分支`)
          }
        },
        onWarning: (message: string) => {
          this.warn(message)
        },
      })

      // Stop progress bar
      fetchProgressBar?.stop()

      // 步驟 4: 檢查是否被限制截斷
      const totalBranches = branchesWithMRs.length
      const wasLimited = totalBranches >= queryLimit

      if (wasLimited && isDefaultLimit) {
        this.log('')
        this.warn(
          `📊 已限制為前 ${queryLimit} 個分支（保護 server 效能）`
        )
        this.log(`💡 如需查看更多分支，請使用：`)
        this.log(`   --limit <數量>     # 指定分析數量（如 --limit 300）`)
        this.log(`   --local-repo <路徑> # 使用本地 Git 加速（無限制）`)
        this.log('')
      } else if (wasLimited && !isDefaultLimit) {
        this.log('')
        this.log(`📊 已限制為前 ${queryLimit} 個分支`)
        this.log('')
      }

      const branchesToAnalyze = branchesWithMRs

      // T058: 邊界案例 - 空專案（0 分支）
      if (branchesToAnalyze.length === 0) {
        this.log('\n✓ 此專案目前沒有未合併的分支')
        this.log('\n建議：')
        this.log('  • 檢查專案是否有分支（gitlab.com/<project>/-/branches）')
        this.log('  • 確認是否所有分支都已合併')
        this.log('  • 驗證 Token 權限（需要 read_repository 權限）\n')
        return
      }

      // 步驟 5: 計算生命週期
      this.log(`正在計算 ${branchesToAnalyze.length} 個分支的生命週期...`)
      const lifecycles = this.calculateLifecyclesWrapper(branchesToAnalyze, flags.threshold)

      // 步驟 6: 計算統計資料
      const statistics = this.calculateStatisticsWrapper(lifecycles)

      // 步驟 7: 轉換為輸出格式
      const branchDetails = this.convertToBranchDetails(branchesToAnalyze, lifecycles)

      // 步驟 8: 計算執行時間
      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2)

      // 步驟 9: 處理 --show-stale 旗標（US2）
      if (flags['show-stale']) {
        await this.handleShowStale(
          lifecycles,
          localGitClient,
          gitlabClient,
          flags,
          executionTime,
          optimizationMode
        )
        return
      }

      // 步驟 9.5: 處理 --check-naming 旗標（US3）
      if (flags['check-naming']) {
        await this.handleCheckNaming(lifecycles, flags, executionTime)
        return
      }

      // 步驟 9.6: 處理 --compare-periods 旗標（US4）
      if (flags['compare-periods']) {
        await this.handleComparePeriods(
          branchesWithMRs,
          flags,
          executionTime
        )
        return
      }

      // 步驟 10: 輸出結果
      await this.outputResults(
        flags,
        branchDetails,
        statistics,
        executionTime,
        totalBranches,
        branchesToAnalyze.length,
        wasLimited,
        isDefaultLimit,
        optimizationMode
      )
    } catch (error) {
      // T057: 結構化錯誤訊息處理（FR-020）
      if (error instanceof AppError) {
        // 格式化錯誤訊息（支援 --verbose）
        const formattedError = ErrorFormatter.format(error, flags.verbose ?? false)
        this.error(formattedError, { exit: this.getExitCode(error.type) })
      } else if (error instanceof Error) {
        // 非預期錯誤
        this.error(`\nError: Unknown - ${error.message}`, { exit: 1 })
      } else {
        // 未知錯誤類型
        this.error(`\nError: Unknown - ${String(error)}`, { exit: 1 })
      }
    }
  }

  /**
   * 根據錯誤類型決定退出碼（FR-020）
   *
   * @param errorType - ErrorType
   * @returns 退出碼
   */
  private getExitCode(errorType: ErrorType): number {
    switch (errorType) {
      case ErrorType.AUTH_ERROR:
      case ErrorType.INVALID_INPUT:
        return 3 // 配置錯誤
      case ErrorType.PROJECT_NOT_FOUND:
      case ErrorType.NETWORK_ERROR:
      case ErrorType.RATE_LIMIT_ERROR:
      case ErrorType.API_ERROR:
        return 1 // 一般錯誤
      default:
        return 1
    }
  }

  /**
   * 處理 --show-stale 旗標（US2）
   *
   * T031: 過濾過時分支 → 批次計算 commits behind → 排序 Top 10 → 輸出
   */
  private async handleShowStale(
    lifecycles: any[],
    localGitClient: any | null,
    gitlabClient: any,
    flags: any,
    executionTime: string,
    optimizationMode: 'local-git' | 'api-batch' | 'api-serial'
  ): Promise<void> {
    const { analyzeStaleBranches, getTopStaleBranches } = await import(
      '../services/stale-analyzer.js'
    )

    // 步驟 1: 過濾過時分支
    const staleBranchLifecycles = lifecycles.filter(lc => lc.isStale)

    if (staleBranchLifecycles.length === 0) {
      this.log('沒有找到過時分支（超過 ' + flags.threshold + ' 天）')
      return
    }

    this.log(`正在分析 ${staleBranchLifecycles.length} 個過時分支...`)

    // Progress bar for stale branch analysis (FR-014)
    const skipProgress = flags.format === 'json'
    const staleProgressBar = createStaleBranchProgressBar(staleBranchLifecycles.length, skipProgress)

    if (!skipProgress) {
      staleProgressBar.start()
    }

    // 步驟 2: 批次計算 commits behind
    const staleBranches = await analyzeStaleBranches(
      staleBranchLifecycles,
      localGitClient,
      gitlabClient,
      {
        baseBranch: flags['base-branch'],
        batchSize: 10,
        onProgress: (completed: number, total: number) => {
          // Update progress bar
          staleProgressBar.update(completed)

          // Verbose logging (in addition to progress bar)
          if (flags.verbose) {
            this.log(`處理進度: ${completed}/${total} 過時分支`)
          }
        },
        onWarning: (message: string) => {
          this.warn(message)
        },
      }
    )

    // Stop progress bar
    staleProgressBar.stop()

    // 步驟 3: 排序 Top 10
    const top10 = getTopStaleBranches(staleBranches, 10)

    // 步驟 4: 輸出結果
    if (flags.format === 'json') {
      // JSON 輸出
      const { BranchHealthJsonFormatter } = await import(
        '../formatters/branch-health-json-formatter.js'
      )
      const formatter = new BranchHealthJsonFormatter()

      const output = {
        metadata: {
          command: 'branch-health',
          project: flags.project,
          timestamp: new Date().toISOString(),
          executionTime: `${executionTime}s`,
          optimization: optimizationMode,
        },
        statistics: {
          totalStaleBranches: staleBranchLifecycles.length,
          analyzedBranches: staleBranches.length,
          top10Count: top10.length,
        },
        branches: [], // Empty for stale branches view
        staleBranches: top10.map(sb => ({
          name: sb.branchName,
          lifecycleDays: sb.totalLifecycleDays,
          mrProcessingDays: sb.mrProcessingDays,
          commitsBehind: sb.commitsBehind,
          baseBranch: sb.baseBranch,
          fetchSource: sb.fetchSource,
          lastCommitDate: sb.lastUpdatedDate.toISOString(),
        })),
      }

      this.log(formatter.format(output as any))
    } else {
      // 表格輸出
      const Table = (await import('cli-table3')).default
      const chalk = (await import('chalk')).default

      const table = new Table({
        head: ['分支名稱', '生命週期', 'Commits Behind', 'MR 處理', '資料來源'],
        colWidths: [40, 12, 15, 12, 12],
      })

      top10.forEach(sb => {
        const lifecycleDays = sb.totalLifecycleDays
        const lifecycleStr = lifecycleDays >= 60
          ? chalk.red(`${lifecycleDays} 天`)
          : chalk.yellow(`${lifecycleDays} 天`)

        const commitsBehindStr = sb.commitsBehind !== null
          ? chalk.cyan(`${sb.commitsBehind}`)
          : chalk.gray('N/A')

        const mrStr = sb.mrProcessingDays !== null
          ? `${sb.mrProcessingDays} 天`
          : 'N/A'

        const sourceStr = sb.fetchSource === 'local-git'
          ? chalk.green('本地 Git')
          : chalk.blue('API')

        table.push([
          sb.branchName,
          lifecycleStr,
          commitsBehindStr,
          mrStr,
          sourceStr,
        ])
      })

      this.log('\n過時分支分析 (Top 10)\n')
      this.log(table.toString())

      this.log('\n統計摘要\n')
      this.log(`總過時分支數: ${staleBranchLifecycles.length}`)
      this.log(`已分析: ${staleBranches.length}`)
      this.log(`顯示: Top ${top10.length}`)
      this.log(`閾值: ${flags.threshold} 天`)
      this.log(`基準分支: ${flags['base-branch']}`)

      // 效能統計
      this.log('')
      this.log('─'.repeat(60))
      this.log(`⏱️  執行時間: ${executionTime} 秒`)
      this.log(`🚀 優化模式: ${optimizationMode}`)
    }
  }

  /**
   * 處理 --check-naming 旗標（US3）
   *
   * T043: 驗證正則表達式 → 過濾活躍分支 → 檢查命名 → 輸出符合/不符合清單
   */
  private async handleCheckNaming(
    lifecycles: any[],
    flags: any,
    executionTime: string
  ): Promise<void> {
    const {
      checkBranchNaming,
      calculateNamingStatistics,
      getMatchingBranches,
      getNonMatchingBranches,
    } = await import('../services/naming-checker.js')

    // 步驟 1: 檢查命名規範（自動過濾活躍分支）
    this.log(`正在檢查分支命名規範...`)

    const namingResults = checkBranchNaming(lifecycles, flags.pattern)

    if (namingResults.length === 0) {
      this.log('沒有找到活躍分支（≤ 90 天）')
      return
    }

    // 步驟 2: 計算統計
    const statistics = calculateNamingStatistics(lifecycles, namingResults)

    // 步驟 3: 分類結果
    const matching = getMatchingBranches(namingResults)
    const nonMatching = getNonMatchingBranches(namingResults)

    // 步驟 4: 輸出結果
    if (flags.format === 'json') {
      // JSON 輸出
      const output = {
        metadata: {
          command: 'branch-health',
          project: flags.project,
          timestamp: new Date().toISOString(),
          executionTime: `${executionTime}s`,
          pattern: flags.pattern,
        },
        statistics: {
          totalBranches: statistics.totalBranches,
          activeBranches: statistics.activeBranches,
          inactiveBranches: statistics.inactiveBranches,
          matchingBranches: statistics.matchingBranches,
          nonMatchingBranches: statistics.nonMatchingBranches,
          matchRate: Math.round(statistics.matchRate * 10) / 10, // 1 decimal
        },
        matching: matching.map(m => ({
          branchName: m.branchName,
          lastUpdatedDate: m.lastUpdatedDate.toISOString(),
        })),
        nonMatching: nonMatching.map(m => ({
          branchName: m.branchName,
          lastUpdatedDate: m.lastUpdatedDate.toISOString(),
        })),
      }

      this.log(JSON.stringify(output, null, 2))
    } else {
      // 表格輸出
      const Table = (await import('cli-table3')).default
      const chalk = (await import('chalk')).default

      this.log('\n命名規範檢查結果\n')
      this.log(`Pattern: ${chalk.cyan(flags.pattern)}`)
      this.log('')

      // 統計摘要
      const matchRateStr = statistics.matchRate >= 80
        ? chalk.green(`${statistics.matchRate.toFixed(1)}%`)
        : statistics.matchRate >= 50
        ? chalk.yellow(`${statistics.matchRate.toFixed(1)}%`)
        : chalk.red(`${statistics.matchRate.toFixed(1)}%`)

      this.log('統計摘要\n')
      this.log(`總分支數: ${statistics.totalBranches}`)
      this.log(`活躍分支: ${statistics.activeBranches} (≤ 90 天)`)
      this.log(`非活躍分支: ${statistics.inactiveBranches} (已排除)`)
      this.log(`符合規範: ${chalk.green(statistics.matchingBranches.toString())}`)
      this.log(`不符合規範: ${chalk.red(statistics.nonMatchingBranches.toString())}`)
      this.log(`符合率: ${matchRateStr}`)
      this.log('')

      // 符合清單
      if (matching.length > 0) {
        this.log(chalk.green(`✓ 符合規範的分支 (${matching.length})\n`))
        const matchTable = new Table({
          head: ['分支名稱', '最後更新'],
          colWidths: [50, 20],
        })

        matching.forEach(m => {
          matchTable.push([
            chalk.green(m.branchName),
            m.lastUpdatedDate.toISOString().split('T')[0],
          ])
        })

        this.log(matchTable.toString())
        this.log('')
      }

      // 不符合清單
      if (nonMatching.length > 0) {
        this.log(chalk.red(`✗ 不符合規範的分支 (${nonMatching.length})\n`))
        const nonMatchTable = new Table({
          head: ['分支名稱', '最後更新'],
          colWidths: [50, 20],
        })

        nonMatching.forEach(m => {
          nonMatchTable.push([
            chalk.red(m.branchName),
            m.lastUpdatedDate.toISOString().split('T')[0],
          ])
        })

        this.log(nonMatchTable.toString())
        this.log('')
      }

      // 建議
      if (statistics.matchRate < 80) {
        this.log(chalk.yellow('💡 建議：'))
        this.log(chalk.yellow(`   符合率 ${statistics.matchRate.toFixed(1)}% 低於建議標準（80%）`))
        this.log(chalk.yellow('   考慮重新命名不符合規範的分支'))
        this.log('')
      }

      // 效能統計
      this.log('─'.repeat(60))
      this.log(`⏱️  執行時間: ${executionTime} 秒`)
    }
  }

  /**
   * 處理 --compare-periods 旗標（US4）
   *
   * T052: 解析兩個時間段 → 按時間過濾分支 → 計算各時間段 lifecycles → 比較 → 輸出
   */
  private async handleComparePeriods(
    branchesWithMRs: any[],
    flags: any,
    executionTime: string
  ): Promise<void> {
    const { parseComparePeriods } = await import('../utils/date-utils.js')
    const { calculateLifecycles } = await import('../services/lifecycle-calculator.js')
    const { comparePeriods } = await import('../services/period-comparator.js')

    // 步驟 1: 解析時間段
    this.log(`正在解析時間段...`)

    const periods = parseComparePeriods(flags['compare-periods'])
    const period1Label = flags['compare-periods'].split(',')[0].trim()
    const period2Label = flags['compare-periods'].split(',')[1].trim()

    if (flags.verbose) {
      this.log(`Period 1: ${period1Label} (${periods.previousPeriod.startDate.toISOString().split('T')[0]} - ${periods.previousPeriod.endDate.toISOString().split('T')[0]})`)
      this.log(`Period 2: ${period2Label} (${periods.currentPeriod.startDate.toISOString().split('T')[0]} - ${periods.currentPeriod.endDate.toISOString().split('T')[0]})`)
    }

    // 步驟 2: 按時間段過濾分支（基於 lastUpdatedDate）
    const period1Branches = branchesWithMRs.filter(b => {
      const lastUpdated = new Date(b.branch.commit.committed_date)
      return lastUpdated >= periods.previousPeriod.startDate &&
             lastUpdated <= periods.previousPeriod.endDate
    })

    const period2Branches = branchesWithMRs.filter(b => {
      const lastUpdated = new Date(b.branch.commit.committed_date)
      return lastUpdated >= periods.currentPeriod.startDate &&
             lastUpdated <= periods.currentPeriod.endDate
    })

    this.log(`Period 1 分支數: ${period1Branches.length}`)
    this.log(`Period 2 分支數: ${period2Branches.length}`)
    this.log('')

    // 步驟 3: 計算各時間段的 lifecycles
    const threshold = flags.threshold ?? 30
    const period1Lifecycles = calculateLifecycles(period1Branches, threshold)
    const period2Lifecycles = calculateLifecycles(period2Branches, threshold)

    // 步驟 4: 比較兩個時間段
    const comparison = comparePeriods(
      period1Lifecycles,
      period2Lifecycles,
      period1Label,
      period2Label,
      periods.previousPeriod.startDate,
      periods.previousPeriod.endDate,
      periods.currentPeriod.startDate,
      periods.currentPeriod.endDate
    )

    // 步驟 5: 輸出結果
    if (flags.format === 'json') {
      // JSON 輸出
      const output = {
        metadata: {
          command: 'branch-health',
          project: flags.project,
          timestamp: new Date().toISOString(),
          executionTime: `${executionTime}s`,
          comparePeriods: flags['compare-periods'],
        },
        period1: {
          label: comparison.period1.label,
          startDate: comparison.period1.startDate.toISOString(),
          endDate: comparison.period1.endDate.toISOString(),
          totalBranches: comparison.period1.totalBranches,
          avgLifecycleDays: Math.round(comparison.period1.avgLifecycleDays * 10) / 10,
          medianLifecycleDays: comparison.period1.medianLifecycleDays,
          maxLifecycleDays: comparison.period1.maxLifecycleDays,
          avgMrProcessingDays: Math.round(comparison.period1.avgMrProcessingDays * 10) / 10,
        },
        period2: {
          label: comparison.period2.label,
          startDate: comparison.period2.startDate.toISOString(),
          endDate: comparison.period2.endDate.toISOString(),
          totalBranches: comparison.period2.totalBranches,
          avgLifecycleDays: Math.round(comparison.period2.avgLifecycleDays * 10) / 10,
          medianLifecycleDays: comparison.period2.medianLifecycleDays,
          maxLifecycleDays: comparison.period2.maxLifecycleDays,
          avgMrProcessingDays: Math.round(comparison.period2.avgMrProcessingDays * 10) / 10,
        },
        changes: {
          avgLifecycleDaysChange: Math.round(comparison.changes.avgLifecycleDaysChange * 10) / 10,
          avgLifecycleTrend: comparison.changes.avgLifecycleTrend,
          medianLifecycleDaysChange: comparison.changes.medianLifecycleDaysChange,
          totalBranchesChange: comparison.changes.totalBranchesChange,
        },
      }

      this.log(JSON.stringify(output, null, 2))
    } else {
      // 表格輸出
      const Table = (await import('cli-table3')).default
      const chalk = (await import('chalk')).default

      this.log('\n時間段比較分析\n')

      // 比較表格
      const compareTable = new Table({
        head: ['指標', period1Label, period2Label, '變化', '趨勢'],
        colWidths: [25, 15, 15, 15, 15],
      })

      // 總分支數
      const branchChange = comparison.changes.totalBranchesChange
      compareTable.push([
        '總分支數',
        comparison.period1.totalBranches.toString(),
        comparison.period2.totalBranches.toString(),
        branchChange > 0 ? chalk.red(`+${branchChange}`) : branchChange < 0 ? chalk.green(`${branchChange}`) : '0',
        branchChange > 0 ? '↑' : branchChange < 0 ? '↓' : '─',
      ])

      // 平均生命週期
      const avgChange = comparison.changes.avgLifecycleDaysChange
      compareTable.push([
        '平均生命週期 (天)',
        comparison.period1.avgLifecycleDays.toFixed(1),
        comparison.period2.avgLifecycleDays.toFixed(1),
        avgChange > 0 ? chalk.red(`+${avgChange.toFixed(1)}`) : avgChange < 0 ? chalk.green(`${avgChange.toFixed(1)}`) : '0.0',
        comparison.changes.avgLifecycleTrend === 'worsening' ? chalk.red('↑ 惡化') :
        comparison.changes.avgLifecycleTrend === 'improving' ? chalk.green('↓ 改善') :
        chalk.gray('─ 穩定'),
      ])

      // 中位數生命週期
      const medianChange = comparison.changes.medianLifecycleDaysChange
      compareTable.push([
        '中位數生命週期 (天)',
        comparison.period1.medianLifecycleDays.toString(),
        comparison.period2.medianLifecycleDays.toString(),
        medianChange > 0 ? chalk.red(`+${medianChange}`) : medianChange < 0 ? chalk.green(`${medianChange}`) : '0',
        medianChange > 0 ? '↑' : medianChange < 0 ? '↓' : '─',
      ])

      // 最大生命週期
      compareTable.push([
        '最大生命週期 (天)',
        comparison.period1.maxLifecycleDays.toString(),
        comparison.period2.maxLifecycleDays.toString(),
        '─',
        '─',
      ])

      // 平均 MR 處理時間
      compareTable.push([
        'MR 平均處理時間 (天)',
        comparison.period1.avgMrProcessingDays.toFixed(1),
        comparison.period2.avgMrProcessingDays.toFixed(1),
        '─',
        '─',
      ])

      this.log(compareTable.toString())
      this.log('')

      // 趨勢摘要
      if (comparison.changes.avgLifecycleTrend === 'improving') {
        this.log(chalk.green('✓ 分支健康度趨勢：改善'))
        this.log(chalk.green(`  平均生命週期減少 ${Math.abs(avgChange).toFixed(1)} 天`))
      } else if (comparison.changes.avgLifecycleTrend === 'worsening') {
        this.log(chalk.red('✗ 分支健康度趨勢：惡化'))
        this.log(chalk.red(`  平均生命週期增加 ${avgChange.toFixed(1)} 天`))
      } else {
        this.log(chalk.gray('─ 分支健康度趨勢：穩定'))
        this.log(chalk.gray('  變化幅度在 ±2 天以內'))
      }
      this.log('')

      // 效能統計
      this.log('─'.repeat(60))
      this.log(`⏱️  執行時間: ${executionTime} 秒`)
    }
  }
}
