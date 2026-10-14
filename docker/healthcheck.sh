#!/usr/bin/env bash
# 健康检查：经 Nginx 同时探测后端（/health）与前端（首页，允许重定向）
set -euo pipefail
python - <<'PY'
import sys, urllib.request
for url in ("http://127.0.0.1:8080/health", "http://127.0.0.1:8080/zh-cn"):
    try:
        req = urllib.request.Request(url, headers={"X-Health-Check": "1"})
        with urllib.request.urlopen(req, timeout=4) as r:
            if r.status >= 400:
                sys.exit(f"{url} -> {r.status}")
    except Exception as e:
        sys.exit(f"{url} -> {e}")
PY
