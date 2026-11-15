#!/usr/bin/env bash
# ============================================================
# 洁神洗车 · 后端服务器安装脚本（nohup 常驻）
#
# 用法（在服务器上，代码已解压到 APP_DIR）：
#   cd /opt/jieshenxiche
#   bash deploy/install.sh
#
# 可用环境变量覆盖：
#   APP_DIR=/opt/jieshenxiche   PORT=8099
#   DB_HOST=127.0.0.1  DB_PORT=3306  DB_USER=root  DB_PASSWORD=xxx  DB_NAME=jieshenxiche
#   ADMIN_TOKEN=xxx     MOCK_OCR=1
# 不传 DB_PASSWORD / ADMIN_TOKEN 时会交互询问。
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
PORT="${PORT:-8099}"

echo "=========================================="
echo " 洁神洗车后端安装"
echo " 目录: $APP_DIR"
echo " 端口: $PORT"
echo "=========================================="

# ---------- 1. Node.js 检查 ----------
if ! command -v node >/dev/null 2>&1; then
  cat <<'EOF'
❌ 服务器上没有 Node.js（需要 >= 18）。任选一种装：

  # Debian / Ubuntu（推荐 NodeSource 20.x）
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs

  # CentOS / Rocky
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && yum install -y nodejs

  # 或 nvm
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  source ~/.bashrc && nvm install 20

装完重新执行：bash deploy/install.sh
EOF
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Node 版本过低：$(node -v)，需要 >= 18（代码用了内置 fetch / fs.promises）"
  exit 1
fi
echo "✅ Node $(node -v)  npm $(npm -v)"

# ---------- 2. 生成 .env ----------
if [ -f .env ]; then
  echo "✅ 已有 backend/.env，沿用（要改就编辑它后 bash deploy/manage.sh restart）"
else
  read -r -p "数据库地址 [127.0.0.1]: " IN_DB_HOST; IN_DB_HOST="${IN_DB_HOST:-127.0.0.1}"
  read -r -p "数据库端口 [3306]: " IN_DB_PORT; IN_DB_PORT="${IN_DB_PORT:-3306}"
  read -r -p "数据库用户 [root]: " IN_DB_USER; IN_DB_USER="${IN_DB_USER:-root}"
  if [ -n "${DB_PASSWORD:-}" ]; then
    IN_DB_PASS="$DB_PASSWORD"
  else
    read -r -s -p "数据库口令（输入不显示，注意末尾符号）: " IN_DB_PASS; echo
  fi
  read -r -p "数据库名 [jieshenxiche]: " IN_DB_NAME; IN_DB_NAME="${IN_DB_NAME:-jieshenxiche}"
  if [ -n "${ADMIN_TOKEN:-}" ]; then
    IN_TOKEN="$ADMIN_TOKEN"
  else
    IN_TOKEN="js-$(head -c 18 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 12)"
  fi
  cat > .env <<EOF
# 由 deploy/install.sh 生成于 $(date '+%F %T')
PORT=$PORT
PUBLIC_BASE_URL=http://127.0.0.1:$PORT

DB_HOST=$IN_DB_HOST
DB_PORT=$IN_DB_PORT
DB_USER=$IN_DB_USER
DB_PASSWORD=$IN_DB_PASS
DB_NAME=$IN_DB_NAME
DB_CONN_LIMIT=10

ADMIN_TOKEN=$IN_TOKEN

# 不填腾讯云密钥时自动走模拟识别
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_OCR_REGION=ap-guangzhou
MOCK_OCR=1
EOF
  chmod 600 .env
  echo "✅ 已生成 backend/.env（权限 600）"
  echo "   后台登录口令 ADMIN_TOKEN = $IN_TOKEN"
fi

mkdir -p logs run uploads data

# ---------- 3. 安装依赖 ----------
if [ "${SKIP_DEPS:-0}" = "1" ]; then
  echo "↷ SKIP_DEPS=1，跳过依赖安装（复用已有 node_modules）"
else
  echo "→ 安装依赖（只装生产依赖）"
  if [ -f package-lock.json ]; then
    npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
  else
    npm install --omit=dev --no-audit --no-fund
  fi
  echo "✅ 依赖安装完成"
fi

# ---------- 4. 建库建表（幂等） ----------
echo "→ 检查数据库 / 建表（幂等）"
if npm run db:init; then
  echo "✅ 数据库就绪"
else
  echo "⚠️  数据库初始化失败：口令或网络问题，先修好再执行 npm run db:init"
fi

# ---------- 5. 启动 ----------
bash deploy/manage.sh restart

sleep 2
echo
bash deploy/manage.sh status || true
echo
echo "后台管理：http://<服务器IP>:$PORT/admin/"
echo "健康检查：http://<服务器IP>:$PORT/health"
echo "进程管理：bash deploy/manage.sh {start|stop|restart|status|logs}"
