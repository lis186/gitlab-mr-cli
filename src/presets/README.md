# 發布配置範例 (Release Configuration Presets)

此目錄包含預設的發布配置範例檔案，供使用者參考並建立自己的配置。

## 重要提示

**⚠️ 開源安全**: 此目錄僅包含 `.example.yml` 範例檔案。所有實際配置檔必須由使用者在本地建立，不會被提交到 Git repository。

## 可用的預設範例

### 1. mobile-app.example.yml
**適用對象**: 使用年月版本號的行動應用程式專案
**標籤格式**: `AppStore{YY}.{MONTH}.{PATCH}` 或 `v{YY}.{MONTH}.{PATCH}`
**範例標籤**: `AppStore25.10.0`, `v25.9.5`

### 2. date-based.example.yml
**適用對象**: 使用日期格式的專案
**標籤格式**: `rel-{YYYYMMDD}-{序號}`
**範例標籤**: `rel-20251015-1`, `rel-20251015-2`

### 3. semver.example.yml
**適用對象**: 使用 Semantic Versioning 的專案
**標籤格式**: `{MAJOR}.{MINOR}.{PATCH}[_{SUFFIX}]`
**範例標籤**: `1.2.3`, `2.0.0_beta`

## 如何使用

### 方式 1: 互動式初始化（建議）

```bash
# 互動模式
npm run release:init -- --project "your-group/your-project"

# 非互動模式（適用於 CI/CD）
npm run release:init -- --project "your-group/your-project" \
  --non-interactive \
  --preset mobile-app \
  --output .gitlab-analysis.yml
```

系統會引導您選擇預設範例並產生配置檔案。

### 方式 2: 手動複製範例檔案

1. 選擇適合的範例檔案（如 `mobile-app.example.yml`）
2. 複製到專案根目錄或全域配置目錄：

```bash
# 專案層級配置（優先級較高）
cp src/presets/mobile-app.example.yml .gitlab-analysis.yml

# 全域配置（可管理多專案）
mkdir -p ~/.gitlab-analysis/presets
cp src/presets/mobile-app.example.yml ~/.gitlab-analysis/presets/my-project.yml
```

3. 編輯配置檔案以符合您的專案需求
4. 驗證與檢視配置：

```bash
# 驗證配置是否正確
npm run release:validate-config -- --config .gitlab-analysis.yml

# 檢視當前生效的配置內容（推薦）
npm run release:analyze -- --project "your-project" \
  --config .gitlab-analysis.yml \
  --show-config
```

## 配置檔案優先級

當多個配置檔案同時存在時，系統會依照以下優先級載入：

1. **CLI 參數**: `--config /path/to/config.yml` (最高優先級)
2. **專案目錄**: `./.gitlab-analysis.yml`
3. **全域配置**: `~/.gitlab-analysis/config.yml`
4. **自動偵測**: 系統嘗試偵測標籤格式 (最低優先級)

## 配置檔案結構說明

完整的配置檔案包含以下主要部分：

### 基本資訊
```yaml
name: "配置名稱"
description: "配置說明"
```

### 標籤格式定義
```yaml
tag:
  pattern: "^AppStore(\\d{2})\\.(\\d{1,2})\\.(\\d+)$"  # Regex pattern
  groups:
    year: 1      # 第一個擷取群組對應年份
    month: 2     # 第二個擷取群組對應月份
    patch: 3     # 第三個擷取群組對應 patch 號
```

### 發布類型定義
```yaml
release_types:
  major:
    name: "正式月度發布"
    description: "每月固定發布"
    priority: 1
    rules:
      - field: "patch"
        operator: "equals"
        value: 0
```

### 分析設定
```yaml
analysis:
  default_branch: "develop"     # 主幹分支名稱
  thresholds:
    mr_count:
      healthy: 50    # ≤50 MR 為健康
      warning: 100   # 50-100 MR 為警告
      critical: 100  # >100 MR 為警戒
```

## 命令列參數

### 常用參數

```bash
# 基本分析
npm run release:analyze -- \
  --project "your-project" \
  --config .gitlab-analysis.yml \
  --since 2024-01-01

# 包含趨勢分析
npm run release:analyze -- \
  --project "your-project" \
  --config .gitlab-analysis.yml \
  --since 2024-01-01 \
  --with-trend

# 包含整合頻率分析
npm run release:analyze -- \
  --project "your-project" \
  --config .gitlab-analysis.yml \
  --with-integration-frequency \
  --target-branch develop

# 顯示詳細執行日誌（除錯用）
npm run release:analyze -- \
  --project "your-project" \
  --config .gitlab-analysis.yml \
  --verbose

# 顯示當前配置內容（不執行分析）
npm run release:analyze -- \
  --project "your-project" \
  --config .gitlab-analysis.yml \
  --show-config

# JSON 格式輸出
npm run release:analyze -- \
  --project "your-project" \
  --config .gitlab-analysis.yml \
  --json
```

## 進階功能

### 自訂發布類型規則

發布類型可使用多種規則來判斷：

```yaml
hotfix:
  name: "緊急修復"
  priority: 2
  rules:
    - field: "patch"           # 可用欄位: patch, minor, major, sequence, tag_message, suffix
      operator: "ends_with"    # 可用運算子: equals, ends_with, contains_any, greater_than, is_empty, is_not_empty, changed
      value: 5
    - field: "tag_message"
      operator: "contains_any"
      value: ["[fix]", "修復"]
      match_mode: "any"        # all=所有符合, any=任一符合
```

### 調整健康度閾值

根據團隊規模調整閾值：

```yaml
analysis:
  thresholds:
    mr_count:
      healthy: 30    # 小團隊 (< 5 人): 20-30
      warning: 60    # 中團隊 (5-15 人): 40-50
      critical: 100  # 大團隊 (> 15 人): 60-80
    loc_changes:
      healthy: 3000
      warning: 8000
      critical: 10000
    release_interval_days:
      expected: 30   # 預期間隔天數
      tolerance: 5   # 容許誤差範圍
    code_freeze_days:
      healthy_min: 1
      healthy_max: 3
      warning_max: 5
```

## 常見問題

### Q: 為什麼沒有預設的實際配置檔案？

**A**: 基於開源安全原則，我們不在程式碼庫中包含任何公司或專案特定的配置資訊。所有實際配置都應由使用者根據範例檔案自行建立。

### Q: 可以在同一個專案中使用多個配置嗎？

**A**: 可以。您可以建立多個配置檔案並使用 `--config` 參數指定：

```bash
npm run release:analyze -- --project "your-project" --config config-android.yml
npm run release:analyze -- --project "your-project" --config config-ios.yml
```

### Q: 自動偵測可靠嗎？

**A**: 自動偵測適用於常見的標籤格式（年月版本、日期格式、Semantic Versioning）。如果您的專案使用特殊格式，建議手動建立配置檔案以確保準確性。

### Q: 如何檢視目前使用的配置？

**A**: 使用 `--show-config` 參數可以快速檢視當前生效的配置內容，包括標籤模式、發布類型、閾值等詳細資訊：

```bash
npm run release:analyze -- \
  --project "your-project" \
  --config .gitlab-analysis.yml \
  --show-config
```

### Q: 如何進行問題排查？

**A**: 使用 `--verbose` 參數可以顯示詳細的執行日誌，包括 API 呼叫、配置載入過程等資訊：

```bash
npm run release:analyze -- \
  --project "your-project" \
  --config .gitlab-analysis.yml \
  --verbose
```

## 相關文件

- [快速開始指南](../../specs/006-release-readiness/quickstart.md)
- [功能規格](../../specs/006-release-readiness/spec.md)
- [資料模型](../../specs/006-release-readiness/data-model.md)

## 效能建議

### 大型專案優化

對於擁有大量發布歷史的專案，建議：

1. **限制分析時間範圍**: 使用 `--since` 和 `--until` 參數
2. **使用快取**: 啟用配置檔案中的快取功能（預設啟用）
3. **批次處理**: 系統會自動進行批次處理以優化 API 呼叫

```bash
# 僅分析最近 90 天
npm run release:analyze -- \
  --project "your-project" \
  --config .gitlab-analysis.yml \
  --since $(date -v-90d +%Y-%m-%d)
```

### CI/CD 整合

在 CI/CD 環境中使用時：

1. **非互動模式初始化**: 使用 `--non-interactive` 參數
2. **JSON 輸出**: 使用 `--json` 參數便於解析結果
3. **環境變數**: 使用 `GITLAB_TOKEN` 環境變數傳遞 token

```yaml
# GitLab CI 範例
release-analysis:
  script:
    - npm install
    - npm run release:analyze --
        --project "$CI_PROJECT_PATH"
        --config .gitlab-analysis.yml
        --since $(date -v-30d +%Y-%m-%d)
        --json > release-report.json
  artifacts:
    paths:
      - release-report.json
```

---

**版本**: 1.1.0
**最後更新**: 2025-10-27
