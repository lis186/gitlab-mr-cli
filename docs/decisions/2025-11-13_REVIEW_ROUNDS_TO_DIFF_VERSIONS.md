# Review Rounds 改用 diffVersions 計算

**日期**: 2025-11-11
**狀態**: ✅ Implemented
**相關 Commit**: 6a20b08

## 📋 決策

將 Review Rounds（審查輪數）的計算從 `reviewRounds` 欄位改為使用 `diffVersions` 欄位。

## 🎯 理由

### 1. 更準確的迭代追蹤

**問題**: `reviewRounds` 計算方式不明確
- 定義模糊：什麼算一輪審查？
- 來源不清：從哪裡取得這個數字？
- 可能遺漏：某些審查迭代可能未被計入

**解決**: `diffVersions` 基於 GitLab 的 diff 版本
- **明確定義**: 每次推送新 commit 產生新的 diff version
- **可驗證**: 直接對應 GitLab UI 中的 "Changes" 版本號
- **完整追蹤**: 自動捕捉所有程式碼變更迭代

### 2. 符合 GitLab 語義

GitLab 的 Diff Versions 功能：
```
Version 1: Initial commit
Version 2: Address review feedback
Version 3: Fix linting issues
Version 4: Final adjustments
```

每個 version 代表一次程式碼迭代，直接反映：
- 審查反饋的響應次數
- 程式碼修改的迭代次數
- MR 成熟度（version 越多通常表示討論越充分）

### 3. 與其他指標一致

使用 `diffVersions` 讓指標更一致：
- **Changes Count**: 總變更數（files + lines）
- **Diff Versions**: 變更迭代次數 ⭐ 新指標
- **Review Rounds**: 審查輪數 → 用 diff versions 表示更清楚

## 🔧 實作變更

### 修改 1: Commands (src/commands/mr-batch-compare.ts)

```typescript
// Before (模糊)
const mrsWithRounds = result.rows.filter(row =>
  !row.error && row.reviewStats.reviewRounds && row.reviewStats.reviewRounds > 0
);

// After (明確)
const mrsWithRounds = result.rows.filter(row =>
  !row.error && row.reviewStats.diffVersions && row.reviewStats.diffVersions > 0
);
```

### 修改 2: Formatters (src/formatters/batch-comparison-table-formatter.ts)

```typescript
// Before
const roundsDisplay = row.reviewStats.reviewRounds !== undefined
  ? row.reviewStats.reviewRounds.toString()
  : chalk.dim('-');

// After
const roundsDisplay = row.reviewStats.diffVersions !== undefined
  ? row.reviewStats.diffVersions.toString()
  : chalk.dim('-');
```

## 📊 影響分析

### 資料來源變更

**Old (reviewRounds)**:
- 來源不明確（可能是從 API 某個欄位或計算得出）
- 可能遺漏某些迭代

**New (diffVersions)**:
- 來源：`GitLab API - MergeRequest.diff_refs` 或 diff 歷史
- 直接對應 GitLab UI 中的版本號
- 完整且可驗證

### 數值變化預期

一般情況下，`diffVersions` >= `reviewRounds`，因為：
- 每次 review feedback → 推送新 commit → 新 diff version
- 但也可能有多次小調整（linting, formatting）產生多個 versions

**範例**:
```
MR #123:
  reviewRounds: 2 (兩輪審查)
  diffVersions: 4 (初始 + 3 次修改)

  說明：第一輪審查後修改了 2 次，第二輪審查後修改了 1 次
```

### 向後相容性

⚠️ **Breaking Change**: 報告中的 "Review Rounds" 欄位數值可能變化

**遷移建議**:
1. 重新生成所有歷史報告以使用新指標
2. 比較新舊值，驗證合理性
3. 更新儀表板和文檔，說明欄位意義變更

## ✅ 驗證方式

### 手動驗證

1. 在 GitLab UI 中找到 MR
2. 點擊 "Changes" 標籤
3. 查看右上角的版本選擇器：`Version 1 of 4`
4. 確認 `diffVersions = 4`

### 自動化測試

```bash
# 執行批次分析
npm run mr-batch-compare -- <project-id> --since 2025-01-01 --rounds-detail

# 檢查輸出的 diffVersions 欄位
# 應該顯示正整數，表示 diff 版本數
```

## 📝 術語釐清

| 術語 | 定義 | 來源 |
|------|------|------|
| **Diff Versions** | GitLab 追蹤的程式碼變更版本號 | GitLab API |
| **Review Rounds** | 審查輪數（現在用 diffVersions 表示） | 計算欄位 |
| **Review Iterations** | 審查迭代次數（同義於 Review Rounds） | 語義描述 |

## 🎓 經驗教訓

1. **使用平台原生指標**: 優先使用 GitLab 提供的原生欄位（如 diffVersions），而不是自己計算模糊的指標
2. **明確定義很重要**: "Review Rounds" 定義不清，導致混淆和不一致
3. **可驗證性**: 使用可以在 UI 中驗證的指標，增加信心

## 🔄 未來改進

- 考慮加入 `commitCount` vs `diffVersions` 的比較分析
- 分析高 diffVersions 的 MR 是否有品質問題
- 建立 diffVersions 的基準值（healthy range）

## 📚 相關資源

- [GitLab Merge Request Diffs API](https://docs.gitlab.com/ee/api/merge_requests.html#get-merge-request-diff-versions)
- [Post-Merge Review Exclusion](./POST_MERGE_REVIEW_EXCLUSION.md)
- [Hybrid Reviewer Configuration](./IOS_AI_COVERAGE_INVESTIGATION.md)
