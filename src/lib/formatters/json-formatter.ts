/**
 * Release Analysis JSON Formatter
 *
 * 將發布品質分析結果格式化為 JSON 輸出
 *
 * @module lib/formatters/json-formatter
 */

import type {
  IOutputFormatter,
  FormatterInput,
  JsonOutput,
  JsonRelease,
  JsonMetrics,
  JsonTrends,
} from '../../types/release-output.js'

/**
 * JSON Formatter 實作
 *
 * 格式化發布品質分析結果為 JSON 輸出（機器可讀格式）
 */
export class JsonFormatter implements IOutputFormatter {
  private readonly pretty: boolean
  private readonly indent: number

  /**
   * 建立 JSON 格式化器
   *
   * @param options - 格式化選項
   * @param options.pretty - 是否美化輸出（預設 true）
   * @param options.indent - 縮排空格數（預設 2）
   */
  constructor(options: { pretty?: boolean; indent?: number } = {}) {
    this.pretty = options.pretty ?? true
    this.indent = options.indent ?? 2
  }

  /**
   * 格式化完整分析輸出
   */
  format(data: FormatterInput): string {
    const output: JsonOutput = {
      metadata: data.metadata,
      releases: data.releases,
      metrics: data.metrics,
      trends: data.trends,
    }

    return this.stringify(output)
  }

  /**
   * 格式化發布列表
   */
  formatReleases(releases: JsonRelease[]): string {
    return this.stringify({ releases })
  }

  /**
   * 格式化指標摘要
   */
  formatMetrics(metrics: JsonMetrics): string {
    return this.stringify({ metrics })
  }

  /**
   * 格式化趨勢分析
   */
  formatTrends(trends: JsonTrends | undefined): string {
    if (!trends) {
      return this.stringify({ trends: null })
    }
    return this.stringify({ trends })
  }

  /**
   * 序列化為 JSON 字串
   *
   * @param data - 要序列化的資料
   * @returns JSON 字串
   */
  private stringify(data: unknown): string {
    if (this.pretty) {
      return JSON.stringify(data, null, this.indent)
    }
    return JSON.stringify(data)
  }
}
