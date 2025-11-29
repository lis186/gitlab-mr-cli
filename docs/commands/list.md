# list

列出專案的 Merge Requests。

## 用途

- 快速查看最近的 MR
- 檢視 MR 基本資訊（標題、作者、狀態）
- 支援多種輸出格式

## 使用方式

```bash
# 列出最近 20 個 MR
gitlab-mr list -p your-team/your-project

# 列出最近 50 個 MR
gitlab-mr list -p your-team/your-project --limit 50

# JSON 輸出
gitlab-mr list -p your-team/your-project --format json

# 精簡輸出
gitlab-mr list -p your-team/your-project --format compact
```

## 參數說明

| 參數 | 說明 |
|------|------|
| `-p, --project` | GitLab 專案（ID 或路徑）**（必填）** |
| `-t, --token` | GitLab Token（或用環境變數 `GITLAB_TOKEN`） |
| `-h, --host` | GitLab URL（預設 `https://gitlab.com`） |
| `-l, --limit` | MR 數量上限（1-100，預設 20） |
| `-f, --format` | 輸出格式：`table` / `json` / `compact` |

## 輸出範例

### Table 格式（預設）

```bash
gitlab-mr list -p your-team/your-project
```

```
┌─────┬────────────────────────────────┬────────────┬────────┬─────────────┐
│ IID │ 標題                            │ 作者       │ 狀態    │ 建立時間     │
├─────┼────────────────────────────────┼────────────┼────────┼─────────────┤
│ 125 │ Fix login validation           │ dev1       │ merged │ 2 days ago  │
│ 124 │ Add user profile page          │ dev2       │ open   │ 3 days ago  │
│ 123 │ Update dependencies            │ dev1       │ merged │ 5 days ago  │
└─────┴────────────────────────────────┴────────────┴────────┴─────────────┘

顯示 3 個 Merge Request
```

### Compact 格式

```bash
gitlab-mr list -p your-team/your-project --format compact
```

```
#125 Fix login validation (dev1) - merged
#124 Add user profile page (dev2) - open
#123 Update dependencies (dev1) - merged
```

### JSON 格式

```bash
gitlab-mr list -p your-team/your-project --format json
```

```json
[
  {
    "iid": 125,
    "title": "Fix login validation",
    "author": "dev1",
    "state": "merged",
    "created_at": "2025-11-26T10:30:00Z"
  },
  {
    "iid": 124,
    "title": "Add user profile page",
    "author": "dev2",
    "state": "open",
    "created_at": "2025-11-25T14:20:00Z"
  }
]
```

### 調整數量

```bash
# 列出最近 50 個 MR
gitlab-mr list -p your-team/your-project --limit 50

# 列出最近 5 個 MR（快速檢視）
gitlab-mr list -p your-team/your-project --limit 5
```

### 輸出格式比較

| 參數 | 輸出內容 |
|------|----------|
| `--format table`（預設） | 表格格式，易讀 |
| `--format compact` | 精簡單行格式 |
| `--format json` | JSON 格式（適合程式處理） |
| `--limit N` | 限制顯示數量（預設 20，最大 100） |
