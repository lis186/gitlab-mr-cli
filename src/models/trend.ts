/**
 * 合併頻率趨勢分析 - 資料模型
 *
 * 本檔案定義時間範圍、趨勢資料點和頻率趨勢等核心模型
 */

/**
 * 時間粒度列舉
 */
export enum TimeGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month'
}

/**
 * 時間範圍介面
 */
export interface TimePeriod {
  /** 開始日期（包含） */
  startDate: Date

  /** 結束日期（包含） */
  endDate: Date

  /** 時間粒度 */
  granularity: TimeGranularity

  /** 時間範圍天數（計算屬性） */
  readonly daysCount: number

  /** 時間範圍週數（計算屬性） */
  readonly weeksCount: number
}

/**
 * 時間範圍實作類別
 */
export class TimePeriodImpl implements TimePeriod {
  constructor(
    public startDate: Date,
    public endDate: Date,
    public granularity: TimeGranularity
  ) {
    this.validate()
  }

  get daysCount(): number {
    const diff = this.endDate.getTime() - this.startDate.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1 // +1 因為包含起始和結束日
  }

  get weeksCount(): number {
    return Math.ceil(this.daysCount / 7)
  }

  private validate(): void {
    if (this.endDate < this.startDate) {
      throw new Error('結束日期不能早於開始日期')
    }
  }
}

/**
 * 趨勢資料點 - 代表單一時間點的統計資料
 */
export interface TrendDataPoint {
  /** 時間點標籤（例如：'2025-10-15', '2025-W42', '2025-10'） */
  timeLabel: string

  /** 時間點開始日期 */
  periodStart: Date

  /** 時間點結束日期 */
  periodEnd: Date

  /** 該時間點的合併數量 */
  mergeCount: number

  /** 該時間點的活躍開發者 ID 集合 */
  activeDeveloperIds: Set<number>

  /** 該時間點的活躍開發者數量（計算屬性） */
  readonly activeDeveloperCount: number

  /** 該時間點的人均合併數（計算屬性） */
  readonly avgMergesPerDeveloper: number
}

/**
 * 趨勢資料點實作類別
 */
export class TrendDataPointImpl implements TrendDataPoint {
  constructor(
    public timeLabel: string,
    public periodStart: Date,
    public periodEnd: Date,
    public mergeCount: number,
    public activeDeveloperIds: Set<number>
  ) {}

  get activeDeveloperCount(): number {
    return this.activeDeveloperIds.size
  }

  get avgMergesPerDeveloper(): number {
    if (this.activeDeveloperCount === 0) return 0
    return this.mergeCount / this.activeDeveloperCount
  }
}

/**
 * 頻率趨勢 - 完整的合併頻率趨勢分析結果
 */
export interface FrequencyTrend {
  /** 查詢的專案識別 */
  projectId: string

  /** 查詢的時間範圍 */
  timePeriod: TimePeriod

  /** 時間序列資料點（按時間排序） */
  dataPoints: TrendDataPoint[]

  /** 查詢時間戳 */
  queriedAt: Date
}
