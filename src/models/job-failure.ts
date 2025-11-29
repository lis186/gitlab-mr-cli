/**
 * Job 失敗分析模型
 * Feature: 008-cicd-health
 *
 * 用途：分析 Job 失敗資料
 * - 失敗分類統計
 * - Top failing jobs 識別
 * - 建議產生
 */

import type {
  Job,
  FailureCategory,
  FailureType,
  JobFailureSummary,
} from '../types/ci-health.js';

/**
 * Job 失敗分析器
 */
export class JobFailureAnalyzer {
  /**
   * 分析 Job 失敗資料
   *
   * 注意：此方法需要與 FailureClassifier 和 JobRecommendationEngine 配合使用
   * 當前實作提供基本結構，完整功能將在整合階段實現
   *
   * @param jobs - Job 清單
   * @param classifyFailure - 失敗分類函數（由 FailureClassifier 提供）
   * @returns 失敗分析結果（失敗分類 + top failing jobs）
   */
  static analyzeFailures(
    jobs: Job[],
    classifyFailure: (job: Job) => FailureType
  ): {
    categories: FailureCategory[];
    topJobs: JobFailureSummary[];
  } {
    // 1. 篩選失敗的 job
    const failedJobs = jobs.filter(j => j.status === 'failed');

    if (failedJobs.length === 0) {
      return {
        categories: [],
        topJobs: [],
      };
    }

    // 2. 分類失敗 job 並統計
    const categoryMap = new Map<FailureType, { count: number; examples: Set<string> }>();

    for (const job of failedJobs) {
      const type = classifyFailure(job);

      if (!categoryMap.has(type)) {
        categoryMap.set(type, { count: 0, examples: new Set() });
      }

      const category = categoryMap.get(type)!;
      category.count++;
      if (category.examples.size < 3) {
        category.examples.add(job.name);
      }
    }

    // 3. 計算各類別百分比並轉換為 FailureCategory 陣列
    const totalFailures = failedJobs.length;
    const categories: FailureCategory[] = Array.from(categoryMap.entries())
      .map(([type, data]) => ({
        type,
        count: data.count,
        percentage: Math.round((data.count / totalFailures) * 1000) / 10, // 四捨五入到小數點後一位
        examples: Array.from(data.examples),
      }))
      .sort((a, b) => b.count - a.count); // 按失敗次數降序排列

    // 4. 識別 top 5 failing jobs
    const topJobs = this.identifyTopFailingJobs(jobs, classifyFailure);

    return {
      categories,
      topJobs,
    };
  }

  /**
   * 識別最常失敗的 job（前 5 個）
   *
   * @param jobs - 所有 job 清單
   * @param classifyFailure - 失敗分類函數
   * @returns Top failing jobs 列表
   */
  private static identifyTopFailingJobs(
    jobs: Job[],
    classifyFailure: (job: Job) => FailureType
  ): JobFailureSummary[] {
    // 統計每個 job 名稱的失敗資訊
    const jobFailureMap = new Map<string, {
      failureCount: number;
      totalCount: number;
      failureType: FailureType;
      lastFailureDate: Date;
      pipelineIds: number[];
    }>();

    for (const job of jobs) {
      if (!jobFailureMap.has(job.name)) {
        jobFailureMap.set(job.name, {
          failureCount: 0,
          totalCount: 0,
          failureType: 'Other',
          lastFailureDate: new Date(0),
          pipelineIds: [],
        });
      }

      const jobData = jobFailureMap.get(job.name)!;
      jobData.totalCount++;

      if (job.status === 'failed') {
        jobData.failureCount++;
        jobData.failureType = classifyFailure(job);

        // 更新最後失敗日期
        const jobDate = job.finishedAt || job.createdAt;
        if (jobDate > jobData.lastFailureDate) {
          jobData.lastFailureDate = jobDate;
        }

        // 記錄 pipeline ID（最多 5 個）
        if (jobData.pipelineIds.length < 5 && !jobData.pipelineIds.includes(job.pipelineId)) {
          jobData.pipelineIds.push(job.pipelineId);
        }
      }
    }

    // 轉換為 JobFailureSummary 並排序
    const jobFailures: JobFailureSummary[] = Array.from(jobFailureMap.entries())
      .filter(([_, data]) => data.failureCount > 0) // 只包含有失敗的 job
      .map(([jobName, data]) => ({
        jobName,
        failureCount: data.failureCount,
        failureRate: Math.round((data.failureCount / data.totalCount) * 1000) / 10,
        failureType: data.failureType,
        recommendation: this.generateRecommendation(data.failureType, data.failureCount),
        lastFailureDate: data.lastFailureDate,
        pipelineIds: data.pipelineIds,
      }))
      .sort((a, b) => b.failureCount - a.failureCount) // 按失敗次數降序排列
      .slice(0, 5); // 取前 5 個

    return jobFailures;
  }

  /**
   * 產生可操作的建議
   *
   * 根據失敗類型和失敗次數產生情境化建議
   *
   * @param failureType - 失敗類型
   * @param failureCount - 失敗次數
   * @returns 建議字串
   */
  static generateRecommendation(
    failureType: FailureType,
    failureCount: number
  ): string {
    switch (failureType) {
      case 'Test':
        if (failureCount > 5) {
          return '建議檢查測試穩定性，考慮隔離或修正不穩定測試';
        }
        return '建議檢視測試日誌，確認測試失敗原因';

      case 'Build':
        if (failureCount > 3) {
          return '建議檢查建置配置，確認依賴版本是否鎖定';
        }
        return '建議檢視建置日誌，確認編譯或打包問題';

      case 'Linting':
        if (failureCount > 3) {
          return '建議統一程式碼風格規範，考慮加入 pre-commit hook';
        }
        return '建議檢視 linting 規則，確保團隊遵循一致的編碼標準';

      case 'Deploy':
        if (failureCount > 2) {
          return '建議檢視部署腳本與環境配置';
        }
        return '建議檢查部署日誌，確認環境或權限問題';

      case 'Other':
      default:
        return '建議檢視 job 日誌以識別根本原因';
    }
  }
}
