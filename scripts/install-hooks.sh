#!/bin/bash

# Git Hooks 安裝腳本
# 用途：安裝專案共享的 Git Hooks 到本地 .git/hooks/
#
# 使用方式：
#   ./scripts/install-hooks.sh          # 互動模式
#   ./scripts/install-hooks.sh --yes    # 非互動模式（自動確認）

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 解析命令列參數
AUTO_YES=false
for arg in "$@"; do
  case $arg in
    --yes|-y)
      AUTO_YES=true
      ;;
    --help|-h)
      echo "使用方式: $0 [選項]"
      echo ""
      echo "選項:"
      echo "  --yes, -y     自動確認所有提示（非互動模式，適合 CI/CD）"
      echo "  --help, -h    顯示此說明訊息"
      exit 0
      ;;
    *)
      echo "未知選項: $arg"
      echo "使用 --help 查看說明"
      exit 1
      ;;
  esac
done

# 檢查是否在互動式終端（如果不是且沒有 --yes，則退出）
if [ "$AUTO_YES" = false ] && [ ! -t 0 ]; then
  echo "錯誤：在非互動式環境中執行，但未指定 --yes 參數"
  echo "提示：在 CI/CD 環境請使用: $0 --yes"
  exit 1
fi

echo ""
echo -e "${BLUE}🔧 Git Hooks 安裝程式${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 檢查是否在 git repository 中
if [ ! -d .git ]; then
  echo -e "${RED}❌ 錯誤：請在 git repository 根目錄執行此腳本${NC}"
  exit 1
fi

# 檢查 .githooks 目錄是否存在
if [ ! -d .githooks ]; then
  echo -e "${RED}❌ 錯誤：找不到 .githooks 目錄${NC}"
  exit 1
fi

# 檢查 git-secrets 是否已安裝
echo -e "${BLUE}📋 檢查環境...${NC}"
if ! command -v git-secrets &> /dev/null; then
  echo -e "${YELLOW}⚠️  警告：git-secrets 尚未安裝${NC}"
  echo ""
  echo "git-secrets 提供機敏資訊保護功能（pre-commit hook）"
  echo ""
  echo "請執行以下指令安裝："
  echo -e "${GREEN}  brew install git-secrets${NC}"
  echo -e "${GREEN}  git secrets --install${NC}"
  echo ""

  if [ "$AUTO_YES" = true ]; then
    echo "自動模式：繼續安裝 pre-push hook"
  else
    read -p "是否繼續安裝 pre-push hook？ (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
else
  echo -e "${GREEN}✅ git-secrets 已安裝${NC}"
fi

echo ""
echo -e "${BLUE}📦 開始安裝 Hooks...${NC}"
echo ""

# 安裝計數
installed_count=0

# 複製 hooks（跳過 README.md）
for hook in .githooks/*; do
  hook_name=$(basename "$hook")

  # 跳過 README.md 和其他非 hook 檔案
  if [ "$hook_name" = "README.md" ] || [ ! -f "$hook" ]; then
    continue
  fi

  # 檢查是否會覆蓋現有的 hook
  if [ -f ".git/hooks/$hook_name" ]; then
    # 特殊處理 pre-commit（git-secrets）
    if [ "$hook_name" = "pre-commit" ]; then
      echo -e "${YELLOW}⚠️  跳過 pre-commit（由 git-secrets 管理）${NC}"
      continue
    fi

    echo -e "${YELLOW}⚠️  .git/hooks/$hook_name 已存在${NC}"

    if [ "$AUTO_YES" = true ]; then
      echo "   自動模式：覆蓋現有的 hook"
    else
      read -p "   是否覆蓋？ (y/N) " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}   → 跳過 $hook_name${NC}"
        continue
      fi
    fi
  fi

  # 複製並設定執行權限（加入錯誤處理）
  if cp "$hook" ".git/hooks/$hook_name" 2>/dev/null; then
    if chmod +x ".git/hooks/$hook_name" 2>/dev/null; then
      echo -e "${GREEN}✅ 已安裝: $hook_name${NC}"
      ((installed_count++))
    else
      echo -e "${RED}❌ 錯誤：無法設定執行權限 $hook_name${NC}"
      echo -e "${YELLOW}   請檢查檔案權限${NC}"
    fi
  else
    echo -e "${RED}❌ 錯誤：無法複製 $hook_name${NC}"
    echo -e "${YELLOW}   請檢查 .githooks/ 目錄權限${NC}"
  fi
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 安裝完成！${NC}"
echo ""

if [ $installed_count -eq 0 ]; then
  echo -e "${YELLOW}⚠️  沒有安裝任何新的 hooks${NC}"
  echo ""
else
  echo -e "${GREEN}📋 已安裝 $installed_count 個 hook(s)${NC}"
  echo ""
fi

echo -e "${BLUE}🛡️  目前啟用的保護機制：${NC}"
if [ -f .git/hooks/pre-commit ]; then
  echo -e "   ${GREEN}✓${NC} pre-commit (git-secrets) - 防止機敏資訊外洩"
else
  echo -e "   ${RED}✗${NC} pre-commit - 未安裝（請執行: git secrets --install）"
fi

if [ -f .git/hooks/pre-push ]; then
  echo -e "   ${GREEN}✓${NC} pre-push - 防止直接推送到 main 分支"
else
  echo -e "   ${YELLOW}⚠${NC} pre-push - 未安裝"
fi

echo ""
echo -e "${BLUE}💡 使用提示：${NC}"
echo "   • 正常開發流程會自動觸發這些 hooks"
echo "   • 緊急情況可使用 --no-verify 繞過檢查"
echo "   • 更多資訊請參考: .githooks/README.md"
echo ""
echo -e "${BLUE}🧪 測試建議：${NC}"
echo "   1. 測試 pre-push:"
echo "      ${GREEN}git checkout main${NC}"
echo "      ${GREEN}git push${NC}  ${YELLOW}# 應該被阻擋${NC}"
echo ""
echo "   2. 測試 git-secrets:"
echo "      ${GREEN}echo 'token=glpat-test' > test.txt${NC}"
echo "      ${GREEN}git add test.txt && git commit -m 'test'${NC}  ${YELLOW}# 應該被阻擋${NC}"
echo ""
