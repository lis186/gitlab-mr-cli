/**
 * 正體中文語言檔
 * 集中管理所有用戶面向的中文字串
 */

export const zhTW = {
  trend: {
    command: {
      description: '分析專案的合併頻率趨勢',
      noData: '指定時間範圍內無合併記錄',
      loading: '正在查詢資料...',
      analysing: '正在分析趨勢...',
      querying: '正在查詢專案資料...',
      progress: '已處理 {current} / {total} 筆記錄...'
    },
    table: {
      headers: {
        date: '日期',
        week: '週次',
        month: '月份',
        mergeCount: '合併次數',
        avgPerDeveloper: '人均合併數',
        activeDevelopers: '活躍開發者',
        batchSizeStatus: '小批量狀態'
      }
    },
    statistics: {
      total: '總計',
      average: '平均',
      summary: '摘要',
      totalMerges: '總合併次數',
      totalActiveDevelopers: '總活躍開發者數',
      overallAvgMergesPerDeveloper: '整體人均合併數',
      weeklyAverageMerges: '週平均合併數',
      weeklyAvgMergesPerDeveloper: '週人均合併數',
      batchHealthy: '✓ 符合小批量工作模式（週人均 >= {threshold}）',
      batchUnhealthy: '✗ 未達小批量標準（週人均 < {threshold}）',
      suggestion: '建議：增加合併頻率，減少每次變更的規模，採用小步快跑的開發模式'
    },
    errors: {
      invalidPeriod: '無效的時間範圍格式。支援格式：7d, 30d, 90d, 6m, 1y',
      invalidDateFormat: '無效的日期格式。請使用 ISO 8601 格式（例如：2025-01-01）',
      invalidDateRange: '結束日期不能早於開始日期',
      invalidInput: '輸入格式錯誤',
      projectNotFound: '找不到指定的專案或沒有存取權限',
      apiRateLimit: 'GitLab API 速率限制，請稍後再試',
      rateLimitRetry: '⚠️  觸發 GitLab API 速率限制，將在 {seconds} 秒後自動重試（第 {attempt}/{maxAttempts} 次）...',
      rateLimitExhausted: 'GitLab API 速率限制：已達最大重試次數，請稍後再試',
      noPermission: '沒有讀取此專案 MR 的權限，請檢查 Token 權限',
      authError: 'GitLab 認證失敗。請檢查 GITLAB_TOKEN 環境變數',
      apiError: 'GitLab API 發生錯誤',
      networkError: '網路連線失敗，請檢查網路連線或稍後再試',
      unexpectedError: '發生未預期的錯誤'
    },
    warnings: {
      missingMergedAt: '警告：{count} 個 MR 因缺少合併時間而被排除',
      largeTimeRange: '警告：查詢時間範圍較大（超過 1 年），建議使用月彙總模式以提升效能'
    }
  }
}

/**
 * 字串模板替換工具
 * @example replaceTemplate("Hello {name}", { name: "World" }) => "Hello World"
 */
export function replaceTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''))
}
