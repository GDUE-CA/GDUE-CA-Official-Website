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
[![i18n](https://img.shields.io/badge/i18n-18_locales-orange)](#国际化)

[![Status](https://img.shields.io/badge/status-active-success)]()
[![Maintenance](https://img.shields.io/badge/503_static-maintenance-blueviolet)](#503-静态维护兜底机制)
[![License](https://img.shields.io/badge/license-Internal_Use-lightgrey)](#开源许可证)

**🌐 在线访问：[https://gdue-ca.paperee.guru](https://gdue-ca.paperee.guru)**

</div>

---

## 项目简介

**广东第二师范学院（花都校区）计算机协会官方网站**是一个前后端完全分离的一体化信息化平台，包含**公开门户**、**个人设置中心**两个用户侧子系统，以及独立的**管理员后台**。它既是社团对外展示与活动运营的门面，也是成员与管理员日常协作的底座。

**项目定位**：以「通用 SaaS 底座 + 社团业务上层实例」的方式构建——鉴权、RBAC、审计、限流、软删除、国际化、统一响应壳等底层能力不含任何社团专属硬编码，可平滑迁移至企业 SaaS、OTA 平台或企业内网办公系统；社团业务（活动 / 招新 / 博客 / 项目等）仅作为上层实例接入。

**用途**：
- **公开门户** — 社团介绍、活动公告与在线报名、项目展示、技术博客、备忘板（Memo）、Bug 反馈与回执查询；
- **个人设置中心** — 基础资料、隐私权限、本地化偏好、账号安全、登录设备管理、第三方账号绑定与通知偏好；
- **管理员后台** — 仪表盘、活动 / 博客 / 项目 / 成员 / 招新 / 内容 / 媒体管理、审核中心、实名审核、数据统计、审计日志、系统设置、安全面板、内容回收站。

**部署架构**：`Cloudflare CDN` → `Nginx（HTTP/2 + HTTP/3 反代）` → `Next.js（127.0.0.1:3000，PM2 托管）` + `FastAPI（127.0.0.1:8000，gunicorn + uvicorn worker）` → `PostgreSQL`（开发环境零配置回退 SQLite）。全站仅 Nginx 对外，应用只监听回环地址。

---

## 主要特性

### 用户系统

- **RBAC 四级角色**：`super_admin` / `admin` / `editor` / `member`（外加匿名访客），配合细粒度模块权限矩阵；
- **完整账号闭环**：注册 / 登录 / 找回密码 / 修改密码 / 实名认证 / 邮箱与手机绑定 / TOTP 二次验证；
- **个人主页与隐私权限**：`/{locale}/u/{username}` 个人主页，可见性、屏蔽名单等隐私开关由用户自主控制；
- **服务端会话**：可撤销、硬顶过期、空闲超时、记住设备 30 天、心跳滑动续期，登录设备可远程登出。

### 安全体系（重点：503 静态维护兜底）

- **静态 503 维护兜底**：Node 服务无响应（进程宕机 / 502 / 504）时，Nginx 自动回退到完全独立的静态维护页，任何维护场景**永远返回 503，禁止 200**，保护搜索引擎 SEO 索引。详见[核心机制说明](#503-静态维护兜底机制)。
- **Break-Glass 应急账号**：凭据仅存环境变量（bcrypt 哈希），永不入库；用于清空管理员等灾难修复，全程高危二次确认并写审计日志；
- **账号 + 设备指纹阶梯防爆破**：按「账号 × IP × 浏览器指纹」三维独立计数，阶梯式封禁（分钟级递进至永久），对外统一模糊化提示，真实原因仅落审计日志；
- **纵深防御**：CSRF 双重提交令牌、HttpOnly Cookie、CSP nonce、XSS 输入过滤、头像魔数校验、IP 黑白名单、后台仅限内网登录；
- **全量审计 + 软删除**：所有管理员变更操作写全局审计日志；删除一律软删除并进入回收站，定时任务每小时扫描、物理删除超 30 天的记录。

### 国际化

- **18 门语言**，UI 翻译语言与区域格式化（日期 / 数字 / 货币）**严格分离**，可独立选择；
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
│   │   ├── api/                      #   接口（auth/activities/blog/projects/memos/security/audit ...）
│   │   ├── core/                     #   通用底座（security/permissions/brute_force/rate_limit/responses ...）
│   │   ├── db/                       #   models.py（全部 ORM + 状态枚举）/ session.py
│   │   ├── schemas/                  #   数据校验模型
│   │   └── utils/                    #   crud / export / receipt / translator
│   ├── scripts/                      #   运维与种子脚本
│   └── tests/                        #   pytest 测试
├── deploy/                           # 部署目录
│   ├── nginx/gdueca.conf            #   Nginx 反代 + 静态维护页兜底
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
```

### 前端（`frontend/.env.local`，完整以 `frontend/.env.example` 为准）

```dotenv
# 服务端访问的后端地址（SSR + 同源 /api 反代目标）
BACKEND_URL=http://127.0.0.1:8000

# 浏览器直连后端地址（一般留空，走同源反代；跨域部署才设置）
NEXT_PUBLIC_API_BASE_URL=

# 站点对外绝对地址（sitemap / robots 使用）
NEXT_PUBLIC_SITE_URL=https://gdue-ca.paperee.guru

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
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env                 # Windows PowerShell: copy .env.example .env
python run.py                        # 默认监听 http://127.0.0.1:8000
```

健康检查：`GET http://127.0.0.1:8000/health`。首次部署需访问 `/{locale}/admin/setup` 用 Break-Glass 账号完成初始化向导。

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
gunicorn -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 app.main:app
pm2 start --name gdueca-api -- gunicorn -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 app.main:app

pm2 save
```

### 2. Nginx 配置

接入 [deploy/nginx/gdueca.conf](deploy/nginx/gdueca.conf)（HTTP/2 + HTTP/3、真实 IP 透传、`/admin` 仅内网、静态维护页兜底），随后 `nginx -t && systemctl reload nginx`。

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

### SEO & 爬虫适配

- `robots.txt` + **动态 `sitemap.xml`**（按全部语言自动展开所有静态与内容页）；
- 18 语言 `hreflang` 互链 + 每页唯一 canonical，配合 schema.org 结构化数据；
- **IndexNow** 即时推送新内容；维护场景恒返回 503 并带 `Retry-After`，**避免爬虫把 503 误判为 200 正常页而清空索引**；
- 全站 HTTPS + Nginx HTTP/3，缩短握手与首字节时间，提升抓取效率。

---

## 贡献指南

欢迎社团成员参与贡献：

1. **分支策略**：`main` 始终保持可运行、可部署；从 `main` 切功能分支 `feat/<模块>-<简述>`、`fix/<问题简述>`、`docs/<主题>`，完成后发起 Pull Request，至少一名成员 review 后合并。
2. **提交信息**：采用 [Conventional Commits](https://www.conventionalcommits.org/)（`feat` / `fix` / `docs` / `refactor` / `perf` / `test` / `chore`）。
3. **代码规范**：前端 TypeScript 严格模式零错误（`tsc --noEmit`）并通过 ESLint；后端保持既有分层（`api → schemas → core/db`），业务状态只用枚举、统一响应壳与 `BizException`、管理员变更必写审计、删除一律软删除；Edge 层只有 `proxy.ts`，**严禁新建 `middleware.ts`**。
4. **提交前自检**：后端 `pytest` 全通过、前端 `tsc` / `lint` 无错误、翻译 key 已补齐、未提交密钥与本地产物。

---

## 贡献者墙

感谢每一位为协会官网付出心力的成员：

<a href="https://github.com/paperee/GDUE-CA-Official-Website-main/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paperee/GDUE-CA-Official-Website-main" alt="Contributors" />
</a>

---

## 开源许可证

本项目源代码**仅供广东第二师范学院计算机协会内部学习与运营使用**（Internal Use License），未经许可不得用于商业用途；禁止用于电子商务、支付、广告、会员费、CRM、再营销等商业场景。详见仓库内版权声明。

---

## 社团版权与联系信息

<div align="center">

**广东第二师范学院（花都校区）计算机协会**

© Guangdong University of Education — Computer Association. All rights reserved.

🌐 官网：[https://gdue-ca.paperee.guru](https://gdue-ca.paperee.guru)　·　💬 反馈：[GitHub Issues](https://github.com/paperee/GDUE-CA-Official-Website-main/issues)

</div>
