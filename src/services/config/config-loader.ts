/**
 * 配置載入服務
 *
 * 多層優先級載入（CLI → 專案 → 全域 → 自動偵測）
 * 整合 ConfigValidator、PresetDetector
 *
 * @module services/config/config-loader
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import yaml from 'js-yaml';
import type {
  ReleaseConfiguration,
  GlobalConfig,
  ConfigLoadPriority,
} from '../../types/release-config.js';
import { ConfigValidator } from './config-validator.js';
import { PresetDetector } from './preset-detector.js';
import { logger } from '../../utils/logger.js';

/**
 * 配置來源資訊
 */
export interface ConfigSource {
  /** 載入優先級 */
  priority: ConfigLoadPriority;
  /** 配置檔案路徑（自動偵測時為 undefined） */
  path?: string;
  /** Preset 名稱（使用 preset 時） */
  preset_name?: string;
}

/**
 * 配置載入結果
 */
export interface ConfigLoadResult {
  /** 載入的配置物件 */
  config: ReleaseConfiguration;
  /** 配置來源 */
  source: 'auto-detect' | 'global' | 'project' | 'cli';
  /** 配置檔案路徑（自動偵測時為 undefined） */
  source_path?: string;
}

/**
 * 配置載入選項
 */
export interface ConfigLoadOptions {
  /** 專案 ID（用於自動偵測） */
  projectId?: string;
  /** CLI 參數指定的配置路徑 */
  cliConfigPath?: string;
  /** 專案根目錄路徑 */
  projectPath?: string;
  /** 標籤樣本（用於自動偵測，若未提供則從 API 取得） */
  tagSamples?: string[];
  /** 是否啟用自動偵測（預設 true） */
  autoDetect?: boolean;
}

/**
 * 配置載入服務
 *
 * 負責按優先順序載入配置檔案：CLI 參數 → 專案配置 → 全域配置 → 自動偵測
 */
export class ConfigLoader {
  private validator: ConfigValidator;
  private detector: PresetDetector;

  constructor() {
    this.validator = new ConfigValidator();
    this.detector = new PresetDetector();
  }

  /**
   * 載入配置（依優先順序）
   *
   * 優先順序：
   * 1. CLI 參數指定的配置檔案（--config）
   * 2. 專案根目錄的 .gitlab-analysis.yml
   * 3. 全域配置 ~/.gitlab-analysis/config.yml
   * 4. 自動偵測（分析標籤格式）
   *
   * @param options - 載入選項
   * @returns 載入結果
   * @throws {Error} 當所有來源都無法載入時拋出錯誤
   *
   * @example
   * ```typescript
   * const loader = new ConfigLoader();
   * const result = await loader.loadConfig({
   *   projectId: 'example/mobile-app',
   *   cliConfigPath: './custom-config.yml'
   * });
   *
   * console.log(`使用配置來源: ${result.source}`);
   * ```
   */
  async loadConfig(options: ConfigLoadOptions): Promise<ConfigLoadResult> {
    const { cliConfigPath, projectPath, autoDetect = true } = options;

    // 1. CLI 參數指定的配置（最高優先級）
    if (cliConfigPath) {
      try {
        const config = await this.loadFromFile(cliConfigPath);
        return {
          config,
          source: 'cli',
          source_path: path.resolve(cliConfigPath),
        };
      } catch (error) {
        throw new Error(
          `無法載入 CLI 指定的配置檔案 "${cliConfigPath}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // 2. 專案配置
    if (projectPath) {
      const projectConfigPath = path.join(projectPath, '.gitlab-analysis.yml');
      if (fs.existsSync(projectConfigPath)) {
        try {
          const config = await this.loadFromFile(projectConfigPath);
          return {
            config,
            source: 'project',
            source_path: projectConfigPath,
          };
        } catch (error) {
          // 專案配置存在但載入失敗時應該報錯
          throw new Error(
            `專案配置檔案載入失敗 "${projectConfigPath}": ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    // 3. 全域配置
    const globalConfigPath = this.getGlobalConfigPath();
    if (fs.existsSync(globalConfigPath)) {
      try {
        const config = await this.loadFromFile(globalConfigPath);
        return {
          config,
          source: 'global',
          source_path: globalConfigPath,
        };
      } catch (error) {
        // 全域配置載入失敗時繼續嘗試自動偵測
        logger.warn(`全域配置載入失敗，將嘗試自動偵測: ${error}`);
      }
    }

    // 4. 自動偵測
    if (autoDetect && options.tagSamples) {
      try {
        const config = await this.autoDetectConfig(options.tagSamples);
        return {
          config,
          source: 'auto-detect',
        };
      } catch (error) {
        throw new Error(
          `自動偵測失敗: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // 所有來源都無法載入
    throw new Error(
      '無法載入配置：未找到配置檔案且無法自動偵測。\n' +
        '請執行 `gitlab-mr release init` 建立配置檔，或使用 --config 參數指定配置路徑。'
    );
  }

  /**
   * 取得全域配置
   *
   * @returns 全域配置物件（null 表示不存在）
   */
  async getGlobalConfig(): Promise<GlobalConfig | null> {
    const globalConfigPath = this.getGlobalConfigPath();

    if (!fs.existsSync(globalConfigPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(globalConfigPath, 'utf-8');
      const rawConfig = yaml.load(content) as unknown;

      // 這裡應該使用 GlobalConfigSchema 驗證，但為了簡化先直接返回
      return rawConfig as GlobalConfig;
    } catch (error) {
      throw new Error(
        `全域配置載入失敗: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 取得專案配置
   *
   * @param options - 載入選項
   * @returns 專案配置物件（null 表示不存在）
   */
  async getProjectConfig(options: {
    projectPath: string;
  }): Promise<ReleaseConfiguration | null> {
    const configPath = path.join(options.projectPath, '.gitlab-analysis.yml');

    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      return await this.loadFromFile(configPath);
    } catch (error) {
      throw new Error(
        `專案配置載入失敗: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 從 YAML 檔案載入配置
   *
   * @param filePath - 配置檔案路徑
   * @returns 驗證後的配置物件
   * @throws {Error} 當檔案不存在、解析失敗或驗證失敗時拋出錯誤
   * @private
   */
  private async loadFromFile(filePath: string): Promise<ReleaseConfiguration> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`配置檔案不存在: ${filePath}`);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const rawConfig = yaml.load(content) as unknown;

      // 驗證配置
      const validationResult = await this.validator.validate(rawConfig);

      if (!validationResult.valid) {
        const errorMessages = validationResult.errors
          .map((err) => `  - ${err.path}: ${err.message}`)
          .join('\n');

        throw new Error(`配置驗證失敗:\n${errorMessages}`);
      }

      return rawConfig as ReleaseConfiguration;
    } catch (error) {
      if (error instanceof yaml.YAMLException) {
        throw new Error(`YAML 格式錯誤: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 自動偵測配置
   *
   * @param tagSamples - 標籤樣本（建議 20 個）
   * @returns 自動產生的配置物件
   * @throws {Error} 當偵測失敗或信心度過低時拋出錯誤
   * @private
   */
  private async autoDetectConfig(tagSamples: string[]): Promise<ReleaseConfiguration> {
    const detectionResult = this.detector.detectPattern(tagSamples);

    // 檢查信心度
    if (detectionResult.confidence < 50) {
      throw new Error(
        `自動偵測信心度過低 (${detectionResult.confidence.toFixed(1)}%)，建議手動建立配置檔。\n` +
          `樣本標籤: ${tagSamples.slice(0, 5).join(', ')}`
      );
    }

    // 產生建議配置
    const config = this.detector.suggestPreset(detectionResult);

    if (!config) {
      throw new Error('無法根據偵測結果產生配置');
    }

    // 如果信心度在 50-80% 之間，提供警告
    if (detectionResult.confidence < 80) {
      logger.warn(
        `⚠ 自動偵測信心度為 ${detectionResult.confidence.toFixed(1)}%，建議確認配置是否正確`
      );
      logger.warn(`  偵測到的模式: ${detectionResult.suggested_preset}`);
      logger.warn(`  匹配標籤範例: ${detectionResult.sample_tags?.join(', ')}`);
    }

    return config;
  }

  /**
   * 取得全域配置檔案路徑
   *
   * @returns 全域配置檔案的絕對路徑
   * @private
   */
  private getGlobalConfigPath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.gitlab-analysis', 'config.yml');
  }

  /**
   * 儲存配置到檔案
   *
   * @param config - 配置物件
   * @param filePath - 目標檔案路徑
   * @throws {Error} 當儲存失敗時拋出錯誤
   *
   * @example
   * ```typescript
   * const loader = new ConfigLoader();
   * await loader.saveConfig(config, './.gitlab-analysis.yml');
   * ```
   */
  async saveConfig(config: ReleaseConfiguration, filePath: string): Promise<void> {
    try {
      // 先驗證配置
      const validationResult = await this.validator.validate(config);
      if (!validationResult.valid) {
        const errorMessages = validationResult.errors
          .map((err) => `  - ${err.path}: ${err.message}`)
          .join('\n');

        throw new Error(`配置驗證失敗:\n${errorMessages}`);
      }

      // 確保目錄存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 轉換為 YAML
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 100,
        noRefs: true,
      });

      // 寫入檔案
      fs.writeFileSync(filePath, yamlContent, 'utf-8');
    } catch (error) {
      throw new Error(
        `配置儲存失敗: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * 載入配置（獨立函數版本）
 *
 * @param options - 載入選項
 * @returns 載入結果
 *
 * @example
 * ```typescript
 * const result = await loadConfig({
 *   projectPath: process.cwd(),
 *   tagSamples: ['AppStore25.10.5', 'AppStore25.9.0']
 * });
 *
 * console.log(`載入配置: ${result.config.name}`);
 * console.log(`來源: ${result.source}`);
 * ```
 */
export async function loadConfig(options: ConfigLoadOptions): Promise<ConfigLoadResult> {
  const loader = new ConfigLoader();
  return loader.loadConfig(options);
}
