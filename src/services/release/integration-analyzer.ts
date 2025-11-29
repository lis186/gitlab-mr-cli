/**
 * 整合頻率分析器
 *
 * 分析團隊合併到主幹的頻率，評估 Trunk-based Development 實踐健康度
 *
 * @module services/release/integration-analyzer
 */

import type { GitLabClient } from '../gitlab-client.js';
import type { MergeEvent } from '../../models/merge-event.js';

/**
 * 整合頻率分析結果
 */
export interface IntegrationFrequencyAnalysis {
  /** 分析時間範圍（天數） */
  days_analyzed: number;

  /** 總合併次數 */
  total_merges: number;

  /** 每日平均合併次數 */
  merges_per_day: number;

  /** 每週平均合併次數 */
  merges_per_week: number;

  /** DORA 整合頻率等級 */
  dora_level: 'elite' | 'high' | 'medium' | 'low';

  /** DORA 等級描述 */
  dora_description: string;

  /** 月底集中合併模式偵測 */
  end_of_month_pattern?: {
    detected: boolean;
    last_5_days_count: number;
    first_25_days_count: number;
    warning: string;
  };

  /** 合併事件列表 */
  merge_events: MergeEvent[];
}

/**
 * 整合頻率分析器
 */
export class IntegrationAnalyzer {
  constructor(private client: GitLabClient) {}

  /**
   * 分析整合頻率
   *
   * @param options - 分析選項
   * @returns 整合頻率分析結果
   */
  async analyzeIntegrationFrequency(options: {
    projectId: string;
    since: Date;
    until: Date;
    targetBranch?: string;
    onProgress?: (message: string) => void;
  }): Promise<IntegrationFrequencyAnalysis> {
    const { projectId, since, until, targetBranch = 'main', onProgress } = options;

    // 取得時間範圍內的合併事件
    if (onProgress) onProgress('正在取得合併記錄...');
    const mergeEvents = await this.getMergeEvents({
      projectId,
      since,
      until,
      targetBranch,
      onProgress,
    });

    // 計算分析天數
    const daysAnalyzed = Math.ceil((until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));

    // 計算頻率指標
    const totalMerges = mergeEvents.length;
    const mergesPerDay = totalMerges / daysAnalyzed;
    const mergesPerWeek = mergesPerDay * 7;

    // 計算 DORA 等級
    const doraLevel = this.calculateDoraLevel(mergesPerDay);
    const doraDescription = this.getDoraDescription(doraLevel);

    // 偵測月底集中合併模式
    let endOfMonthPattern: IntegrationFrequencyAnalysis['end_of_month_pattern'];
    if (daysAnalyzed >= 30) {
      endOfMonthPattern = this.detectEndOfMonthPattern(mergeEvents, since, until);
    }

    return {
      days_analyzed: daysAnalyzed,
      total_merges: totalMerges,
      merges_per_day: mergesPerDay,
      merges_per_week: mergesPerWeek,
      dora_level: doraLevel,
      dora_description: doraDescription,
      end_of_month_pattern: endOfMonthPattern,
      merge_events: mergeEvents,
    };
  }

  /**
   * 取得合併事件
   *
   * @param options - 查詢選項
   * @returns 合併事件列表
   * @private
   */
  private async getMergeEvents(options: {
    projectId: string;
    since: Date;
    until: Date;
    targetBranch: string;
    onProgress?: (message: string) => void;
  }): Promise<MergeEvent[]> {
    const { since, until, targetBranch, onProgress } = options;

    // 使用 GitLabClient 的 getMergedMRsByTimeRange 取得時間範圍內已合併的 MR
    if (onProgress) onProgress('正在查詢 Merge Requests...');

    const mrs = await this.client.getMergedMRsByTimeRange(since, until, {
      perPage: 100,
      maxPages: 10, // 最多查詢 1000 筆
      onWarning: onProgress,
    });

    // 過濾目標分支並轉換為 MergeEvent
    const mergeEvents: MergeEvent[] = [];

    for (const mr of mrs) {
      // 檢查目標分支
      if (mr.targetBranch !== targetBranch) {
        continue;
      }

      // mergedAt 應該已經存在（因為使用 getMergedMRsByTimeRange）
      if (!mr.mergedAt) {
        continue;
      }

      // 轉換為 MergeEvent
      // 注意：MergeRequest 模型沒有 changes_count，使用預設值 0
      mergeEvents.push({
        mr_id: mr.iid.toString(),
        title: mr.title,
        merged_at: mr.mergedAt,
        source_branch: mr.sourceBranch,
        target_branch: mr.targetBranch,
        author: mr.author?.name || 'Unknown',
        loc_additions: 0, // MergeRequest 模型沒有此資訊
        loc_deletions: 0, // MergeRequest 模型沒有此資訊
        loc_changes: 0, // MergeRequest 模型沒有此資訊
      });
    }

    // 按合併時間排序（由舊到新）
    mergeEvents.sort((a, b) => a.merged_at.getTime() - b.merged_at.getTime());

    if (onProgress) onProgress(`找到 ${mergeEvents.length} 筆合併記錄`);

    return mergeEvents;
  }

  /**
   * 計算 DORA 整合頻率等級
   *
   * @param mergesPerDay - 每日平均合併次數
   * @returns DORA 等級
   * @private
   */
  private calculateDoraLevel(
    mergesPerDay: number
  ): 'elite' | 'high' | 'medium' | 'low' {
    if (mergesPerDay >= 2) {
      return 'elite'; // 每天多次（>2 次）
    } else if (mergesPerDay >= 1) {
      return 'high'; // 每天至少 1 次
    } else if (mergesPerDay >= 0.33) {
      return 'medium'; // 每 2-3 天 1 次
    } else {
      return 'low'; // 每週或更低
    }
  }

  /**
   * 取得 DORA 等級描述
   *
   * @param level - DORA 等級
   * @returns 等級描述
   * @private
   */
  private getDoraDescription(level: 'elite' | 'high' | 'medium' | 'low'): string {
    switch (level) {
      case 'elite':
        return 'Elite - 團隊持續整合實踐優秀，每天多次合併到主幹';
      case 'high':
        return 'High - 團隊整合頻率良好，每天至少合併一次';
      case 'medium':
        return 'Medium - 整合頻率中等，建議增加合併頻率至每天至少一次';
      case 'low':
        return 'Low - 整合頻率偏低，存在月底集中合併風險，建議改善';
    }
  }

  /**
   * 偵測月底集中合併模式
   *
   * @param mergeEvents - 合併事件列表
   * @param since - 起始日期
   * @param until - 結束日期
   * @returns 月底模式偵測結果
   * @private
   */
  private detectEndOfMonthPattern(
    mergeEvents: MergeEvent[],
    since: Date,
    until: Date
  ): IntegrationFrequencyAnalysis['end_of_month_pattern'] {
    if (mergeEvents.length === 0) {
      return {
        detected: false,
        last_5_days_count: 0,
        first_25_days_count: 0,
        warning: '',
      };
    }

    // 計算最後 5 天和前 25 天的合併次數
    const daysAnalyzed = Math.ceil((until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));

    // 如果分析期間少於 30 天，不進行月底模式偵測
    if (daysAnalyzed < 30) {
      return {
        detected: false,
        last_5_days_count: 0,
        first_25_days_count: 0,
        warning: '',
      };
    }

    // 計算分界點（最後 5 天的起始時間）
    const last5DaysStart = new Date(until.getTime() - 5 * 24 * 60 * 60 * 1000);

    let last5DaysCount = 0;
    let first25DaysCount = 0;

    for (const event of mergeEvents) {
      if (event.merged_at >= last5DaysStart) {
        last5DaysCount++;
      } else {
        first25DaysCount++;
      }
    }

    // 判斷是否為月底集中合併模式
    // 條件：最後 5 天的合併次數 > 前面所有天數的總和
    const detected = last5DaysCount > first25DaysCount && first25DaysCount > 0;

    let warning = '';
    if (detected) {
      const ratio = (last5DaysCount / (last5DaysCount + first25DaysCount) * 100).toFixed(1);
      warning = `偵測到月底集中合併反模式：${ratio}% 的合併集中在最後 5 天，增加整合風險`;
    }

    return {
      detected,
      last_5_days_count: last5DaysCount,
      first_25_days_count: first25DaysCount,
      warning,
    };
  }
}
