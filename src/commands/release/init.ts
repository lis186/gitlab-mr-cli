/**
 * release:init 命令 - 互動式配置初始化
 *
 * 實作功能：006-release-readiness
 * Phase 8: Configuration Management Commands
 */

import { Command, Flags } from '@oclif/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { input, confirm } from '@inquirer/prompts';
import type { ReleaseConfiguration } from '../../types/release-config.js';

/**
 * release:init 命令類別
 */
export default class ReleaseInit extends Command {
  static description =
    '互動式配置初始化 - 建立發布分析配置檔案';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --global',
    '<%= config.bin %> <%= command.id %> --preset mobile-app',
    '<%= config.bin %> <%= command.id %> --output custom-config.yml',
    '<%= config.bin %> <%= command.id %> --non-interactive --preset mobile-app --force',
    '<%= config.bin %> <%= command.id %> -y -p semver --name my-config --branch main --force',
  ];

  static flags = {
    global: Flags.boolean({
      char: 'g',
      description: '建立全域配置（~/.gitlab-analysis/config.yml）',
      default: false,
    }),
    preset: Flags.string({
      char: 'p',
      description: '使用預設範本',
      options: ['mobile-app', 'date-based', 'semver'],
    }),
    output: Flags.string({
      char: 'o',
      description: '輸出檔案路徑（預設：.gitlab-analysis.yml）',
    }),
    force: Flags.boolean({
      char: 'f',
      description: '強制覆寫既有配置檔案',
      default: false,
    }),
    'non-interactive': Flags.boolean({
      char: 'y',
      description: '非互動模式（適用於 CI/CD，使用預設值或命令列參數）',
      default: false,
    }),
    name: Flags.string({
      description: '配置名稱',
    }),
    description: Flags.string({
      description: '配置描述',
    }),
    branch: Flags.string({
      description: '主幹分支名稱（預設：main）',
    }),
    pattern: Flags.string({
      description: '標籤正則表達式（如未提供則使用 preset 預設值）',
    }),
    'mr-healthy': Flags.integer({
      description: 'MR 數量健康閾值（預設：50）',
    }),
    'mr-warning': Flags.integer({
      description: 'MR 數量警告閾值（預設：100）',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ReleaseInit);
    const nonInteractive = flags['non-interactive'];

    // 非互動模式下的提示訊息
    if (nonInteractive) {
      this.log(chalk.cyan('📝 發布分析配置初始化（非互動模式）\n'));
    } else {
      this.log(chalk.cyan('📝 發布分析配置初始化精靈\n'));
    }

    // 1. 選擇預設範本（非互動模式必須提供）
    let presetChoice = flags.preset;
    if (!presetChoice) {
      if (nonInteractive) {
        this.error(
          '非互動模式必須提供 --preset 參數。有效選項: mobile-app, date-based, semver'
        );
      }
      presetChoice = await input({
        message: '選擇配置範本 (mobile-app/date-based/semver)',
        default: 'mobile-app',
      });
    }

    // 驗證 preset 選擇
    const validPresets = ['mobile-app', 'date-based', 'semver'];
    if (!validPresets.includes(presetChoice)) {
      this.error(
        `無效的 preset: "${presetChoice}"。有效選項: ${validPresets.join(', ')}`
      );
    }

    this.log(
      chalk.green(`✓ 已選擇範本: ${this.getPresetName(presetChoice)}\n`)
    );

    // 2. 載入範本檔案
    const presetPath = this.getPresetPath(presetChoice);
    if (!fs.existsSync(presetPath)) {
      this.error(`找不到範本檔案: ${presetPath}`);
    }

    const templateContent = fs.readFileSync(presetPath, 'utf-8');
    const templateConfig = yaml.load(templateContent) as ReleaseConfiguration;

    // 3. 客製化配置（支援互動式與非互動模式）
    const customConfig = await this.customizeConfig(
      templateConfig,
      presetChoice,
      flags,
      nonInteractive
    );

    // 4. 確定輸出路徑
    const outputPath = this.determineOutputPath(flags);

    // 5. 檢查檔案是否已存在
    if (fs.existsSync(outputPath)) {
      if (nonInteractive && !flags.force) {
        this.error(
          `檔案 "${outputPath}" 已存在。非互動模式下請使用 --force 強制覆寫`
        );
      }

      if (!nonInteractive && !flags.force) {
        const overwrite = await confirm({
          message: `檔案 "${outputPath}" 已存在，是否覆寫？`,
          default: false,
        });
        if (!overwrite) {
          this.log(chalk.yellow('已取消配置初始化'));
          return;
        }
      }
    }

    // 6. 寫入配置檔案
    this.writeConfigFile(outputPath, customConfig);

    // 7. 顯示成功訊息與下一步提示
    this.log(chalk.green(`\n✓ 配置檔案已成功建立: ${outputPath}\n`));

    if (!nonInteractive) {
      this.showNextSteps(outputPath, flags.global || false);
    }
  }

  /**
   * 取得 preset 的中文名稱
   */
  private getPresetName(preset: string): string {
    const names: Record<string, string> = {
      'mobile-app': '行動應用程式年月版本號',
      'date-based': '日期格式發布版本',
      semver: 'Semantic Versioning',
    };
    return names[preset] || preset;
  }

  /**
   * 取得 preset 範本檔案路徑
   */
  private getPresetPath(preset: string): string {
    // 範本檔案在 src/presets/，不會複製到 dist/
    // 從編譯後的位置 (dist/commands/release/init.js) 找到專案根目錄
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const projectRoot = path.resolve(currentDir, '../../../'); // dist/commands/release -> project root
    const presetsDir = path.join(projectRoot, 'src', 'presets');
    return path.join(presetsDir, `${preset}.example.yml`);
  }

  /**
   * 客製化配置（支援互動式與非互動模式）
   */
  private async customizeConfig(
    template: ReleaseConfiguration,
    preset: string,
    flags: any,
    nonInteractive: boolean
  ): Promise<ReleaseConfiguration> {
    let name: string;
    let description: string;
    let defaultBranch: string;
    let tagPattern: string;
    let mrHealthy: number;
    let mrWarning: number;

    if (nonInteractive) {
      // 非互動模式：使用參數或預設值
      name = flags.name || template.name || `my-${preset}-config`;
      description = flags.description || template.description || '';
      defaultBranch = flags.branch || template.analysis?.default_branch || 'main';
      tagPattern = flags.pattern || template.tag?.pattern || '';
      mrHealthy = flags['mr-healthy'] || template.analysis?.thresholds?.mr_count?.healthy || 50;
      mrWarning = flags['mr-warning'] || template.analysis?.thresholds?.mr_count?.warning || 100;

      // 非互動模式下顯示使用的值
      this.log(chalk.gray('使用配置值:'));
      this.log(chalk.gray(`  名稱: ${name}`));
      this.log(chalk.gray(`  描述: ${description || '(無)'}`));
      this.log(chalk.gray(`  分支: ${defaultBranch}`));
      this.log(chalk.gray(`  Pattern: ${tagPattern}`));
      this.log(chalk.gray(`  MR 閾值: ${mrHealthy}/${mrWarning}\n`));
    } else {
      // 互動模式：原有的 input/confirm 流程
      this.log(chalk.cyan('請回答以下問題以客製化配置:\n'));

      // 配置名稱
      name = await input({
        message: '配置名稱',
        default: template.name || `my-${preset}-config`,
      });

      // 配置描述
      description = await input({
        message: '配置描述（選填）',
        default: template.description || '',
      });

      // 主幹分支名稱
      defaultBranch = await input({
        message: '主幹分支名稱',
        default: template.analysis?.default_branch || 'main',
      });

      // 標籤正則表達式（顯示範例）
      this.log(
        chalk.gray(
          `\n範本的標籤 pattern: ${template.tag?.pattern || '(未定義)'}`
        )
      );
      const useDefaultPattern = await confirm({
        message: '是否使用範本的標籤 pattern？',
        default: true,
      });

      tagPattern = template.tag?.pattern || '';
      if (!useDefaultPattern) {
        tagPattern = await input({
          message: '請輸入自訂的標籤正則表達式',
        });
      }

      // MR 數量閾值
      this.log(chalk.cyan('\n設定健康度閾值:'));
      const mrHealthyStr = await input({
        message: 'MR 數量 - 健康上限',
        default: String(template.analysis?.thresholds?.mr_count?.healthy || 50),
      });
      const mrWarningStr = await input({
        message: 'MR 數量 - 警告上限',
        default: String(template.analysis?.thresholds?.mr_count?.warning || 100),
      });

      mrHealthy = Number(mrHealthyStr);
      mrWarning = Number(mrWarningStr);
    }

    // 組裝客製化配置
    const customConfig: ReleaseConfiguration = {
      ...template,
      name,
      description,
      tag: {
        ...template.tag,
        pattern: tagPattern,
        groups: template.tag?.groups || {},
      },
      release_types: template.release_types || {},
      analysis: {
        default_branch: defaultBranch,
        mode: template.analysis?.mode,
        thresholds: {
          mr_count: {
            healthy: Number(mrHealthy),
            warning: Number(mrWarning),
            critical: Number(mrWarning),
          },
          loc_changes: template.analysis?.thresholds?.loc_changes,
          loc_additions: template.analysis?.thresholds?.loc_additions,
          pipeline_success_rate: template.analysis?.thresholds?.pipeline_success_rate,
          mean_time_to_fix_hours: template.analysis?.thresholds?.mean_time_to_fix_hours,
        },
        default_filters: template.analysis?.default_filters,
        pipeline_history_days: template.analysis?.pipeline_history_days || 90,
      },
    };

    return customConfig;
  }

  /**
   * 確定輸出路徑
   */
  private determineOutputPath(flags: {
    global: boolean;
    output?: string;
  }): string {
    if (flags.output) {
      return path.resolve(flags.output);
    }

    if (flags.global) {
      const globalDir = path.join(os.homedir(), '.gitlab-analysis');
      if (!fs.existsSync(globalDir)) {
        fs.mkdirSync(globalDir, { recursive: true });
      }
      return path.join(globalDir, 'config.yml');
    }

    // 預設：專案根目錄的 .gitlab-analysis.yml
    return path.resolve('.gitlab-analysis.yml');
  }

  /**
   * 寫入配置檔案
   */
  private writeConfigFile(
    filePath: string,
    config: ReleaseConfiguration
  ): void {
    const outputDir = path.dirname(filePath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: 100,
      noRefs: true,
    });

    fs.writeFileSync(filePath, yamlContent, 'utf-8');
  }

  /**
   * 顯示下一步提示
   */
  private showNextSteps(outputPath: string, isGlobal: boolean): void {
    this.log(chalk.cyan('下一步:'));
    this.log(
      chalk.gray(
        `1. 驗證配置: ${chalk.white('release:validate-config' + (isGlobal ? ' --global' : ''))}`
      )
    );
    this.log(
      chalk.gray(
        `2. 執行分析: ${chalk.white('release:analyze -p <project>' + (isGlobal ? '' : ' --config ' + path.basename(outputPath)))}`
      )
    );
    this.log(
      chalk.gray(
        `3. 編輯配置: ${chalk.white('vim ' + outputPath)}`
      )
    );

    if (!isGlobal) {
      this.log(
        chalk.yellow(
          `\n⚠️  記得將 "${path.basename(outputPath)}" 加入 .gitignore（避免提交敏感資訊）`
        )
      );
    }
  }
}
