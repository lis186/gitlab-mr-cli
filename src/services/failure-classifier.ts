/**
 * 失敗分類器服務
 * Feature: 008-cicd-health
 *
 * 用途：基於規則的 Job 失敗分類
 * - 透過 job name 和 stage 匹配規則
 * - 分類為：Test / Build / Linting / Deploy / Other
 */

import type { Job, FailureType } from '../types/ci-health.js';

/**
 * 失敗分類器
 *
 * 使用基於規則的匹配邏輯，根據 job 名稱和階段識別失敗類型
 * 預期準確率：≥ 90%
 */
export class FailureClassifier {
  /**
   * 分類失敗的 job
   *
   * @param job - Job 物件
   * @returns 失敗類型
   */
  static classify(job: Job): FailureType {
    const jobName = job.name.toLowerCase();
    const stage = job.stage.toLowerCase();

    // 測試失敗 (Test)
    if (this.isTestFailure(jobName, stage)) {
      return 'Test';
    }

    // Linting 錯誤
    if (this.isLintingFailure(jobName, stage)) {
      return 'Linting';
    }

    // 建置失敗 (Build)
    if (this.isBuildFailure(jobName, stage)) {
      return 'Build';
    }

    // 部署失敗 (Deploy)
    if (this.isDeployFailure(jobName, stage)) {
      return 'Deploy';
    }

    // 其他失敗 (Other)
    return 'Other';
  }

  /**
   * 判定是否為測試失敗
   */
  private static isTestFailure(jobName: string, stage: string): boolean {
    // Stage 匹配
    if (stage === 'test' || stage === 'testing') {
      return true;
    }

    // Job name 關鍵字匹配
    const testKeywords = [
      'test',
      'spec',
      'e2e',
      'integration',
      'unit',
      'acceptance',
      'functional',
      'regression',
      'smoke',
      'sanity',
      'coverage',
      'jest',
      'vitest',
      'mocha',
      'cypress',
      'playwright',
    ];

    return testKeywords.some(keyword => jobName.includes(keyword));
  }

  /**
   * 判定是否為 Linting 錯誤
   */
  private static isLintingFailure(jobName: string, stage: string): boolean {
    // Stage 匹配
    if (stage === 'lint' || stage === 'linting' || stage === 'quality' || stage === 'check') {
      return true;
    }

    // Job name 關鍵字匹配
    const lintKeywords = [
      'lint',
      'linter',
      'format',
      'formatter',
      'style',
      'eslint',
      'prettier',
      'tslint',
      'rubocop',
      'flake8',
      'pylint',
      'checkstyle',
      'pmd',
      'spotbugs',
      'golint',
      'rustfmt',
      'clippy',
    ];

    return lintKeywords.some(keyword => jobName.includes(keyword));
  }

  /**
   * 判定是否為建置失敗
   */
  private static isBuildFailure(jobName: string, stage: string): boolean {
    // Stage 匹配
    if (
      stage === 'build' ||
      stage === 'compile' ||
      stage === 'package' ||
      stage === 'assemble'
    ) {
      return true;
    }

    // Job name 關鍵字匹配
    const buildKeywords = [
      'build',
      'compile',
      'package',
      'bundle',
      'webpack',
      'rollup',
      'vite',
      'docker',
      'image',
      'container',
      'maven',
      'gradle',
      'npm',
      'yarn',
      'pnpm',
      'cargo',
      'go build',
      'make',
      'cmake',
    ];

    return buildKeywords.some(keyword => jobName.includes(keyword));
  }

  /**
   * 判定是否為部署失敗
   */
  private static isDeployFailure(jobName: string, stage: string): boolean {
    // Stage 匹配
    if (
      stage === 'deploy' ||
      stage === 'deployment' ||
      stage === 'release' ||
      stage === 'publish'
    ) {
      return true;
    }

    // Job name 關鍵字匹配
    const deployKeywords = [
      'deploy',
      'deployment',
      'release',
      'publish',
      'upload',
      'push',
      'deliver',
      'production',
      'staging',
      'kubernetes',
      'k8s',
      'helm',
      'terraform',
      'ansible',
      'chef',
      'puppet',
    ];

    return deployKeywords.some(keyword => jobName.includes(keyword));
  }
}
