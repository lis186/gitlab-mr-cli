/**
 * 配置範本偵測服務
 *
 * 支援 3 種模式偵測：mobile-app、date-based、semver
 * 實作信心度計算，回傳 DetectionResult
 *
 * @module services/config/preset-detector
 */

import type {
  DetectionResult,
  ReleaseConfiguration,
} from '../../types/release-config.js';
import { TagPatternMatcher } from './tag-pattern-matcher.js';

/**
 * 預設標籤格式模式定義
 */
interface TagPatternPreset {
  /** Preset 名稱 */
  name: 'mobile-app' | 'date-based' | 'semver';
  /** 正則表達式 */
  pattern: string;
  /** 群組映射 */
  groups: Record<string, number>;
  /** 範例標籤 */
  examples: string[];
  /** 說明 */
  description: string;
}

/**
 * 支援的標籤格式預設配置
 */
const TAG_PATTERN_PRESETS: TagPatternPreset[] = [
  {
    name: 'mobile-app',
    pattern: '^(?:AppStore|v)?(\\d{2})\\.(\\d{1,2})\\.(\\d+)$',
    groups: { year: 1, month: 2, patch: 3 },
    examples: ['AppStore25.10.5', 'v25.9.0', '24.12.1'],
    description: '行動應用程式年月版本（格式：YY.M.PATCH）',
  },
  {
    name: 'date-based',
    pattern: '^rel-(\\d{4})(\\d{2})(\\d{2})-(\\d+)$',
    groups: { year: 1, month: 2, day: 3, sequence: 4 },
    examples: ['rel-20251026-1', 'rel-20250915-2'],
    description: '日期格式版本（格式：rel-YYYYMMDD-N）',
  },
  {
    name: 'semver',
    pattern: '^v?(\\d+)\\.(\\d+)\\.(\\d+)(?:_(.+))?$',
    groups: { major: 1, minor: 2, patch: 3, suffix: 4 },
    examples: ['v1.2.3', '2.0.0', '1.5.10_beta'],
    description: 'Semantic Versioning（格式：MAJOR.MINOR.PATCH）',
  },
];

/**
 * 配置範本偵測服務
 *
 * 負責自動偵測專案的標籤命名規範，並建議適合的配置範本
 */
export class PresetDetector {
  private matcher: TagPatternMatcher;

  constructor() {
    this.matcher = new TagPatternMatcher();
  }

  /**
   * 偵測標籤格式並計算信心度
   *
   * @param tags - 標籤樣本（建議 20 個）
   * @returns 偵測結果，包含最佳匹配的 pattern、信心度、建議 preset
   *
   * @example
   * ```typescript
   * const detector = new PresetDetector();
   * const tags = ['AppStore25.10.5', 'AppStore25.9.0', 'AppStore25.8.3'];
   * const result = detector.detectPattern(tags);
   *
   * if (result.confidence > 80) {
   *   console.log(`高信心度偵測: ${result.suggested_preset}`);
   * } else if (result.confidence > 50) {
   *   console.log(`中信心度偵測，建議確認: ${result.suggested_preset}`);
   * } else {
   *   console.log('低信心度，建議建立自訂配置');
   * }
   * ```
   */
  detectPattern(tags: string[]): DetectionResult {
    if (tags.length === 0) {
      return {
        pattern: '',
        confidence: 0,
        matched_count: 0,
        total_count: 0,
        suggested_preset: null,
      };
    }

    // 測試所有預設模式
    let bestMatch: DetectionResult | null = null;

    for (const preset of TAG_PATTERN_PRESETS) {
      const results = this.matcher.matchBatch({
        tags,
        pattern: preset.pattern,
        groups: preset.groups,
      });

      const matchedResults = results.filter((r) => r.matched);
      const matchedCount = matchedResults.length;
      const matchRate = matchedCount / tags.length;

      // 計算信心度（百分比）
      const confidence = this.calculateConfidence(matchRate, matchedCount, tags.length);

      if (confidence > (bestMatch?.confidence || 0)) {
        bestMatch = {
          pattern: preset.pattern,
          confidence,
          matched_count: matchedCount,
          total_count: tags.length,
          suggested_preset: preset.name,
          sample_tags: matchedResults.slice(0, 5).map((r) => r.tag),
        };
      }
    }

    return (
      bestMatch || {
        pattern: '',
        confidence: 0,
        matched_count: 0,
        total_count: tags.length,
        suggested_preset: null,
      }
    );
  }

  /**
   * 根據偵測結果建議配置範本
   *
   * @param detectionResult - 偵測結果
   * @returns 建議的配置物件（null 表示無法建議）
   *
   * @example
   * ```typescript
   * const detector = new PresetDetector();
   * const tags = ['AppStore25.10.5', 'AppStore25.9.0'];
   * const detection = detector.detectPattern(tags);
   * const config = detector.suggestPreset(detection);
   *
   * if (config) {
   *   console.log(`建議使用配置: ${config.name}`);
   * }
   * ```
   */
  suggestPreset(detectionResult: DetectionResult): ReleaseConfiguration | null {
    if (!detectionResult.suggested_preset) {
      return null;
    }

    const preset = TAG_PATTERN_PRESETS.find(
      (p) => p.name === detectionResult.suggested_preset
    );

    if (!preset) {
      return null;
    }

    // 根據偵測到的 preset 產生完整配置
    return this.generatePresetConfig(preset);
  }

  /**
   * 計算偵測信心度（0-100）
   *
   * 考慮因素：
   * 1. 匹配率（主要因素）
   * 2. 樣本數量（樣本越多越可靠）
   * 3. 一致性評分（連續匹配提升信心度）
   *
   * @param matchRate - 匹配率（0-1）
   * @param matchedCount - 匹配數量
   * @param totalCount - 樣本總數
   * @returns 信心度（0-100）
   * @private
   */
  private calculateConfidence(
    matchRate: number,
    matchedCount: number,
    totalCount: number
  ): number {
    // 基礎分數：匹配率
    let confidence = matchRate * 100;

    // 樣本數量加成（至少 10 個樣本才有加成）
    if (totalCount >= 10 && matchedCount >= 8) {
      confidence += 5;
    }

    // 高匹配率加成
    if (matchRate >= 0.9) {
      confidence += 5;
    }

    // 確保不超過 100
    return Math.min(confidence, 100);
  }

  /**
   * 根據 preset 產生完整配置物件
   *
   * @param preset - 標籤格式 preset
   * @returns 完整的發布配置
   * @private
   */
  private generatePresetConfig(preset: TagPatternPreset): ReleaseConfiguration {
    // 根據不同 preset 提供不同的預設配置
    const baseConfig: ReleaseConfiguration = {
      name: `auto-detected-${preset.name}`,
      description: `自動偵測的配置（${preset.description}）`,
      tag: {
        pattern: preset.pattern,
        groups: preset.groups,
      },
      release_types: this.getDefaultReleaseTypes(preset.name),
      analysis: {
        default_branch: 'main',
        thresholds: {
          mr_count: {
            healthy: 30,
            warning: 50,
            critical: 100,
          },
        },
        pipeline_history_days: 90,
      },
    };

    return baseConfig;
  }

  /**
   * 取得預設的發布類型定義
   *
   * @param presetName - Preset 名稱
   * @returns 發布類型定義
   * @private
   */
  private getDefaultReleaseTypes(
    presetName: 'mobile-app' | 'date-based' | 'semver'
  ): ReleaseConfiguration['release_types'] {
    switch (presetName) {
      case 'mobile-app':
        return {
          major: {
            name: 'major',
            description: '正式月度發布',
            priority: 1,
            evaluate_batch_size: true,  // 預設評估批量
            rules: [
              {
                field: 'patch',
                operator: 'equals',
                value: 0,
              },
            ],
          },
          hotfix: {
            name: 'hotfix',
            description: '緊急修復',
            priority: 2,
            evaluate_batch_size: false,  // 預設不評估批量
            rules: [
              {
                field: 'patch',
                operator: 'greater_than',
                value: 0,
              },
            ],
          },
        };

      case 'date-based':
        return {
          release: {
            name: 'release',
            description: '正式發布',
            priority: 1,
            evaluate_batch_size: true,  // 預設評估批量
            rules: [
              {
                field: 'sequence',
                operator: 'greater_than',
                value: 0,
              },
            ],
          },
        };

      case 'semver':
        return {
          major: {
            name: 'major',
            description: '重大版本',
            priority: 1,
            evaluate_batch_size: true,  // 預設評估批量
            rules: [
              {
                field: 'major',
                operator: 'greater_than',
                value: 0,
              },
            ],
          },
          minor: {
            name: 'minor',
            description: '功能版本',
            priority: 2,
            evaluate_batch_size: false,  // 預設不評估批量
            rules: [
              {
                field: 'minor',
                operator: 'greater_than',
                value: 0,
              },
            ],
          },
          patch: {
            name: 'patch',
            description: '修補版本',
            priority: 3,
            evaluate_batch_size: false,  // 預設不評估批量
            rules: [
              {
                field: 'patch',
                operator: 'greater_than',
                value: 0,
              },
            ],
          },
        };
    }
  }

  /**
   * 取得支援的 preset 清單
   *
   * @returns Preset 清單
   */
  getSupportedPresets(): Array<{
    name: string;
    description: string;
    examples: string[];
  }> {
    return TAG_PATTERN_PRESETS.map((preset) => ({
      name: preset.name,
      description: preset.description,
      examples: preset.examples,
    }));
  }
}

/**
 * 偵測標籤格式（獨立函數版本）
 *
 * @param tags - 標籤樣本陣列
 * @returns 偵測結果
 *
 * @example
 * ```typescript
 * const tags = await fetchRecentTags(projectId, 20);
 * const result = detectPattern(tags);
 *
 * if (result.confidence > 80) {
 *   console.log(`自動使用 ${result.suggested_preset} 配置`);
 * } else {
 *   console.log('建議手動建立配置檔');
 * }
 * ```
 */
export function detectPattern(tags: string[]): DetectionResult {
  const detector = new PresetDetector();
  return detector.detectPattern(tags);
}

/**
 * 建議配置範本（獨立函數版本）
 *
 * @param detectionResult - 偵測結果
 * @returns 建議的配置物件
 *
 * @example
 * ```typescript
 * const detection = detectPattern(tags);
 * const config = suggestPreset(detection);
 *
 * if (config) {
 *   await saveConfig(config);
 * }
 * ```
 */
export function suggestPreset(detectionResult: DetectionResult): ReleaseConfiguration | null {
  const detector = new PresetDetector();
  return detector.suggestPreset(detectionResult);
}
