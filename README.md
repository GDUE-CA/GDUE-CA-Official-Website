**[English version](./README.en.md)**

<div align="center">

# 广东第二师范学院计算机协会 · 官方网站

**GDUE-CA Official Website** —— 校园社团门户 / 个人中心 / 管理后台一体化平台

[![Next.js](https://img.shields.io/badge/Next.js-16.3-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.14x-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-ready-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Nginx](https://img.shields.io/badge/Nginx-HTTP%2F3-269539?logo=nginx&logoColor=white)](https://nginx.org)
[![i18n](https://img.shields.io/badge/i18n-19_locales-orange)](#国际化)

[![Status](https://img.shields.io/badge/status-active-success)]()
[![Maintenance](https://img.shields.io/badge/503_static-maintenance-blueviolet)](#503-静态维护兜底机制)
[![License](https://img.shields.io/badge/license-Source--Available-lightgrey)](./LICENSE-ZH.md)

**🌐 在线访问：[https://www.gdueca.com](https://www.gdueca.com)**

</div>

---

## 项目简介

**广东第二师范学院（花都校区）计算机协会官方网站**是一个前后端完全分离的一体化信息化平台，包含**公开门户**、**个人设置中心**两个用户侧子系统，以及独立的**管理员后台**。它既是社团对外展示与活动运营的门面，也是成员与管理员日常协作的底座。

**项目定位**：以「通用 SaaS 底座 + 社团业务上层实例」的方式构建——鉴权、RBAC、审计、限流、软删除、国际化、统一响应壳等底层能力不含任何社团专属硬编码，可平滑迁移至企业 SaaS、OTA 平台或企业内网办公系统；社团业务（活动 / 招新 / 博客 / 项目等）仅作为上层实例接入。

**用途**：
- **公开门户** — 社团介绍、活动公告与在线报名、项目展示、技术博客、备忘板（Memo）、Bug 反馈与回执查询；
- **个人设置中心** — 基础资料、个人主页封面（Banner）、隐私权限、本地化偏好、账号安全、登录设备管理、第三方账号绑定与通知偏好；
- **管理员后台** — 仪表盘、活动 / 博客 / 项目 / 成员 / 招新 / 内容 / 媒体管理、**审核中心**（注册 / 社团申请 / Bug / 密码重置 / 学校身份 / 换绑邮箱六类聚合）、**角色与权限矩阵管理**、实名审核、数据统计、审计日志、系统设置、安全面板、内容回收站、邮件与推送（系统就绪门禁）。

**部署架构**：`Cloudflare CDN` → `Nginx（HTTP/2 + HTTP/3 反代）` → `Next.js（127.0.0.1:3000，PM2 托管）` + `FastAPI（127.0.0.1:8000，gunicorn + uvicorn worker）` → `PostgreSQL`（开发环境零配置回退 SQLite）。全站仅 Nginx 对外，应用只监听回环地址。

---

## 主要特性

### 用户系统

- **RBAC 四级角色**：`super_admin` / `admin` / `editor` / `member`（外加匿名访客），配合细粒度模块权限矩阵（28 个权限模块）；角色默认矩阵为代码内置，**单账号可配置模块级权限覆盖**（仅 super_admin 可写，覆盖命中模块即完全替代默认矩阵），后台「角色管理」页（`/admin/roles`）可视化查看矩阵、成员分布与覆盖账号；
- **完整账号闭环**：注册 / 登录 / 找回密码（邮箱验证码）/ 修改密码（强制旧密码 + 会话撤消管理）/ 实名认证 / 邮箱与手机绑定 / **换绑邮箱三路径**（双验证码 · 四项核验 · 人工审核）/ TOTP 二次验证；
- **个人主页与社交关注**：`/{locale}/u/{username}` 个人主页，宽幅 **Banner 封面**（上传图片服务端压缩 / 自定义纯色 / 系统默认渐变三态）+ 头像叠放，About / Posts 双 Tab（About 默认，Posts 懒加载）；隐私开关由用户自主控制；
- **单向关注体系**：关注即生效、无需审批（`user_follows` 表，接口幂等），**双向互关自动标记为好友**；个人主页展示粉丝 / 关注计数与三态按钮（本人→编辑资料、登录访客→关注 / 已关注、未登录→跳转登录）；Break-Glass 应急账号无社交身份，相关接口直接 403；
- **服务端会话**：可撤销、硬顶过期、空闲超时、记住设备 30 天、心跳滑动续期，登录设备可远程登出。

### 安全体系（重点：503 静态维护兜底）

- **静态 503 维护兜底**：Node 服务无响应（进程宕机 / 502 / 504）时，Nginx 自动回退到完全独立的静态维护页，任何维护场景**永远返回 503，禁止 200**，保护搜索引擎 SEO 索引。详见[核心机制说明](#503-静态维护兜底机制)。
- **Break-Glass 应急账号**：凭据仅存环境变量（bcrypt 哈希），永不入库；用于清空管理员等灾难修复，全程高危二次确认并写审计日志；
- **账号 + 设备指纹阶梯防爆破**：按「账号 × IP × 浏览器指纹」三维独立计数，阶梯式封禁（分钟级递进至永久），对外统一模糊化提示，真实原因仅落审计日志；
- **纵深防御**：CSRF 双重提交令牌、HttpOnly Cookie、CSP nonce、XSS 输入过滤、头像魔数校验、IP 黑白名单、后台仅限内网登录；
- **全量审计 + 软删除**：所有管理员变更操作写全局审计日志；删除一律软删除并进入回收站，定时任务每小时扫描、物理删除超 30 天的记录。

### 国际化

- **19 门语言**，UI 翻译语言与区域格式化（日期 / 数字 / 货币）**严格分离**，可独立选择；
- 三级优先级解析：用户个人设置 > URL `/{locale}/` 前缀 > 系统全局默认；变体语言缺失词条沿回退链兜底，不落空白；
- 语言清单由构建期扫描 `i18n/messages/*.json` 自动生成（单一真值源），驱动 Edge 重写、字典加载、语言切换器、sitemap 与 hreflang。

### UI 主题

- **双主题体系**：深浅色（跟随系统 / 手动）与**主题风格**（微软默认主题、Apple 主题、节日主题）相互独立，可叠加；
- 主题在客户端首帧前由防 FOUC 内联脚本应用，无闪烁；
- 响应式三栏设置面板（桌面 / 平板 / 手机自适应），移动端抽屉菜单与手势关闭；
- 全站零 Web 字体、零 `@font-face`，完全复用客户端本机系统字体。

### SEO

- `robots.txt`、**动态 `sitemap.xml`**（按全部语言自动展开）、18 语言 `hreflang` 互链；
- schema.org 结构化数据、每页唯一 canonical；
- **IndexNow** 即时收录推送，配合 Cloudflare CDN 与 Nginx HTTP/3 提升抓取与访问体验。

---

## 技术栈

### 前端

| 类别 | 技术 |
| --- | --- |
| 框架 | Next.js 16 App Router（Turbopack）、React 19、TypeScript 5 |
| 样式 / UI | Tailwind CSS v4、自研主题 UI（Radix UI 原语、shadcn/ui 风格、Lucide Icons、Framer Motion） |
| 表单 / 内容 | react-hook-form + zod、react-markdown（remark-gfm / rehype-highlight） |
| 图表 / 其他 | Recharts、qrcode.react |
| 包管理 | pnpm 11（corepack） |

### 后端

| 类别 | 技术 |
| --- | --- |
| 框架 | FastAPI、Uvicorn |
| ORM / 校验 | SQLAlchemy 2.0（async）、Pydantic v2、pydantic-settings |
| 数据库 | PostgreSQL（生产，asyncpg）/ SQLite（开发，aiosqlite） |
| 缓存 / KV | Redis（防爆破计数、封禁、应急会话；未配置时进程内存兜底） |
| 安全 | python-jose（JWT）、bcrypt、Authlib（OAuth）、nh3（HTML 清洗）、Pillow（图片压缩） |

### 运维部署

| 类别 | 技术 |
| --- | --- |
| 反向代理 | Nginx（HTTP/2 + HTTP/3 / QUIC、真实 IP 透传、后台内网限制） |
| 进程管理 | PM2（Next.js 与后端进程常驻与自愈） |
| CDN / DNS | Cloudflare（海外节点、缓存与真实 IP 还原） |
| 维护兜底 | 纯静态维护页 `frontend/components/maintenance/`（部署脚本 `deploy/scripts/post_deploy.sh`）+ Nginx `error_page 502/504 → 503` |

---

## 项目目录结构

```text
GDUE-CA-Official-Website/
├── frontend/                         # Next.js 16 + TypeScript 前端
│   ├── app/
│   │   ├── [locale]/                 #   多语言公开门户（about/events/projects/blog/memo/join/contact/query ...）
│   │   ├── setting/                  #   统一设置页（所有角色共用）
│   │   ├── admin/                    #   管理员后台（含 (dashboard) 路由组）
│   │   ├── auth/                     #   账号注册 / 登录
│   │   └── api/                      #   接口路由
│   ├── i18n/                         # 完整国际化系统（messages/*.json + 变体深合并）
│   ├── components/
│   │   ├── layout/                   #   全局组件：导航、页脚
│   │   ├── theme/                    #   主题切换组件
│   │   ├── setting/                  #   设置三栏布局与各设置表单
│   │   ├── profile/                  #   用户资料 / 隐私设置组件
│   │   ├── maintenance/              #   ✅ 纯静态 503 维护页（无编译/运行时依赖）
│   │   │   ├── index.html            #     完整独立页面（相对路径引用 style.css）
│   │   │   └── style.css             #     维护页样式（系统字体栈 / prefers-color-scheme）
│   │   ├── admin/ blog/ events/ memo/ projects/ ... 
│   │   └── ui/                       #   基础 UI 原语
│   ├── lib/
│   │   ├── api/                      #   鉴权、限流、各业务 API 封装
│   │   ├── i18n.ts                   #   语言单一真值源
│   │   └── hooks/ navigation.ts      #   语言逻辑与导航工具
│   ├── proxy.ts                      # Edge 唯一入口（i18n + 守卫）；禁止新建 middleware.ts
│   └── public/                       # 静态资源与 SEO 文件（robots / sitemap 由 app/ 生成）
├── backend/                          # FastAPI 后端
│   ├── app/
│   │   ├── api/                      #   接口（auth/activities/blog/projects/memos/users(社交关注)/roles(权限矩阵)/security/audit ...）
│   │   ├── core/                     #   通用底座（security/permissions/brute_force/rate_limit/responses ...）
│   │   ├── db/                       #   models.py（全部 ORM + 状态枚举）/ session.py
│   │   ├── schemas/                  #   数据校验模型
│   │   └── utils/                    #   crud / export / receipt / translator
│   ├── scripts/                      #   运维与种子脚本
│   └── tests/                        #   pytest 测试
├── deploy/                           # 部署目录
│   └── scripts/post_deploy.sh        #   静态维护页部署脚本（同步到 /var/www/maintenance）
├── docs/                             # SPEC.md / BREAK_GLASS_OPS.md 等文档
└── .env.example 环境变量模板
```

---

## 环境变量配置

> 前端全部变量在**构建时**固化，修改后必须重新 `pnpm build`；后端变量在启动时读取。

### 后端（`backend/.env`，完整以 `backend/.env.example` 为准）

```dotenv
# 服务监听
HOST=127.0.0.1
PORT=8000

# 数据库（开发零配置用 SQLite；生产用 PostgreSQL）
DATABASE_URL=sqlite+aiosqlite:///./assoc.db
# DATABASE_URL=postgresql+asyncpg://gdueca:强密码@127.0.0.1:5432/gdueca

# JWT 签名密钥（≥32 位随机串；留空自动生成并写入 backend/.jwt_secret）
JWT_SECRET_KEY=

# Break-Glass 应急账号（凭据仅存环境变量，永不入库）
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD_HASH=$2b$12$...   # bcrypt 哈希，禁止明文
SUPER_ADMIN_ENABLED=true

# 管理员来源 IP 白名单（逗号分隔，支持 IPv4 / IPv6 地址及两者的 CIDR 网段）
# 例：ADMIN_TRUSTED_IPS=127.0.0.1,192.168.1.0/24,::1,2001:db8::/32
# 默认留空 = 不限制来源 IP，账号密码正确即可登录（防爆破 / 指纹限流照常生效）；
# 填入条目后开启白名单：仅列表内来源可登录 / 使用管理员级账号（editor / admin /
# super_admin 及 Break-Glass），其余来源拒绝（提示「请求来源不合法」）；
# 普通用户（member）不受此变量影响。
# 优先级：后台 Web 配置（管理员可信 IP 白名单，支持 IPv4/IPv6/CIDR 混合、# 注释、
# 非法行整体拒绝并提示行号）优先生效；数据库配置为空时才读取本环境变量。
ADMIN_TRUSTED_IPS=

# 通用 KV 存储（生产必配，多 worker 共享限流 / 封禁计数）
REDIS_URL=

# SMTP 邮件服务（忘记密码 / 换绑邮箱验证码；
# SMTP_HOST 留空 = 未配置邮件服务，验证码仅记录到服务端日志，仅限开发环境）
SMTP_HOST=
SMTP_PORT=465
SMTP_USERNAME=
SMTP_PASSWORD=                       # 授权码 / 密码
SMTP_FROM=                           # 发件人地址；留空时取 SMTP_USERNAME
SMTP_FROM_NAME=GDUE-CA
SMTP_USE_SSL=true                    # true = SSL 直连（465）；false = STARTTLS（587）

# 发信通道：smtp（默认）/ graph（Microsoft Graph sendMail，走 HTTPS 443；
# Exchange Online 已停用 SMTP 基本认证、或云主机封禁出站 SMTP 端口时使用）
# graph 需在 Entra ID 注册应用：Mail.Send 应用程序权限 + 管理员同意，
# 并用 RBAC for Applications 限定只能以 GRAPH_SENDER 发信
MAIL_PROVIDER=smtp
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
GRAPH_SENDER=                        # 发件邮箱；留空时取 SMTP_FROM
```

### 前端（`frontend/.env.local`，完整以 `frontend/.env.example` 为准）

```dotenv
# 服务端访问的后端地址（SSR + 同源 /api 反代目标）
BACKEND_URL=http://127.0.0.1:8000

# 浏览器直连后端地址（一般留空，走同源反代；跨域部署才设置）
NEXT_PUBLIC_API_BASE_URL=

# 站点对外绝对地址（sitemap / robots 使用）
NEXT_PUBLIC_SITE_URL=https://www.gdueca.com

# Umami 网站统计（可选，两项都填才加载）
NEXT_PUBLIC_UMAMI_WEBSITE_ID=
NEXT_PUBLIC_UMAMI_SRC=
```

---

## 本地开发教程

### 前端启动

```bash
cd frontend
pnpm install
cp .env.example .env.local          # Windows PowerShell: copy .env.example .env.local
pnpm dev                             # 访问 http://localhost:3000
```

> 浏览器统一请求同源 `/api/*`、`/uploads/*`，由 `next.config.ts` rewrites 转发到后端，登录 Cookie 为第一方 Cookie，无需配置 CORS。通过局域网 IP / Tailscale 访问时，可在 `DEV_ALLOWED_ORIGINS` 追加来源。

### 后端启动

> ⚠️ 后端**必须在 `backend/` 目录内启动**：`DATABASE_URL` 默认使用相对路径 `sqlite+aiosqlite:///./assoc.db`，在仓库根目录启动会产生游离的数据库文件。

```bash
cd backend
python -m venv venv
# Windows PowerShell
.\venv\Scripts\Activate.ps1
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
copy .env.example .env               # Windows PowerShell；Linux/WSL/macOS: cp .env.example .env
python run.py                        # 默认监听 http://127.0.0.1:8000
```

健康检查：`GET http://127.0.0.1:8000/health`。首次部署需访问 `/{locale}/admin/setup` 用 Break-Glass 账号完成初始化向导。

### 一键脚本与首次初始化虚拟环境

仓库根目录提供统一脚本，所有 `pip / python / uvicorn / alembic` 操作**一律先激活 `backend/venv` 虚拟环境**，绝不使用系统全局 Python。虚拟环境固定位于 `backend/venv`，脚本**不负责创建**（防止重复覆盖破坏现有环境），仅首次初始化时手动执行一次：

首次初始化后端虚拟环境（Linux / WSL / macOS）：

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Windows 首次初始化虚拟环境（PowerShell）：

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

| 脚本 | 平台 / 模式 | 行为 |
| --- | --- | --- |
| `dev.sh` | Linux / WSL / macOS · 开发 | **无** git pull、**无** build、**无**自动迁移；后台并行启动 `npm run dev` 与 venv 内 `uvicorn app.main:app --reload`；Ctrl-C 统一杀死全部子进程 |
| `dev.ps1`（或双击 `dev.bat`） | Windows · 开发 | 同上；另开两个 PowerShell 窗口（自动以 Bypass 执行策略启动，避免 `Activate.ps1` / `npm.ps1` 被拦截） |
| `migrate.sh` / `migrate.ps1` | 手动数据库迁移 | 仅在 venv 内执行 `alembic upgrade head`，开发模式不会自动调用 |
| `start.sh` | Linux · 生产部署 | 严格顺序：`git pull origin main` → venv 内 `pip install` → `alembic upgrade head` → `npm install` → **`npm run build`（生产必须构建）** → `pm2 restart frontend/backend` → curl 刷新 503 维护快照（健康探测，仍为 503/502/504 即判失败中止）→ `pm2 status`；任一步失败立即终止并打印失败阶段 |

> 生产脚本第 5 步探测地址可用环境变量覆盖：`SITE_HEALTHCHECK_URL=https://你的域名/ ./start.sh`（默认 `http://127.0.0.1/`）。

---

## 生产部署流程

### 1. 构建与启动

```bash
# 前端构建（BACKEND_URL / NEXT_PUBLIC_SITE_URL 在构建时固化）
cd frontend
pnpm install --frozen-lockfile
pnpm build
pm2 start pnpm --name gdueca-web -- start      # next start 绑定 127.0.0.1:3000

# 后端（多 worker 时必须配置 REDIS_URL）
cd ../backend
# FORWARDED_ALLOW_IPS="" 关闭 uvicorn 自带的代理头改写，由应用按 TRUSTED_PROXIES 判定真实 IP
FORWARDED_ALLOW_IPS="" gunicorn -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 app.main:app
FORWARDED_ALLOW_IPS="" pm2 start --name gdueca-api -- gunicorn -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 app.main:app

pm2 save
```

> 上述全流程可直接执行仓库根目录的生产脚本 `./start.sh`（自动按序完成 git pull → venv 内 pip install → alembic 迁移 → npm install/build → pm2 重启 → 503 健康探测）；PM2 进程名需与脚本中的 `frontend` / `backend` 一致。

### 2. Nginx 配置

宿主机 Nginx 配置由服务器自行维护（不随仓库分发），需具备：真实 IP 透传（`X-Forwarded-For` / `X-Real-IP`，前端风控依赖）、`/admin` 仅内网、Next.js 502/504 回退静态维护页（状态码 503、禁止缓存）。修改后 `nginx -t && systemctl reload nginx`。

### 3. 部署静态维护页（部署后必做）

```bash
chmod +x deploy/scripts/post_deploy.sh
./deploy/scripts/post_deploy.sh
```

脚本将纯静态维护页（`frontend/components/maintenance/` 的 `index.html` + `style.css`）原子同步到 Nginx 挂载目录 `/var/www/maintenance/`。部署要点：

- 页面为原生 HTML/CSS，**无需编译 / 构建 / 运行时环境**，Nginx 挂载即可渲染；样式经相对路径 `./style.css` 引用，两文件必须同目录一并部署；
- 脚本会校验部署内容确为维护页（含 `503` 与 `under maintenance`），否则报错退出；
- Nginx 检测到 Node `3000` 端口 `502/504`（进程宕机 / 无法连接）时，`error_page 502 504 =503 /maintenance/index.html` 回退到该静态页，状态码强制 503、响应头 `Cache-Control: no-cache, no-store, must-revalidate` 严禁缓存。

### 4. Cloudflare 与安全注意事项

- ⚠️ **直接暴露 Next.js 3000 端口会使客户端可伪造 X-Forwarded-For 冒充内网**，必须经反代并由 Nginx 覆盖 XFF（`proxy_set_header X-Forwarded-For $remote_addr;`）；
- 生产请设置 `COOKIE_SECURE=true`、强随机 `JWT_SECRET_KEY`、`ENABLE_API_DOCS=false`、配置 Redis 与全站 HTTPS；
- 套用 Cloudflare 时，用官方 IP 列表 `set_real_ip_from` + `real_ip_header CF-Connecting-IP` 还原访客真实 IP（表单 submit_ip 与访问统计依赖）；
- Cloudflare 可能缓存 `502/504`：建议对 HTML 关闭「Always Online」缓存回源，或确保源站返回的 503 静态维护页携带 `no-store` 头以穿透 CDN；
- 部署新版本前如需主动停机，可临时在 Nginx 层让主站返回 503（指向静态维护页），再滚动更新后端，使访客始终看到维护页。

### 5. Docker 一体化部署（可选）

单镜像内含 Nginx（对外 `:8080`）+ Next.js（`127.0.0.1:3000`）+ FastAPI（`127.0.0.1:8000`），由 tini 托管，全部以非 root 用户运行：

```bash
docker compose up -d --build        # 访问 http://<服务器IP>:8080
docker compose logs -f              # Nginx / 前端 / 后端统一日志格式，按 request id（req=）串联
```

- **持久化**：数据库、上传文件、`.jwt_secret` 均位于命名卷 `gdueca-data`（容器内 `/data`）；也可把后端 `.env` 放到 `/data/.env`；
- **配置**：后端变量与 `backend/.env.example` 相同，写在 `docker-compose.yml` 的 `environment`；`NEXT_PUBLIC_*` 在构建时固化，写在 `build.args`；
- **真实 IP**：容器前面还有 CDN / 负载均衡 / 宿主机 Nginx 时，必须设置 `REAL_IP_FROM`（上游网段，逗号分隔），否则管理员 IP 白名单与登录限流都只能看到上游地址；
- **Break-Glass**：默认凭据 admin/admin，上线前务必通过 `SUPER_ADMIN_PASSWORD_HASH` 替换（compose 文件中 `$` 需写成 `$$`）；
- **健壮性**：根文件系统只读、`cap_drop: ALL`；任一进程退出即整体重启；Next.js 未就绪时 Nginx 返回 503 静态维护页；内置健康检查同时探测前后端。

---

## 核心机制说明

### i18n 双分离

**UI 翻译语言**（菜单 / 按钮文案）与**区域格式化规则**（日期、星期起始日、数字、货币）严格解耦，可分别选择：

- 三级优先级：用户个人持久设置（非空优先）> URL `/{locale}/` 前缀（仅影响 UI 文字）> 系统全局默认；
- 前端所有 `/api/*` 请求自动注入 `X-Locale` 头；时间一律 UTC 存储、IANA 时区渲染；
- 单一真值源：`frontend/lib/i18n.ts` 的 locales 列表驱动 Edge 重写、字典加载、语言切换器、sitemap 与 hreflang；
- 变体翻译文件仅存放与父语言有差异的 key，构建时深合并，缺失词条沿回退链兜底。

### 503 静态维护兜底机制

当 Node.js 服务无响应时，Nginx 自动回退并展示**完全独立于主项目的纯静态 503 维护页**：

| 触发条件 | 行为 |
| --- | --- |
| Node `3000` 端口返回 502/504（进程宕机 / 无法连接） | Nginx `proxy_intercept_errors on` + `error_page 502 504 =503 /maintenance/index.html`，回退到静态维护页，状态码固定 **503** |

**页面源码**：`frontend/components/maintenance/`（`index.html` + `style.css`，原生 HTML/CSS，无编译 / 构建 / 运行时依赖）；由 `deploy/scripts/post_deploy.sh` 同步到 Nginx 挂载目录 `/var/www/maintenance/`。页面内样式经**相对路径** `./style.css` 引用，随目录一并挂载即可正常加载。

> **样式备注**：维护页**模仿 Next.js 默认 404 页面风格**——纯黑白、简洁干净、无多余装饰、无边框阴影；数字 `503` 与文案均为 Next.js 默认 404 同款字号（数字 `24px` / `500`，文案 `14px` / `400`）；`min-height:100vh` 且 flex 水平 + 垂直居中；同行左侧 `503`，右侧中文「本站点正在维护中，敬请期待。」，中文正下方英文「This site is under maintenance, please stay tuned.」；**无导航栏、无页脚、不接入 i18n**，中英文字硬编码写死。
>
> 配色依靠 `@media (prefers-color-scheme)` 跟随**系统**深浅色：浅色=纯白背景 `#ffffff` + 黑字 `#000000`，深色=纯黑背景 `#000000` + 白字 `#ffffff`；**完全独立，不受站内用户主题控制**。
>
> 字体严格使用系统字体栈 `-apple-system, "San Francisco", "Segoe UI", Roboto, system-ui, Helvetica, Arial, sans-serif`，**禁止加载任何外部 Web 字体，零额外网络请求**。

所有维护场景**永远返回 503，禁止 200**（保护搜索引擎 SEO 索引，避免爬虫把 503 误判为正常页而清空索引）。

### Break-Glass 与防爆破安全

- **Break-Glass 应急账号**：`SUPER_ADMIN_USERNAME/PASSWORD_HASH/ENABLED` 三项环境变量；缺失则进程 FATAL 退出。会话以布尔标记记录、不续期；用于「清空全部管理员」等灾难修复，操作全程高危确认与审计；
- **系统未初始化门禁**：`system_initialized=false` 时普通账号登录被拒（仅应急账号可进入初始化向导）；
- **阶梯防爆破**：按「账号 × IP × 浏览器指纹」独立计数，阶梯式封禁从分钟级递进至永久；对外统一返回模糊化提示（真实原因仅落审计日志）；提供封禁面板支持查看与解封。

### 数据库异步导出（后台任务）

数据库导出现在为**后台异步任务**（后台 → 系统设置 → 数据库维护 →「执行一次完整数据库导出」）：

1. 按下导出按钮立刻返回 `task_id`，任务在服务器后台运行，**不用停留在该页面等待**；
2. 进度可以看**右下角悬浮弹窗**，或者顶部导航栏**通知中心**（前端每 800ms 轮询一次，进入成功/失败终态后自动停止轮询）；
3. 任务记录**永久保存在通知列表，由用户手动关闭清除，不会自动消失**；刷新页面后进入通知中心依然可见历史后台任务（任务落库 `background_tasks` 表，进程重启不丢，启动时自动把中断的 pending/running 标记为 failed）；
4. 完成后备份文件依旧存放在服务器 `./exports`（目录 0700 / 文件 0600 权限，已 gitignore），**SFTP 手动下载**。

> 导出操作照常写入全局审计日志（`system.db.export`）；`background_tasks` 仅作进度展示层，不替代审计。数据库导入维持同步执行不变（superadmin 专属 + 双重确认）。

### 换绑邮箱三路径与站内私信

- **路径 A · 双验证码**（旧邮箱仍可用）：旧 / 新邮箱验证码同时下发，加当前密码三项核验通过即换绑，不撤销任何会话；
- **路径 B · 四项核验**（旧邮箱不可用）：密码 / 学号 / 手机 / 实名四项全部一致才放行，任一错误统一返回模糊 403（防枚举），连续失败 5 次锁定 1 小时；核验通过后仅需新邮箱验证码；
- **路径 C · 人工审核**（自助均不可用）：提交申请进入待审状态（期间禁止一切自助换绑），管理员在后台「换绑邮箱审核」（`review.emails` 权限）同意后，再由用户本人最后确认才正式生效；
- **站内私信通知**：审核通过 / 驳回（含理由）/ 换绑成功三类结果自动写入 `user_messages` 站内私信，与公告广播合并计入通知中心未读角标，支持单条已读与一键全部已读。

### 后台导航、权限矩阵与功能门禁

- **审核中心聚合**：后台侧边栏一级菜单「审核中心」统一收纳六类待办——注册审核、社团申请、Bug 反馈、密码重置审核、学校身份验证、换绑邮箱审核，通过 `?tab=` 深链在同一审核页内定位；顶栏铃铛待办角标直达；
- **模块权限矩阵**：`core/permissions.py` 以「模块 × 角色 → 动作集合（view/manage）」为单一真值源，super_admin 恒全通过；接口侧 `require_permission(module, action)` 强制鉴权（UI 置灰/隐藏仅为体验层，不作为安全边界），账号级覆盖矩阵 JSON 落库 `users.permission_overrides`；
- **功能门禁（邮件与推送）**：`system_settings.mail_system_ready` 为系统就绪开关，未就绪时侧边栏「邮件与推送」置灰（悬停 tooltip 说明），直接访问 `/admin/mailpush` 仅渲染黄色警告门禁页；该开关随公开设置接口下发，无需登录即可驱动门禁 UI；
- **后台布局**：`h-dvh` flex 布局，侧边栏菜单与右侧主内容区为两个独立滚动容器（`overscroll-contain` 防止滚动链穿透），侧边栏支持汉堡折叠（折叠态图标 popover 展开子菜单）。

### SEO & 爬虫适配

- `robots.txt` + **动态 `sitemap.xml`**（按全部语言自动展开所有静态与内容页）；
- 18 语言 `hreflang` 互链 + 每页唯一 canonical，配合 schema.org 结构化数据；
- **IndexNow** 即时推送新内容；维护场景恒返回 503 并带 `Retry-After`，**避免爬虫把 503 误判为 200 正常页而清空索引**；
- 全站 HTTPS + Nginx HTTP/3，缩短握手与首字节时间，提升抓取效率。

---

## 贡献指南

欢迎社团成员参与贡献。完整贡献规则与 PR 版权约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)（中文参考版 [CONTRIBUTING-ZH.md](./CONTRIBUTING-ZH.md)）：

1. **分支策略**：`main` 始终保持可运行、可部署；从 `main` 切功能分支 `feat/<模块>-<简述>`、`fix/<问题简述>`、`docs/<主题>`，完成后发起 Pull Request，至少一名成员 review 后合并。
2. **提交信息**：采用 [Conventional Commits](https://www.conventionalcommits.org/)（`feat` / `fix` / `docs` / `refactor` / `perf` / `test` / `chore`）。
3. **代码规范**：前端 TypeScript 严格模式零错误（`tsc --noEmit`）并通过 ESLint；后端保持既有分层（`api → schemas → core/db`），业务状态只用枚举、统一响应壳与 `BizException`、管理员变更必写审计、删除一律软删除；Edge 层只有 `proxy.ts`，**严禁新建 `middleware.ts`**；密码输入一律复用全局 `PasswordInput` 组件（每框独立眼睛切换、刷新自动复位，禁止手写原生 `type="password"`）。
4. **提交前自检**：后端 `pytest` 全通过、前端 `tsc` / `lint` 无错误、翻译 key 已补齐、未提交密钥与本地产物。

---

## 贡献者墙

感谢每一位为协会官网付出心力的成员：

<a href="https://github.com/paperee/GDUE-CA-Official-Website-main/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paperee/GDUE-CA-Official-Website-main" alt="Contributors" />
</a>

---

## 许可与版权

本项目采用自定义 **Source-Available（源码可见）** 许可发布——源代码公开可查看，便于学习与研究；未获得 OSI 认证，**不属于开源软件，严禁标注为开源**。软件按「现状」提供，无任何担保。

- 📄 [LICENSE](./LICENSE) —— 唯一法律效力文本（英文）
- 📄 [LICENSE-ZH.md](./LICENSE-ZH.md) —— 中文参考版（仅供阅读参考，法律权责以英文 LICENSE 为准）
- 📄 [COPYRIGHT.md](./COPYRIGHT.md) —— 版权与联系信息（[English](./COPYRIGHT.en.md)）
- 📄 [CONTRIBUTING.md](./CONTRIBUTING.md) —— 贡献规则（[中文参考版](./CONTRIBUTING-ZH.md)）

---

<div align="center">

**广东第二师范学院（花都校区）计算机协会** · © Guangdong University of Education — Computer Association. All rights reserved.

🌐 官网：[https://www.gdueca.com](https://www.gdueca.com)　·　💬 反馈：[GitHub Issues](https://github.com/paperee/GDUE-CA-Official-Website-main/issues)

完整版权与联系信息见 [COPYRIGHT.md](./COPYRIGHT.md)（[English](./COPYRIGHT.en.md)）

</div>
