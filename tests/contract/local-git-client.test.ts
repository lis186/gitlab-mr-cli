/**
 * Local Git Client Contract Tests
 *
 * T012: Verify LocalGitClient interface method behaviors
 * Uses vi.spyOn() to mock child_process.execSync
 *
 * @module tests/contract/local-git-client.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync } from 'child_process'
import { existsSync, statSync } from 'fs'
import {
  LocalGitClient,
  GitError,
  GitTimeoutError,
  BranchNotFoundError,
  InvalidRepoError,
} from '../../src/services/local-git-client'
import type { LocalGitClientConfig } from '../../src/types/branch-health'

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}))

describe('LocalGitClient Contract Tests (T012)', () => {
  let config: LocalGitClientConfig
  let mockExecSync: any
  let mockExistsSync: any
  let mockStatSync: any

  beforeEach(() => {
    vi.clearAllMocks()

    config = {
      repoPath: '/Users/test/project',
      expectedProjectId: 'example/mobile-app',
      baseBranch: 'main',
      gitTimeout: 5000,
    }

    mockExecSync = vi.mocked(execSync)
    mockExistsSync = vi.mocked(existsSync)
    mockStatSync = vi.mocked(statSync)

    // Default mock: valid repository
    mockExistsSync.mockReturnValue(true)
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git config --get remote.origin.url')) {
        return 'https://gitlab.com/example/mobile-app.git\n'
      }
      if (cmd.includes('git rev-list --count')) {
        return '42\n'
      }
      return ''
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validateRepo()', () => {
    it('should validate a valid repository', async () => {
      const client = new LocalGitClient(config)
      const result = await client.validateRepo()

      expect(result).toBeDefined()
      expect(result.isValid).toBe(true)
      expect(result.remoteOriginUrl).toContain('example/mobile-app')
      expect(result.error).toBeNull()
    })

    it('should reject paths with traversal', async () => {
      const invalidConfig = {
        ...config,
        repoPath: '/Users/test/../../../etc/passwd',
      }

      const client = new LocalGitClient(invalidConfig)
      const result = await client.validateRepo()

      expect(result.isValid).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('should check .git directory exists', async () => {
      mockExistsSync.mockReturnValue(false)

      const client = new LocalGitClient(config)
      const result = await client.validateRepo()

      expect(result.isValid).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('getCommitsBehind()', () => {
    it('should return commits behind count', async () => {
      mockExecSync.mockReturnValue('42\n')

      const client = new LocalGitClient(config)
      await client.validateRepo()

      const count = await client.getCommitsBehind('feature/test')

      expect(count).toBe(42)
    })

    it('should handle branch not found error', async () => {
      mockExecSync.mockImplementation(() => {
        const error: any = new Error('fatal: bad revision')
        error.stderr = 'fatal: bad revision'
        throw error
      })

      const client = new LocalGitClient(config)
      await client.validateRepo()

      await expect(
        client.getCommitsBehind('nonexistent-branch')
      ).rejects.toThrow(BranchNotFoundError)
    })
  })

  describe('getBatchCommitsBehind()', () => {
    it('should batch process multiple branches', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('feature/a')) return '10\n'
        if (cmd.includes('feature/b')) return '20\n'
        return '0\n'
      })

      const client = new LocalGitClient(config)
      await client.validateRepo()

      const branches = ['feature/a', 'feature/b']
      const results = await client.getBatchCommitsBehind(branches)

      expect(results).toBeInstanceOf(Map)
      expect(results.size).toBe(branches.length)
      expect(results.get('feature/a')).toBe(10)
      expect(results.get('feature/b')).toBe(20)
    })
  })
})
