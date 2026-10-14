#!/usr/bin/env bash
# =============================================================================
# migrate.sh —— Linux / WSL / macOS 数据库迁移脚本（仅此一件事）
#
# 在 backend/venv 内执行 alembic upgrade head；不做 git pull、不做构建。
# venv 需预先手动创建，本脚本不负责创建虚拟环境。
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

VENV_ACTIVATE="backend/venv/bin/activate"

on_error() {
  echo -e "${RED}❌迁移失败：alembic upgrade head 未完成，请根据上方日志排查。${NC}" >&2
}
trap on_error ERR

if [ ! -f "$VENV_ACTIVATE" ]; then
  echo -e "${RED}❌ 未找到后端虚拟环境：$VENV_ACTIVATE${NC}" >&2
  echo -e "${RED}   请先手动初始化（仅首次）：${NC}" >&2
  echo -e "${RED}     cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt${NC}" >&2
  exit 1
fi

cd backend
# shellcheck disable=SC1091
source ./venv/bin/activate

echo "使用 Python：$(command -v python)"
python -m alembic upgrade head

echo -e "${GREEN}✅ 迁移完成（alembic upgrade head）。${NC}"
