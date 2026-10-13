# 广东第二师范学院计算机协会 · 官方网站

![Next.js](https://img.shields.io/badge/Next.js-16.3-black)
![React](https://img.shields.io/badge/React-19-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688)
![Python](https://img.shields.io/badge/Python-3.11%2B-yellow)
![i18n](https://img.shields.io/badge/i18n-13%20locales-orange)
![License](https://img.shields.io/badge/license-Internal%20Use-lightgrey)

> 广东第二师范学院（花都校区）计算机协会官方网站 —— 前后端完全分离，包含公开门户、成员个人中心与管理员后台三大子系统。

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [系统初始化（Break-Glass + 初始化向导）](#系统初始化break-glass--初始化向导)
- [配置指南](#配置指南)
- [使用说明](#使用说明)
- [本地化系统（13 门语言）](#本地化系统13-门语言)
- [测试](#测试)
- [部署](#部署)
- [项目文档](#项目文档)
- [贡献指南](#贡献指南)
- [常见问题（FAQ）](#常见问题faq)
- [贡献者](#贡献者)
- [版权声明](#版权声明)

---

## 项目简介

本项目是计算机协会的一体化信息化平台，由两个**完全独立、仅通过 HTTP API 通信**的子项目组成：

- **公开门户**（`frontend/app/[locale]/`）：社团介绍、活动公告与在线报名、项目展示、技术博客、备忘板（Memo）、Bug 反馈与回执查询。
- **个人设置中心**（`frontend/app/setting/` 与 `frontend/app/auth/`）：所有角色共用，包括基础资料、本地化偏好、账号安全、登录设备管理、第三方账号绑定与通知偏好。
- **管理员后台**（`frontend/app/admin/`）：仪表盘、活动 / 博客 / 项目 / 成员 / 招新 / 内容 / 媒体管理、审核中心、实名审核、数据统计、审计日志、系统设置、安全面板、回收站等。

底层架构按「通用 SaaS 底座 + 社团业务上层实例」设计：鉴权、RBAC、审计、限流、软删除、本地化、响应壳等能力均不含社团专属硬编码，可迁移至其他垂直业务。

## 功能特性

### 门户与业务

- 活动全生命周期：草稿 / 发布 / 报名中 / 已结束 / 归档，归档后报名、取消、签到接口强制 403，历史数据完整保留
- 在线报名（活动报名 / 社团报名）+ 唯一回执码 + 二维码 + 公开进度查询（不泄露个人信息）
- 现场扫码签到、报名批量审核（复选框 / 全选 / Ctrl+A）
- Bug 反馈公开表单、项目展示、技术博客（评论 / 标签 / Markdown）
- 备忘板 Memo：日历视图、Markdown、版本历史、分享链接
- 多语言内容自动翻译（Google gtx / MyMemory 兜底 + 翻译缓存）

### 账号、权限与安全

- RBAC 四级角色：`super_admin` / `admin` / `editor` / `member`，外加匿名访客；细粒度模块权限矩阵
- **Break-Glass 应急账号**：内置默认 admin/admin（强制改密），凭据存 env（bcrypt 哈希），不入库；用于清空全部管理员等灾难修复，全程高危确认审计
- 系统初始化向导（`/admin/setup`）：未初始化时普通账号无法登录，仅应急账号可进入
- 服务端会话表：可撤销、硬顶过期、空闲超时、记住设备 30 天、心跳滑动续期
- 登录防爆破阶梯封禁（按 账号 × IP × 浏览器指纹 独立计数）+ 全局限流（令牌桶 120/min，突发 30）
- CSRF 双重提交令牌、HttpOnly Cookie、CSP nonce、XSS 输入过滤、头像魔数校验、IP 黑白名单与内网后台限制
- 全部管理员变更操作写全局审计日志；业务数据软删除 + 回收站，定时任务物理删除超 30 天记录

### 工程与体验

- 13 门语言、深浅色主题、移动端响应式（右侧抽屉菜单 + 手势关闭）
- UI 翻译语言与区域格式化（日期 / 数字 / 货币）**严格分离**，三级优先级解析
- 全站 UTC 存储 + IANA 时区渲染、服务端时间校准、统一响应壳 `{code, message, data, request_id}`
- SEO：sitemap.xml、robots.txt、13 语言 hreflang、schema.org 结构化数据
- ISR / SSG、Next.js Image 优化、Umami 隐私友好统计

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端框架 | Next.js 16.3（App Router，Turbopack）、React 19、TypeScript 5 |
| 前端样式 / UI | Tailwind CSS v4、shadcn/ui、Radix UI、Lucide Icons、Framer Motion |
| 前端表单 / 内容 | react-hook-form + zod、react-markdown（remark-gfm / rehype-highlight） |
| 前端图表 | Recharts、qrcode.react |
| 包管理 | pnpm 11（corepack） |
| 后端框架 | FastAPI 0.115+、Uvicorn |
| ORM / 校验 | SQLAlchemy 2.0（async）、Pydantic v2、pydantic-settings |
| 数据库 | SQLite（开发，aiosqlite）/ PostgreSQL（生产，asyncpg） |
| 缓存 / KV | Redis（防爆破计数、封禁、应急会话）；未配置时进程内存兜底 |
| 鉴权 / 安全 | python-jose（JWT）、bcrypt、Authlib（OAuth）、nh3（HTML 清洗）、Pillow（图片压缩） |
| 其他 | maxminddb + GeoLite2 离线 IP 库、ip2region 备用库、openpyxl（Excel 导出）、httpx、tzdata |

## 项目结构

```text
GDUE-CA-Official-Website/
├── frontend/                    # 前端（Next.js App Router）
│   ├── app/
│   │   ├── [locale]/            #   公开门户（13 语言前缀：about/events/projects/blog/memo/join/contact/query ...）
│   │   ├── auth/                #   用户端登录 / 注册
│   │   ├── setting/             #   个人设置中心（profile/localization/region/regional-format/security/sessions ...）
│   │   └── admin/               #   管理员后台（login/setup + (dashboard) 路由组）
│   ├── components/              # 业务组件（admin/home/events/blog/memo/setting/...）+ ui/ 基础组件
│   ├── i18n/
│   │   ├── provider.tsx         #   客户端 I18n Context
│   │   ├── dictionary.ts        #   服务端字典加载 + 变体深合并回退
│   │   └── messages/            #   13 个 locale JSON
│   ├── lib/
│   │   ├── api/                 #   API 封装（与后端 app/api/ 模块一一对应）
│   │   ├── i18n.ts              #   语言单一真值源（locales / fallback / region 映射）
│   │   ├── navigation.ts        #   localizedPath / useSwitchLocale（禁止裸绝对路径跳转）
│   │   └── hooks/               #   useEffectiveTimezone / useSystemTimer / useTheme
│   ├── types/                   # api.ts（后端实体类型）+ response.ts（统一响应壳 / BizCode）
│   ├── proxy.ts                 # Edge 唯一入口（i18n 重定向 + admin/setting 守卫）；禁止新建 middleware.ts
│   └── next.config.ts           # rewrites：同源 /api/*、/uploads/* → 后端
├── backend/
│   ├── app/
│   │   ├── main.py              #   入口（lifespan 建表 / 列迁移 / 路由注册）
│   │   ├── api/                 #   接口模块（auth/activities/blog/projects/memos/system_init/security/audit ...）
│   │   ├── core/                #   通用底座（security/permissions/localization/locales/brute_force/rate_limit/responses ...）
│   │   ├── db/                  #   models.py（全部 ORM + 状态枚举）/ session.py
│   │   ├── schemas/             #   Pydantic 模型
│   │   └── utils/               #   crud/export/receipt/translator ...
│   ├── scripts/                 # generate_super_admin.py / backup_db.py / 内容迁移与种子脚本
│   ├── tests/                   # pytest（60+ 用例）
│   ├── run.py                   # uvicorn 启动器
│   └── .env.example
├── deploy/                      # nginx/gdueca.conf、Caddyfile（HTTP/2 + HTTP/3 反代样例）
├── docs/                        # SPEC.md（工程规范）、BREAK_GLASS_OPS.md、ADMIN_UI_REPORT.md
└── README.md
```

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20 LTS | Next.js 16 要求；开发机实测使用系统 Node + corepack pnpm |
| pnpm | 11.x | `corepack enable && corepack prepare pnpm@11.7.0 --activate` |
| Python | ≥ 3.11 | 开发环境为 Python 3.14；建议使用 venv |
| Redis | 可选 | 生产环境必配（多 worker 共享限流 / 封禁计数）；留空回退进程内存 |
| 数据库 | SQLite 或 PostgreSQL | 开发零配置使用 SQLite |

> Windows 环境提示：PowerShell 5 不支持 `&&` 连接命令，请用 `;` 或分多条执行；后端脚本请使用 venv 内的 python 绝对路径调用。

## 快速开始

### 1. 克隆仓库

```bash
git clone <仓库地址>
cd GDUE-CA-Official-Website-main
```

### 2. 启动后端

> ⚠️ 后端**必须在 `backend/` 目录内启动**：`DATABASE_URL` 默认使用相对路径 `sqlite+aiosqlite:///./assoc.db`，在仓库根目录启动会产生游离的数据库文件。

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # macOS/Linux: cp .env.example .env
```

编辑 `.env`（复制自 `.env.example`）。Break-Glass 应急账号默认凭据已内置为 **admin / admin**，可直接启动；生产部署强烈建议覆盖为独立强密码（下文有说明）。

启动：

```bash
python run.py
# 默认监听 http://127.0.0.1:8000，需要局域网直连时在 .env 设置 HOST=::
```

健康检查：`GET http://127.0.0.1:8000/health`。

### 3. 启动前端

```bash
cd frontend
pnpm install
copy .env.example .env.local   # macOS/Linux: cp .env.example .env.local
pnpm dev
# 访问 http://localhost:3000
```

前端通过 `next.config.ts` 的 rewrites 将同源 `/api/*`、`/uploads/*` 转发到后端（默认 `http://127.0.0.1:8000`），浏览器不直接访问 8000 端口。`BACKEND_URL` 在**构建时**固化，修改后需重新 `pnpm build`。

### 4. 完成初始化并进入后台

1. 浏览器访问 `http://localhost:3000/admin/setup`，使用 Break-Glass 账号登录；
2. 按 4 步向导填写：确认应急密码 → 系统默认本地化（语言 / 时区 / 区域 / 货币）→ 创建首位业务超级管理员 → 确认提交；
3. 提交后后端自动登出应急账号，使用新建的超管账号在 `/admin/login` 登录，落地 `/admin/dashboard`。

## 系统初始化（Break-Glass + 初始化向导）

1. **应急账号（Break-Glass）**：
   - 默认凭据 **admin / admin**（bcrypt 哈希内置），首次登录后强制进入初始化向导改密；
   - 三项环境变量 `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD_HASH` / `SUPER_ADMIN_ENABLED` 可覆盖默认，哈希必须为 bcrypt（`$2a$/$2b$/$2y$` 开头 60 字符，禁止明文）；
   - 生产部署建议生成独立强密码：

     ```bash
     cd backend
     .venv\Scripts\python.exe scripts\generate_super_admin.py
     ```

     脚本输出可直接粘贴进 `.env` 的片段，明文密码仅显示一次。运维手册见 [docs/BREAK_GLASS_OPS.md](docs/BREAK_GLASS_OPS.md)。

2. **系统未初始化门禁**：`system_initialized=false` 时普通账号登录被拒（业务码 `SYSTEM_NOT_INITIALIZED`），仅应急账号可登录并进入 `/admin/setup`。

3. **初始化向导**原子完成：写入系统全局默认配置 → 创建首位 `super_admin` → 置位初始化标记 → 登出应急账号。后续业务管理员只能由现有管理员在后台创建或升级，公开注册恒为 `member` 角色。

## 配置指南

### 后端环境变量（`backend/.env`）

完整清单以 [backend/.env.example](backend/.env.example) 为准，常用项：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | 监听地址与端口；`HOST=::` 为 IPv4/IPv6 双栈 |
| `DATABASE_URL` | `sqlite+aiosqlite:///./assoc.db` | 数据库连接串；生产可用 `postgresql+asyncpg://...` |
| `JWT_SECRET_KEY` | 自动生成 | ≥32 位随机串；缺省时写入 `backend/.jwt_secret`（0600） |
| `JWT_EXPIRE_HOURS` | `24` | 未勾选记住设备时的有效期上限（另有 30 分钟空闲超时） |
| `COOKIE_SECURE` | `auto` | `auto` / `true` / `false`；全站 HTTPS 后建议 `true` |
| `CORS_ORIGINS` | 空 | 仅跨域直连部署时填写前端来源，逗号分隔，禁止 `*` |
| `ALLOWED_HOSTS` | 空 | Host 头白名单，逗号分隔；留空不校验 |
| `ADMIN_ALLOWED_NETWORKS` | 回环 + RFC1918 + IPv6 ULA | 管理员级账号允许登录的 CIDR 列表 |
| `TRUSTED_PROXIES` | 本机回环 | 可信反代 CIDR；仅采信其 XFF，防伪造内网 IP |
| `RATE_LIMIT_PER_MIN` / `RATE_LIMIT_BURST` | `120` / `30` | 每 IP 令牌桶限流 |
| `REDIS_URL` | 空 | 如 `redis://127.0.0.1:6379/0`；生产必配 |
| `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD_HASH` / `SUPER_ADMIN_ENABLED` | `admin` / bcrypt(`admin`) / `true` | Break-Glass 应急账号（**admin/admin 为内置默认，首次登录向导强制改密**；生产请覆盖为独立强密码） |
| `LOG_LEVEL` / `LOG_FORMAT` | `INFO` / `text` | 日志级别与格式（`text` / `json`，均带 traceId） |
| `ENABLE_API_DOCS` | `false` | 是否开放 `/docs`、`/redoc`、`/openapi.json` |

### 前端环境变量（`frontend/.env.local`）

完整清单以 [frontend/.env.example](frontend/.env.example) 为准。**所有变量在构建时固化，修改后必须重新 `pnpm build`。**

| 变量 | 说明 |
| --- | --- |
| `BACKEND_URL` | 服务端访问的后端地址（SSR + rewrites 目标），默认 `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_API_BASE_URL` | 浏览器直连后端地址；一般留空走同源反代，跨域部署时才设置 |
| `NEXT_PUBLIC_SITE_URL` | 站点对外绝对地址，用于 sitemap / robots，如 `https://gdue-ca.paperee.guru` |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` / `NEXT_PUBLIC_UMAMI_SRC` | Umami 统计（可选，两项都填才加载） |

## 使用说明

### 角色与权限

| 角色 | 能力 |
| --- | --- |
| 匿名访客 | 公开页面、公开表单（报名 / Bug 反馈 / 回执查询）、注册 |
| `member` | 全部个人设置；无后台入口（访问 `/admin/**` 由后端中间件强制 403） |
| `editor` | 内容生产：活动 / 博客 / 项目 / 成员等编辑权限 |
| `admin` | 审核、系统设置、安全面板、审计查看等管理权限 |
| `super_admin` | 全部权限：账号创建与角色变更、权限矩阵、应急灾难修复 |

- 两套设置边界：用户级设置 `/setting/**`（所有角色共用，未登录跳 `/auth/login?returnUrl=`）；后台 `/admin/**`（独立根，独立登录页与角色落地页）。
- 角色变更等敏感操作需二次确认并写审计日志；账号停用 / 降权立即生效并踢出会话。

### 主要页面路由

| 区域 | 代表路径 |
| --- | --- |
| 公开门户 | `/{locale}`、`/{locale}/about`、`/{locale}/events`（含 `archive`、`{id}`）、`/{locale}/projects`、`/{locale}/blog`、`/{locale}/memo`、`/{locale}/join`、`/{locale}/contact`、`/{locale}/query` |
| 账号 | `/auth/register`、`/auth/login` |
| 个人设置 | `/setting/profile`、`/setting/localization`、`/setting/region`、`/setting/regional-format`、`/setting/security`、`/setting/sessions`、`/setting/connections`、`/setting/notifications` |
| 管理员 | `/admin/setup`、`/admin/login`、`/admin/dashboard`、`/admin/activities`、`/admin/review`、`/admin/recycle`、`/admin/users`、`/admin/audit-logs`、`/admin/settings`、`/admin/security/bans`、`/admin/stats/*` 等 |

### API 模块

接口按业务模块组织在 `backend/app/api/`，与前端 `frontend/lib/api/*.ts` 一一对应；本地开发可临时将后端 `ENABLE_API_DOCS=true` 后访问 `/docs` 查看交互式文档。典型基础接口：

- 认证：`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/csrf`、`GET/PUT /api/auth/profile`
- 初始化：`GET /api/system-init/status`、`POST /api/system-init/initialize`
- 活动：`GET /api/activities`（公开）、`POST/PATCH/DELETE /api/activities`（管理）、报名 / 签到 / 统计
- 系统：`GET /api/system/settings`（公开子集）、`GET/PUT /api/system/settings/admin`（管理）
- 健康检查：`GET /health`

统一响应壳：`{ "code": 0, "message": ..., "data": ..., "request_id": "..." }`，所有响应带 `X-Server-Utc-Time`，错误响应带可追踪的 `request_id`。

### 典型业务流程

1. **活动报名**：管理员建活动并开放报名 → 用户在 `/{locale}/join` 提交 → 获得 `GDUECA-xxxxxxxx` 回执码 → 在 `/{locale}/query` 查询进度；管理员在审核中心批量通过 / 拒绝 → 活动现场开放签到，报名者凭回执码自助签到。
2. **Bug 反馈**：用户在 `/{locale}/contact` 提交，生成 `REPORT-时间戳` 回执码；后台可批量处理。
3. **内容回收站**：删除均为软删除（`is_deleted=true`），在 `/admin/recycle` 可恢复；定时任务每小时扫描，物理删除软删超过 30 天的记录。

## 本地化系统（13 门语言）

支持语言（URL 前缀全小写、横杠分隔）：

| Locale | 名称 | 缺失词条回退 |
| --- | --- | --- |
| `zh-cn` | 简体中文（中国大陆） | —（基准语言） |
| `zh-cn-sg` | 简体中文（新加坡） | `zh-cn` |
| `zh-tw` | 繁體中文（台灣） | `en-gb` |
| `zh-mo` | 繁體中文（澳門） | `zh-cn` |
| `zh-yue-cn` | 简体粤语 | `zh-cn` |
| `zh-yue-hk` | 繁體廣東話 | `zh-cn` |
| `en-gb` | English (UK) | — |
| `ja-jp` | 日本語 | `en-gb` |
| `ko-kr` | 한국어 | `en-gb` |
| `es-es` | Español | `en-gb` |
| `fr-fr` | Français | `en-gb` |
| `de-de` | Deutsch | `en-gb` |
| `ru-ru` | Русский | `en-gb` |

核心规则：

- **UI 翻译语言**（菜单 / 按钮文字）与**区域格式化规则**（日期、星期起始日、数字、货币）严格解耦，可独立选择。
- 三级优先级：用户个人持久设置（`users.locale/timezone/region_code/currency`，非空优先）> URL 路径 `/{locale}/`（仅影响 UI 文字，本次访问有效）> 系统全局默认（`sys_config.sys_default_*`）。
- 新建用户四个本地化字段一律为 `NULL`（表示跟随系统），**禁止拷贝系统默认值写死**。
- 匿名访客：UI 与区域跟随 URL-locale，时区 / 货币回退系统默认；登录后立即切换为用户优先级。前端所有 `/api/*` 请求自动注入 `X-Locale` 头。
- 单一真值源：`frontend/lib/i18n.ts` 的 `locales` 数组同时驱动 Edge 重写、字典加载、语言切换器、sitemap 与 hreflang；旧语言路径（`/en-us`、`/zh-hk`、`/ja`）由 `proxy.ts` 301 重定向。
- 变体翻译文件只存放与父语言有差异的 key，构建时由 `dictionary.ts` 深合并。
- 管理入口：个人设置 `/setting/localization`（4 个下拉 +「恢复为系统默认」+「使用浏览器本地时区」+ 联动复选框）；系统默认在初始化向导第二步设置，管理员也可在后台修改。

## 测试

```bash
cd backend
.\.venv\Scripts\python.exe -m pytest                      # 全量
.\.venv\Scripts\python.exe -m pytest tests/test_security.py
```

```bash
cd frontend
node node_modules\typescript\bin\tsc --noEmit            # 类型检查
pnpm lint                                                # ESLint
```

> 后端测试基于 pytest + pytest-asyncio + FastAPI TestClient，会话级共享 app fixture；新增需要建库的模块时注意测试按文件名字母序共享状态。

## 部署

生产环境必须由 Nginx / Caddy 对外，Next.js 与 Uvicorn 只绑定 `127.0.0.1`：

```bash
# 前端构建（BACKEND_URL 在构建时固化）
cd frontend
$env:BACKEND_URL="http://127.0.0.1:8000"; pnpm build
pnpm start

# 后端（gunicorn + uvicorn worker，多 worker 时必须配置 REDIS_URL）
cd backend
gunicorn -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 app.main:app
```

反代样例：[deploy/nginx/gdueca.conf](deploy/nginx/gdueca.conf)（含 HTTP/2、HTTP/3、真实 IP 透传、`/admin` 仅内网）与 [deploy/Caddyfile](deploy/Caddyfile)（自动 HTTPS 简化方案，二选一）。

注意事项：

- ⚠️ 直接暴露 Next.js 3000 端口会使客户端可伪造 `X-Forwarded-For` 冒充内网，必须经反代覆盖 XFF。
- 生产设置 `COOKIE_SECURE=true`、强随机 `JWT_SECRET_KEY`、`ENABLE_API_DOCS=false`、配置 Redis 与 HTTPS。
- 备份：`backend/scripts/backup_db.py` 支持 SQLite 在线快照 / PostgreSQL `pg_dump`，gzip 压缩、0600、按天轮转，建议配 crontab 并异地演练恢复。

## 项目文档

- [docs/SPEC.md](docs/SPEC.md) —— 工程规范真值源（响应壳、时区、状态枚举、RBAC 等约束）
- [docs/BREAK_GLASS_OPS.md](docs/BREAK_GLASS_OPS.md) —— 应急账号运维手册
- [docs/ADMIN_UI_REPORT.md](docs/ADMIN_UI_REPORT.md) —— 后台管理界面功能验证报告

## 贡献指南

欢迎社团成员参与贡献，请遵循以下流程：

### 1. 分支策略

- `main`：始终保持可运行、可部署；禁止直接推送。
- 从 `main` 切功能分支：`feat/<模块>-<简述>`、`fix/<问题简述>`、`docs/<文档主题>`，例如 `feat/localization-panel`。
- 完成后发起 Pull Request，标题与描述说明改动点、验证方式与影响范围，至少一名成员 review 后合并。

### 2. 提交信息规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```text
<type>(<可选作用域>): <简明描述>

<可选正文：动机、实现要点、关联 issue>
```

常用 type：`feat`（新功能）、`fix`（缺陷修复）、`docs`（文档）、`style`（格式）、`refactor`、`perf`、`test`、`chore`（构建 / 杂项）。示例：`docs(readme): 完善安装、配置与本地化系统说明`。

### 3. 代码规范

- 前端：TypeScript 严格模式零错误（`tsc --noEmit`），通过 ESLint；组件按业务子目录归类，路由 `page.tsx` 只做数据获取与组合，内联卡片抽到 `components/`。
- 后端：遵循既有分层（`api → schemas → core/db`），业务状态只用 `models.py` 中的枚举，禁止裸字符串；统一走 `responses.ok()` 响应壳与 `BizException`；本地化读取统一调用 `resolve_localization()`，禁止零散 if-else。
- 时间一律 UTC 存储、IANA 时区标识（禁止存 ±偏移量）；所有管理员变更必须写审计日志；删除一律软删除。
- Edge 层只有 `proxy.ts`，**严禁新建 `middleware.ts`**（两者共存会导致 Next.js 启动死锁）。
- 导航统一使用 `lib/navigation.ts` 的 `localizedPath` / `useSwitchLocale`，禁止硬编码丢失 locale 前缀的裸绝对路径。

### 4. 提交前自检

- [ ] 后端 `pytest` 全部通过；前端 `tsc --noEmit` 与 `pnpm lint` 无错误
- [ ] 13 个 `frontend/i18n/messages/*.json` 均为合法 JSON
- [ ] 未提交密钥、`.env`、`*.db`、`uploads/`、日志与本地调试产物
- [ ] 用户可见文案新增 key 已补齐翻译（变体语言可依赖回退）
- [ ] 涉及管理员变更 / 删除 / 归档的行为已验证审计日志与软删除

## 常见问题（FAQ）

**Q1：后端启动直接 FATAL 退出？**
检查 Break-Glass 三项环境变量是否齐全、哈希是否为合法 bcrypt（`$2a$/$2b$/$2y$` 开头 60 字符）。可用 `python scripts/generate_super_admin.py` 重新生成。

**Q2：为什么在仓库根目录启动后端后数据「不见了」？**
默认 SQLite 路径是相对路径 `./assoc.db`，工作目录不同会生成不同库文件。始终 `cd backend` 后再 `python run.py`，并删除仓库根下游离的 `assoc.db` / `.jwt_secret` / `initial_admin_password.txt`。

**Q3：前端端口正常但所有请求挂起 / 404？**
Next.js 16 检测到 `middleware.ts` 与 `proxy.ts` 共存会在启动时抛 Unhandled Rejection 并使请求管线死锁。本项目只允许 `proxy.ts`，删除任何新建的 `middleware.ts` 后重启。

**Q4：脚本登录后紧接着的请求返回 401「会话已失效」？**
会话行在响应发送后才提交，毫秒级连续请求可能早于落库。脚本登录后 sleep ≥1 秒；浏览器人工操作不会复现。

**Q5：请求突然全部变成 429？**
触发了限流（全局 120/min、突发 30；登录 10 次/60s/IP）。脚本调用间隔建议 ≥0.65s，被限流后停止重试，计数窗口过后自动恢复；管理员可在 `/admin/security/bans` 查看与解封。

**Q6：访问 `/en-us`、`/zh-hk` 等旧语言路径会怎样？**
由 `proxy.ts` 301 永久重定向到新标识（`en-us → en-gb`、`zh-hk → zh-yue-hk`、`ja → ja-jp`），书签与搜索引擎权重可平滑迁移。

**Q7：改了界面语言，日期和货币没变，是 Bug 吗？**
不是。界面语言只控制菜单按钮文字；日期 / 数字 / 货币由「区域格式」独立决定。可在 `/setting/localization` 勾选「切换界面语言时同步更新区域格式」开启联动，底层两个字段仍保持独立存储。

**Q8：PowerShell 执行脚本报 `&&` 或执行策略错误？**
Windows PowerShell 5 用 `;` 分隔命令；执行策略红字快照属于环境噪音，不影响命令结果。venv python 请用绝对路径 `.\.venv\Scripts\python.exe` 调用。

**Q9：活动归档后还能报名或签到吗？**
不能。归档后报名、取消报名、签到接口强制返回 403，仅保留浏览权限，历史报名记录与统计数据完整保留。

**Q10：corepack / pnpm 拉取失败？**
网络无法访问 npmjs 时 corepack 无法自动下载 pnpm，可改用已安装的 pnpm 或 npm；此时不要手工改 `package.json` 依赖，以免 lockfile 无法同步。

## 贡献者

| 成员 | GitHub |
| --- | --- |
| past-ee | [@paperee](https://github.com/paperee) |
| Dylan Liang | [@liang1481624299](https://github.com/liang1481624299) |
| Yuki | [@binaryYuki](https://github.com/binaryYuki) |

## 版权声明

© 广东第二师范学院计算机协会。本项目源代码仅供社团内部学习与运营使用，未经许可不得用于商业用途；禁止用于电子商务、支付、广告、会员费、CRM、再营销等商业场景。
