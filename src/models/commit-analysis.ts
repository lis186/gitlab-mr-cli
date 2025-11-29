/**
 * CommitAnalysis 模型
 * 功能：004-commit-size-analysis
 *
 * 代表單一 commit 的分析結果
 */

import type {
  CommitAnalysis,
  SizeCategory,
  SeverityLevel,
} from '../types/commit-analysis.js';

/**
 * CommitAnalysis 建構器參數
 */
export interface CommitAnalysisParams {
  sha: string;
  author: string;
  authorEmail: string;
  timestamp: Date;
  message: string;
  filesChanged: number;
  loc: number;
  additions: number;
  deletions: number;
  sizeCategory: SizeCategory;
  severityLevel: SeverityLevel;
  refactorSuggestion: string | null;
  isMergeCommit: boolean;
  branch: string | null;
}

/**
 * 建立 CommitAnalysis 實例
 *
 * @param params - 建構參數
 * @returns CommitAnalysis 物件
 */
export function createCommitAnalysis(params: CommitAnalysisParams): CommitAnalysis {
  return {
    sha: params.sha,
    author: params.author,
    authorEmail: params.authorEmail,
    timestamp: params.timestamp,
    message: params.message,
    filesChanged: params.filesChanged,
    loc: params.loc,
    additions: params.additions,
    deletions: params.deletions,
    sizeCategory: params.sizeCategory,
    severityLevel: params.severityLevel,
    refactorSuggestion: params.refactorSuggestion,
    isMergeCommit: params.isMergeCommit,
    branch: params.branch,
  };
}

/**
 * 驗證 CommitAnalysis 物件的完整性
 *
 * @param commit - CommitAnalysis 物件
 * @returns 驗證錯誤訊息陣列（空陣列表示驗證通過）
 */
export function validateCommitAnalysis(commit: CommitAnalysis): string[] {
  const errors: string[] = [];

  if (!commit.sha || commit.sha.length !== 40) {
    errors.push('SHA 必須為 40 字元');
  }

  if (!commit.author || commit.author.trim() === '') {
    errors.push('作者名稱不能為空');
  }

  if (!commit.authorEmail || !commit.authorEmail.includes('@')) {
    errors.push('作者電子郵件格式無效');
  }

  if (commit.filesChanged < 0) {
    errors.push('變更檔案數不能為負數');
  }

  if (commit.loc < 0) {
    errors.push('LOC 不能為負數');
  }

  if (commit.additions < 0 || commit.deletions < 0) {
    errors.push('新增或刪除行數不能為負數');
  }

  if (commit.loc !== commit.additions + commit.deletions) {
    errors.push('LOC 必須等於 additions + deletions');
  }

  return errors;
}
