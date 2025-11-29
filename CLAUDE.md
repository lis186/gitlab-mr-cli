# gitlab-mr-analysis Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-11-07

## Tech Stack

- **Language**: TypeScript 5.9 / Node.js 18+
- **Core Libraries**: @gitbeaker/rest (GitLab API), oclif 4.6 (CLI framework), Vitest 3.2.4 (Testing)
- **UI**: chalk 5.6 (終端顏色), cli-table3 0.6 (表格輸出), cli-progress 3.12 (進度顯示)
- **Utilities**: date-fns 4.1 (日期處理), js-yaml (配置解析), zod (配置驗證), dotenv (環境變數)
- **Storage**: 無持久化需求（無狀態查詢），可選檔案系統快取

## Project Structure

```
src/
├── commands/           # CLI 命令（oclif）
├── services/           # 業務邏輯服務
├── lib/                # 共用基礎設施（API 客戶端、進度、錯誤處理）
├── types/              # TypeScript 型別定義
├── formatters/         # 輸出格式化器
├── models/             # 資料模型
└── utils/              # 工具函數

tests/
├── contract/           # 合約測試（介面契約）
├── integration/        # 整合測試（端到端）
└── unit/               # 單元測試
```

## Commands

npm test              # 執行所有測試（Vitest）
npm run test:watch    # 測試監視模式
npm run lint          # TypeScript 型別檢查
npm run build         # 建置專案

## Code Style

- TypeScript strict mode
- ESM modules
- Functional programming patterns preferred
- Comprehensive JSDoc comments for public APIs

## Development Workflow

- Never use the git commit command after a task is finished.

## Testing Strategy

- **測試框架**: Vitest 3.2.4（ESM 原生支援）
- **Mock 策略**:
  - GitLab API: 使用 vi.mock() 與 fixture 資料
  - 本地 Git: 使用 vi.spyOn() 模擬 child_process.execSync
- **測試結構**: 合約測試 → 整合測試 → 單元測試（測試金字塔）

## Performance Optimization Patterns

- **本地 Git 優先**: 使用 child_process.execSync 執行 git rev-list --count（95% 效能提升）
- **並發批次處理**: Promise.allSettled 手動批次（每批次 10 個項目）
- **優雅降級**: 本地 Git → API 批次 → 智慧限制
- **進度回報**: 即時進度顯示（每批次更新，含耗時統計）
- **週期時間分析優化**: BatchProcessor 複用（每批次 10 個 MR，100 個 MR 約 6 秒完成）
- **MR 規模分析效能**: 批次大小 10，100 MRs < 5s，支援 --verbose 模式顯示詳細效能資訊

## Error Handling

- **結構化錯誤訊息**: 錯誤類型 + 原因 + 補救建議 + 技術細節（--verbose）
- **錯誤分類**: Authentication, Permission, Not Found, Rate Limit, Network, Validation
- **降級處理**: 單一項目失敗不影響整體流程（使用 Promise.allSettled）

## Localization & i18n

- **Primary Language**: Traditional Chinese (繁體中文)
- **Weekday Display**: Hardcoded Chinese weekday format (日一二三四五六) in `timeline-table-formatter.ts`
  - Implementation: `formatWeekday()` method uses static array `['日', '一', '二', '三', '四', '五', '六']`
  - Rationale: Tool is designed for Chinese-speaking teams, no i18n requirements currently
  - Future Enhancement: If internationalization is needed, consider:
    - Using `Intl.DateTimeFormat` with locale parameter
    - Adding environment variable `LOCALE` (e.g., `zh-TW`, `en-US`)
    - Extracting weekday strings to configuration file

## Recent Changes

- 2025-11-08: **Wait Time 計算邏輯修復**
  - 改用時間範圍分類法，正確計算 MR Created → First Review 總時長
  - CI Bot 檢測增強（支援 AI Code Review Bot 模式）
- 2025-11-07: **Draft → Ready 事件檢測修復**
  - 修復 GitLab API markdown 格式導致的事件檢測問題
- 2025-11-06: **Draft MR 處理增強**
  - 支援 legacy GitLab API draft MR 檢測
  - 新增 Branch Created 事件追蹤
  - Commit 命名區分 ([C] Code Committed vs [C+] Commit Pushed)
- 2025-11-05: **日期範圍修正與 AI Review 檢測**
  - 修正日期範圍查詢以包含完整結束日
  - 新增 AI Review 指示欄位到 mr-batch-compare
- 2025-11-04: **CI Bot 事件與 AI Bot 檢測修正**
  - 新增 CI Bot Response 事件類型
- 2025-11-02: **環境變數命名統一**
  - 將 `GITLAB_URL` 改為 `GITLAB_HOST`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
