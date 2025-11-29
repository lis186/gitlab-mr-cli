# GitLab MR 分析工具

分析團隊 Merge Request 週期時間，找出開發流程瓶頸。

## 為什麼使用這個工具？

GitLab 內建的 Value Stream Analytics 無法回答這些問題：

| 問題 | GitLab 內建 | 本工具 |
|------|-------------|--------|
| MR 卡在等待審查多久？（Wait Time） | ❌ | ✅ |
| 四階段各佔多少時間？ | ❌ | ✅ |
| AI Review vs Human Review 效果？ | ❌ | ✅ |
| 批次比較並找出異常 MR？ | ❌ | ✅ |
| 匯出 CSV 給非技術主管？ | ❌ | ✅ |

### 四階段週期時間分解

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
| **Review Time** | First Review → Approve | 來回修改、討論過多 |
| **Merge Time** | Approve → Merge | CI 太慢、等待部署窗口 |

> 詳細定義請參考 [SDLC 流程圖](docs/sdlc.png)

## 快速開始

### 1. 安裝

```bash
git clone <repo-url> && cd gitlab-mr-analysis
npm install && npm run build && npm link
```

> 需要 Node.js 18+，檢查版本：`node --version`

### 2. 設定

取得 GitLab Token（需要 `read_api` 權限）：
- GitLab → Settings → Access Tokens → Add new token

建立 `.env` 檔案：
```
GITLAB_HOST=https://gitlab.example.com
GITLAB_TOKEN=glpat-xxxxxxxxxxxx
```

### 3. 驗證安裝

```bash
gitlab-mr list -p your-team/your-project --limit 5
```

### 4. 產生第一份報告

```bash
gitlab-mr mr-batch-compare -p your-team/your-project \
  --since 2025-11-01 --until 2025-11-30
```

## 命令選擇指南

| 我想要... | 用這個命令 | 說明 |
|-----------|-----------|------|
| 產生團隊週報/月報 | `mr-batch-compare` | 批次分析，可匯出 CSV |
| 快速看週期時間趨勢 | `cycle-time` | 輕量統計，適合日常監控 |
| 深入分析單一 MR | `mr-timeline` | 完整事件時間軸 |
| 檢查 MR 是否太大 | `mr-size` | 規模分佈分析 |
| 監控 CI/CD 健康度 | `ci-health` | Pipeline 成功率、失敗原因 |
| 清理過時分支 | `branch-health` | 識別未合併的老舊分支 |

## 使用範例

### 週報分析

```bash
gitlab-mr mr-batch-compare -p your-team/your-project \
  --since 2025-11-01 --until 2025-11-30 \
  --classify-by-type --exclude-no-review
```

### 匯出 CSV 給上級

```bash
gitlab-mr mr-batch-compare -p your-team/your-project \
  --since 2025-11-01 --until 2025-11-30 \
  --csv -o monthly-report.csv
```

### 分析特定開發者

```bash
gitlab-mr mr-batch-compare -p your-team/your-project \
  --author john.doe --since 2025-11-01
```

## 命令文檔

| 命令 | 用途 | 文檔 |
|------|------|------|
| `mr-batch-compare` | 批次週期時間分析 | [文檔](docs/commands/mr-batch-compare.md) |
| `cycle-time` | 週期時間統計 | [文檔](docs/commands/cycle-time.md) |
| `mr-size` | MR 規模分析 | [文檔](docs/commands/mr-size.md) |
| `mr-timeline` | 單一 MR 時間軸 | [文檔](docs/commands/mr-timeline.md) |
| `ci-health` | CI/CD 健康度 | [文檔](docs/commands/ci-health.md) |
| `branch-health` | 分支健康度 | [文檔](docs/commands/branch-health.md) |
| `list` | MR 列表 | [文檔](docs/commands/list.md) |

查看命令說明：`gitlab-mr <command> --help`

## FAQ

### Token 需要什麼權限？
只需要 `read_api`，不需要寫入權限。

### 可以分析多個專案嗎？
可以，用 shell script 迴圈：
```bash
for project in ios-app android-app; do
  gitlab-mr mr-batch-compare -p team/$project --csv -o $project.csv
done
```

### 資料會儲存在哪裡？
不會儲存，所有資料即時從 GitLab API 取得（無狀態查詢）。

### 什麼是 P50 / P90？
- P50（中位數）：50% 的 MR 在此時間內完成
- P90：90% 的 MR 在此時間內完成（用來識別異常值）

### 什麼是 AI Review？
工具會自動識別 AI Code Review Bot 的留言（如 GitLab Duo、自訂 Bot），區分 AI 審查與人工審查的效果。

## 開發

```bash
npm test          # 執行測試
npm run build     # 編譯
npm run lint      # 型別檢查
```

## License

MIT
