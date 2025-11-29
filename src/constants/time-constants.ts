/**
 * Time Conversion Constants
 * Feature: 013-mr-phase-filters
 *
 * 用於週期時間分析和階段過濾的時間轉換常數。
 * 遵循專案慣例（參考 commit-analysis.ts）。
 */

/**
 * 時間單位轉換常數
 *
 * @remarks
 * 用於階段天數計算（durationSeconds / SECONDS_PER_DAY）
 * 和時間格式化顯示。
 */
export const TIME_CONSTANTS = {
  /** Seconds in one minute (60s) */
  SECONDS_PER_MINUTE: 60,

  /** Seconds in one hour (3,600s) */
  SECONDS_PER_HOUR: 3600,

  /** Seconds in one day (86,400s = 24 hours) */
  SECONDS_PER_DAY: 86400,

  /** Seconds in one week (604,800s = 7 days) */
  SECONDS_PER_WEEK: 604800,

  /** Milliseconds in one second (1,000ms) */
  MS_PER_SECOND: 1000,
} as const;

/**
 * 浮點數比較容錯值
 *
 * @remarks
 * 用於處理浮點數運算的精度問題（例如：0.1 + 0.2 !== 0.3）。
 * 當前僅作為參考，尚未在階段過濾邏輯中使用（T020: 待優化）。
 *
 * @see https://0.30000000000000004.com/
 */
export const COMPARISON_TOLERANCE = {
  /**
   * 預設 epsilon 值（1e-10）
   * 用於一般浮點數比較
   */
  DEFAULT_EPSILON: 1e-10,

  /**
   * 百分比比較容錯值（0.01%）
   * 考慮到百分比已四捨五入到小數點 1 位
   */
  PERCENTAGE_EPSILON: 0.01,

  /**
   * 天數比較容錯值（約 0.000012 天 ≈ 1 秒）
   * 用於 durationSeconds / SECONDS_PER_DAY 的比較
   */
  DAYS_EPSILON: 1 / 86400,
} as const;
