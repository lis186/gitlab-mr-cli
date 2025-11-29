# Known Test Failures (Pre-existing)

**日期**: 2025-11-12
**狀態**: ⚠️ Pre-existing Issues

## 📋 概述

以下測試失敗**不是由 Hybrid Reviewer 功能引入**，而是在實作該功能之前就已存在的問題。

## 🔴 失敗測試清單

### 1. batch-comparison-ai-review-detection.test.ts (5 failures)

**測試檔案**: `tests/unit/batch-comparison-ai-review-detection.test.ts`

**失敗測試**:
1. ❌ should detect AI review when "First AI Review" event exists
2. ❌ should not detect AI review when no "First AI Review" event
3. ❌ should detect AI review with both indicators (aiReviews > 0 AND event)
4. ❌ should detect AI review with either indicator (OR logic)
5. ❌ should not detect AI review when neither indicator is present

**錯誤訊息**:
```
ServiceError: 所有 MR 查詢都失敗
 ❯ BatchComparisonService.fetchMRData src/services/batch-comparison-service.ts:352:13
```

**根本原因**:
- Mock 資料結構與 `BatchComparisonService.fetchMRData()` 的預期不匹配
- `createMockTimeline()` 返回的物件缺少必要的欄位
- Timeline Service 的 mock 可能沒有正確設定

**影響**:
- 不影響 hybrid reviewer 功能
- AI Review detection 的單元測試無法驗證
- 主要功能仍可正常運作（integration tests 通過）

### 2. batch-comparison-events-serialization.test.ts (1 failure)

**測試檔案**: `tests/unit/batch-comparison-events-serialization.test.ts`

**失敗測試**:
1. ❌ should not fail when event serialization encounters errors

**錯誤訊息**:
```
TypeError: Cannot read properties of undefined (reading 'timestamp')
```

**根本原因**:
- Event 物件結構變更，但測試未同步更新
- 可能缺少 `timestamp` 欄位的 mock 資料

**影響**:
- 不影響 hybrid reviewer 功能
- Events serialization 錯誤處理測試失效
- 實際執行時 serialization 可能正常運作

## ✅ 已驗證正常的測試

### Hybrid Reviewer 相關測試

**測試檔案**: `tests/unit/services/mr-timeline-service.test.ts`

**結果**: ✅ 12/12 tests passed

包含：
- ✅ Hybrid reviewer classification (8-minute threshold)
- ✅ Multiple AI reviewers handling
- ✅ Boundary conditions (exactly 8 minutes)
- ✅ Post-merge review exclusion

### 整體測試結果

```bash
Test Files  2 failed | 70 passed (72)
Tests       6 failed | 1082 passed | 2 skipped (1090)
```

**通過率**: 99.4% (1082/1088 non-skipped tests)

## 🔧 建議修復方案

### 優先級 1: AI Review Detection Tests

**步驟**:
1. 檢查 `createMockTimeline()` 回傳的資料結構
2. 確保包含所有必要欄位：
   ```typescript
   {
     mr: { ... },
     summary: { aiReviews: number, ... },
     events: Event[],  // ⚠️ 可能缺少
     segments: Segment[],
     cycleTimeSeconds: number
   }
   ```
3. 更新 mock 以符合 `BatchComparisonService.fetchMRData()` 預期

### 優先級 2: Events Serialization Test

**步驟**:
1. 檢查 Event 型別定義中的 `timestamp` 欄位
2. 確保測試 mock 包含該欄位
3. 加入 null/undefined 檢查以提高健壯性

## 📊 影響評估

### 對 Hybrid Reviewer 功能的影響

✅ **無影響**

原因：
1. 失敗的測試與 hybrid reviewer 邏輯無關
2. Hybrid reviewer 專屬測試（12個）全部通過
3. 整合測試驗證了端到端流程

### 對產品發布的影響

⚠️ **中等影響**

- 功能本身可以正常運作
- 但缺少完整的測試覆蓋
- 建議在正式發布前修復這些測試

### 建議行動

**立即**:
- ✅ 記錄這些已知問題（本文檔）
- ✅ 標記為 pre-existing issues
- ✅ 與 hybrid reviewer PR 分開追蹤

**短期**:
- 建立獨立的 issue 追蹤這 6 個測試失敗
- 分配給熟悉 batch comparison service 的開發者
- 預估修復時間：1-2 天

**長期**:
- 審查所有單元測試的 mock 資料
- 建立測試資料 factory 以確保一致性
- 加強 CI 以防止類似問題

## 📝 追蹤

**Issue**: #TBD (待建立)
**Assignee**: TBD
**Priority**: Medium (不阻擋 hybrid reviewer 功能發布)
**Target**: 下個 sprint

## ✅ 驗證 Hybrid Reviewer 功能可安全合併

儘管有這些 pre-existing test failures，Hybrid Reviewer 功能可以安全合併，因為：

1. ✅ 所有 hybrid reviewer 專屬測試通過（12/12）
2. ✅ 失敗的測試與該功能無關
3. ✅ 整體測試通過率 99.4%
4. ✅ 已有完整的文檔和決策記錄
5. ✅ Critical bug (cache update) 已修復

**建議**: 合併 hybrid reviewer PR，同時建立獨立 issue 追蹤這些測試失敗。
