#!/usr/bin/env bash
# =============================================================================
# 数据库备份脚本（V0.6.0 Issue12 · 低配服务器友好）
#
# 作用：
#   解析后端 DATABASE_URL 并导出一致性备份：
#   - SQLite（默认 sqlite+aiosqlite:///./assoc.db）：
#       优先用 sqlite3 ".backup" 在线一致性快照（不阻塞业务、不含半写事务）；
#       未安装 sqlite3 时回退为直接 cp（风险：若恰逢写入可能得到不一致副本）。
#   - PostgreSQL（postgresql+asyncpg://user:pass@host:port/db）：
#       pg_dump 自定义格式（-Fc，已内置压缩）。
#   产出按日期命名的备份文件，保留最近 KEEP_COPIES 份，自动清理更早备份。
#
# 使用：
#   chmod +x deploy/scripts/db_backup.sh
#   ./deploy/scripts/db_backup.sh                 # 自动读取 backend/.env 的 DATABASE_URL
#   DATABASE_URL='sqlite+aiosqlite:///./assoc.db' ./deploy/scripts/db_backup.sh
#
# 环境变量（均有默认值，可覆盖）：
#   DATABASE_URL  后端连接串；缺省时尝试 source backend/.env，再回退内置默认值
#   BACKUP_DIR    备份输出目录，默认 /var/backups/gdueca
#   KEEP_COPIES   保留份数，默认 7
#
# Crontab 每日 03:17 备份示例（crontab -e 添加一行）：
#   17 3 * * * /path/to/GDUE-CA-Official-Website/deploy/scripts/db_backup.sh >> /var/log/gdueca-backup.log 2>&1
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gdueca}"
KEEP_COPIES="${KEEP_COPIES:-7}"

# ---------- 解析 DATABASE_URL：环境变量 > backend/.env > 内置默认 ----------
if [ -z "${DATABASE_URL:-}" ] && [ -f "$REPO_DIR/backend/.env" ]; then
  # shellcheck disable=SC1091
  DATABASE_URL="$(grep -E '^\s*DATABASE_URL\s*=' "$REPO_DIR/backend/.env" | tail -n 1 | sed -E 's/^\s*DATABASE_URL\s*=\s*//; s/^["'\'']//; s/["'\'']\s*$//')"
fi
DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:///./assoc.db}"

STAMP="$(date +%Y%m%d-%H%M%S)"

log() { echo "[db_backup] $*"; }

# ---------- 生成备份文件（输出到 $OUT） ----------
OUT=""
case "$DATABASE_URL" in
  sqlite*)
    # sqlite+aiosqlite:///./assoc.db → 相对 backend/ 目录解析
    DB_PATH="${DATABASE_URL#sqlite*:///}"
    DB_PATH="${DB_PATH%%\?*}"   # 去查询参数
    case "$DB_PATH" in
      /*) ;;                    # 绝对路径
      *)  DB_PATH="$REPO_DIR/backend/$DB_PATH" ;;
    esac
    [ -f "$DB_PATH" ] || { log "错误：SQLite 数据库文件不存在：$DB_PATH" >&2; exit 1; }
    mkdir -p "$BACKUP_DIR"
    if command -v sqlite3 >/dev/null 2>&1; then
      OUT="$BACKUP_DIR/gdueca-sqlite-$STAMP.db.gz"
      sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/.tmp-$STAMP.db'"
      gzip -f "$BACKUP_DIR/.tmp-$STAMP.db"           # → .tmp-$STAMP.db.gz
      mv -f "$BACKUP_DIR/.tmp-$STAMP.db.gz" "$OUT"
    else
      log "警告：未安装 sqlite3，回退为直接 cp（恰逢写入可能不一致，建议安装 sqlite3）" >&2
      OUT="$BACKUP_DIR/gdueca-sqlite-$STAMP.db.gz"
      cp -f "$DB_PATH" "$BACKUP_DIR/.tmp-$STAMP.db"
      gzip -f "$BACKUP_DIR/.tmp-$STAMP.db"
      mv -f "$BACKUP_DIR/.tmp-$STAMP.db.gz" "$OUT"
    fi
    ;;
  postgresql*|postgres*)
    # postgresql+asyncpg://user:pass@host:port/dbname → pg_dump -Fc
    CLEAN_URL="${DATABASE_URL/postgresql+asyncpg:/postgresql://}"
    CLEAN_URL="${CLEAN_URL/postgresql+psycopg:/postgresql://}"
    DB_NAME="${CLEAN_URL##*/}"
    DB_NAME="${DB_NAME%%\?*}"
    [ -n "$DB_NAME" ] || { log "错误：无法从 DATABASE_URL 解析库名" >&2; exit 1; }
    mkdir -p "$BACKUP_DIR"
    OUT="$BACKUP_DIR/gdueca-pg-$DB_NAME-$STAMP.dump"
    pg_dump --no-owner --no-privileges -Fc -f "$OUT" "$CLEAN_URL"
    ;;
  *)
    log "错误：不支持的 DATABASE_URL 协议（仅支持 sqlite* / postgresql*）" >&2
    exit 1
    ;;
esac

chmod 0600 "$OUT"   # 备份含用户数据，仅属主可读写
log "已生成：$OUT"

# ---------- 滚动清理：仅保留最近 KEEP_COPIES 份（按文件名时间戳排序） ----------
ls -1t "$BACKUP_DIR"/gdueca-*.db.gz "$BACKUP_DIR"/gdueca-pg-*.dump 2>/dev/null \
  | tail -n +$((KEEP_COPIES + 1)) \
  | while IFS= read -r old; do
      rm -f -- "$old"
      log "已清理过期备份：$old"
    done

log "完成（保留最近 $KEEP_COPIES 份）。恢复方法见 docs/DEPLOY_OPS.md。"
