**[中文版本](./README.md)**

<div align="center">

# Guangdong University of Education Computer Association · Official Website

**GDUE-CA Official Website** — Campus club portal / personal center / admin dashboard all-in-one platform

[![Next.js](https://img.shields.io/badge/Next.js-16.3-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.14x-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-ready-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Nginx](https://img.shields.io/badge/Nginx-HTTP%2F3-269539?logo=nginx&logoColor=white)](https://nginx.org)
[![i18n](https://img.shields.io/badge/i18n-19_locales-orange)](#internationalization)

[![Status](https://img.shields.io/badge/status-active-success)]()
[![Maintenance](https://img.shields.io/badge/503_static-maintenance-blueviolet)](#503-static-maintenance-fallback)
[![License](https://img.shields.io/badge/license-Source--Available-lightgrey)](./LICENSE)

**🌐 Live site: [https://gdue-ca.paperee.guru](https://gdue-ca.paperee.guru)**

</div>

---

## Project Overview

The **official website of the Computer Association (Huadu Campus) of Guangdong University of Education** is a fully decoupled, all-in-one information platform comprising two user-facing subsystems — the **public portal** and the **personal settings center** — plus a standalone **admin dashboard**. It serves both as the public face of the association (outreach and event operations) and as the daily working base for members and administrators.

**Positioning**: built as a "generic SaaS base + association business layer on top" — the foundational capabilities (auth, RBAC, audit, rate limiting, soft delete, i18n, unified response envelope) contain zero association-specific hard-coding and can be smoothly migrated to enterprise SaaS, OTA platforms, or enterprise intranet office systems. Association business (events / recruitment / blog / projects, etc.) is plugged in only as an upper-layer instance.

**Use cases**:
- **Public portal** — association intro, event announcements and online registration, project showcase, tech blog, memo board, bug feedback and receipt lookup;
- **Personal settings center** — basic profile, personal homepage banner, privacy permissions, localization preferences, account security, login device management, third-party account binding and notification preferences;
- **Admin dashboard** — dashboard, events / blog / projects / members / recruitment / content / media management, **review center** (registration / club application / bug / password reset / school identity / email rebinding — six aggregated types), **role & permission matrix management**, real-name verification, data statistics, audit logs, system settings, security panel, content recycle bin, mail & push (system-readiness gating).

**Deployment architecture**: `Cloudflare CDN` → `Nginx (HTTP/2 + HTTP/3 reverse proxy)` → `Next.js (127.0.0.1:3000, PM2 managed)` + `FastAPI (127.0.0.1:8000, gunicorn + uvicorn worker)` → `PostgreSQL` (dev falls back to SQLite with zero config). Only Nginx is exposed externally; applications listen on loopback only.

---

## Key Features

### User System

- **RBAC four-tier roles**: `super_admin` / `admin` / `editor` / `member` (plus anonymous visitors), combined with a fine-grained module permission matrix (28 permission modules). The default role matrix is built into the code; **per-account module-level permission overrides** are supported (writable only by super_admin; an override fully replaces the default matrix for matched modules). The admin "Role Management" page (`/admin/roles`) visualizes the matrix, member distribution, and override accounts.
- **Complete account lifecycle**: registration / login / password recovery (email verification code) / password change (requires old password + session revocation management) / real-name verification / email & phone binding / **three email-rebinding paths** (dual verification codes · four-item verification · manual review) / TOTP two-factor authentication.
- **Personal homepage & social follow**: `/{locale}/u/{username}` personal page with a wide **Banner cover** (uploaded image with server-side compression / custom solid color / system default gradient — three states) and overlaid avatar, About / Posts dual tabs (About by default, Posts lazy-loaded). Privacy toggles are user-controlled.
- **One-way follow system**: follows take effect immediately without approval (`user_follows` table, idempotent API). **Mutual follows are automatically marked as friends.** Personal pages show follower / following counts and a three-state button (self → edit profile; logged-in visitor → follow / following; anonymous → redirect to login). Break-Glass emergency accounts have no social identity; related APIs return 403 directly.
- **Server-side sessions**: revocable, hard-capped expiry, idle timeout, remember-device for 30 days, heartbeat sliding renewal; login devices can be logged out remotely.

### Security (Highlight: 503 Static Maintenance Fallback)

- **Static 503 maintenance fallback**: when the Node service is unresponsive (process crash / 502 / 504), Nginx automatically falls back to a fully independent static maintenance page. Any maintenance scenario **always returns 503, never 200**, protecting search-engine SEO indexing. See the [core mechanism explanation](#503-static-maintenance-fallback).
- **Break-Glass emergency account**: credentials live only in environment variables (bcrypt hash), never in the database; used for disaster recovery such as clearing all admins. Every operation requires high-risk double confirmation and writes an audit log.
- **Account + device fingerprint tiered brute-force defense**: counts independently across the "account × IP × browser fingerprint" three dimensions, with escalating bans (minute-level progressing to permanent). Externally, a uniform, obfuscated message is returned; the real reason is only written to the audit log.
- **Defense in depth**: CSRF double-submit tokens, HttpOnly cookies, CSP nonce, XSS input filtering, avatar magic-number validation, IP allow/block lists, admin login restricted to intranet.
- **Full audit + soft delete**: all admin mutation operations write to the global audit log; deletions are always soft and go to the recycle bin. A scheduled task scans hourly and physically deletes records older than 30 days.

### Internationalization

- **19 languages**; UI translation language and regional formatting (dates / numbers / currency) are **strictly separated** and can be selected independently.
- Three-level priority resolution: user personal settings > URL `/{locale}/` prefix > system global default. Variant languages with missing keys fall back along the fallback chain, never leaving blanks.
- The language list is auto-generated at build time by scanning `i18n/messages/*.json` (single source of truth), driving Edge rewrites, dictionary loading, the language switcher, sitemap, and hreflang.

### UI Theme

- **Dual theme system**: light/dark (follow system / manual) and **theme style** (Microsoft default, Apple, festival) are independent and stackable.
- Themes are applied by an anti-FOUC inline script before the first client paint — no flicker.
- Responsive three-column settings panel (desktop / tablet / mobile adaptive); mobile drawer menu with gesture close.
- Zero web fonts, zero `@font-face` across the site — entirely reuses the client's native system fonts.

### SEO

- `robots.txt`, **dynamic `sitemap.xml`** (auto-expanded for all languages), 18-language `hreflang` interlinking.
- schema.org structured data, unique canonical per page.
- **IndexNow** instant indexing push, combined with Cloudflare CDN and Nginx HTTP/3 to improve crawl and access experience.

---

## Tech Stack

### Frontend

| Category | Technology |
| --- | --- |
| Framework | Next.js 16 App Router (Turbopack), React 19, TypeScript 5 |
| Styling / UI | Tailwind CSS v4, in-house themed UI (Radix UI primitives, shadcn/ui style, Lucide Icons, Framer Motion) |
| Forms / Content | react-hook-form + zod, react-markdown (remark-gfm / rehype-highlight) |
| Charts / Other | Recharts, qrcode.react |
| Package manager | pnpm 11 (corepack) |

### Backend

| Category | Technology |
| --- | --- |
| Framework | FastAPI, Uvicorn |
| ORM / Validation | SQLAlchemy 2.0 (async), Pydantic v2, pydantic-settings |
| Database | PostgreSQL (production, asyncpg) / SQLite (development, aiosqlite) |
| Cache / KV | Redis (brute-force counters, bans, emergency sessions; in-process memory fallback when unconfigured) |
| Security | python-jose (JWT), bcrypt, Authlib (OAuth), nh3 (HTML sanitization), Pillow (image compression) |

### Ops & Deployment

| Category | Technology |
| --- | --- |
| Reverse proxy | Nginx (HTTP/2 + HTTP/3 / QUIC, real-IP passthrough, admin intranet restriction) |
| Process management | PM2 (always-on & self-healing for Next.js and backend processes) |
| CDN / DNS | Cloudflare (overseas nodes, caching & real-IP restoration) |
| Maintenance fallback | Pure static maintenance page `frontend/components/maintenance/` (deploy script `deploy/scripts/post_deploy.sh`) + Nginx `error_page 502/504 → 503` |

---

## Project Directory Structure

```text
GDUE-CA-Official-Website/
├── frontend/                         # Next.js 16 + TypeScript frontend
│   ├── app/
│   │   ├── [locale]/                 #   Multilingual public portal (about/events/projects/blog/memo/join/contact/query ...))
│   │   ├── setting/                  #   Unified settings page (shared by all roles)
│   │   ├── admin/                    #   Admin dashboard (includes (dashboard) route group)
│   │   ├── auth/                     #   Account registration / login
│   │   └── api/                      #   API routes
│   ├── i18n/                         # Complete i18n system (messages/*.json + variant deep merge)
│   ├── components/
│   │   ├── layout/                   #   Global components: nav, footer
│   │   ├── theme/                    #   Theme switcher components
│   │   ├── setting/                  #   Three-column settings layout & forms
│   │   ├── profile/                  #   User profile / privacy components
│   │   ├── maintenance/              #   ✅ Pure static 503 maintenance page (no build/runtime dependency)
│   │   │   ├── index.html            #     Complete standalone page (references style.css via relative path)
│   │   │   └── style.css             #     Maintenance page styles (system font stack / prefers-color-scheme)
│   │   ├── admin/ blog/ events/ memo/ projects/ ... 
│   │   └── ui/                       #   Base UI primitives
│   ├── lib/
│   │   ├── api/                      #   Auth, rate-limit, business API wrappers
│   │   ├── i18n.ts                   #   Language single source of truth
│   │   └── hooks/ navigation.ts      #   Locale logic & navigation utilities
│   ├── proxy.ts                      # Edge single entry (i18n + guards); do NOT create middleware.ts
│   └── public/                       # Static assets & SEO files (robots / sitemap generated by app/)
├── backend/                          # FastAPI backend
│   ├── app/
│   │   ├── api/                      #   APIs (auth/activities/blog/projects/memos/users(social follow)/roles(permission matrix)/security/audit ...))
│   │   ├── core/                     #   Common base (security/permissions/brute_force/rate_limit/responses ...))
│   │   ├── db/                       #   models.py (all ORM + state enums) / session.py
│   │   ├── schemas/                  #   Data validation models
│   │   └── utils/                    #   crud / export / receipt / translator
│   ├── scripts/                      #   Ops & seed scripts
│   └── tests/                        #   pytest tests
├── deploy/                           # Deployment directory
│   ├── nginx/gdueca.conf            #   Nginx reverse proxy + static maintenance fallback
│   └── scripts/post_deploy.sh        #   Static maintenance page deploy script (syncs to /var/www/maintenance)
├── docs/                             # SPEC.md / BREAK_GLASS_OPS.md etc.
└── .env.example                      # Environment variable template
```

---

## Environment Variables

> All frontend variables are baked in at **build time**; after changing them you must re-run `pnpm build`. Backend variables are read at startup.

### Backend (`backend/.env`; see `backend/.env.example` for the full set)

```dotenv
# Service listen
HOST=127.0.0.1
PORT=8000

# Database (SQLite for zero-config dev; PostgreSQL for production)
DATABASE_URL=sqlite+aiosqlite:///./assoc.db
# DATABASE_URL=postgresql+asyncpg://gdueca:strong-password@127.0.0.1:5432/gdueca

# JWT signing key (≥32-char random string; left blank it is auto-generated and written to backend/.jwt_secret)
JWT_SECRET_KEY=

# Break-Glass emergency account (credentials only in env vars, never persisted to DB)
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD_HASH=$2b$12$...   # bcrypt hash, never plaintext
SUPER_ADMIN_ENABLED=true

# Admin source-IP allowlist (comma-separated, supports IPv4 / IPv6 addresses and CIDR ranges)
# Example: ADMIN_TRUSTED_IPS=127.0.0.1,192.168.1.0/24,::1,2001:db8::/32
# Empty = no source-IP restriction; correct username+password is enough to log in
# (brute-force / fingerprint rate limiting still applies).
# When entries are present, the allowlist is enforced: only listed sources may log in /
# use admin-level accounts (editor / admin / super_admin and Break-Glass); all others are
# rejected (with the message "Invalid request source").
# Regular users (member) are not affected by this variable.
# Priority: the admin-web configuration (admin trusted-IP allowlist, supports IPv4/IPv6/CIDR
# mixed, # comments, illegal lines rejected wholesale with the line number) takes effect first;
# this env var is read only when the DB config is empty.
ADMIN_TRUSTED_IPS=

# General KV store (required in production; shared rate-limit / ban counters across workers)
REDIS_URL=

# SMTP mail service (forgot-password / email-rebinding verification codes;
# empty SMTP_HOST = no mail service configured, codes are only logged server-side (dev only))
SMTP_HOST=
SMTP_PORT=465
SMTP_USERNAME=
SMTP_PASSWORD=                       # authorization code / password
SMTP_FROM=                           # sender address; defaults to SMTP_USERNAME when empty
SMTP_FROM_NAME=GDUE-CA
SMTP_USE_SSL=true                    # true = direct SSL (465); false = STARTTLS (587)

# Mail transport: smtp (default) / graph (Microsoft Graph sendMail over HTTPS 443;
# use when Exchange Online has retired SMTP basic auth or the host blocks outbound SMTP ports)
# graph needs an Entra ID app with the Mail.Send application permission + admin consent,
# scoped with RBAC for Applications so it can only send as GRAPH_SENDER
MAIL_PROVIDER=smtp
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
GRAPH_SENDER=                        # sender mailbox; defaults to SMTP_FROM when empty
```

### Frontend (`frontend/.env.local`; see `frontend/.env.example` for the full set)

```dotenv
# Backend address accessed server-side (SSR + same-origin /api reverse-proxy target)
BACKEND_URL=http://127.0.0.1:8000

# Backend address the browser connects to directly (usually empty, uses same-origin reverse proxy; set only for cross-domain deployment)
NEXT_PUBLIC_API_BASE_URL=

# Site's absolute external address (used by sitemap / robots)
NEXT_PUBLIC_SITE_URL=https://gdue-ca.paperee.guru

# Umami analytics (optional; loaded only when both are set)
NEXT_PUBLIC_UMAMI_WEBSITE_ID=
NEXT_PUBLIC_UMAMI_SRC=
```

---

## Local Development

### Starting the frontend

```bash
cd frontend
pnpm install
cp .env.example .env.local          # Windows PowerShell: copy .env.example .env.local
pnpm dev                             # Visit http://localhost:3000
```

> The browser uniformly requests the same-origin `/api/*`, `/uploads/*`, which `next.config.ts` rewrites to the backend. The login cookie is a first-party cookie, so no CORS configuration is needed. When accessing via LAN IP / Tailscale, you can append origins to `DEV_ALLOWED_ORIGINS`.

### Starting the backend

> ⚠️ The backend **must be started inside the `backend/` directory**: `DATABASE_URL` defaults to the relative path `sqlite+aiosqlite:///./assoc.db`; starting from the repo root would create a stray database file.

```bash
cd backend
python -m venv venv
# Windows PowerShell
.\venv\Scripts\Activate.ps1
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
copy .env.example .env               # Windows PowerShell; Linux/WSL/macOS: cp .env.example .env
python run.py                        # Listens on http://127.0.0.1:8000 by default
```

Health check: `GET http://127.0.0.1:8000/health`. On first deployment, visit `/{locale}/admin/setup` with the Break-Glass account to complete the initialization wizard.

### One-click scripts & first-time venv initialization

The repo root provides unified scripts. All `pip / python / uvicorn / alembic` operations **must activate the `backend/venv` virtual environment first** — never use the system-global Python. The venv is fixed at `backend/venv`; the scripts **do not create it** (to avoid clobbering an existing environment), so initialize it manually once:

First-time venv initialization (Linux / WSL / macOS):

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

First-time venv initialization on Windows (PowerShell):

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

| Script | Platform / Mode | Behavior |
| --- | --- | --- |
| `dev.sh` | Linux / WSL / macOS · Dev | **No** git pull, **no** build, **no** auto-migration; starts `npm run dev` and `uvicorn app.main:app --reload` in parallel inside the venv; Ctrl-C kills all child processes |
| `dev.ps1` (or double-click `dev.bat`) | Windows · Dev | Same as above; opens two extra PowerShell windows (auto-started with Bypass execution policy to avoid `Activate.ps1` / `npm.ps1` being blocked) |
| `migrate.sh` / `migrate.ps1` | Manual DB migration | Runs `alembic upgrade head` inside the venv only; dev mode does not call it automatically |
| `start.sh` | Linux · Production | Strict order: `git pull origin main` → `pip install` in venv → `alembic upgrade head` → `npm install` → **`npm run build` (build is required in production)** → `pm2 restart frontend/backend` → curl refreshes the 503 maintenance snapshot (health probe; still 503/502/504 means failure and aborts) → `pm2 status`; any failed step aborts immediately and prints the failed stage |

> The health-probe URL in production-script step 5 can be overridden via env var: `SITE_HEALTHCHECK_URL=https://your-domain/ ./start.sh` (default `http://127.0.0.1/`).

---

## Production Deployment

### 1. Build & Start

```bash
# Frontend build (BACKEND_URL / NEXT_PUBLIC_SITE_URL are baked in at build time)
cd frontend
pnpm install --frozen-lockfile
pnpm build
pm2 start pnpm --name gdueca-web -- start      # next start bound to 127.0.0.1:3000

# Backend (REDIS_URL is required for multi-worker)
cd ../backend
# FORWARDED_ALLOW_IPS="" disables uvicorn's built-in proxy-header rewriting; the app determines real IP per TRUSTED_PROXIES
FORWARDED_ALLOW_IPS="" gunicorn -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 app.main:app
FORWARDED_ALLOW_IPS="" pm2 start --name gdueca-api -- gunicorn -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 app.main:app

pm2 save
```

> The entire flow can be run via the repo-root production script `./start.sh` (auto-completes in order: git pull → pip install in venv → alembic migration → npm install/build → pm2 restart → 503 health probe). PM2 process names must match the script's `frontend` / `backend`.

### 2. Nginx Configuration

Wire up [deploy/nginx/gdueca.conf](deploy/nginx/gdueca.conf) (HTTP/2 + HTTP/3, real-IP passthrough, `/admin` intranet-only, static maintenance fallback), then `nginx -t && systemctl reload nginx`.

### 3. Deploy the static maintenance page (required after deployment)

```bash
chmod +x deploy/scripts/post_deploy.sh
./deploy/scripts/post_deploy.sh
```

The script atomically syncs the pure static maintenance page (`index.html` + `style.css` from `frontend/components/maintenance/`) to the Nginx-mounted directory `/var/www/maintenance/`. Deployment notes:

- The page is native HTML/CSS — **no compilation / build / runtime** needed; Nginx mounts and renders it. Styles are referenced via the **relative path** `./style.css`; the two files must be deployed in the same directory.
- The script validates that the deployed content is indeed the maintenance page (contains `503` and `under maintenance`); otherwise it errors out.
- When Nginx detects a `502/504` from the Node `3000` port (process crash / unreachable), `error_page 502 504 =503 /maintenance/index.html` falls back to this static page, forcing status 503 and the response header `Cache-Control: no-cache, no-store, must-revalidate` (no caching).

### 4. Cloudflare & Security Notes

- ⚠️ **Directly exposing the Next.js 3000 port lets clients forge X-Forwarded-For to impersonate the intranet** — you must go through the reverse proxy and let Nginx override XFF (`proxy_set_header X-Forwarded-For $remote_addr;`).
- In production, set `COOKIE_SECURE=true`, a strong random `JWT_SECRET_KEY`, `ENABLE_API_DOCS=false`, configure Redis and site-wide HTTPS.
- When fronting with Cloudflare, use the official IP list `set_real_ip_from` + `real_ip_header CF-Connecting-IP` to restore the visitor's real IP (form submit_ip and visit statistics depend on it).
- Cloudflare may cache `502/504`: it's recommended to disable "Always Online" cache for HTML, or ensure the origin's 503 static maintenance page carries a `no-store` header to pass through the CDN.
- Before deploying a new version, if you need to actively stop the site, you can temporarily make Nginx return 503 for the main site (pointing to the static maintenance page), then roll the backend update so visitors always see the maintenance page.

### 5. Docker all-in-one deployment (optional)

A single image contains Nginx (exposed on `:8080`) + Next.js (`127.0.0.1:3000`) + FastAPI (`127.0.0.1:8000`), supervised by tini, all running as a non-root user:

```bash
docker compose up -d --build        # Visit http://<server-IP>:8080
docker compose logs -f              # Nginx / frontend / backend unified log format, linked by trace
```

- **Persistence**: the database, uploaded files, and `.jwt_secret` all live in the named volume `gdueca-data` (`/data` in the container); you can also place the backend `.env` at `/data/.env`.
- **Configuration**: backend variables are the same as `backend/.env.example`, written in `docker-compose.yml`'s `environment`; `NEXT_PUBLIC_*` are baked in at build time, written in `build.args`.
- **Real IP**: when there's a CDN / load balancer / host Nginx in front of the container, you must set `REAL_IP_FROM` (upstream CIDR, comma-separated), otherwise the admin IP allowlist and login rate limiting will only see the upstream address.
- **Break-Glass**: default credentials admin/admin; before going live, be sure to replace via `SUPER_ADMIN_PASSWORD_HASH` (in the compose file, `$` must be written as `$$`).
- **Robustness**: read-only root filesystem, `cap_drop: ALL`; any process exiting restarts the whole stack; when Next.js is not ready, Nginx returns the 503 static maintenance page; the built-in health check probes both frontend and backend.

---

## Core Mechanisms

### i18n dual separation

The **UI translation language** (menu / button copy) and **regional formatting rules** (dates, week start day, numbers, currency) are strictly decoupled and selectable independently:

- Three-level priority: user personal persisted settings (non-empty first) > URL `/{locale}/` prefix (affects UI text only) > system global default.
- All frontend `/api/*` requests automatically inject the `X-Locale` header; times are always stored in UTC and rendered in the IANA timezone.
- Single source of truth: the locales list in `frontend/lib/i18n.ts` drives Edge rewrites, dictionary loading, the language switcher, sitemap, and hreflang.
- Variant translation files only store keys that differ from the parent language; they are deep-merged at build time, and missing keys fall back along the fallback chain.

### 503 Static Maintenance Fallback

When the Node.js service is unresponsive, Nginx automatically falls back and serves a **pure static 503 maintenance page that is completely independent of the main project**:

| Trigger | Behavior |
| --- | --- |
| Node `3000` port returns 502/504 (process crash / unreachable) | Nginx `proxy_intercept_errors on` + `error_page 502 504 =503 /maintenance/index.html`, falls back to the static maintenance page with status code fixed at **503** |

**Page source**: `frontend/components/maintenance/` (`index.html` + `style.css`, native HTML/CSS, no compile / build / runtime dependency); synced to the Nginx-mounted directory `/var/www/maintenance/` by `deploy/scripts/post_deploy.sh`. In-page styles are referenced via a **relative path** `./style.css`; mounting the directory is enough to load them.

> **Style notes**: the maintenance page **mimics the Next.js default 404 page style** — pure black-and-white, clean, no extra ornament, no borders or shadows; the `503` number and copy use the same sizes as the Next.js default 404 (number `24px` / `500`, copy `14px` / `400`); `min-height:100vh` and flex-centered both horizontally and vertically; on the same line, `503` on the left and the Chinese "本站点正在维护中，敬请期待。" on the right, with the English "This site is under maintenance, please stay tuned." directly beneath the Chinese; **no nav bar, no footer, no i18n integration** — the Chinese and English text is hardcoded.
>
> Coloring relies on `@media (prefers-color-scheme)` to follow the **system** light/dark: light = pure white background `#ffffff` + black text `#000000`, dark = pure black background `#000000` + white text `#ffffff`; **completely independent, unaffected by the site's user theme**.
>
> The font strictly uses the system font stack `-apple-system, "San Francisco", "Segoe UI", Roboto, system-ui, Helvetica, Arial, sans-serif`, **no external web fonts loaded, zero extra network requests**.

All maintenance scenarios **always return 503, never 200** (protecting search-engine SEO indexing, preventing crawlers from mistaking 503 for a normal page and wiping the index).

### Break-Glass & brute-force defense

- **Break-Glass emergency account**: the three env vars `SUPER_ADMIN_USERNAME/PASSWORD_HASH/ENABLED`; if missing, the process FATAL-exits. Sessions are recorded with a boolean flag and do not renew; used for disaster recovery such as "clearing all admins", with high-risk confirmation and audit throughout.
- **System-uninitialized gate**: when `system_initialized=false`, normal-account login is rejected (only the emergency account can enter the initialization wizard).
- **Tiered brute-force defense**: counts independently across "account × IP × browser fingerprint", with escalating bans from minute-level up to permanent; externally returns a uniform, obfuscated message (the real reason is only written to the audit log); a ban panel is provided for viewing and lifting bans.

### Async database export (background task)

Database export is now a **background async task** (Dashboard → System Settings → Database Maintenance → "Run a full database export"):

1. Pressing the export button immediately returns a `task_id`; the task runs on the server in the background — **no need to stay on the page**.
2. Progress is visible in the **bottom-right floating popup** or the top-nav **notification center** (the frontend polls every 800ms; once it enters a success/failure terminal state, polling stops automatically).
3. Task records are **permanently kept in the notification list and only cleared by the user manually, never auto-disappearing**; after refreshing the page, historical background tasks are still visible in the notification center (tasks are persisted in the `background_tasks` table; they survive process restarts; on startup, interrupted pending/running are auto-marked as failed).
4. When complete, the backup file remains on the server at `./exports` (directory 0700 / files 0600, gitignored), to be downloaded **manually via SFTP**.

> Export operations are written to the global audit log as usual (`system.db.export`); `background_tasks` is only a progress-presentation layer and does not replace the audit. Database import remains synchronous (superadmin-only + double confirmation).

### Three email-rebinding paths & in-app messages

- **Path A · Dual verification codes** (old email still works): old/new email codes are issued simultaneously; passing three checks (both codes + current password) rebinds the email, with no sessions revoked.
- **Path B · Four-item verification** (old email unavailable): password / student ID / phone / real-name must all match to proceed; any error returns a uniform, vague 403 (anti-enumeration), and 5 consecutive failures lock for 1 hour; after verification, only the new email's code is needed.
- **Path C · Manual review** (self-service unavailable): submitting an application enters a pending-review state (during which all self-service rebinding are blocked); an admin approves in the dashboard's "Email Rebinding Review" (`review.emails` permission), after which the user must finally confirm for it to take effect.
- **In-app message notifications**: three result types — approved / rejected (with reason) / rebinding success — are automatically written to the `user_messages` in-app messages, combined with announcement broadcasts into the notification center's unread badge, supporting per-message read and one-click mark-all-read.

### Dashboard navigation, permission matrix & feature gating

- **Review center aggregation**: the dashboard sidebar's first-level "Review Center" menu centrally collects six to-do types — registration review, club application, bug feedback, password-reset review, school-identity verification, email-rebinding review — located via `?tab=` deep links within the same review page; the top-bar bell to-do badge jumps directly to it.
- **Module permission matrix**: `core/permissions.py` is the single source of truth as "module × role → action set (view/manage)"; super_admin always passes fully; on the API side, `require_permission(module, action)` enforces authz (UI greying/hiding is UX-only, not a security boundary); per-account override matrices are persisted as JSON in `users.permission_overrides`.
- **Feature gating (mail & push)**: `system_settings.mail_system_ready` is the system-readiness switch; when not ready, the sidebar's "Mail & Push" is greyed (hover tooltip explains), and directly visiting `/admin/mailpush` only renders a yellow warning gate page; the switch is delivered via the public settings API and can drive the gate UI without logging in.
- **Dashboard layout**: `h-dvh` flex layout; the sidebar menu and the right main content area are two independent scroll containers (`overscroll-contain` prevents scroll-chain passthrough); the sidebar supports hamburger collapse (collapsed-state icons expand submenus via popover).

### SEO & crawler adaptation

- `robots.txt` + **dynamic `sitemap.xml`** (auto-expanded for all languages across all static and content pages).
- 18-language `hreflang` interlinking + a unique canonical per page, combined with schema.org structured data.
- **IndexNow** pushes new content instantly; maintenance scenarios always return 503 with `Retry-After`, **preventing crawlers from mistaking 503 for a 200 normal page and wiping the index**.
- Site-wide HTTPS + Nginx HTTP/3, shortening handshake and time-to-first-byte, improving crawl efficiency.

---

## Contributing

Members are welcome to contribute. Full contribution rules and PR copyright terms are in [CONTRIBUTING.md](./CONTRIBUTING.md) (Chinese reference version [CONTRIBUTING-ZH.md](./CONTRIBUTING-ZH.md)):

1. **Branch strategy**: `main` always stays runnable and deployable; cut feature branches from `main` — `feat/<module>-<summary>`, `fix/<issue-summary>`, `docs/<topic>` — and open a Pull Request when done; merge after at least one member review.
2. **Commit messages**: use [Conventional Commits](https://www.conventionalcommits.org/) (`feat` / `fix` / `docs` / `refactor` / `perf` / `test` / `chore`).
3. **Code conventions**: frontend TypeScript strict mode with zero errors (`tsc --noEmit`) and passing ESLint; backend keeps the existing layering (`api → schemas → core/db`), business states only use enums, the unified response envelope and `BizException`, admin mutations must write an audit log, deletions are always soft; the Edge layer has only `proxy.ts` — **never create `middleware.ts`**; password inputs must reuse the global `PasswordInput` component (per-box independent eye toggle, auto-reset on refresh; never hand-write a raw `type="password"`).
4. **Pre-submit self-check**: backend `pytest` all pass, frontend `tsc` / `lint` error-free, translation keys added, no secrets or local build artifacts committed.

---

## Contributors

Thanks to everyone who has put effort into the association's official website:

<a href="https://github.com/paperee/GDUE-CA-Official-Website-main/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paperee/GDUE-CA-Official-Website-main" alt="Contributors" />
</a>

---

## License & Copyright

This project is released under a custom **Source-Available** license — the source code is publicly viewable for learning and research; it is not OSI-approved, **is not open-source software, and must never be labeled as open source**. The software is provided "as is", without any warranty.

- 📄 [LICENSE](./LICENSE) — the sole legally binding text (English)
- 📄 [LICENSE-ZH.md](./LICENSE-ZH.md) — Chinese reference version (for reading convenience only; the English LICENSE prevails)
- 📄 [COPYRIGHT.md](./COPYRIGHT.md) — copyright & contact info ([English](./COPYRIGHT.en.md))
- 📄 [CONTRIBUTING.md](./CONTRIBUTING.md) — contribution rules ([Chinese reference version](./CONTRIBUTING-ZH.md))

---

<div align="center">

**Guangdong University of Education (Huadu Campus) Computer Association** · © Guangdong University of Education — Computer Association. All rights reserved.

🌐 Website: [https://gdue-ca.paperee.guru](https://gdue-ca.paperee.guru)　·　💬 Feedback: [GitHub Issues](https://github.com/paperee/GDUE-CA-Official-Website-main/issues)

Full copyright & contact info: [COPYRIGHT.en.md](./COPYRIGHT.en.md)（[中文](./COPYRIGHT.md)）

</div>
