# Git Hooks 說明

本專案使用 Git Hooks 來保護程式碼品質與安全性。

## 🛡️ 保護機制

### 1. git-secrets (pre-commit)
**目的**：防止機敏資訊（tokens, passwords, API keys）被提交到 repository

**檢測內容**：
- GitLab Personal Access Tokens (`glpat-*`)
- AWS Keys
- IP 位址
- GitLab URLs

**觸發時機**：每次執行 `git commit` 時

**如何繞過**（僅緊急情況）：
```bash
git commit --no-verify -m "message"
```

### 2. pre-push (本目錄提供)
**目的**：強制使用 Pull Request 流程，防止直接推送到 `main` 或 `master` 分支

**檢測內容**：
- 檢查推送目標是否為 protected 分支

**觸發時機**：每次執行 `git push` 時

**如何繞過**（僅緊急情況）：
```bash
git push --no-verify
```

## 📦 安裝方式

### 方法 1: 使用自動安裝腳本（推薦）

```bash
# 在專案根目錄執行
./scripts/install-hooks.sh
```

### 方法 2: 手動安裝

```bash
# 複製 pre-push hook
cp .githooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

**注意**：`git-secrets` 的 pre-commit hook 已經透過 `git secrets --install` 安裝，無需手動複製。

## 🔄 更新 Hooks

當專案的 hooks 更新時，重新執行安裝腳本即可：

```bash
./scripts/install-hooks.sh
```

## 🧪 測試 Hooks

### 測試 git-secrets (pre-commit)

```bash
# 建立測試檔案（包含假 token）
echo "GITLAB_TOKEN=glpat-test123" > test-secret.txt
git add test-secret.txt
git commit -m "test"  # 應該被阻擋

# 清理
git reset HEAD test-secret.txt
rm test-secret.txt
```

### 測試 pre-push

```bash
# 切換到 main 分支並嘗試推送
git checkout main
echo "test" >> test.txt
git add test.txt
git commit -m "test"
git push  # 應該被阻擋

# 清理
git reset HEAD~1
git checkout .
```

## ❓ 常見問題

### Q1: 為什麼需要兩個 hooks？

- **git-secrets (pre-commit)**: 防止機敏資訊外洩（安全性）
- **pre-push**: 確保程式碼審查流程（開發流程）

兩者互補，提供完整保護。

### Q2: 新成員如何設定？

```bash
# 1. Clone repository
git clone <repo-url>
cd gitlab-mr-analysis

# 2. 安裝 git-secrets（依平台選擇）

# macOS
brew install git-secrets

# Ubuntu/Debian
sudo apt-get install git-secrets
# 或從原始碼安裝（如果套件庫沒有）:
# git clone https://github.com/awslabs/git-secrets
# cd git-secrets
# sudo make install

# Windows (使用 Git Bash)
# 下載並安裝 git-secrets
# https://github.com/awslabs/git-secrets#installing-git-secrets
# 或使用 Chocolatey:
# choco install git-secrets

# 初始化 git-secrets（所有平台相同）
git secrets --install

# 3. 安裝 pre-push hook
./scripts/install-hooks.sh
```

**注意**：
- 所有平台的安裝腳本都相同（`./scripts/install-hooks.sh`）
- Windows 用戶請使用 Git Bash 執行腳本
- Linux/macOS 用戶如遇權限問題，請執行 `chmod +x scripts/install-hooks.sh`

### Q3: 如果我真的需要直接推送到 main？

使用 `--no-verify` 繞過檢查，但請謹慎使用：

```bash
git push --no-verify
```

**建議**：即使是緊急修復，也應該：
1. 先推送到 feature 分支
2. 建立 PR
3. 快速審查後合併

### Q4: Hooks 可以被刪除嗎？

可以，但不建議：

```bash
# 刪除 hook（不建議）
rm .git/hooks/pre-push
rm .git/hooks/pre-commit
```

這會失去所有保護機制。

## 📚 延伸閱讀

- [Git Hooks 官方文件](https://git-scm.com/docs/githooks)
- [git-secrets GitHub](https://github.com/awslabs/git-secrets)
- [專案安全防護指南](./.git-secrets-prevention.md)

## 🤝 貢獻

如果發現 hooks 有問題或需要改進，請：
1. 在 `.githooks/` 目錄修改
2. 測試修改
3. 提交 PR
4. 通知團隊成員重新執行安裝腳本
