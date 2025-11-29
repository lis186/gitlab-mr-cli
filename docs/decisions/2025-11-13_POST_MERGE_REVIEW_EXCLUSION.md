# Post-Merge Review Exclusion

**日期**: 2025-11-11
**狀態**: ✅ Implemented
**相關 Commits**: 6cc3c65, 6b8d279, 05d42b0

## 📋 決策

排除在 MR 合併後發生的審查事件（post-merge reviews），不計入統計分析。

## 🎯 理由

### 1. 統計準確性

Post-merge reviews 不是正常開發流程的一部分，包含它們會：
- **扭曲 Review Time 指標**: 合併後的測試性審查拉長平均審查時間
- **混淆 Cycle Time**: 實際的開發週期在 merge 時已結束
- **誤導改進方向**: 讓團隊以為審查流程有問題，實際上是測試行為

### 2. 真實世界行為

Post-merge reviews 通常是：
- 測試審查流程的實驗性留言
- 自動化測試觸發的 Bot 留言
- 團隊成員的學習性審查
- 與實際程式碼審查流程無關的活動

### 3. 符合業界標準

LinearB、DORA Metrics 等工具都排除 post-merge 活動，只計算 merge 前的工作。

## 🔧 實作

### 位置
`src/services/mr-timeline-service.ts`

### 邏輯
```typescript
// 3. 評論事件（AI Review、Human Review 或 Approved）
// 先按時間排序 notes，確保 hasEarlierAIReview 邏輯正確
const sortedNotes = notes.sort((a, b) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
);

for (const note of sortedNotes) {
  const noteTime = new Date(note.created_at);

  // Skip post-merge reviews for statistical accuracy
  if (mrMergedAt && noteTime > mrMergedAt) {
    continue; // Post-merge review - exclude from analysis
  }

  // ... normal event processing
}
```

### 影響範圍

**排除的事件**:
- ✅ Post-merge 的 Human Review 留言
- ✅ Post-merge 的 AI Review 留言
- ✅ Post-merge 的 Author Response

**不受影響**:
- ✅ Draft 期間的審查（仍然計入）
- ✅ Merge 前的所有審查活動
- ✅ Approval 事件（通常在 merge 前）

## 📊 範例場景

### 場景 1: 正常流程
```
10:00 - MR Created
10:30 - AI Review (✅ 計入)
11:00 - Human Review (✅ 計入)
12:00 - Approved
12:05 - Merged
```
**結果**: 所有審查都計入統計

### 場景 2: Post-Merge 測試
```
10:00 - MR Created
10:30 - AI Review (✅ 計入)
11:00 - Approved
11:05 - Merged
------ POST-MERGE ------
15:00 - Test Review (❌ 排除)
16:00 - Another Test (❌ 排除)
```
**結果**: 只有 10:30 的 AI Review 計入，post-merge 的測試留言被排除

### 場景 3: Draft MR
```
10:00 - MR Created (Draft)
10:30 - Review Comment (✅ 計入 - Draft 期間仍計算)
11:00 - Marked as Ready
11:30 - AI Review (✅ 計入)
12:00 - Merged
```
**結果**: Draft 期間的審查仍然計入，這是正常的開發流程

## ❓ 常見問題

### Q1: 為什麼 Draft 期間的審查不排除？

Draft 期間的審查是正常開發流程的一部分。開發者可能：
- 徵求早期反饋
- 進行 WIP (Work In Progress) 審查
- 與團隊討論設計決策

這些都應該計入實際的 Review Time。

### Q2: 這會影響歷史資料嗎？

不會。這個過濾邏輯在查詢時動態執行，不會修改原始資料。重新執行分析會得到更新後的結果。

### Q3: 如何驗證某個審查是否被排除？

使用 `--verbose` 模式執行 mr-timeline 命令：
```bash
npm run mr-timeline -- <project-id> <mr-iid> --verbose
```

會顯示哪些事件被排除以及原因。

## 📝 相關文檔

- [MR Timeline Service](../../src/services/mr-timeline-service.ts)
- [Hybrid Reviewer Configuration](./IOS_AI_COVERAGE_INVESTIGATION.md)
- [Wait Time Bug Fix](./WAIT_TIME_BUG_FIX_IMPACT_REPORT.md)

## ✅ 驗證

測試案例覆蓋：
- ✅ 正常流程（無 post-merge reviews）
- ✅ Post-merge reviews 被正確排除
- ✅ Draft 期間的審查正確計入
- ✅ 邊界條件（merge 時間點的審查）

## 🎓 經驗教訓

1. **時間戳比較很重要**: 必須使用 `noteTime > mrMergedAt`（大於），不是 `>=`
2. **Draft ≠ Post-merge**: 這兩個是不同的概念，不應混淆
3. **統計清晰度**: 明確的排除邏輯比包含所有事件然後在報告中過濾更好

## 🔄 未來考量

- 考慮加入 `--include-post-merge` flag 讓用戶選擇是否包含
- 在報告中顯示被排除的 post-merge 事件數量
- 記錄 post-merge reviews 用於其他分析目的（但不計入主要指標）
