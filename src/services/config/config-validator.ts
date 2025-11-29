/**
 * 配置驗證服務
 *
 * 使用 Zod schemas 驗證配置檔案，提供詳細的驗證錯誤訊息（正體中文）
 *
 * @module services/config/config-validator
 */

import { z, type ZodIssue } from 'zod';
import {
  ReleaseConfigurationSchema,
  type ReleaseConfiguration,
  type ConfigValidationResult,
} from '../../types/release-config.js';

/**
 * 配置驗證服務
 *
 * 負責驗證發布配置檔案的格式與內容正確性
 */
export class ConfigValidator {
  /**
   * 驗證配置檔案
   *
   * @param config - 待驗證的配置物件（任意型別）
   * @returns 驗證結果，包含是否通過與錯誤訊息
   *
   * @example
   * ```typescript
   * const validator = new ConfigValidator();
   * const result = await validator.validate(rawConfig);
   *
   * if (!result.valid) {
   *   console.error('配置驗證失敗：');
   *   result.errors.forEach(err => {
   *     console.error(`- ${err.path}: ${err.message}`);
   *   });
   * }
   * ```
   */
  async validate(config: unknown): Promise<ConfigValidationResult> {
    try {
      // 使用 Zod schema 進行驗證
      ReleaseConfigurationSchema.parse(config);

      // 驗證通過
      return {
        valid: true,
        errors: [],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        // 轉換 Zod 錯誤為正體中文訊息
        const errors = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: this.translateErrorMessage(issue),
          code: issue.code,
        }));

        return {
          valid: false,
          errors,
        };
      }

      // 非預期錯誤
      return {
        valid: false,
        errors: [
          {
            path: 'root',
            message: `配置驗證時發生未預期的錯誤: ${error instanceof Error ? error.message : String(error)}`,
            code: 'unexpected_error',
          },
        ],
      };
    }
  }

  /**
   * 驗證標籤格式正則表達式
   *
   * @param pattern - 正則表達式字串
   * @returns 驗證結果，包含是否有效與錯誤訊息
   *
   * @example
   * ```typescript
   * const validator = new ConfigValidator();
   * const result = validator.validateTagPattern('^AppStore(\\d{2})\\.(\\d{1,2})\\.(\\d+)$');
   *
   * if (!result.valid) {
   *   console.error(`標籤格式無效: ${result.error}`);
   * }
   * ```
   */
  validateTagPattern(pattern: string): {
    valid: boolean;
    error?: string;
    sample_matches?: string[];
  } {
    try {
      // 嘗試建立 RegExp 物件
      const regex = new RegExp(pattern);

      // 檢查是否包含擷取群組
      const testString = 'test-string-for-groups';
      const match = regex.exec(testString);

      // 基本驗證通過
      return {
        valid: true,
        sample_matches: match ? Array.from(match).slice(1) : [],
      };
    } catch (error) {
      return {
        valid: false,
        error: `正則表達式格式錯誤: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 將 Zod 驗證錯誤轉換為正體中文訊息
   *
   * @param issue - Zod 驗證問題
   * @returns 正體中文錯誤訊息
   * @private
   */
  private translateErrorMessage(issue: ZodIssue): string {
    const path = issue.path.join('.');

    switch (issue.code) {
      case 'invalid_type':
        return `欄位「${path}」型別錯誤：期望 ${issue.expected}，實際為 ${(issue as any).received}`;

      case 'too_small':
        return `欄位「${path}」不符合最小值限制：${issue.message}`;

      case 'too_big':
        return `欄位「${path}」不符合最大值限制：${issue.message}`;

      case 'invalid_format':
        return `欄位「${path}」格式錯誤：${issue.message}`;

      case 'custom':
        return `欄位「${path}」自訂驗證失敗：${issue.message || '未提供詳細訊息'}`;

      default:
        return `欄位「${path}」驗證失敗：${issue.message || '未知錯誤'}`;
    }
  }
}

/**
 * 驗證配置檔案（獨立函數版本）
 *
 * @param config - 待驗證的配置物件
 * @returns 驗證結果
 *
 * @example
 * ```typescript
 * const result = await validateConfig(rawConfig);
 *
 * if (result.valid) {
 *   console.log('配置驗證通過');
 * } else {
 *   console.error('配置驗證失敗：', result.errors);
 * }
 * ```
 */
export async function validateConfig(config: unknown): Promise<ConfigValidationResult> {
  const validator = new ConfigValidator();
  return validator.validate(config);
}

/**
 * 驗證並解析配置檔案（型別安全版本）
 *
 * @param config - 待驗證的配置物件
 * @returns 型別安全的配置物件
 * @throws {Error} 當驗證失敗時拋出錯誤
 *
 * @example
 * ```typescript
 * try {
 *   const validConfig = validateAndParse(rawConfig);
 *   console.log(`配置名稱: ${validConfig.name}`);
 * } catch (error) {
 *   console.error('配置驗證失敗:', error.message);
 * }
 * ```
 */
export function validateAndParse(config: unknown): ReleaseConfiguration {
  try {
    return ReleaseConfigurationSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validator = new ConfigValidator();
      const firstError = error.issues[0];
      if (firstError) {
        const message = (validator as any).translateErrorMessage(firstError);
        throw new Error(`配置驗證失敗: ${message}`);
      }
    }
    throw error;
  }
}
