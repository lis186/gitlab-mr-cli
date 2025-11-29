/**
 * FailureClassifier 單元測試
 * Feature: 008-cicd-health
 * Task: T020
 *
 * 目的：測試失敗分類規則（Test/Build/Linting/Deploy/Other）
 */

import { describe, it, expect } from 'vitest';
import { FailureClassifier } from '../../src/services/failure-classifier.js';
import type { Job } from '../../src/types/ci-health.js';

// 測試用的 Job 建構函數
function createJob(name: string, stage: string): Job {
  return {
    id: 1,
    name,
    stage,
    status: 'failed',
    createdAt: new Date(),
    startedAt: new Date(),
    finishedAt: new Date(),
    duration: 100,
    failureReason: 'script_failure',
    webUrl: 'https://gitlab.com/test',
    pipelineId: 1,
  };
}

describe('FailureClassifier', () => {
  describe('測試失敗 (Test) 分類', () => {
    it('應該根據 stage 名稱識別測試失敗', () => {
      expect(FailureClassifier.classify(createJob('任意名稱', 'test'))).toBe('Test');
      expect(FailureClassifier.classify(createJob('任意名稱', 'testing'))).toBe('Test');
    });

    it('應該根據 job 名稱關鍵字識別測試失敗', () => {
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

      testKeywords.forEach((keyword) => {
        expect(
          FailureClassifier.classify(createJob(`run-${keyword}`, 'build'))
        ).toBe('Test');
        expect(
          FailureClassifier.classify(createJob(`${keyword}-runner`, 'build'))
        ).toBe('Test');
      });
    });

    it('應該對大小寫不敏感', () => {
      expect(FailureClassifier.classify(createJob('RUN-TEST', 'BUILD'))).toBe('Test');
      expect(FailureClassifier.classify(createJob('任意', 'TEST'))).toBe('Test');
    });
  });

  describe('Linting 錯誤分類', () => {
    it('應該根據 stage 名稱識別 Linting 錯誤', () => {
      expect(FailureClassifier.classify(createJob('任意名稱', 'lint'))).toBe('Linting');
      expect(FailureClassifier.classify(createJob('任意名稱', 'linting'))).toBe('Linting');
      expect(FailureClassifier.classify(createJob('任意名稱', 'quality'))).toBe('Linting');
      expect(FailureClassifier.classify(createJob('任意名稱', 'check'))).toBe('Linting');
    });

    it('應該根據 job 名稱關鍵字識別 Linting 錯誤', () => {
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

      lintKeywords.forEach((keyword) => {
        expect(
          FailureClassifier.classify(createJob(`run-${keyword}`, 'build'))
        ).toBe('Linting');
      });
    });
  });

  describe('建置失敗 (Build) 分類', () => {
    it('應該根據 stage 名稱識別建置失敗', () => {
      expect(FailureClassifier.classify(createJob('任意名稱', 'build'))).toBe('Build');
      expect(FailureClassifier.classify(createJob('任意名稱', 'compile'))).toBe('Build');
      expect(FailureClassifier.classify(createJob('任意名稱', 'package'))).toBe('Build');
      expect(FailureClassifier.classify(createJob('任意名稱', 'assemble'))).toBe('Build');
    });

    it('應該根據 job 名稱關鍵字識別建置失敗', () => {
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

      buildKeywords.forEach((keyword) => {
        // 使用 'other' stage 避免 stage 優先級干擾
        expect(
          FailureClassifier.classify(createJob(`run-${keyword}`, 'other'))
        ).toBe('Build');
      });
    });
  });

  describe('部署失敗 (Deploy) 分類', () => {
    it('應該根據 stage 名稱識別部署失敗', () => {
      expect(FailureClassifier.classify(createJob('任意名稱', 'deploy'))).toBe('Deploy');
      expect(FailureClassifier.classify(createJob('任意名稱', 'deployment'))).toBe('Deploy');
      expect(FailureClassifier.classify(createJob('任意名稱', 'release'))).toBe('Deploy');
      expect(FailureClassifier.classify(createJob('任意名稱', 'publish'))).toBe('Deploy');
    });

    it('應該根據 job 名稱關鍵字識別部署失敗', () => {
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

      deployKeywords.forEach((keyword) => {
        // 使用 'other' stage 避免 stage 優先級干擾
        expect(
          FailureClassifier.classify(createJob(`run-${keyword}`, 'other'))
        ).toBe('Deploy');
      });
    });
  });

  describe('其他失敗 (Other) 分類', () => {
    it('應該將無法識別的 job 分類為 Other', () => {
      expect(
        FailureClassifier.classify(createJob('custom-job', 'custom-stage'))
      ).toBe('Other');
      expect(
        FailureClassifier.classify(createJob('unknown', 'unknown'))
      ).toBe('Other');
    });

    it('應該將空名稱或空 stage 分類為 Other', () => {
      expect(
        FailureClassifier.classify(createJob('', ''))
      ).toBe('Other');
    });
  });

  describe('優先級測試', () => {
    it('測試失敗應該優先於建置失敗', () => {
      // job 名稱同時包含 test 和 build 關鍵字
      expect(
        FailureClassifier.classify(createJob('build-and-test', 'verify'))
      ).toBe('Test');
    });

    it('Linting 應該優先於建置失敗', () => {
      // job 名稱同時包含 lint 和 build 關鍵字
      expect(
        FailureClassifier.classify(createJob('build-lint-check', 'verify'))
      ).toBe('Linting');
    });

    it('測試失敗應該優先於 Linting', () => {
      // job 名稱同時包含 test 和 lint 關鍵字
      expect(
        FailureClassifier.classify(createJob('lint-and-test', 'verify'))
      ).toBe('Test');
    });

    it('關鍵字匹配優先級：Test > Linting > Build > Deploy', () => {
      // Test 優先級最高
      expect(
        FailureClassifier.classify(createJob('build-and-test', 'deploy'))
      ).toBe('Test');

      // Linting 優先於 Build
      expect(
        FailureClassifier.classify(createJob('lint-before-build', 'deploy'))
      ).toBe('Linting');

      // Build 優先於 Deploy（即使 stage 是 deploy）
      expect(
        FailureClassifier.classify(createJob('build-container', 'deploy'))
      ).toBe('Build');

      // 沒有更高優先級的關鍵字時，stage 優先
      expect(
        FailureClassifier.classify(createJob('custom-job', 'deploy'))
      ).toBe('Deploy');
    });
  });

  describe('真實世界範例', () => {
    it('應該正確分類常見的 CI/CD job 名稱', () => {
      // 測試相關
      expect(FailureClassifier.classify(createJob('rspec', 'test'))).toBe('Test');
      expect(FailureClassifier.classify(createJob('karma', 'test'))).toBe('Test');
      expect(FailureClassifier.classify(createJob('pytest-unit', 'test'))).toBe('Test');

      // Linting 相關
      expect(FailureClassifier.classify(createJob('rubocop', 'lint'))).toBe('Linting');
      expect(FailureClassifier.classify(createJob('eslint-check', 'quality'))).toBe('Linting');

      // 建置相關
      expect(FailureClassifier.classify(createJob('webpack-build', 'build'))).toBe('Build');
      expect(FailureClassifier.classify(createJob('docker-image', 'build'))).toBe('Build');
      expect(FailureClassifier.classify(createJob('maven-package', 'package'))).toBe('Build');

      // 部署相關
      expect(FailureClassifier.classify(createJob('deploy-to-staging', 'deploy'))).toBe('Deploy');
      expect(FailureClassifier.classify(createJob('k8s-deploy', 'deploy'))).toBe('Deploy');
      // release stage + publish 關鍵字（但 package 會優先匹配 Build）
      expect(FailureClassifier.classify(createJob('publish-artifact', 'release'))).toBe('Deploy');
    });

    it('應該處理複合 job 名稱', () => {
      expect(
        FailureClassifier.classify(createJob('frontend:build:webpack', 'build'))
      ).toBe('Build');
      expect(
        FailureClassifier.classify(createJob('backend:test:integration', 'test'))
      ).toBe('Test');
      expect(
        FailureClassifier.classify(createJob('lint:typescript:strict', 'quality'))
      ).toBe('Linting');
    });
  });

  describe('邊界情況', () => {
    it('應該處理包含空白的名稱', () => {
      expect(
        FailureClassifier.classify(createJob('run unit tests', 'test'))
      ).toBe('Test');
      expect(
        FailureClassifier.classify(createJob('build docker image', 'build'))
      ).toBe('Build');
    });

    it('應該處理特殊字元', () => {
      expect(
        FailureClassifier.classify(createJob('test:unit-e2e', 'test'))
      ).toBe('Test');
      expect(
        FailureClassifier.classify(createJob('build_webpack_prod', 'build'))
      ).toBe('Build');
    });

    it('應該處理數字', () => {
      expect(
        FailureClassifier.classify(createJob('test-job-123', 'test'))
      ).toBe('Test');
      expect(
        FailureClassifier.classify(createJob('deploy-v2.5.1', 'deploy'))
      ).toBe('Deploy');
    });
  });
});
