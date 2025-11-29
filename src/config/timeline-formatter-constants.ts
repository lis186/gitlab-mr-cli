/**
 * 時間軸表格格式化器常數
 *
 * 集中管理 TimelineTableFormatter 中的所有魔數，便於維護和調整
 */

/**
 * 事件時間軸表格的列寬配置
 * 對應列順序: # | 時間 | 星期 | 操作者 | 角色 | 事件類型 | 間隔
 */
export const TIMELINE_EVENTS_TABLE_COL_WIDTHS = [5, 17, 6, 16, 10, 35, 11] as const;

/**
 * AI 反應摘要表格的列寬配置
 * 對應列順序: 嚴重性 | 表情符號 | 計數
 */
export const AI_REACTIONS_TABLE_COL_WIDTHS = [12, 12, 8, 26] as const;

/**
 * 統計摘要表格的列寬配置
 * 對應列順序: 指標 | 數值
 */
export const STATS_SUMMARY_TABLE_COL_WIDTHS = [14, 8, 42] as const;

/**
 * 中文工作日字符陣列 (週日到週六)
 * 用於時間軸表格的星期顯示
 */
export const CHINESE_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

/**
 * 週期時間摘要表格配置
 */
export const CYCLE_TIME_SUMMARY_TABLE_CONFIG = {
  /** 週期時間統計表的列寬 */
  colWidths: [20, 15] as const,
} as const;

/**
 * Emoji 嚴重性等級映射
 * 將 emoji 符號映射到嚴重性級別
 */
export const EMOJI_SEVERITY_MAP = {
  '🔴': 'critical',
  '🟠': 'warning',
  '🟡': 'caution',
  '🟢': 'info',
} as const;

/**
 * 嚴重性優先級順序
 * 用於在消息中包含多個 emoji 時選擇最高優先級
 */
export const SEVERITY_PRIORITY_ORDER = ['🔴', '🟠', '🟡', '🟢'] as const;

/**
 * 消息前綴長度（字符）
 * 用於嚴重性提取時檢查消息的開頭部分
 */
export const MESSAGE_PREFIX_LENGTH = 100;

/**
 * 嚴重性標籤文字（中文）
 */
export const SEVERITY_LABELS = {
  critical: '🔴 Critical',
  warning: '🟠 Warning',
  caution: '🟡 Caution',
  info: '🟢 Info',
} as const;
