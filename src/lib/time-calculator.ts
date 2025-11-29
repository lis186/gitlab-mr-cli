/**
 * 時間計算器
 *
 * 提供時間間隔計算和格式化功能，用於 MR 時間軸分析
 */

/** 時間轉換常數 */
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * 時間計算器類別
 */
export class TimeCalculator {
  /**
   * 計算兩個時間點之間的間隔（秒數）
   *
   * @param startTime - 開始時間
   * @param endTime - 結束時間
   * @param tolerance - 時間寬容度（秒數），用於處理時鐘同步問題（預設 5 秒）
   * @returns 時間間隔（秒數），若 endTime 早於 startTime 但在容差範圍內，返回 0
   */
  calculateInterval(startTime: Date, endTime: Date, tolerance: number = 5): number {
    if (!(startTime instanceof Date) || isNaN(startTime.getTime())) {
      throw new Error('開始時間無效');
    }

    if (!(endTime instanceof Date) || isNaN(endTime.getTime())) {
      throw new Error('結束時間無效');
    }

    const intervalMs = endTime.getTime() - startTime.getTime();
    const intervalSeconds = intervalMs / MILLISECONDS_PER_SECOND;

    // 若結束時間稍早於開始時間（在容差範圍內），視為 0 秒間隔
    // 這處理時鐘同步問題（如 GitLab 伺服器時間不同步）
    if (intervalSeconds < 0 && Math.abs(intervalSeconds) <= tolerance) {
      return 0;
    }

    // 若結束時間明顯早於開始時間，這是錯誤
    if (intervalSeconds < 0) {
      throw new Error(`結束時間不可早於開始時間（差距: ${Math.abs(intervalSeconds)} 秒）`);
    }

    // 四捨五入到整數秒數（避免顯示小數點）
    return Math.round(intervalSeconds);
  }

  /**
   * 格式化時間長度為人類可讀的字串
   *
   * 格式規則：
   * - < 60 秒：顯示「Xs」
   * - < 60 分鐘：顯示「Xm Ys」
   * - < 24 小時：顯示「Xh Ym」
   * - >= 24 小時：顯示「Xd Yh」
   *
   * @param seconds - 時間長度（秒數）
   * @returns 格式化字串（如「17h 22m」、「2h 4m」、「14m 32s」）
   *
   * @example
   * ```typescript
   * const calc = new TimeCalculator();
   * calc.formatDuration(45);        // '45s'
   * calc.formatDuration(872);       // '14m 32s'
   * calc.formatDuration(7440);      // '2h 4m'
   * calc.formatDuration(62520);     // '17h 22m'
   * calc.formatDuration(105240);    // '1d 5h'
   * ```
   */
  formatDuration(seconds: number): string {
    if (seconds < 0) {
      throw new Error('時間長度不可為負值');
    }

    // 0 秒
    if (seconds === 0) {
      return '0s';
    }

    // < 60 秒：顯示「Xs」
    if (seconds < SECONDS_PER_MINUTE) {
      return `${seconds}s`;
    }

    // < 60 分鐘：顯示「Xm Ys」
    if (seconds < SECONDS_PER_HOUR) {
      const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
      const remainingSeconds = seconds % SECONDS_PER_MINUTE;

      if (remainingSeconds === 0) {
        return `${minutes}m`;
      }
      return `${minutes}m ${remainingSeconds}s`;
    }

    // < 24 小時：顯示「Xh Ym」
    if (seconds < SECONDS_PER_DAY) {
      const hours = Math.floor(seconds / SECONDS_PER_HOUR);
      const remainingMinutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);

      if (remainingMinutes === 0) {
        return `${hours}h`;
      }
      return `${hours}h ${remainingMinutes}m`;
    }

    // >= 24 小時：顯示「Xd Yh」
    const days = Math.floor(seconds / SECONDS_PER_DAY);
    const remainingHours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);

    if (remainingHours === 0) {
      return `${days}d`;
    }
    return `${days}d ${remainingHours}h`;
  }

  /**
   * 格式化日期時間為顯示格式（YYYY-MM-DD HH:mm:ss）
   *
   * @param date - 日期物件
   * @returns 格式化字串
   */
  formatDateTime(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('日期無效');
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
