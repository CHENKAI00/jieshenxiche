#!/usr/bin/env bash
# 洁神洗车 · 后端进程管理（nohup 常驻，不依赖 systemd）
# 用法：bash deploy/manage.sh {start|stop|restart|status|logs}
set -uo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
PID_FILE="$APP_DIR/run/app.pid"
LOG_FILE="$APP_DIR/logs/app.log"
PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d ' \r')"
PORT="${PORT:-8099}"

mkdir -p "$APP_DIR/run" "$APP_DIR/logs"

# 装了 systemd 单元就优先用 systemd（能开机自启、崩溃自动拉起）
USE_SYSTEMD=0
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^jieshenxiche\.service'; then
  USE_SYSTEMD=1
fi

is_running() {
  [ -f "$PID_FILE" ] || return 1
  local pid; pid="$(cat "$PID_FILE" 2>/dev/null)"
  [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null
}

start() {
  if is_running; then
    echo "已在运行 (PID $(cat "$PID_FILE"))，端口 $PORT"
    return 0
  fi
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "❌ 端口 $PORT 已被其它进程占用："
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN
    return 1
  fi
  echo "→ 启动（nohup）：node src/app.js  日志：logs/app.log"
  nohup node src/app.js >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 1
  if is_running; then
    echo "✅ 已启动 PID $(cat "$PID_FILE")"
  else
    echo "❌ 启动失败，最后 20 行日志："
    tail -n 20 "$LOG_FILE"
    return 1
  fi
}

stop() {
  if ! is_running; then
    echo "未运行"
    rm -f "$PID_FILE"
    return 0
  fi
  local pid; pid="$(cat "$PID_FILE")"
  echo "→ 停止 PID $pid"
  kill "$pid" 2>/dev/null
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.3
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "→ 未退出，强制结束"
    kill -9 "$pid" 2>/dev/null
  fi
  rm -f "$PID_FILE"
  echo "✅ 已停止"
}

status() {
  if is_running; then
    echo "进程：运行中 PID $(cat "$PID_FILE")"
  else
    echo "进程：未运行"
  fi
  if command -v curl >/dev/null 2>&1; then
    echo -n "健康检查："
    curl -s -m 5 "http://127.0.0.1:$PORT/health" || echo "无响应（检查 logs/app.log）"
    echo
  fi
}

if [ "$USE_SYSTEMD" = "1" ]; then
  case "${1:-}" in
    start)   systemctl start jieshenxiche && systemctl --no-pager -l status jieshenxiche | head -5 ;;
    stop)    systemctl stop jieshenxiche ;;
    restart) systemctl restart jieshenxiche && sleep 1 && systemctl --no-pager -l status jieshenxiche | head -5 ;;
    status)  systemctl is-active jieshenxiche; curl -s -m 5 "http://127.0.0.1:$PORT/health"; echo ;;
    logs)    journalctl -u jieshenxiche -n 100 -f ;;
    *) echo "用法：bash deploy/manage.sh {start|stop|restart|status|logs}"; exit 1 ;;
  esac
  exit 0
fi

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 1; start ;;
  status)  status ;;
  logs)    tail -n 100 -f "$LOG_FILE" ;;
  *) echo "用法：bash deploy/manage.sh {start|stop|restart|status|logs}"; exit 1 ;;
esac
