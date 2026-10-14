#!/usr/bin/env bash
# =============================================================================
# 部署后静态维护页部署脚本（503 维护兜底 · Nginx error_page 挂载）
#
# 作用：
#   将纯静态维护页（frontend/components/maintenance/ 下的 index.html + style.css）
#   部署到 Nginx 挂载目录（默认 /var/www/maintenance/）。
#   Nginx 检测到 Node 3000 端口返回 502/504（进程宕机 / 无法连接）时，
#   error_page 502 504 =503 /maintenance/index.html 回退到该静态页，
#   状态码强制 503 且严禁缓存（见 deploy/nginx/gdueca.conf）。
#
#   页面为原生 HTML/CSS，无编译 / 构建 / 运行时依赖，Nginx 直接挂载即可渲染；
#   页面内样式通过相对路径 ./style.css 引用，故两个文件必须一并部署。
#
# 使用：
#   chmod +x deploy/scripts/post_deploy.sh && ./deploy/scripts/post_deploy.sh
#   建议在每次部署成功后由 CI 或部署流程自动调用（源码变动时重新同步一次即可）。
#
# 环境变量（均有默认值，可覆盖）：
#   SRC_DIR   静态维护页源码目录，默认 <repo>/frontend/components/maintenance
#   DEST_DIR  部署目录（Nginx 挂载点），默认 /var/www/maintenance
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SRC_DIR:-$(cd "$SCRIPT_DIR/../../frontend/components/maintenance" && pwd)}"
DEST_DIR="${DEST_DIR:-/var/www/maintenance}"

FILES=(index.html style.css)

echo "[post_deploy] 静态维护页：$SRC_DIR -> $DEST_DIR"

mkdir -p "$DEST_DIR"

for name in "${FILES[@]}"; do
  src="$SRC_DIR/$name"
  if [ ! -f "$src" ]; then
    echo "[post_deploy] 错误：缺少源文件 $src" >&2
    exit 1
  fi
  # 临时文件落在目标目录内，保证 mv 为同文件系统原子替换（避免出现半成品）
  tmp="$(mktemp "$DEST_DIR/.$name.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT
  cp "$src" "$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$DEST_DIR/$name"
  trap - EXIT
  echo "[post_deploy] 已部署：$DEST_DIR/$name"
done

# 校验部署结果确为维护页（含 503 与英文文案），并确认样式为相对引用
if ! grep -q "503" "$DEST_DIR/index.html" || ! grep -q "under maintenance" "$DEST_DIR/index.html"; then
  echo "[post_deploy] 错误：部署内容不是维护页" >&2
  exit 1
fi
if ! grep -q 'href="./style.css"' "$DEST_DIR/index.html"; then
  echo "[post_deploy] 警告：index.html 未使用相对路径 ./style.css 引用样式" >&2
fi

echo "[post_deploy] 完成：Node 宕机（502/504）时 Nginx 将回退到该静态页（状态码 503，禁止缓存）。"
