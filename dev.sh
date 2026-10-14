#!/usr/bin/env bash
# =============================================================================
# dev.sh —— Linux / WSL / macOS 本地开发启动脚本（DEV）
#
# DEV 铁律：
#   ❌ 禁止 git pull；❌ 禁止 npm run build；❌ 禁止 alembic 自动迁移
#   （数据库迁移由开发者手动执行：./migrate.sh）
#   ✅ 前端 npm run dev（热重载）；✅ 后端 venv 内 uvicorn --reload
#
# 所有 python/uvicorn 操作均在 backend/venv 内执行；venv 需预先手动创建，
# 本脚本不负责创建虚拟环境。
# Ctrl-C 统一杀死前端 / 后端全部子进程后退出。
# =============================================================================
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

VENV_ACTIVATE="backend/venv/bin/activate"

if [ ! -f "$VENV_ACTIVATE" ]; then
  echo -e "${RED}❌ 未找到后端虚拟环境：$VENV_ACTIVATE${NC}" >&2
  echo -e "${RED}   请先手动初始化（仅首次）：${NC}" >&2
  echo -e "${RED}     cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt${NC}" >&2
  exit 1
fi

if [ ! -d "$SCRIPT_DIR/frontend" ]; then
  echo -e "${RED}❌ 未找到 frontend 目录，请在仓库根目录运行本脚本。${NC}" >&2
  exit 1
fi

echo -e "${YELLOW}⚠️  DEVELOPMENT MODE, NO git pull, NO build, NO auto migrate${NC}"
echo -e "${YELLOW}   数据库迁移请手动执行：./migrate.sh${NC}"

# 递归结束整棵进程树（npm 会派生子进程，仅杀 PID 会残留）
kill_tree() {
  local pid="$1"
  local children
  children="$(pgrep -P "$pid" 2>/dev/null || true)"
  for child in $children; do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

FE_PID=""
BE_PID=""

shutdown() {
  echo ""
  echo -e "${YELLOW}收到 Ctrl-C，正在停止前端 / 后端开发进程...${NC}"
  [ -n "$FE_PID" ] && kill_tree "$FE_PID"
  [ -n "$BE_PID" ] && kill_tree "$BE_PID"
  wait 2>/dev/null || true
  echo -e "${GREEN}✅ 全部开发进程已退出。${NC}"
  exit 0
}
trap shutdown INT TERM

# 前端（后台运行）
(
  cd frontend
  exec npm run dev
) &
FE_PID=$!

# 后端（后台运行：激活 venv 后以 --reload 启动）
(
  cd backend
  # shellcheck disable=SC1091
  source ./venv/bin/activate
  exec python -m uvicorn app.main:app --reload
) &
BE_PID=$!

echo -e "${CYAN}▶ 前端 Next.js： http://localhost:3000${NC}"
echo -e "${CYAN}▶ 后端 FastAPI：http://127.0.0.1:8000（健康检查 /health）${NC}"
echo -e "${CYAN}  按 Ctrl-C 同时停止前后端。${NC}"

# 任一子进程存活则持续等待；任一意外退出则整体停止
while kill -0 "$FE_PID" 2>/dev/null || kill -0 "$BE_PID" 2>/dev/null; do
  if ! kill -0 "$FE_PID" 2>/dev/null; then
    echo -e "${RED}❌ 前端进程已意外退出，停止全部开发服务。${NC}" >&2
    kill_tree "$BE_PID"
    exit 1
  fi
  if ! kill -0 "$BE_PID" 2>/dev/null; then
    echo -e "${RED}❌ 后端进程已意外退出，停止全部开发服务。${NC}" >&2
    kill_tree "$FE_PID"
    exit 1
  fi
  sleep 2
done
