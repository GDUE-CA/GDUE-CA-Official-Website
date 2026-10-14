# syntax=docker/dockerfile:1.7
# =============================================================================
# GDUECA 官网一体化镜像：Nginx（入口 :8080）+ Next.js 前端 + FastAPI 后端
#
#   docker build -t gdueca .
#   docker run -d --name gdueca -p 8080:8080 -v gdueca-data:/data gdueca
#
# 构建阶段：
#   frontend-build  pnpm 安装依赖并构建 Next.js standalone 产物
#   backend-build   安装 Python 依赖到独立虚拟环境
#   runtime         python:slim + Node 运行时 + Nginx + tini，全部以非 root 用户运行
# =============================================================================

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.13

# ---------------------------------------------------------------------------
# 1) 前端构建
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS frontend-build
WORKDIR /build/frontend

ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# 先只复制依赖清单，充分利用构建缓存
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml frontend/.npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY frontend/ ./

# 以下变量在构建时固化进产物（见 frontend/.env.example）
# 容器内后端固定为 127.0.0.1:8000，浏览器通过同源 /api 访问
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=""
ARG NEXT_PUBLIC_UMAMI_SRC=""
ENV BACKEND_URL=http://127.0.0.1:8000 \
    NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=${NEXT_PUBLIC_UMAMI_WEBSITE_ID} \
    NEXT_PUBLIC_UMAMI_SRC=${NEXT_PUBLIC_UMAMI_SRC}
RUN pnpm build \
 # standalone 不含静态资源与 public，需手动放入
 && cp -r .next/static .next/standalone/.next/static \
 && cp -r public .next/standalone/public

# ---------------------------------------------------------------------------
# 2) 后端依赖
# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim-bookworm AS backend-build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
RUN python -m venv /opt/venv
COPY backend/requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install -r /tmp/requirements.txt

# ---------------------------------------------------------------------------
# 3) 运行时
# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime

LABEL org.opencontainers.image.title="gdueca-website" \
      org.opencontainers.image.description="广东第二师范学院计算机协会官网（Nginx + Next.js + FastAPI）"

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx tini \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /etc/nginx/sites-enabled/default \
 && groupadd --system --gid 10001 gdueca \
 && useradd --system --uid 10001 --gid gdueca --home-dir /data --shell /usr/sbin/nologin gdueca \
 && mkdir -p /data /tmp/nginx \
 && chown -R gdueca:gdueca /data /tmp/nginx

# Node 运行时（只需二进制，standalone 产物已自带依赖）
COPY --from=frontend-build /usr/local/bin/node /usr/local/bin/node

COPY --from=backend-build /opt/venv /opt/venv
COPY --chown=root:root backend/app /app/backend/app
COPY --chown=root:root backend/run.py backend/requirements.txt /app/backend/
COPY --chown=root:root backend/scripts /app/backend/scripts
COPY --from=frontend-build --chown=root:root /build/frontend/.next/standalone /app/frontend
COPY --chown=root:root frontend/components/maintenance /app/maintenance
COPY --chown=root:root docker/nginx.conf /etc/nginx/nginx.conf
COPY --chown=root:root --chmod=0755 docker/entrypoint.sh docker/healthcheck.sh /app/docker/

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # 后端：仅监听回环，由 Nginx 转发；数据全部落在 /data 卷
    HOST=127.0.0.1 \
    PORT=8000 \
    DATABASE_URL=sqlite+aiosqlite:////data/assoc.db \
    LOG_FORMAT=text \
    LOG_LEVEL=INFO

# 应用代码只读（root 所有），运行用户只对 /data 与 /tmp 可写
USER gdueca
WORKDIR /data
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/app/docker/healthcheck.sh"]

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
