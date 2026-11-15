#!/usr/bin/env bash
# 一键把本地仓库推到远程 Git（GitHub / Gitee / 自建 Gitea / 裸仓库均可）
#
# 用法：
#   ./scripts/push-git.sh git@github.com:<你的账号>/jieshenxiche.git
#   ./scripts/push-git.sh https://gitee.com/<你的账号>/jieshenxiche.git
#   ./scripts/push-git.sh ssh://git@27.124.46.63:2222/git/jieshenxiche.git
#
# 说明：
#   1. 先在平台上「新建空仓库」（不要勾选初始化 README），拿到仓库地址；
#   2. 本仓库已提交在 main 分支，.env / node_modules 已被 .gitignore 排除；
#   3. HTTPS 方式会提示输入用户名 + 访问令牌（GitHub 不支持密码，用 PAT）。
set -euo pipefail

REMOTE="${1:-}"
if [ -z "$REMOTE" ]; then
  echo "用法: $0 <仓库地址>"
  echo "例:   $0 git@github.com:yourname/jieshenxiche.git"
  exit 1
fi

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  还有未提交的改动，先提交再推："
  git status --short
  echo
  read -r -p "现在自动提交（feat: 更新）? [y/N] " ans
  if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
    git add -A
    git commit -m "feat: 更新"
  else
    echo "已取消。"
    exit 1
  fi
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
echo "→ 推送到 $REMOTE (main)"
git push -u origin main

echo
echo "✅ 完成。仓库地址："
git remote get-url origin
