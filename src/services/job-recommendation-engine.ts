/**
 * Job 建議引擎服務
 * Feature: 008-cicd-health
 *
 * 用途：為失敗的 job 產生可操作建議
 * - 基於失敗類型和失敗次數
 * - 提供情境化的修復建議
 */

import type { FailureType } from '../types/ci-health.js';

/**
 * Job 建議引擎
 *
 * 使用模式匹配產生針對性建議
 */
export class JobRecommendationEngine {
  /**
   * 產生建議
   *
   * @param failureType - 失敗類型
   * @param failureCount - 失敗次數
   * @param jobName - Job 名稱（可選，用於更精確的建議）
   * @returns 建議字串
   */
  static generate(
    failureType: FailureType,
    failureCount: number,
    jobName?: string
  ): string {
    switch (failureType) {
      case 'Test':
        return this.generateTestRecommendation(failureCount, jobName);

      case 'Build':
        return this.generateBuildRecommendation(failureCount, jobName);

      case 'Linting':
        return this.generateLintingRecommendation(failureCount, jobName);

      case 'Deploy':
        return this.generateDeployRecommendation(failureCount, jobName);

      case 'Other':
      default:
        return this.generateDefaultRecommendation(failureCount);
    }
  }

  /**
   * 產生測試失敗建議
   */
  private static generateTestRecommendation(failureCount: number, jobName?: string): string {
    if (failureCount > 10) {
      return '測試頻繁失敗，建議優先修復此測試或暫時停用，避免影響團隊效率';
    }

    if (failureCount > 5) {
      return '建議檢查測試穩定性，考慮隔離或修正不穩定測試';
    }

    // 根據 job name 提供更精確的建議
    if (jobName) {
      const lowerJobName = jobName.toLowerCase();

      if (lowerJobName.includes('e2e') || lowerJobName.includes('integration')) {
        return '整合測試失敗，建議檢查外部依賴（API、資料庫）和測試環境配置';
      }

      if (lowerJobName.includes('unit')) {
        return '單元測試失敗，建議檢視測試覆蓋率和 mock 資料正確性';
      }
    }

    return '建議檢視測試日誌，確認測試失敗原因';
  }

  /**
   * 產生建置失敗建議
   */
  private static generateBuildRecommendation(failureCount: number, jobName?: string): string {
    if (failureCount > 5) {
      return '建置頻繁失敗，建議檢查 CI 環境配置和依賴版本鎖定';
    }

    if (failureCount > 3) {
      return '建議檢查建置配置，確認依賴版本是否鎖定';
    }

    // 根據 job name 提供更精確的建議
    if (jobName) {
      const lowerJobName = jobName.toLowerCase();

      if (lowerJobName.includes('docker')) {
        return 'Docker 建置失敗，建議檢查 Dockerfile 和 base image 可用性';
      }

      if (lowerJobName.includes('webpack') || lowerJobName.includes('bundle')) {
        return '打包失敗，建議檢查 webpack 配置和 assets 路徑';
      }

      if (lowerJobName.includes('npm') || lowerJobName.includes('yarn')) {
        return '套件安裝失敗，建議檢查 package.json 和 lock 檔案';
      }
    }

    return '建議檢視建置日誌，確認編譯或打包問題';
  }

  /**
   * 產生 Linting 失敗建議
   */
  private static generateLintingRecommendation(failureCount: number, jobName?: string): string {
    if (failureCount > 5) {
      return 'Linting 頻繁失敗，建議統一程式碼風格規範並加入 pre-commit hook 強制執行';
    }

    if (failureCount > 3) {
      return '建議統一程式碼風格規範，考慮加入 pre-commit hook';
    }

    // 根據 job name 提供更精確的建議
    if (jobName) {
      const lowerJobName = jobName.toLowerCase();

      if (lowerJobName.includes('prettier') || lowerJobName.includes('format')) {
        return '格式檢查失敗，建議執行 prettier --write 統一格式化';
      }

      if (lowerJobName.includes('eslint') || lowerJobName.includes('tslint')) {
        return 'ESLint 檢查失敗，建議執行 eslint --fix 自動修正可修正的問題';
      }
    }

    return '建議檢視 linting 規則，確保團隊遵循一致的編碼標準';
  }

  /**
   * 產生部署失敗建議
   */
  private static generateDeployRecommendation(failureCount: number, jobName?: string): string {
    if (failureCount > 3) {
      return '部署頻繁失敗，建議檢視部署腳本、環境變數和權限配置';
    }

    if (failureCount > 2) {
      return '建議檢視部署腳本與環境配置';
    }

    // 根據 job name 提供更精確的建議
    if (jobName) {
      const lowerJobName = jobName.toLowerCase();

      if (lowerJobName.includes('kubernetes') || lowerJobName.includes('k8s')) {
        return 'Kubernetes 部署失敗，建議檢查 manifest 檔案和 cluster 權限';
      }

      if (lowerJobName.includes('terraform')) {
        return 'Terraform 部署失敗，建議檢查 state 檔案和雲端資源配額';
      }

      if (lowerJobName.includes('production') || lowerJobName.includes('prod')) {
        return '正式環境部署失敗，建議先在 staging 環境驗證，並檢查環境變數';
      }
    }

    return '建議檢查部署日誌，確認環境或權限問題';
  }

  /**
   * 產生預設建議（Other 類型）
   */
  private static generateDefaultRecommendation(failureCount: number): string {
    if (failureCount > 5) {
      return 'Job 頻繁失敗，建議檢視完整日誌並考慮尋求團隊協助識別根本原因';
    }

    return '建議檢視 job 日誌以識別根本原因';
  }
}
