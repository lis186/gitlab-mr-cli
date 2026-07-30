/**
 * release:validate-config 命令 - 配置驗證
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
import Table from 'cli-table3';
import { ConfigValidator } from '../../services/config/config-validator.js';
import type { ReleaseConfiguration } from '../../types/release-config.js';

/**
 * release:validate-config 命令類別
 */
export default class ReleaseValidateConfig extends Command {
  static description = '驗證發布分析配置檔案 - 檢查格式正確性並測試標籤 pattern';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --config custom-config.yml',
    '<%= config.bin %> <%= command.id %> --global',
    '<%= config.bin %> <%= command.id %> --test-tags "AppStore25.10.0,AppStore25.9.5"',
  ];

  static flags = {
    config: Flags.string({
      char: 'c',
      description: '配置檔案路徑（預設：.gitlab-analysis.yml）',
    }),
    global: Flags.boolean({
      char: 'g',
      description: '驗證全域配置（~/.gitlab-analysis/config.yml）',
      default: false,
    }),
    'test-tags': Flags.string({
      description: '測試標籤清單（逗號分隔，用於測試 pattern 匹配）',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: '顯示詳細訊息',
      default: false,
    }),
  };

  private validator: ConfigValidator;

  constructor(argv: string[], config: any) {
    super(argv, config);
    this.validator = new ConfigValidator();
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ReleaseValidateConfig);

    this.log(chalk.cyan('🔍 配置檔案驗證\n'));

    // 1. 確定配置檔案路徑
    const configPath = this.determineConfigPath(flags);

    if (!fs.existsSync(configPath)) {
      this.error(
        chalk.red(
          `配置檔案不存在: ${configPath}\n\n` +
            `提示：執行 ${chalk.white('release:init')} 建立新配置`
        )
      );
    }

    this.log(chalk.gray(`檢查配置檔案: ${configPath}\n`));

    // 2. 載入配置檔案
    let rawConfig: unknown;
    try {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      rawConfig = yaml.load(fileContent);
    } catch (error) {
      this.error(
        chalk.red(
          `無法載入配置檔案:\n${error instanceof Error ? error.message : String(error)}`
        )
      );
    }

    // 3. 驗證配置結構
    const validationResult = await this.validator.validate(rawConfig);

    if (!validationResult.valid) {
      this.log(chalk.red('✗ 配置驗證失敗\n'));
      this.displayValidationErrors(validationResult.errors);
      this.exit(1);
    }

    const config = rawConfig as ReleaseConfiguration;
    this.log(chalk.green('✓ 配置結構驗證通過\n'));

    // 4. 驗證標籤 pattern
    const patternResult = this.validatePattern(config);
    if (!patternResult.valid) {
      this.log(chalk.red('✗ 標籤 pattern 驗證失敗\n'));
      this.log(chalk.red(`錯誤: ${patternResult.error}\n`));
      this.exit(1);
    }

    this.log(chalk.green('✓ 標籤 pattern 驗證通過\n'));

    // 5. 測試標籤匹配（如果提供 --test-tags）
    if (flags['test-tags']) {
      const testTags = flags['test-tags'].split(',').map((t) => t.trim());
      this.testTagMatching(config, testTags);
    }

    // 6. 顯示配置摘要
    if (flags.verbose) {
      this.displayConfigSummary(config);
    }

    // 7. 最終結果
    this.log(chalk.green('✓ 配置驗證完成，所有檢查通過\n'));

    // 8. 顯示建議
    this.displayRecommendations(config, configPath);
  }

  /**
   * 確定配置檔案路徑
   */
  private determineConfigPath(flags: {
    config?: string;
    global: boolean;
  }): string {
    if (flags.config) {
      return path.resolve(flags.config);
    }

    if (flags.global) {
      return path.join(os.homedir(), '.gitlab-analysis', 'config.yml');
    }

    return path.resolve('.gitlab-analysis.yml');
  }

  /**
   * 驗證標籤 pattern
   */
  private validatePattern(config: ReleaseConfiguration): {
    valid: boolean;
    error?: string;
  } {
    if (!config.tag?.pattern) {
      return {
        valid: false,
        error: '配置中缺少 tag.pattern 定義',
      };
    }

    return this.validator.validateTagPattern(config.tag.pattern);
  }

  /**
   * 測試標籤匹配
   */
  private testTagMatching(
    config: ReleaseConfiguration,
    testTags: string[]
  ): void {
    this.log(chalk.cyan('測試標籤匹配:\n'));

    const pattern = config.tag?.pattern;
    if (!pattern) {
      this.log(chalk.red('錯誤: 配置中缺少 tag.pattern'));
      return;
    }

    const regex = new RegExp(pattern);
    const table = new Table({
      head: [
        chalk.cyan('標籤名稱'),
        chalk.cyan('匹配結果'),
        chalk.cyan('擷取群組'),
      ],
      colWidths: [30, 15, 50],
      wordWrap: true,
    });

    for (const tag of testTags) {
      const match = regex.exec(tag);
      if (match) {
        const groups = Array.from(match)
          .slice(1)
          .map((g, i) => `[${i + 1}]=${g}`)
          .join(', ');
        table.push([
          tag,
          chalk.green('✓ 匹配'),
          chalk.gray(groups || '(無擷取群組)'),
        ]);
      } else {
        table.push([tag, chalk.red('✗ 不匹配'), chalk.gray('-')]);
      }
    }

    this.log(table.toString());
    this.log('');
  }

  /**
   * 顯示驗證錯誤
   */
  private displayValidationErrors(
    errors: Array<{ path: string; message: string; code: string }>
  ): void {
    this.log(chalk.red('發現以下錯誤:\n'));

    const table = new Table({
      head: [chalk.red('欄位路徑'), chalk.red('錯誤訊息')],
      colWidths: [30, 70],
      wordWrap: true,
    });

    for (const error of errors) {
      table.push([error.path || '(root)', error.message]);
    }

    this.log(table.toString());
    this.log('');

    // 提供修復建議
    this.log(chalk.yellow('修復建議:'));
    this.log(
      chalk.gray(
        '1. 檢查配置檔案的 YAML 格式是否正確（縮排、引號、冒號）'
      )
    );
    this.log(
      chalk.gray(
        '2. 參考範本檔案: src/presets/mobile-app.example.yml'
      )
    );
    this.log(
      chalk.gray(
        '3. 執行 release:init 重新產生配置檔案'
      )
    );
    this.log('');
  }

  /**
   * 顯示配置摘要
   */
  private displayConfigSummary(config: ReleaseConfiguration): void {
    this.log(chalk.cyan('配置摘要:\n'));

    const summaryTable = new Table({
      colWidths: [30, 70],
      wordWrap: true,
    });

    summaryTable.push(
      ['配置名稱', config.name || '(未命名)'],
      ['配置描述', config.description || '(無描述)'],
      ['標籤 pattern', config.tag?.pattern || '(未定義)'],
      [
        '主幹分支',
        config.analysis?.default_branch || '(未定義)',
      ],
      [
        '發布類型數量',
        String(Object.keys(config.release_types || {}).length),
      ],
      [
        'MR 健康閾值',
        `<${config.analysis?.thresholds?.mr_count?.healthy || 'N/A'}`,
      ],
      [
        'MR 警告閾值',
        `≤${config.analysis?.thresholds?.mr_count?.warning || 'N/A'}`,
      ]
    );

    this.log(summaryTable.toString());
    this.log('');

    // 顯示發布類型清單
    if (config.release_types && Object.keys(config.release_types).length > 0) {
      this.log(chalk.cyan('定義的發布類型:\n'));

      const typeTable = new Table({
        head: [
          chalk.cyan('類型 ID'),
          chalk.cyan('名稱'),
          chalk.cyan('優先級'),
          chalk.cyan('規則數量'),
        ],
        colWidths: [15, 25, 10, 15],
      });

      for (const [typeId, typeConfig] of Object.entries(
        config.release_types
      )) {
        typeTable.push([
          typeId,
          typeConfig.name,
          String(typeConfig.priority),
          String(typeConfig.rules?.length || 0),
        ]);
      }

      this.log(typeTable.toString());
      this.log('');
    }
  }

  /**
   * 顯示建議
   */
  private displayRecommendations(
    config: ReleaseConfiguration,
    configPath: string
  ): void {
    this.log(chalk.cyan('建議:\n'));

    const recommendations: string[] = [];

    // 檢查是否缺少常見欄位
    if (!config.description) {
      recommendations.push('建議加入配置描述 (description) 以說明用途');
    }

    if (
      !config.analysis?.default_filters ||
      !config.analysis.default_filters.exclude_tags ||
      config.analysis.default_filters.exclude_tags.length === 0
    ) {
      recommendations.push(
        '建議設定 analysis.default_filters.exclude_tags 以排除測試標籤'
      );
    }

    if (
      !config.release_types ||
      Object.keys(config.release_types).length === 0
    ) {
      recommendations.push(
        '警告: 未定義任何發布類型 (release_types)，將無法分類發布'
      );
    }

    // 檢查閾值是否合理
    const mrWarning = config.analysis?.thresholds?.mr_count?.warning;
    const mrHealthy = config.analysis?.thresholds?.mr_count?.healthy;
    if (
      mrWarning !== undefined &&
      mrHealthy !== undefined &&
      mrWarning <= mrHealthy
    ) {
      recommendations.push(
        `警告: MR 警告閾值 (${mrWarning}) 應大於健康閾值 (${mrHealthy})`
      );
    }

    // 輸出建議
    if (recommendations.length > 0) {
      for (const [index, rec] of recommendations.entries()) {
        this.log(chalk.gray(`${index + 1}. ${rec}`));
      }
      this.log('');
    } else {
      this.log(chalk.green('配置看起來很完善！\n'));
    }

    // 下一步提示
    this.log(chalk.cyan('下一步:'));
    this.log(
      chalk.gray(
        `執行分析: ${chalk.white('release:analyze -p <project> --config ' + path.basename(configPath))}`
      )
    );
    this.log('');
  }
}
