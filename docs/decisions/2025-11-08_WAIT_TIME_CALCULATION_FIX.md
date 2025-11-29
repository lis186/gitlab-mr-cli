# Wait Time 計算邏輯修復

**日期**: 2025-11-08
**狀態**: ✅ Implemented
**決策者**: User + Claude Code AI
**影響範圍**: mr-batch-compare 命令的所有 Phase 時間計算

---

## 背景

在分析 Android MR 數據時，發現 Wait Time (Pickup Time) 計算結果不合理：

- **35 個 MRs 中，27 個 (77%) 顯示 Wait Time = 0 秒**
- **P50 Wait Time = 0 秒**
- 使用者反饋：「不可能 0 秒」

經過深入分析，發現問題出在 `batch-comparison-service.ts` 的 phase 計算邏輯。

---

## 問題分析

### 錯誤的假設

舊邏輯假設 MR timeline 會有**直接的狀態轉換**：
```
MR Created → First Review
```

因此使用以下程式碼匹配：
```typescript
// 只匹配直接轉換
if (!hasMarkedAsReady && from === KeyState.MR_CREATED &&
    (to === KeyState.FIRST_HUMAN_REVIEW || to === KeyState.FIRST_AI_REVIEW)) {
  waitDuration += segment.durationSeconds;
}
```

### 實際情況

但實際上，大多數 MRs 在創建後會繼續 commit，時間軸是：
```
MR Created → First Commit → First Review
```

這會產生兩個 segments：
1. `MR Created → First Commit` (duration: 58,817 秒)
2. `First Commit → First Review` (duration: 14,451 秒)

### 匹配失敗

- Segment 1: `from=MR_CREATED`, `to=FIRST_COMMIT` → **不匹配** Wait 條件 ❌
- Segment 2: `from=FIRST_COMMIT`, `to=FIRST_REVIEW` → 匹配 **Review** 條件 ❌

結果：Wait Time = 0 秒，兩個 segments 的時間都被誤算或遺失。

---

## 決策過程

### 選項評估

我們評估了三種修復方案：

#### Option A: 模式匹配增強（治標）
**方法**: 加更多 if-else 規則來匹配缺失的模式

```typescript
else if (from === KeyState.MR_CREATED && to === KeyState.FIRST_COMMIT) {
  waitDuration += segment.durationSeconds;
}
else if (from === KeyState.FIRST_COMMIT && to === KeyState.FIRST_REVIEW) {
  waitDuration += segment.durationSeconds;
}
```

**優點**:
- 修改最小
- 保持現有結構

**缺點**:
- ❌ 脆弱：每次新模式出現就要加新規則
- ❌ 難以維護：要列舉所有可能組合
- ❌ 語意不清：為什麼這個轉換是 wait？

**評分**: ⭐⭐

#### Option B: 時間範圍分類（治本） ← **採用**
**方法**: Phase 由**時間範圍**定義，而非**狀態轉換模式**

```typescript
const waitStartTime = markedAsReadyTime || mrCreatedTime;
const waitEndTime = firstReviewTime;

if (segmentStartTime >= waitStartTime && segmentEndTime <= waitEndTime) {
  waitDuration += segment.durationSeconds;  // 自動匹配所有模式
}
```

**優點**:
- ✅ 語意清晰：Wait = 等待審查的時間區間
- ✅ 自動處理所有模式：不需列舉狀態轉換
- ✅ 符合業界標準（LinearB Pickup Time）
- ✅ 易於理解和維護

**缺點**:
- ⚠️ 需要重構較多程式碼
- ⚠️ 需要正確處理邊界情況

**評分**: ⭐⭐⭐⭐⭐

#### Option C: 直接事件計算（最簡單但有缺陷）
**方法**: 繞過 segments，直接從 events 計算

```typescript
waitDuration = firstReviewTime - mrCreatedTime;
```

**優點**:
- ✅ 最簡單直接
- ✅ 不依賴 segment 結構

**缺點**:
- ❌ 失去粒度：看不到等待期間發生了什麼
- ❌ 與現有架構不一致（破壞 segment 層級）
- ❌ 無法提供時間分段的 intensity 資訊

**評分**: ⭐⭐⭐

### 最終決定

**選擇 Option B**：時間範圍分類法

**理由**:
1. **語意正確性**: Wait Time 本質上是一個時間區間，不是狀態轉換
2. **自動處理**: 不需要列舉所有可能的 segment 模式
3. **業界對齊**: 符合 LinearB Pickup Time 定義
4. **長期維護性**: 邏輯清晰，易於擴展

**使用者確認**:
- Wait Time 定義: "MR Created → First Review 總時間（含作者活動）"
- 修復方式: "方案 B：改用時間範圍分類 segments"
- 歷史數據: "重新生成所有受影響的報告"

---

## 實作細節

### 核心變更

#### 1. 新增 `getPhaseBoundaryTimestamps()` 方法

```typescript
private getPhaseBoundaryTimestamps(timelineData: MRTimeline): {
  mrCreatedTime: number;
  markedAsReadyTime: number | null;
  firstReviewTime: number | null;
  approvedTime: number | null;
  mergedTime: number | null;
} {
  // 掃描所有事件，找出關鍵時間戳記（毫秒）
  for (const event of events) {
    if (event.eventType === EventType.MARKED_AS_READY) {
      markedAsReadyTime = event.timestamp.getTime();
    }
    if (event.eventType === EventType.AI_REVIEW_STARTED) {
      firstAIReviewTime = event.timestamp.getTime();
    }
    // ... 其他事件類型
  }

  // 取 AI 和 Human Review 最早時間
  firstReviewTime = Math.min(firstAIReviewTime, firstHumanReviewTime);

  return { ... };
}
```

#### 2. 重構 `calculateTimelinePhases()` 邏輯

**舊邏輯** (狀態轉換模式匹配):
```typescript
for (const segment of segments) {
  const from = segment.from;
  const to = segment.to;

  if (from === KeyState.MR_CREATED && to === KeyState.FIRST_REVIEW) {
    waitDuration += segment.durationSeconds;
  }
  // ... 需要列舉所有可能組合
}
```

**新邏輯** (時間範圍分類):
```typescript
const timestamps = this.getPhaseBoundaryTimestamps(timelineData);
const waitStartTime = timestamps.markedAsReadyTime || timestamps.mrCreatedTime;

for (const segment of segments) {
  const segmentStartTime = segment.fromEvent.timestamp.getTime();
  const segmentEndTime = segment.toEvent.timestamp.getTime();

  // Wait 階段: 時間區間內的所有 segments
  if (firstReviewTime !== null &&
      segmentStartTime >= waitStartTime &&
      segmentEndTime <= firstReviewTime) {
    waitDuration += segment.durationSeconds;  // 自動匹配
  }
  // ... 其他階段分類
}
```

### 邊界情況處理

#### 1. 無審查事件
```typescript
// 如果 MR 從未被審查，整個週期都算 Wait
if (firstReviewTime === null && segmentStartTime >= waitStartTime) {
  waitDuration += segment.durationSeconds;
}
```

#### 2. Draft MR
```typescript
// Draft MR: Wait 從 Marked as Ready 開始
const waitStartTime = markedAsReadyTime !== null
  ? markedAsReadyTime
  : mrCreatedTime;
```

#### 3. Dev 階段（MR Created 之前）
```typescript
// Dev 階段:
// 1. MR Created 之前的所有時間
// 2. Draft 期間 (MR Created → Marked as Ready)
if (segmentEndTime <= mrCreatedTime) {
  devDuration += segment.durationSeconds;
} else if (markedAsReadyTime !== null &&
           segmentStartTime >= mrCreatedTime &&
           segmentEndTime <= markedAsReadyTime) {
  devDuration += segment.durationSeconds;
}
```

---

## 驗證結果

### 單一 MR 驗證

**MR #4814** (feat: Smartlook):
```
Timeline:
  2025-07-31 10:58:46 - MR Created
  2025-08-01 03:19:04 - First Commit (+16.3h)
  2025-08-01 07:19:55 - First Review (+4.0h)
```

| 階段 | 修復前 | 修復後 | 狀態 |
|------|--------|--------|------|
| Wait Time | 0 秒 | 73,269 秒 (20.4h) | ✅ |
| Review Time | 2,082,799 秒 | 2,068,348 秒 | ✅ |

**MR #4811** (fix: SearchView):
```
Timeline:
  2025-07-30 02:50:20 - MR Created
  ... (commits)
  2025-07-30 07:28:27 - First Review (+4.6h)
```

| 階段 | 修復前 | 修復後 | 狀態 |
|------|--------|--------|------|
| Wait Time | 16,707 秒 | 16,707 秒 (4.6h) | ✅ |
| Review Time | 5,746 秒 | 5,746 秒 (1.6h) | ✅ |

### 批次驗證

**Android Human Only (2025-05-01 to 2025-07-31)**:

| 指標 | 修復前 | 修復後 | 改善 |
|------|--------|--------|------|
| Total MRs | 35 | 24 | CI Bot 過濾 |
| Wait = 0 的 MRs | 27 (77%) | 3 (12.5%) | ✅ -65% |
| Wait Time P50 | 0 秒 | 16,733 秒 (4.6h) | ✅ 修正 |
| Review Time P50 | 14,400 秒 (4.0h) | 5,855 秒 (1.6h) | ✅ 更準確 |

---

## 影響分析

### 正面影響

1. ✅ **數據準確性**: 77% 的 MRs 從錯誤的 0 秒修正為正確值
2. ✅ **語意清晰**: 符合 LinearB Pickup Time 業界標準定義
3. ✅ **程式碼可維護性**: 邏輯清晰，不需列舉狀態轉換
4. ✅ **團隊洞察**: 可正確評估審查響應速度

### 潛在風險

1. ⚠️ **歷史資料不一致**: 舊報告使用錯誤數據
   - **緩解**: 重新生成所有報告，舊報告加註修復日期

2. ⚠️ **統計值變化**: Wait Time 從 0s 變為數小時可能引起疑慮
   - **緩解**: 提供詳細的 bug 修復報告說明原因

3. ⚠️ **邊界情況**: 可能有其他未預見的 segment 模式
   - **緩解**: 持續監控，必要時調整邏輯

---

## 相關檔案

- **實作**: src/services/batch-comparison-service.ts
- **測試**: tests/integration/mr-batch-compare.test.ts (待新增)
- **文件**:
  - WAIT_TIME_BUG_FIX_IMPACT_REPORT.md
  - CLAUDE.md (Recent Changes)
  - PICKUP_TIME_CLARIFICATION.md (語意定義)
  - LINEARB_STAGE_MAPPING.md (業界標準對照)

---

## 經驗教訓

1. **語意優先於實作**: Phase 定義應該基於時間區間語意，而非技術實作的狀態轉換
2. **業界標準對齊**: 參考 LinearB 等業界標準可避免語意歧義
3. **數據驗證重要性**: 使用者的「不可能 0 秒」直覺是發現 bug 的關鍵
4. **逐步驗證**: 先用單一 MR 驗證，再批次驗證，確保修復正確

---

## 後續行動

### 已完成 ✅

1. ✅ 修復核心邏輯
2. ✅ 驗證 MR #4814 和 #4811
3. ✅ 批次驗證 Android 資料
4. ✅ 更新 CLAUDE.md
5. ✅ 建立影響報告
6. ✅ 建立決策記錄

### 待辦 ⏳

1. ⏳ 重新生成所有受影響專案的資料
2. ⏳ 更新 AI_VS_HUMAN_REVIEW_COMPARISON_2025.md
3. ⏳ 新增單元測試覆蓋所有 segment patterns
4. ⏳ 考慮建立 phase 分類的視覺化驗證工具

---

**決策記錄建立日期**: 2025-11-08
**最後更新**: 2025-11-08
**版本**: 1.0
