#!/usr/bin/env bash
# =============================================================================
# GDUECA 一体化镜像启动脚本（由 tini 作为 PID 1 托管）
# 同时运行 FastAPI（127.0.0.1:8000）、Next.js（127.0.0.1:3000）与 Nginx（:8080）；
# 任一进程退出即整体退出，交给 Docker 的 restart 策略重启，避免「半死」状态
# =============================================================================
set -Eeuo pipefail

log() { echo "$(date +%Y-%m-%dT%H:%M:%S.%3N%:z) INFO  [req=-] entrypoint | $*"; }

# ---- 持久化数据目录：数据库、上传文件、JWT 密钥、初始管理员口令、备份 ----
mkdir -p /data/uploads/avatars /data/backups /tmp/nginx

# ---- 外层负载均衡 / CDN 真实 IP 还原（逗号分隔 CIDR，如 REAL_IP_FROM=10.0.0.0/8,172.16.0.0/12）----
: > /tmp/nginx/real_ip.conf
if [[ -n "${REAL_IP_FROM:-}" ]]; then
  IFS=',' read -ra cidrs <<< "${REAL_IP_FROM}"
  for cidr in "${cidrs[@]}"; do
    cidr="$(echo "$cidr" | tr -d '[:space:]')"
    [[ "$cidr" =~ ^[0-9a-fA-F:./]+$ ]] || { echo "非法的 REAL_IP_FROM 项：$cidr" >&2; exit 1; }
    echo "set_real_ip_from ${cidr};" >> /tmp/nginx/real_ip.conf
  done
  echo "real_ip_header ${REAL_IP_HEADER:-X-Forwarded-For};" >> /tmp/nginx/real_ip.conf
  echo "real_ip_recursive on;" >> /tmp/nginx/real_ip.conf
  log "已启用真实 IP 还原，可信上游：${REAL_IP_FROM}"
fi
nginx -e stderr -t -q

pids=()
shutdown() {
  log "收到退出信号，正在停止所有进程"
  kill -TERM "${pids[@]}" 2>/dev/null || true
  wait || true
}
trap shutdown TERM INT

# ---- FastAPI：工作目录 /data（.env、数据库、uploads、.jwt_secret 均相对此目录）----
(cd /data && exec python /app/backend/run.py) &
pids+=($!)
log "后端已启动 pid=$!"

# ---- Next.js standalone：工作目录须为前端目录 ----
# Docker 会把 HOSTNAME 设为容器 ID，必须显式覆盖为回环地址
(cd /app/frontend && HOSTNAME=127.0.0.1 PORT=3000 exec node server.js) &
pids+=($!)
log "前端已启动 pid=$!"

nginx -e stderr -g 'daemon off;' &
pids+=($!)
log "Nginx 已启动 pid=$!，监听 :8080"

# 任一子进程退出 → 停止其余进程并以其退出码退出
set +e
wait -n
code=$?
log "有进程退出（code=${code}），停止容器"
kill -TERM "${pids[@]}" 2>/dev/null
wait
exit "${code}"
