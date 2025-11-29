/**
 * MR 週期時間 JSON 格式化器
 *
 * 將週期時間分析結果格式化為 JSON 輸出
 *
 * @module formatters/cycle-time-json-formatter
 */

import type { AnalysisResult } from '../types/cycle-time.js'

/**
 * 格式化分析結果為 JSON
 *
 * @param result - 分析結果
 * @returns JSON 字串（格式化，縮排 2 空格）
 */
export function formatCycleTimeJson(result: AnalysisResult): string {
  // 直接輸出 AnalysisResult，已符合 contracts/analysis-result.json schema
  return JSON.stringify(result, null, 2)
}
