/**
 * 健康度指標模型
 *
 * 彙整整體健康度評估結果
 */

/**
 * 發布批量指標
 */
export interface BatchSizeMetric {
  /** 平均 MR 數量 */
  average_mr_count: number;

  /** 平均 LOC 變更 */
  average_loc_changes: number;

  /** 健康度等級 */
  level: 'healthy' | 'warning' | 'critical';

  /** 是否有月底集中合併反模式 */
  has_end_of_month_pattern: boolean;
}

/**
 * 主幹可部署性指標
 */
export interface TrunkHealthMetric {
  /** Pipeline 成功率 (0-1) */
  pipeline_success_rate: number;

  /** 平均修復時間（小時） */
  mean_time_to_fix_hours: number;

  /** 最大連續失敗次數 */
  consecutive_failures: number;

  /** 健康度等級 */
  level: 'elite' | 'good' | 'needs-improvement';

  /** 是否符合 DORA Elite 標準 */
  dora_compliance: boolean;
}

/**
 * 整合頻率指標
 */
export interface IntegrationMetric {
  /** 總合併次數 */
  total_merges: number;

  /** 每日平均合併次數 */
  daily_average: number;

  /** 每週分佈（7 個數字，週一到週日） */
  weekly_distribution: number[];

  /** DORA 等級 */
  dora_level: 'Elite' | 'High' | 'Medium' | 'Low';
}

/**
 * 發布準備度指標
 */
export interface ReadinessMetric {
  /** 平均凍結期天數 */
  average_freeze_days: number;

  /** 健康度等級 */
  level: 'healthy' | 'too-long' | 'too-short';

  /** 針對性建議 */
  recommendation: string;
}

/**
 * 整體健康度等級
 */
export type OverallHealthLevel = 'elite' | 'high' | 'medium' | 'low';

/**
 * 健康度指標
 *
 * 彙整整體健康度評估結果
 *
 * @example
 * ```typescript
 * const metrics: HealthMetrics = {
 *   batch_size: {
 *     average_mr_count: 45,
 *     average_loc_changes: 1200,
 *     level: 'healthy',
 *     has_end_of_month_pattern: false
 *   },
 *   trunk_health: {
 *     pipeline_success_rate: 0.95,
 *     mean_time_to_fix_hours: 2.5,
 *     consecutive_failures: 1,
 *     level: 'elite',
 *     dora_compliance: true
 *   },
 *   integration_frequency: {
 *     total_merges: 120,
 *     daily_average: 4.0,
 *     weekly_distribution: [18, 20, 22, 19, 21, 15, 5],
 *     dora_level: 'Elite'
 *   },
 *   readiness: {
 *     average_freeze_days: 2,
 *     level: 'healthy',
 *     recommendation: '代碼凍結期長度適中，建議保持'
 *   },
 *   overall_level: 'high',
 *   recommendations: [
 *     '保持小批量發布',
 *     '繼續維持高 Pipeline 成功率'
 *   ]
 * };
 * ```
 */
export interface HealthMetrics {
  /** 發布批量指標 */
  batch_size: BatchSizeMetric;

  /** 主幹可部署性指標 */
  trunk_health: TrunkHealthMetric;

  /** 整合頻率指標 */
  integration_frequency: IntegrationMetric;

  /** 發布準備度指標 */
  readiness?: ReadinessMetric;

  /** 整體健康度等級 */
  overall_level: OverallHealthLevel;

  /** 改善建議清單 */
  recommendations: string[];
}

/**
 * 計算整體健康度等級
 *
 * 根據各項指標綜合評估整體健康度
 *
 * @param batchLevel - 批量指標等級
 * @param trunkLevel - 主幹健康度等級
 * @param integrationLevel - 整合頻率等級
 * @returns 整體健康度等級
 */
export function calculateOverallLevel(
  batchLevel: BatchSizeMetric['level'],
  trunkLevel: TrunkHealthMetric['level'],
  integrationLevel: IntegrationMetric['dora_level']
): OverallHealthLevel {
  // 轉換各指標等級為數值評分
  const batchScore = batchLevel === 'healthy' ? 3 : batchLevel === 'warning' ? 2 : 1;
  const trunkScore = trunkLevel === 'elite' ? 3 : trunkLevel === 'good' ? 2 : 1;
  const integrationScore =
    integrationLevel === 'Elite' ? 4 :
    integrationLevel === 'High' ? 3 :
    integrationLevel === 'Medium' ? 2 : 1;

  // 計算平均分數
  const averageScore = (batchScore + trunkScore + integrationScore) / 3;

  // 轉換為整體等級
  if (averageScore >= 3.5) return 'elite';
  if (averageScore >= 2.5) return 'high';
  if (averageScore >= 1.5) return 'medium';
  return 'low';
}

/**
 * 驗證健康度指標物件
 *
 * @param metrics - 健康度指標物件
 * @returns 驗證錯誤訊息陣列，若為空陣列則驗證通過
 */
export function validateHealthMetrics(metrics: HealthMetrics): string[] {
  const errors: string[] = [];

  // 驗證 pipeline_success_rate 在 0-1 之間
  if (metrics.trunk_health.pipeline_success_rate < 0 ||
      metrics.trunk_health.pipeline_success_rate > 1) {
    errors.push(
      `pipeline_success_rate must be between 0 and 1, got ${metrics.trunk_health.pipeline_success_rate}`
    );
  }

  // 驗證 daily_average >= 0
  if (metrics.integration_frequency.daily_average < 0) {
    errors.push('daily_average cannot be negative');
  }

  // 驗證 weekly_distribution 長度為 7
  if (metrics.integration_frequency.weekly_distribution.length !== 7) {
    errors.push(
      `weekly_distribution must have 7 elements, got ${metrics.integration_frequency.weekly_distribution.length}`
    );
  }

  // 驗證 weekly_distribution 所有值 >= 0
  for (let i = 0; i < metrics.integration_frequency.weekly_distribution.length; i++) {
    const value = metrics.integration_frequency.weekly_distribution[i];
    if (value !== undefined && value < 0) {
      errors.push(`weekly_distribution[${i}] cannot be negative`);
    }
  }

  // 驗證 readiness 指標（如果存在）
  if (metrics.readiness && metrics.readiness.average_freeze_days < 0) {
    errors.push('average_freeze_days cannot be negative');
  }

  return errors;
}

/**
 * 生成批量指標改善建議
 *
 * @param metric - 批量指標
 * @returns 改善建議清單
 */
export function getBatchSizeRecommendations(metric: BatchSizeMetric): string[] {
  const recommendations: string[] = [];

  if (metric.level === 'critical') {
    recommendations.push('發布批量過大，建議增加發布頻率以減少每次發布的變更量');
  } else if (metric.level === 'warning') {
    recommendations.push('發布批量偏大，建議適度提高發布頻率');
  }

  if (metric.has_end_of_month_pattern) {
    recommendations.push('檢測到月底集中合併反模式，建議平均分配合併時間');
  }

  if (metric.level === 'healthy' && !metric.has_end_of_month_pattern) {
    recommendations.push('發布批量控制良好，建議保持當前節奏');
  }

  return recommendations;
}

/**
 * 生成主幹健康度改善建議
 *
 * @param metric - 主幹健康度指標
 * @returns 改善建議清單
 */
export function getTrunkHealthRecommendations(metric: TrunkHealthMetric): string[] {
  const recommendations: string[] = [];

  if (metric.level === 'needs-improvement') {
    recommendations.push('主幹 Pipeline 成功率偏低，建議檢查測試覆蓋率和程式碼品質');
  }

  if (metric.consecutive_failures > 3) {
    recommendations.push(`連續失敗 ${metric.consecutive_failures} 次，建議立即修復 CI/CD 問題`);
  }

  if (metric.mean_time_to_fix_hours > 24) {
    recommendations.push('平均修復時間過長，建議建立更快速的問題回應流程');
  }

  if (metric.dora_compliance) {
    recommendations.push('符合 DORA Elite 標準，繼續保持');
  }

  return recommendations;
}

/**
 * 生成整合頻率改善建議
 *
 * @param metric - 整合頻率指標
 * @returns 改善建議清單
 */
export function getIntegrationRecommendations(metric: IntegrationMetric): string[] {
  const recommendations: string[] = [];

  if (metric.dora_level === 'Low' || metric.dora_level === 'Medium') {
    recommendations.push('整合頻率偏低，建議鼓勵團隊更頻繁地合併小變更');
  }

  // 檢查週末活動是否異常高
  const sat = metric.weekly_distribution[5] ?? 0;
  const sun = metric.weekly_distribution[6] ?? 0;
  const weekendTotal = sat + sun;
  const weekdayAverage = metric.weekly_distribution.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  if (weekendTotal > weekdayAverage * 2) {
    recommendations.push('週末合併活動異常高，建議評估工作分配是否合理');
  }

  if (metric.dora_level === 'Elite') {
    recommendations.push('整合頻率優異，繼續保持高頻率小批量合併');
  }

  return recommendations;
}
