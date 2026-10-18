# 部署运维手册（V0.6.0）

面向低配 VPS（1C1G/1C2G 级别）的日常运维操作。本文覆盖：数据库备份与恢复、种子脚本、Cloudflare 站点配置（Issue3）、致命故障排查辅助（faulthandler）、静态维护页。

---

## 1. 数据库备份（Issue12）

### 1.1 手动备份

```bash
chmod +x deploy/scripts/db_backup.sh
./deploy/scripts/db_backup.sh
```

脚本行为：

- 自动从环境变量或 `backend/.env` 读取 `DATABASE_URL`；
- **SQLite**（默认）：优先 `sqlite3 .backup` 在线一致性快照 + gzip（未装 sqlite3 时回退 `cp`，会打印警告）；
- **PostgreSQL**：`pg_dump -Fc` 自定义格式（内置压缩）；
- 输出到 `BACKUP_DIR`（默认 `/var/backups/gdueca`），文件权限 0600；
- 滚动保留最近 `KEEP_COPIES` 份（默认 7），自动清理更早备份。

可覆盖变量：

```bash
BACKUP_DIR=/data/backup KEEP_COPIES=14 ./deploy/scripts/db_backup.sh
```

### 1.2 定时备份（crontab）

```cron
# 每日 03:17 备份数据库
17 3 * * * /path/to/GDUE-CA-Official-Website/deploy/scripts/db_backup.sh >> /var/log/gdueca-backup.log 2>&1
```

### 1.3 恢复

```bash
# SQLite：解压后放回 backend/ 目录（覆盖前先停服务）
systemctl stop gdueca   # 或你的进程管理方式
gunzip -k /var/backups/gdueca/gdueca-sqlite-YYYYMMDD-HHMMSS.db.gz
cp /var/backups/gdueca/gdueca-sqlite-YYYYMMDD-HHMMSS.db /path/to/backend/assoc.db
# 若原先启用了 WAL，删除旧 -wal / -shm 文件后启动
systemctl start gdueca
```

```bash
# PostgreSQL：pg_restore（建议恢复到新建空库）
createdb gdueca_restored
pg_restore --no-owner --no-privileges -d gdueca_restored /var/backups/gdueca/gdueca-pg-gdueca-YYYYMMDD-HHMMSS.dump
```

恢复后建议执行一次种子脚本补齐内置数据（见 §2）。

---

## 2. 种子 / 修复脚本（Issue12）

```bash
cd backend
python -m app.seed
```

等价于应用启动时自动执行的 `_init_db()`：建表（含轻量列迁移）+ 预置系统设置 / 内置主题 / 安全问题题库 / 意向部门选项。**全部幂等**——仅在缺省时插入，不覆盖管理员已修改的数据，可放心重复执行。

典型场景：从备份还原数据库后补齐种子；启动初始化中途失败的手动修复；新环境初始化演练。

---

## 3. Cloudflare 站点配置（Issue3 · 必做）

站点经 Cloudflare CDN 代理时，以下两个「优化」功能必须关闭，否则会破坏前端正常渲染（这两个功能会改写页面 HTML/脚本，与 Next.js 不兼容）：

| 配置项 | 路径 | 设置 | 原因 |
| --- | --- | --- | --- |
| **Email Address Obfuscation** | 控制台 → Scrape Shield（抓取防护）→ Email Address Obfuscation | **Off** | 会把页面中的邮箱文本改写为 `/cdn-cgi/l/email-protection` 混淆脚本，导致社团报名邮箱、联系邮箱等显示为乱码或链接失效 |
| **Rocket Loader** | 控制台 → Speed（速度）→ 优化 → Rocket Loader | **Off** | 将 `<script>` 改为异步注入，破坏 Next.js hydration 的脚本执行顺序，引发白屏、点击无响应等交互故障 |

其余默认配置（含 CSP）**不要动**：站点的 Content-Security-Policy 由后端 `security_headers_middleware` 统一下发，Cloudflare 不参与 CSP 改写；不要在 Cloudflare 侧再叠加 CSP 变换。

---

## 4. 致命故障排查辅助（Issue11）

后端入口已启用 `faulthandler.enable()`（`app/main.py`）。进程发生段错误 / 致命信号（SIGSEGV/SIGABRT 等）时，Python 会把**全部线程栈**转储到 stderr，用于定位低配 VPS 上的卡死与崩溃。

查看方式取决于进程管理器：

```bash
# systemd：转储内容会出现在 journal
journalctl -u gdueca -n 200

# Docker：容器日志
docker logs --tail 200 <container>
```

---

## 5. 静态维护页（503 兜底）

```bash
./deploy/scripts/post_deploy.sh
```

将纯静态维护页部署到 `/var/www/maintenance/`（默认）。Nginx 检测到 Node 3000 端口 502/504 时通过 `error_page` 回退到该页（状态码强制 503、禁止缓存），Nginx 挂载配置见 `deploy/nginx/gdueca.conf`。每次部署成功后执行一次即可。
