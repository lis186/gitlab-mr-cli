#!/bin/bash
# 敏感資訊快速檢查腳本

set -e

echo "🔍 掃描敏感資訊..."
echo ""

FOUND_ISSUES=0

# 1. 檢查檔案內容（排除合法範例）
echo "【1/4】檢查檔案內容..."
SUSPICIOUS=$(grep -rn "glpat-[a-zA-Z0-9_-]\{20,\}\|password\s*=\s*['\"][^'\"x]\+['\"]" \
  --include="*.ts" --include="*.js" --include="*.yml" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.specstory \
  . 2>/dev/null | \
  grep -v "example\.com" | \
  grep -v "xxxx" | \
  grep -v "your.*here" | \
  grep -v "防止敏感資訊" || true)

if [ -n "$SUSPICIOUS" ]; then
  echo "$SUSPICIOUS"
  echo "❌ 發現可疑內容"
  FOUND_ISSUES=1
else
  echo "✅ 通過"
fi
echo ""

# 2. 檢查 Git 歷史
echo "【2/4】檢查最近 10 個 commits..."
SUSPICIOUS_COMMITS=$(git log -10 --pretty=format:"%s %b" | \
  grep -iE "(password|token|secret|key|glpat)" | wc -l | tr -d ' ')
if [ "$SUSPICIOUS_COMMITS" -gt 0 ]; then
  echo "⚠️  發現 $SUSPICIOUS_COMMITS 個可疑 commit"
  FOUND_ISSUES=1
else
  echo "✅ 通過"
fi
echo ""

# 3. 檢查 .env 檔案
echo "【3/4】檢查 .env 檔案..."
if git ls-files | grep "\.env$" >/dev/null 2>&1; then
  echo "❌ .env 被 Git 追蹤！執行: git rm --cached .env"
  FOUND_ISSUES=1
else
  echo "✅ .env 未被追蹤"
fi
echo ""

# 4. 檢查 .gitignore
echo "【4/4】檢查 .gitignore..."
if ! grep -q "^\.env$" .gitignore; then
  echo "⚠️  .gitignore 未包含 .env"
  FOUND_ISSUES=1
else
  echo "✅ .gitignore 設定正確"
fi
echo ""

# 總結
if [ $FOUND_ISSUES -eq 0 ]; then
  echo "✅ 所有檢查通過！"
  exit 0
else
  echo "⚠️  發現問題，請檢查上述輸出"
  exit 1
fi
