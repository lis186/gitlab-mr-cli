# cycle-time

MR 週期時間四階段分解分析（DORA Lead Time）。

## 用途

- 分析 MR 從建立到合併的總週期時間
- 四階段分解：Dev / Wait / Review / Merge Time
- 與 DORA 指標基準比較
- 支援週/月趨勢分析

## 使用方式

```bash
# 分析最近 30 天
gitlab-mr cycle-time -p your-team/your-project

# 分析最近 60 天
gitlab-mr cycle-time -p your-team/your-project --days 60

# 指定日期範圍
gitlab-mr cycle-time -p your-team/your-project \
  --since 2025-11-01 --until 2025-11-30

# 顯示詳細資訊
gitlab-mr cycle-time -p your-team/your-project --show-details

# 顯示週趨勢
gitlab-mr cycle-time -p your-team/your-project --trend weekly

# 顯示月趨勢
gitlab-mr cycle-time -p your-team/your-project --trend monthly --days 90

# JSON 輸出
gitlab-mr cycle-time -p your-team/your-project --json
```

## 參數說明

| 參數 | 說明 |
|------|------|
| `-p, --project` | GitLab 專案（ID 或路徑） |
| `-t, --token` | GitLab Token（或用環境變數 `GITLAB_TOKEN`） |
| `-h, --host` | GitLab URL（預設 `https://gitlab.com`） |
| `-d, --days` | 分析最近 N 天（預設 30） |
| `--since` | 開始日期（YYYY-MM-DD） |
| `--until` | 結束日期（YYYY-MM-DD） |
| `-l, --limit` | 限制 MR 數量（預設 100） |
| `-j, --json` | JSON 格式輸出 |
| `--show-details` | 顯示每個 MR 的詳細資訊 |
| `--trend` | 趨勢分析：`weekly` / `monthly` |

## 輸出範例

### 基本輸出（預設）

```bash
gitlab-mr cycle-time -p your-team/your-project
```

```
═══════════════════════════════════════════════════════════════════════════════
MR 週期時間分析（最近 30 天）
═══════════════════════════════════════════════════════════════════════════════

總覽
────────────────────────────────────────────────────────────────────────────────
  分析 MR 數量: 35
  平均週期時間: 1.8 天
  中位數週期時間: 1.2 天

階段分解
────────────────────────────────────────────────────────────────────────────────
  Dev Time:     8.5h (45%)  ████████████████████
  Wait Time:    2.3h (12%)  █████
  Review Time:  6.8h (36%)  ████████████████
  Merge Time:   1.2h (7%)   ███

DORA 基準比較
────────────────────────────────────────────────────────────────────────────────
  Elite:   < 1 天
  High:    1-7 天
  Medium:  7-30 天
  Low:     > 30 天

  您的團隊: High 表現 ✓
```

### 加上 `--show-details`（每個 MR 詳情）

```bash
gitlab-mr cycle-time -p your-team/your-project --show-details
```

額外顯示：
```
MR 詳細列表
────────────────────────────────────────────────────────────────────────────────
┌──────┬────────────────────┬──────────┬─────────┬─────────┬─────────┬─────────┐
│ MR   │ 標題               │ 週期     │ Dev     │ Wait    │ Review  │ Merge   │
├──────┼────────────────────┼──────────┼─────────┼─────────┼─────────┼─────────┤
│ 125  │ Fix login bug      │ 0.5 天   │ 2.0h    │ 1.5h    │ 3.0h    │ 0.5h    │
│ 124  │ Add feature X      │ 1.2 天   │ 8.0h    │ 4.0h    │ 6.5h    │ 1.0h    │
│ 123  │ Refactor API       │ 2.0 天   │ 12.0h   │ 8.0h    │ 18.0h   │ 2.0h    │
└──────┴────────────────────┴──────────┴─────────┴─────────┴─────────┴─────────┘
```

### 加上 `--trend weekly`（週趨勢）

```bash
gitlab-mr cycle-time -p your-team/your-project --trend weekly
```

額外顯示：
```
週趨勢分析
────────────────────────────────────────────────────────────────────────────────
  週次        MR 數    P50 週期    變化
  11/04-11/10   8      1.5 天      -
  11/11-11/17  12      1.2 天      ↓ 20% 改善
  11/18-11/24  10      0.9 天      ↓ 25% 改善
  11/25-11/30   5      1.1 天      ↑ 22% 退步
```

### 加上 `--trend monthly`（月趨勢）

```bash
gitlab-mr cycle-time -p your-team/your-project --trend monthly --days 90
```

額外顯示：
```
月趨勢分析
────────────────────────────────────────────────────────────────────────────────
  月份        MR 數    P50 週期    P50 Wait Time
  2025-09      42      2.1 天      4.5h
  2025-10      38      1.8 天      3.2h         ↓ 改善
  2025-11      35      1.2 天      2.3h         ↓ 改善
```

### 輸出格式比較

| 參數 | 輸出內容 |
|------|----------|
| （預設） | 總覽 + 階段分解 + DORA 比較 |
| `--show-details` | + 每個 MR 的四階段時間 |
| `--trend weekly` | + 週趨勢變化 |
| `--trend monthly` | + 月趨勢變化 |
| `--json` | JSON 格式（適合自動化） |

## 四階段定義

```
Branch Created ──► MR Ready ──► First Review ─-─► Approve ─--─► Merge
        │            │              │               │             │
        └─ Dev Time ─└─ Wait Time -─┘               │             │
                     │              └─ Review Time ─┘             │
                     │                              │             │
                     └─────── Review Lead Time -────┘             │
                                                    └ Merge Time ─┘
        ├───────────────────────── Cycle Time── ──────────────────┤
```

| 階段 | 定義 | 常見瓶頸 |
|------|------|----------|
| **Dev Time** | Branch Created → MR Ready | 需求不清、技術卡關 |
| **Wait Time** | MR Ready → First Review | 審查者太忙、時區差異 |
| **Review Time** | First Review → Approve | 來回修改、討論過多、Reviewer 或 Author 太忙 |
| **Merge Time** | Approve → Merge | CI 太慢、等待部署窗口 |

> 詳細定義請參考 [SDLC 流程圖](../sdlc.png)
