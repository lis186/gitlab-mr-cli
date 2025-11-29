/**
 * CI/CD 健康度表格格式化器
 * Feature: 008-cicd-health
 *
 * 用途：將健康度分析結果格式化為易讀的表格輸出
 */

import chalk from 'chalk';
import type {
  HealthMetrics,
  FailureCategory,
  JobFailureSummary,
} from '../types/ci-health.js';

/**
 * 格式化健康度指標為表格輸出
 */
export function formatHealthMetrics(metrics: HealthMetrics): string {
  const lines: string[] = [];

  // 標題
  lines.push('');
  lines.push(chalk.bold('═'.repeat(65)));
  lines.push(chalk.bold(`CI/CD 健康度報告（最近 ${metrics.period.days} 天）`));
  lines.push(chalk.bold('═'.repeat(65)));
  lines.push('');

  // 成功率
  const successRateIcon = getHealthStatusIcon(metrics.successRateStatus);
  const successRateLabel = getHealthStatusLabel(metrics.successRateStatus);
  const successRateColor = getHealthStatusColor(metrics.successRateStatus);

  lines.push(
    chalk[successRateColor](
      `${successRateIcon} Pipeline 成功率：${metrics.successRate}% ` +
      `(${metrics.successfulPipelines}/${metrics.completedPipelines}) ` +
      `${successRateLabel}`
    )
  );

  // 執行時間
  const executionTimeIcon = getHealthStatusIcon(metrics.executionTimeStatus);
  const executionTimeLabel = getHealthStatusLabel(metrics.executionTimeStatus);
  const executionTimeColor = getHealthStatusColor(metrics.executionTimeStatus);
  const avgTimeMinutes = Math.floor(metrics.avgExecutionTime / 60);
  const avgTimeSeconds = metrics.avgExecutionTime % 60;

  lines.push(
    chalk[executionTimeColor](
      `${executionTimeIcon} 平均執行時間：${avgTimeMinutes} 分 ${avgTimeSeconds} 秒 ` +
      `${executionTimeLabel}`
    )
  );

  // 統計資訊
  lines.push('');
  lines.push(chalk.gray(`📊 統計資訊:`));
  lines.push(chalk.gray(`  - 總 Pipeline 數: ${metrics.totalPipelines}`));
  lines.push(chalk.gray(`  - 已完成: ${metrics.completedPipelines}`));
  lines.push(chalk.gray(`  - 執行中: ${metrics.runningPipelines}`));
  lines.push(chalk.gray(`  - 中位數執行時間: ${Math.floor(metrics.medianExecutionTime / 60)} 分鐘`));

  return lines.join('\n');
}

/**
 * 格式化失敗分類為表格輸出
 */
export function formatFailureBreakdown(
  categories: FailureCategory[],
  totalFailures: number
): string {
  if (categories.length === 0) {
    return '\n' + chalk.green('✅ 無失敗記錄');
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.yellow(`📊 失敗原因分析（${totalFailures} 次失敗）:`));

  categories.forEach((category, index) => {
    const typeLabel = getFailureTypeLabel(category.type);
    const percentage = `${category.percentage}%`;

    lines.push(
      chalk.yellow(
        `  ${index + 1}. ${typeLabel} (${percentage}):\t${category.count} 次`
      )
    );

    // 顯示範例（如果有）
    if (category.examples.length > 0) {
      const examples = category.examples.slice(0, 3).join(', ');
      lines.push(chalk.gray(`     範例: ${examples}`));
    }
  });

  return lines.join('\n');
}

/**
 * 格式化最常失敗的 job 為表格輸出
 */
export function formatTopFailingJobs(jobs: JobFailureSummary[]): string {
  if (jobs.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.red('⚠️  最常失敗的 Job:'));

  jobs.forEach((job) => {
    lines.push(
      chalk.red(
        `  - ${job.jobName} (${job.failureCount} 次，失敗率 ${job.failureRate}%)`
      )
    );
    lines.push(chalk.gray(`    ${job.recommendation}`));
  });

  return lines.join('\n');
}

/**
 * 格式化完整的 CI 健康度報告
 */
export function formatCIHealthReport(
  metrics: HealthMetrics,
  failureBreakdown: FailureCategory[],
  topFailingJobs: JobFailureSummary[]
): string {
  const sections: string[] = [];

  // 1. 健康度指標
  sections.push(formatHealthMetrics(metrics));

  // 2. 失敗分類
  sections.push(formatFailureBreakdown(failureBreakdown, metrics.failedPipelines));

  // 3. 最常失敗的 job
  if (topFailingJobs.length > 0) {
    sections.push(formatTopFailingJobs(topFailingJobs));
  }

  // 結尾分隔線
  sections.push('');
  sections.push(chalk.bold('═'.repeat(65)));
  sections.push('');

  return sections.join('\n');
}

// ============================================================================
// 輔助函數
// ============================================================================

/**
 * 取得健康狀態圖示
 */
function getHealthStatusIcon(status: string): string {
  switch (status) {
    case 'healthy':
      return '✅';
    case 'warning':
      return '⚠️';
    case 'critical':
      return '❌';
    default:
      return '❓';
  }
}

/**
 * 取得健康狀態標籤
 */
function getHealthStatusLabel(status: string): string {
  switch (status) {
    case 'healthy':
      return '健康';
    case 'warning':
      return '警告';
    case 'critical':
      return '危險';
    default:
      return '未知';
  }
}

/**
 * 取得健康狀態顏色
 */
function getHealthStatusColor(status: string): 'green' | 'yellow' | 'red' | 'gray' {
  switch (status) {
    case 'healthy':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'critical':
      return 'red';
    default:
      return 'gray';
  }
}

/**
 * 取得失敗類型標籤
 */
function getFailureTypeLabel(type: string): string {
  switch (type) {
    case 'Test':
      return '測試失敗';
    case 'Build':
      return '建置失敗';
    case 'Linting':
      return 'Linting 錯誤';
    case 'Deploy':
      return '部署失敗';
    case 'Other':
      return '其他';
    default:
      return type;
  }
}
