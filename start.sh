#!/usr/bin/env bash
# =============================================================================
# start.sh —— Linux 生产部署脚本（PRODUCTION）
#
# 严格执行顺序（不可调换）：
#   1. git pull origin main
#   2. backend：激活 venv -> pip install -r requirements.txt -> alembic upgrade head
#   3. frontend：npm install -> npm run build（生产必须构建）
#   4. pm2 restart frontend / pm2 restart backend
#   5. curl 刷新 503 维护快照（站点健康探测，仍返回 503/502/504 即判定失败）
#   6. pm2 status
#
# 硬性约定：
#   - 所有 pip/python/alembic 操作均在 backend/venv 内执行，绝不使用系统全局 Python；
#   - backend/venv 必须预先手动创建，本脚本不负责创建（防止覆盖既有虚拟环境）；
#   - 任一步骤失败立即终止，并输出红色错误提示与失败阶段名。
#
# 可选环境变量：
#   SITE_HEALTHCHECK_URL  第 5 步探测地址，默认 http://127.0.0.1/
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ------------------------------------------------------------------ 颜色/阶段
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

STAGE="初始化"

on_error() {
  echo -e "${RED}❌ ERROR: 【${STAGE}】执行失败，部署中止！${NC}" >&2
}
trap on_error ERR

stage() {
  STAGE="$1"
  echo ""
  echo -e "${YELLOW}==== [${STAGE}] ====${NC}"
}

VENV_ACTIVATE="backend/venv/bin/activate"

# venv 统一前置检查：脚本绝不自动创建虚拟环境
require_venv() {
  if [ ! -f "$VENV_ACTIVATE" ]; then
    echo -e "${RED}❌ 未找到后端虚拟环境：$VENV_ACTIVATE${NC}" >&2
    echo -e "${RED}   请先在服务器手动初始化（仅首次）：${NC}" >&2
    echo -e "${RED}     cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt${NC}" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------- 1. git pull
stage "拉取最新代码 git pull origin main"
git pull origin main

# ----------------------------------------------------- 2. backend venv + pip
require_venv

stage "后端依赖安装（激活 venv -> pip install）"
(
  trap - ERR
  cd backend
  # shellcheck disable=SC1091
  source ./venv/bin/activate
  echo "使用 Python：$(command -v python)"
  python -m pip install -r requirements.txt
)

# ------------------------------------------------------------ 3. 数据库迁移
stage "数据库迁移 alembic upgrade head"
(
  trap - ERR
  cd backend
  # shellcheck disable=SC1091
  source ./venv/bin/activate
  python -m alembic upgrade head
)

# ------------------------------------------------ 4. frontend npm i + build
stage "前端依赖安装 npm install"
(
  trap - ERR
  cd frontend
  npm install
)

stage "前端生产构建 npm run build"
(
  trap - ERR
  cd frontend
  npm run build
)

# ----------------------------------------------------------------- 5. pm2
stage "重启 PM2 进程 frontend"
pm2 restart frontend

stage "重启 PM2 进程 backend"
pm2 restart backend

# ------------------------------------------------- 6. 刷新 503 维护快照
# 重启后探测站点：服务已恢复时应返回 2xx/3xx；
# 若仍返回 503（维护快照未刷新/服务未就绪）或 502/504，则重试，最终失败即中止。
stage "刷新 503 维护快照（站点健康探测）"
HEALTHCHECK_URL="${SITE_HEALTHCHECK_URL:-http://127.0.0.1/}"
HTTP_CODE="000"
for i in $(seq 1 15); do
  HTTP_CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTHCHECK_URL" || echo "000")"
  case "$HTTP_CODE" in
    2*|3*)
      echo -e "${GREEN}站点已恢复（HTTP ${HTTP_CODE}），503 维护快照已刷新。${NC}"
      break
      ;;
    *)
      echo "第 ${i}/15 次探测：HTTP ${HTTP_CODE}，2 秒后重试..."
      sleep 2
      ;;
  esac
done
case "$HTTP_CODE" in
  2*|3*) ;;
  *)
    echo -e "${RED}❌ 站点在 PM2 重启后仍未恢复（最终 HTTP ${HTTP_CODE}，探测地址 ${HEALTHCHECK_URL}）。${NC}" >&2
    echo -e "${RED}   请立即检查 pm2 logs frontend / pm2 logs backend 与 Nginx 状态。${NC}" >&2
    exit 1
    ;;
esac

# ----------------------------------------------------------------- 7. 状态
stage "PM2 进程状态 pm2 status"
pm2 status

echo ""
echo -e "${GREEN}✅ 生产部署全部完成：代码更新、依赖安装、数据库迁移、前端构建、PM2 重启均成功。${NC}"
