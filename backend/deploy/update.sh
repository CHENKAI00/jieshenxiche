#!/usr/bin/env bash
# ============================================================
# 洁神洗车 · 服务器增量更新脚本
# 用法（在 /opt/jieshenxiche 下）：
#   bash deploy/update.sh
#
# 做的事：
#   1) 备份 .env
#   2) 安装/更新生产依赖
#   3) 依次跑幂等迁移（v2→v5）
#   4) 重启并自检 /health
# 前置：.env 里必须有 PHONE_ENC_KEY（数据库手机号已加密，换钥匙会解不开）
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 0. 环境检查 =="
[ -f .env ] || { echo "❌ 缺少 backend/.env"; exit 1; }
if ! grep -q '^PHONE_ENC_KEY=.\+' .env; then
  cat <<'EOF'
❌ .env 里没有 PHONE_ENC_KEY。
   数据库里的手机号已用本地密钥加密，必须把开发机 backend/.env 的
   PHONE_ENC_KEY=... 原样复制到服务器的 .env，再执行本脚本。
   否则服务虽然能起，但读不出任何手机号。
EOF
  exit 1
fi
echo "✅ PHONE_ENC_KEY 已配置"

echo "== 1. 备份配置 =="
cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
mkdir -p logs run uploads data

echo "== 2. 依赖 =="
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi

echo "== 3. 数据库迁移（幂等） =="
npm run db:migrate || true
npm run migrate:v3 || true
npm run migrate:v4 || true
npm run migrate:v5

echo "== 4. 重启 =="
bash deploy/manage.sh restart

sleep 2
echo "== 5. 自检 =="
PORT="$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d ' \r')"
PORT="${PORT:-8099}"
curl -s -m 5 "http://127.0.0.1:$PORT/health" || true
echo
curl -s -o /dev/null -m 5 -w "admin 页面: %{http_code}\n" "http://127.0.0.1:$PORT/admin/"
curl -s -o /dev/null -m 5 -w "车主端接口 /api/v1/customer/services: %{http_code}\n" "http://127.0.0.1:$PORT/api/v1/customer/services"
curl -s -o /dev/null -m 5 -w "预约接口 /api/v1/catalog: %{http_code}\n" "http://127.0.0.1:$PORT/api/v1/catalog"
