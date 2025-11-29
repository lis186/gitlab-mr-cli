import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitLabClient } from '../../src/services/gitlab-client'
import type { ProjectConfig } from '../../src/models/project'

/**
 * Commit Analysis API 合約測試
 * Issue #2: 驗證 GitLab Commits API 的回應格式符合預期
 */

// Mock GitLab API Commits 回應
const mockCommits = [
  {
    id: 'abc123',
    short_id: 'abc123',
    title: 'feat: 新增功能',
    author_name: 'Developer',
    author_email: 'dev@example.com',
    authored_date: '2025-10-25T10:00:00Z',
    committer_name: 'Developer',
    committer_email: 'dev@example.com',
    committed_date: '2025-10-25T10:00:00Z',
    created_at: '2025-10-25T10:00:00Z',
    message: 'feat: 新增功能\n\n詳細說明',
    parent_ids: ['parent123'],
    web_url: 'https://gitlab.com/project/commit/abc123'
  }
]

const mockCommitDiff = [
  {
    old_path: 'src/test.ts',
    new_path: 'src/test.ts',
    a_mode: '100644',
    b_mode: '100644',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    diff: '@@ -1,5 +1,10 @@\n+line1\n+line2\n-oldline',
    binary: false,
    generated_file: false
  }
]

const mockProject = {
  id: 123,
  name: 'test-project',
  default_branch: 'main'
}

// Mock @gitbeaker/rest
vi.mock('@gitbeaker/rest', () => {
  return {
    Gitlab: vi.fn().mockImplementation(() => {
      return {
        Commits: {
          all: vi.fn().mockResolvedValue(mockCommits),
          showDiff: vi.fn().mockResolvedValue(mockCommitDiff)
        },
        Projects: {
          show: vi.fn().mockResolvedValue(mockProject)
        }
      }
    })
  }
})

describe('Commit Analysis API Contract Tests', () => {
  let client: GitLabClient
  const config: ProjectConfig = {
    identifier: 'test/project',
    token: 'test-token',
    host: 'https://gitlab.com'
  }

  beforeEach(() => {
    client = new GitLabClient(config)
  })

  describe('getCommits()', () => {
    it('should return commits with correct structure', async () => {
      const commits = await client.getCommits({
        refName: 'main',
        since: '2025-10-01',
        until: '2025-10-31',
        perPage: 100
      })

      expect(Array.isArray(commits)).toBe(true)
      expect(commits.length).toBeGreaterThan(0)

      const commit = commits[0]
      expect(commit).toHaveProperty('id')
      expect(commit).toHaveProperty('author_name')
      expect(commit).toHaveProperty('author_email')
      expect(commit).toHaveProperty('authored_date')
      expect(commit).toHaveProperty('message')
      expect(commit).toHaveProperty('parent_ids')
      expect(Array.isArray(commit.parent_ids)).toBe(true)
    })

    it('should handle empty commits array', async () => {
      vi.mocked(client['client'].Commits.all).mockResolvedValueOnce([])

      const commits = await client.getCommits()
      expect(Array.isArray(commits)).toBe(true)
      expect(commits.length).toBe(0)
    })
  })

  describe('getCommitDiff()', () => {
    it('should return diff with correct structure', async () => {
      const diffs = await client.getCommitDiff('abc123')

      expect(Array.isArray(diffs)).toBe(true)
      expect(diffs.length).toBeGreaterThan(0)

      const diff = diffs[0]
      expect(diff).toHaveProperty('old_path')
      expect(diff).toHaveProperty('new_path')
      expect(diff).toHaveProperty('diff')
      expect(diff).toHaveProperty('binary')
      expect(typeof diff.binary).toBe('boolean')
    })

    it('should handle binary files', async () => {
      const binaryDiff = [{
        ...mockCommitDiff[0],
        binary: true,
        diff: 'Binary files differ'
      }]

      vi.mocked(client['client'].Commits.showDiff).mockResolvedValueOnce(binaryDiff)

      const diffs = await client.getCommitDiff('abc123')
      expect(diffs[0].binary).toBe(true)
      expect(diffs[0].diff).toBe('Binary files differ')
    })
  })

  describe('getProject()', () => {
    it('should return project with default_branch', async () => {
      const project = await client.getProject()

      expect(project).toHaveProperty('id')
      expect(project).toHaveProperty('name')
      expect(project).toHaveProperty('default_branch')
      expect(typeof project.default_branch).toBe('string')
    })
  })
})
