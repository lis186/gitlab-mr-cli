# branch-health

分支健康度分析，識別過時分支與命名規範問題。

## 用途

- 分析分支存活時間
- 識別過時未合併分支
- 檢查分支命名規範
- 比較不同時間段的健康度

## 使用方式

```bash
# 基本分析
gitlab-mr branch-health -p your-team/your-project

# 顯示過時分支（預設 30 天閾值）
gitlab-mr branch-health -p your-team/your-project --show-stale

# 自訂過時閾值（60 天）
gitlab-mr branch-health -p your-team/your-project --show-stale --threshold 60

# 檢查命名規範
gitlab-mr branch-health -p your-team/your-project --check-naming

# 自訂命名規範
gitlab-mr branch-health -p your-team/your-project \
  --check-naming --pattern "^(feature|bugfix|hotfix)/"

# 比較時間段
gitlab-mr branch-health -p your-team/your-project \
  --compare-periods "2025-10,2025-11"

# 使用本地 Git 加速
gitlab-mr branch-health -p your-team/your-project \
  --local-repo /path/to/repo

# JSON 輸出
gitlab-mr branch-health -p your-team/your-project --format json
```

## 參數說明

| 參數 | 說明 |
|------|------|
| `-p, --project` | GitLab 專案（ID 或路徑） |
| `-t, --token` | GitLab Token（或用環境變數 `GITLAB_TOKEN`） |
| `-h, --host` | GitLab URL（預設 `https://gitlab.com`） |
| `-f, --format` | 輸出格式：`table` / `json` |
| `-l, --limit` | 分析的最大分支數（預設 150） |
| `--show-stale` | 顯示過時分支 |
| `--threshold` | 過時閾值天數（預設 30） |
| `--check-naming` | 檢查命名規範 |
| `--pattern` | 命名規範正則表達式 |
| `--compare-periods` | 比較時間段（逗號分隔） |
| `--local-repo` | 本地 Git 路徑（加速分析） |
| `--base-branch` | 基準分支（預設 main） |
| `-v, --verbose` | 詳細輸出 |

## 輸出範例

### 基本輸出（預設）

```bash
gitlab-mr branch-health -p your-team/your-project
```

```
═══════════════════════════════════════════════════════════════════════════════
分支健康度分析
═══════════════════════════════════════════════════════════════════════════════

總覽
────────────────────────────────────────────────────────────────────────────────
  總分支數: 45
  活躍分支: 32
  過時分支: 13

分支存活時間
────────────────────────────────────────────────────────────────────────────────
  平均: 12.5 天
  中位數: 8 天
  最長: 45 天

建議
────────────────────────────────────────────────────────────────────────────────
  - 13 個分支超過 30 天未更新，建議清理或合併
  - 過時分支比例: 29%（建議 < 20%）
```

### 加上 `--show-stale`（過時分支清單）

```bash
gitlab-mr branch-health -p your-team/your-project --show-stale
```

額外顯示：
```
過時分支清單（> 30 天未更新）
────────────────────────────────────────────────────────────────────────────────
┌────────────────────────────────────────┬────────────┬────────────┬───────────────┬────────────────────┐
│ 分支名稱                               │ 生命週期   │ MR 處理    │ 最後提交      │ 作者               │
├────────────────────────────────────────┼────────────┼────────────┼───────────────┼────────────────────┤
│ feature/old-feature                    │ 45 天      │ N/A        │ 2025-10-14    │ dev1               │
│ bugfix/legacy-fix                      │ 38 天      │ N/A        │ 2025-10-21    │ dev2               │
│ experiment/poc                         │ 35 天      │ N/A        │ 2025-10-24    │ dev3               │
│ feature/abandoned-work                 │ 32 天      │ N/A        │ 2025-10-27    │ dev1               │
└────────────────────────────────────────┴────────────┴────────────┴───────────────┴────────────────────┘

⚠️ 建議清理這些分支以保持 repository 整潔
```

### 加上 `--threshold`（自訂過時閾值）

```bash
gitlab-mr branch-health -p your-team/your-project --show-stale --threshold 60
```

將過時閾值從預設 30 天改為 60 天，顯示超過 60 天未更新的分支。

### 加上 `--check-naming`（命名規範檢查）

```bash
gitlab-mr branch-health -p your-team/your-project --check-naming
```

額外顯示：
```
命名規範檢查
────────────────────────────────────────────────────────────────────────────────
  預設規範: ^(feature|bugfix|hotfix|release)/

  符合規範: 38 (84%)
  不符合規範: 7 (16%)

  不符合規範的分支:
    - dev/temp-test
    - experiment/poc
    - john-feature
    - quick-fix
    - test123
    - wip-changes
    - master

⚠️ 建議統一分支命名規範
```

### 加上 `--pattern`（自訂命名規範）

```bash
gitlab-mr branch-health -p your-team/your-project \
  --check-naming --pattern "^(feat|fix|docs|chore)/"
```

使用自訂正則表達式檢查命名規範。

### 加上 `--compare-periods`（時間段比較）

```bash
gitlab-mr branch-health -p your-team/your-project \
  --compare-periods "2025-10,2025-11"
```

額外顯示：
```
時間段比較
────────────────────────────────────────────────────────────────────────────────
  指標              2025-10     2025-11     變化
  總分支數          52          45          ↓ 減少 7
  過時分支          18          13          ↓ 改善
  過時比例          35%         29%         ↓ 改善
  平均存活時間      15.2 天     12.5 天     ↓ 改善
```

### 輸出格式比較

| 參數 | 輸出內容 |
|------|----------|
| （預設） | 總覽 + 存活時間統計 + 建議 |
| `--show-stale` | + 過時分支清單 |
| `--threshold N` | 自訂過時閾值（預設 30 天） |
| `--check-naming` | + 命名規範檢查結果 |
| `--pattern` | 自訂命名規範正則表達式 |
| `--compare-periods` | + 時間段比較 |
| `--format json` | JSON 格式（適合自動化） |

## 命名規範範例

```bash
# 標準 GitFlow
--pattern "^(feature|bugfix|hotfix|release)/"

# 含 issue 編號
--pattern "^(feature|fix)/[A-Z]+-[0-9]+-"

# 簡單前綴
--pattern "^(feat|fix|docs|chore)/"
```
