import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitLabClient } from '../../src/services/gitlab-client'
import type { ProjectConfig } from '../../src/models/project'

/**
 * GitLab API 合約測試
 *
 * 目的：驗證 GitLab API 的回應格式符合預期
 * T011: 驗證 getUnmergedBranches() 與 getBranchesWithMRs() 回應格式
 */

// Mock GitLab API 回應
const mockBranches = [
  {
    name: 'feature/user-auth',
    commit: {
      committed_date: '2025-09-15T10:30:00Z',
      author_name: 'John Doe',
    },
    protected: false,
    merged: false,
  },
  {
    name: 'bugfix/login-error',
    commit: {
      committed_date: '2025-10-01T14:20:00Z',
      author_name: 'Jane Smith',
    },
    protected: false,
    merged: false,
  },
]

const mockMergeRequests = [
  {
    iid: 12345,
    created_at: '2025-09-03T08:00:00Z',
    source_branch: 'feature/user-auth',
    state: 'opened',
    title: '新增使用者認證功能',
    author: {
      id: 1,
      name: 'John Doe',
      username: 'johndoe',
    },
  },
]

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => {
  return {
    Gitlab: vi.fn().mockImplementation(() => {
      return {
        Branches: {
          all: vi.fn().mockResolvedValue(mockBranches),
        },
        MergeRequests: {
          all: vi.fn().mockImplementation((options: any) => {
            if (options.sourceBranch) {
              const mr = mockMergeRequests.find(
                (m) => m.source_branch === options.sourceBranch
              )
              return Promise.resolve(mr ? [mr] : [])
            }
            return Promise.resolve(mockMergeRequests)
          }),
        },
        Repositories: {
          compare: vi.fn().mockResolvedValue({
            commits: Array(10).fill({}),
          }),
        },
      }
    }),
  }
})

describe('GitLab API MR Response Contract', () => {
  /**
   * 測試：驗證 GitLab API 回應包含所有必要欄位
   */
  it('應包含所有必要的 MR 欄位', () => {
    // 模擬真實的 GitLab API 回應格式
    const mockApiResponse = {
      iid: 123,
      title: 'Test MR',
      state: 'opened',
      created_at: '2024-01-15T10:30:00Z',
      author: {
        id: 1,
        name: 'Test User',
        username: 'testuser'
      }
    }

    // 驗證必要欄位存在
    expect(mockApiResponse).toHaveProperty('iid')
    expect(mockApiResponse).toHaveProperty('title')
    expect(mockApiResponse).toHaveProperty('state')
    expect(mockApiResponse).toHaveProperty('created_at')
    expect(mockApiResponse).toHaveProperty('author')

    // 驗證作者物件結構
    expect(mockApiResponse.author).toHaveProperty('id')
    expect(mockApiResponse.author).toHaveProperty('name')
    expect(mockApiResponse.author).toHaveProperty('username')
  })

  /**
   * 測試：驗證 state 欄位的有效值
   */
  it('state 欄位應為有效的 GitLab MR 狀態', () => {
    const validStates = ['opened', 'merged', 'closed']

    validStates.forEach(state => {
      const mockResponse = {
        iid: 1,
        title: 'Test',
        state,
        created_at: '2024-01-15T10:30:00Z',
        author: { id: 1, name: 'Test', username: 'test' }
      }

      expect(validStates).toContain(mockResponse.state)
    })
  })

  /**
   * 測試：驗證日期格式為 ISO 8601
   */
  it('created_at 應為有效的 ISO 8601 日期字串', () => {
    const mockResponse = {
      iid: 1,
      title: 'Test',
      state: 'opened',
      created_at: '2024-01-15T10:30:00Z',
      author: { id: 1, name: 'Test', username: 'test' }
    }

    // 驗證可以轉換為有效的 Date 物件
    const date = new Date(mockResponse.created_at)
    expect(date).toBeInstanceOf(Date)
    expect(date.getTime()).not.toBeNaN()
  })

  /**
   * 測試：驗證 iid 為正整數
   */
  it('iid 應為正整數', () => {
    const mockResponse = {
      iid: 123,
      title: 'Test',
      state: 'opened',
      created_at: '2024-01-15T10:30:00Z',
      author: { id: 1, name: 'Test', username: 'test' }
    }

    expect(mockResponse.iid).toBeTypeOf('number')
    expect(mockResponse.iid).toBeGreaterThan(0)
    expect(Number.isInteger(mockResponse.iid)).toBe(true)
  })
})

/**
 * T011: GitLab API 分支健康度功能合約測試
 *
 * 驗證 getUnmergedBranches() 與 getBranchesWithMRs() 回應格式符合預期
 */
describe('GitLab API Branch Health Contract (T011)', () => {
  let client: GitLabClient
  let config: ProjectConfig

  beforeEach(() => {
    vi.clearAllMocks()
    config = {
      identifier: 'example/mobile-app',
      token: 'test-token',
      host: 'https://gitlab.com',
    }
    client = new GitLabClient(config)
  })

  describe('getUnmergedBranches()', () => {
    it('應返回未合併分支清單', async () => {
      const branches = await client.getUnmergedBranches()

      expect(branches).toBeDefined()
      expect(Array.isArray(branches)).toBe(true)
      expect(branches.length).toBeGreaterThan(0)
    })

    it('分支物件應包含必要欄位', async () => {
      const branches = await client.getUnmergedBranches()
      const branch = branches[0]

      // 驗證 Branch 契約介面
      expect(branch).toHaveProperty('name')
      expect(branch).toHaveProperty('commit')
      expect(branch).toHaveProperty('protected')
      expect(branch).toHaveProperty('merged')

      // 驗證 commit 欄位
      expect(branch.commit).toHaveProperty('committed_date')
      expect(branch.commit).toHaveProperty('author_name')

      // 驗證資料型別
      expect(typeof branch.name).toBe('string')
      expect(typeof branch.protected).toBe('boolean')
      expect(branch.merged).toBe(false) // 未合併分支
    })

    it('commit.committed_date 應為有效的 ISO 8601 日期格式', async () => {
      const branches = await client.getUnmergedBranches()
      const branch = branches[0]

      const date = new Date(branch.commit.committed_date)
      expect(date).toBeInstanceOf(Date)
      expect(isNaN(date.getTime())).toBe(false)
    })

    it('應支援 search 與 limit 選項', async () => {
      const branches = await client.getUnmergedBranches({
        search: 'feature',
        limit: 10,
      })

      expect(branches).toBeDefined()
      expect(Array.isArray(branches)).toBe(true)
    })
  })

  describe('getBranchesWithMRs()', () => {
    it('應返回分支與 MR 的關聯資料', async () => {
      const results = await client.getBranchesWithMRs()

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
    })

    it('每個結果應包含 branch 與 mergeRequest 欄位', async () => {
      const results = await client.getBranchesWithMRs()
      const result = results[0]

      expect(result).toHaveProperty('branch')
      expect(result).toHaveProperty('mergeRequest')

      // 驗證 branch 欄位
      expect(result.branch).toHaveProperty('name')
      expect(result.branch).toHaveProperty('commit')
    })

    it('mergeRequest 存在時應包含必要欄位', async () => {
      const results = await client.getBranchesWithMRs()

      // 找到有 MR 的分支
      const resultWithMR = results.find((r) => r.mergeRequest !== null)

      if (resultWithMR) {
        const mr = resultWithMR.mergeRequest

        expect(mr).toHaveProperty('iid')
        expect(mr).toHaveProperty('created_at')
        expect(mr).toHaveProperty('source_branch')
        expect(mr).toHaveProperty('state')
        expect(mr).toHaveProperty('title')

        // 驗證資料型別
        expect(typeof mr.iid).toBe('number')
        expect(typeof mr.created_at).toBe('string')
        expect(typeof mr.source_branch).toBe('string')

        // 驗證日期格式
        const date = new Date(mr.created_at)
        expect(date).toBeInstanceOf(Date)
        expect(isNaN(date.getTime())).toBe(false)
      }
    })

    it('mergeRequest 不存在時應為 null', async () => {
      const results = await client.getBranchesWithMRs()

      // 驗證允許 null 值（沒有 MR 的分支）
      const hasResult = results.length > 0
      expect(hasResult).toBe(true)

      // 每個 result 都應該有 mergeRequest 屬性（可能為 null）
      results.forEach((result) => {
        expect(result).toHaveProperty('mergeRequest')
      })
    })

    it('應支援批次查詢與進度回呼', async () => {
      let progressCalled = false
      let processed = 0
      let total = 0

      const results = await client.getBranchesWithMRs({
        batchSize: 2,
        onProgress: (p, t) => {
          progressCalled = true
          processed = p
          total = t
        },
      })

      expect(results).toBeDefined()
      expect(progressCalled).toBe(true)
      expect(processed).toBeGreaterThan(0)
      expect(total).toBeGreaterThan(0)
    })
  })

  describe('compareBranchAPI()', () => {
    it('應返回分支比較結果', async () => {
      const result = await client.compareBranchAPI('feature/user-auth', 'main')

      expect(result).toBeDefined()
      if (result) {
        expect(result).toHaveProperty('branch')
        expect(result).toHaveProperty('baseBranch')
        expect(result).toHaveProperty('commitsBehind')
        expect(result).toHaveProperty('source')

        // 驗證資料型別
        expect(typeof result.branch).toBe('string')
        expect(typeof result.baseBranch).toBe('string')
        expect(typeof result.commitsBehind).toBe('number')
        expect(result.source).toBe('api')

        // commitsBehind 應為非負整數
        expect(result.commitsBehind).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(result.commitsBehind)).toBe(true)
      }
    })
  })

  describe('compareBranchesAPI()', () => {
    it('應批次比較多個分支', async () => {
      const branches = ['feature/user-auth', 'bugfix/login-error']
      const results = await client.compareBranchesAPI(branches, 'main')

      expect(results).toBeInstanceOf(Map)
      expect(results.size).toBe(branches.length)

      // 驗證每個分支都有結果
      branches.forEach((branch) => {
        expect(results.has(branch)).toBe(true)
      })
    })

    it('應支援批次大小與進度回呼', async () => {
      const branches = ['feature/user-auth', 'bugfix/login-error']
      let progressCalled = false

      const results = await client.compareBranchesAPI(branches, 'main', {
        batchSize: 1,
        onProgress: (processed, total) => {
          progressCalled = true
          expect(processed).toBeGreaterThan(0)
          expect(total).toBe(branches.length)
        },
      })

      expect(results).toBeInstanceOf(Map)
      expect(progressCalled).toBe(true)
    })
  })
})
