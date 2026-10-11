"""FastAPI 入口：应用创建、路由注册、安全中间件、启动时初始化超级管理员。"""
import asyncio
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete as sa_delete
from sqlalchemy import select

from app.api import activities, admin_stats, announcements, audit, auth, blog, bug_report, comments, content, geo, i18n_public, health, memos, media, members, notifications, oauth, projects, query, realname, recruitment, recycle, register, security, sso, stats, system, tags, translations
from app.api.auth import security_answer_digest
from app.core.config import get_settings
from app.core.csrf import CSRF_HEADER, csrf_middleware
from app.core.exceptions import register_exception_handlers
from app.core.log import setup_logging
from app.core.middleware import (
    ip_rules_middleware,
    rate_limit_middleware,
    security_headers_middleware,
)
from app.core.password_policy import check_password_strength
from app.core.security import Role, hash_password, is_bcrypt_hash, verify_password
from app.core.trace import REQUEST_ID_HEADER, SERVER_TIME_HEADER, TRACE_HEADER, trace_middleware
from app.api.recycle import RETENTION_DAYS, _purge_user
from app.core.admin_gate import admin_gate_middleware
from app.db.models import (
    Activity,
    ActivityEnrol,
    ActivityStatus,
    Base,
    IpRule,
    IpRuleType,
    SecurityQuestion,
    SystemSetting,
    User,
)
from app.db.session import async_session, engine

settings = get_settings()
# 统一日志格式（含 traceId）：尽早初始化，覆盖启动阶段与 uvicorn 自身日志
setup_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
logger = logging.getLogger("gdueca")

# 旧版本预置的弱安全问题（答案可被轻易猜中），启动时自动清除
_LEGACY_SECURITY_QUESTION = ("计算机协会成立于哪一年？", "2008")
# 自动生成的初始超管口令写入该文件（权限 0600），首次登录后必须修改并删除此文件
_INITIAL_PASSWORD_FILE = Path("initial_admin_password.txt")


# ---------- 启动时：建表 + 轻量列迁移 + 初始化超级管理员 ----------
async def _migrate_columns(conn):
    """SQLite 轻量迁移：为已有表补缺失列（create_all 不会给旧表加列）。"""
    from sqlalchemy import text

    expected = {
        "audit_logs": [("trace_id", "VARCHAR(64) NULL")],
        "users": [
            ("failed_login_count", "INTEGER DEFAULT 0"),
            ("locked_until", "DATETIME NULL"),
            ("password_changed_at", "DATETIME NULL"),
            ("timezone", "VARCHAR(64) NULL"),
            ("country", "VARCHAR(64) NULL"),
            ("region", "VARCHAR(128) NULL"),
            ("locality", "VARCHAR(128) NULL"),
            # 标准化地区编码（i18n：只存 code，不存显示文字）
            ("country_code", "VARCHAR(8) NULL"),
            ("subdiv1_code", "VARCHAR(32) NULL"),
            ("subdiv2_code", "VARCHAR(32) NULL"),
            ("locality_text", "VARCHAR(128) NULL"),
            ("permission_overrides", "JSON NULL"),
            # 实名验证（Phase 6）：未实名账号禁止进后台，仅可浏览前台
            ("realname_verified", "BOOLEAN DEFAULT 0"),
            ("realname_verified_at", "DATETIME NULL"),
            ("realname_submitted_at", "DATETIME NULL"),
            ("realname_note", "TEXT NULL"),
            # P0：展示昵称 + 软删除 + 时间戳
            ("display_name", "VARCHAR(64) NULL"),
            ("is_deleted", "BOOLEAN DEFAULT 0"),
            ("deleted_at", "DATETIME NULL"),
            ("updated_at", "DATETIME NULL"),
            ("last_login_at", "DATETIME NULL"),
            # 区域格式（只存编码 / 模式字符串，不存展示文本）
            ("primary_calendar", "VARCHAR(16) DEFAULT 'gregorian'"),
            ("secondary_calendar", "VARCHAR(16) NULL"),
            ("week_first_day", "VARCHAR(16) DEFAULT 'monday'"),
            ("date_short_pattern", "VARCHAR(32) DEFAULT 'YYYY-MM-DD'"),
            ("date_long_pattern", "VARCHAR(32) DEFAULT 'YYYY年M月D日'"),
            ("time_short_pattern", "VARCHAR(32) DEFAULT 'HH:mm'"),
            ("time_long_pattern", "VARCHAR(32) DEFAULT 'HH:mm:ss'"),
            ("default_currency", "VARCHAR(8) DEFAULT 'CNY'"),
        ],
        "activities": [
            ("checkin_open", "BOOLEAN DEFAULT 0"),
            # Phase 3：活动开始/结束时间（状态自动识别 + 双必填校验）
            ("start_at", "DATETIME NULL"),
            ("end_at", "DATETIME NULL"),
            # CMS 对接：列表短描述 / 前台标识 slug / 实际参与人数（markdown 历史数据迁移）
            ("description", "VARCHAR(300) NOT NULL DEFAULT ''"),
            # SQLite ADD COLUMN 不支持 UNIQUE，唯一性由下方部分唯一索引保证
            ("slug", "VARCHAR(64) NULL"),
            ("participants", "INTEGER NULL"),
            # P0：操作管理员 + 软删除
            ("operator_admin_id", "INTEGER NULL"),
            ("is_deleted", "BOOLEAN DEFAULT 0"),
            ("deleted_at", "DATETIME NULL"),
        ],
        "registrations": [
            ("checked_in_at", "DATETIME NULL"),
            ("submit_ip", "VARCHAR(64) NULL"),
            ("source", "VARCHAR(16) NOT NULL DEFAULT 'form'"),
        ],
        "bug_reports": [("submit_ip", "VARCHAR(64) NULL")],
        # 博客展示用作者名（历史迁移内容无系统账号）
        "blog_posts": [("author_name", "VARCHAR(64) NULL")],
        # 成员花名册扩展字段（Excel 批量导入；电话/微信仅管理端可见）
        "members": [
            ("gender", "VARCHAR(8) NULL"),
            ("grade", "VARCHAR(32) NULL"),
            ("department", "VARCHAR(64) NULL"),
            ("major_class", "VARCHAR(64) NULL"),
            ("phone", "VARCHAR(32) NULL"),
            ("wechat", "VARCHAR(64) NULL"),
            ("political_status", "VARCHAR(32) NULL"),
            ("is_intl_student", "BOOLEAN DEFAULT 0"),
        ],
        "login_sessions": [
            ("location_zh", "VARCHAR(128) NULL"),
            ("location_en", "VARCHAR(128) NULL"),
        ],
        "system_settings": [
            ("club_checkin_open", "BOOLEAN DEFAULT 0"),
            ("system_timezone", "VARCHAR(64) DEFAULT 'Asia/Shanghai'"),
            ("network_port", "INTEGER DEFAULT 443"),
            ("network_listen_ip", "VARCHAR(64) DEFAULT '0.0.0.0'"),
            ("network_domains", "TEXT DEFAULT '[]'"),
            # Phase 5：博客评论全局开关
            ("comments_enabled", "BOOLEAN DEFAULT 1"),
            # P0：活动自动归档开关
            ("auto_archive_events", "BOOLEAN DEFAULT 0"),
            # 全局登录会话空闲超时（分钟）
            ("session_idle_timeout_minutes", "INTEGER DEFAULT 30"),
        ],
    }
    if conn.dialect.name == "postgresql":
        # PostgreSQL 原生 ENUM 需显式追加新角色值
        await conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'MEMBER'"))
        # 公告 category 新枚举值：主页公告（原社团公告 club 改名）
        await conn.execute(text("ALTER TYPE announcementcategory ADD VALUE IF NOT EXISTS 'HOME'"))
    # 公告 category 历史数据兼容：社团公告 club → 主页公告 home（SAEnum 存枚举名）
    await conn.execute(text(
        "UPDATE announcements SET category = 'HOME' WHERE category = 'CLUB'"
    ))
    # 翻译缓存去重：缓存表无唯一约束，历史并发未命中可能产生重复行（按原文哈希+语言对保留最新一条）
    await conn.execute(text(
        "DELETE FROM translation_cache WHERE id NOT IN ("
        "SELECT MAX(id) FROM translation_cache "
        "GROUP BY source_hash, source_lang, target_lang)"
    ))
    if conn.dialect.name != "sqlite":
        return
    for table, columns in expected.items():
        rows = await conn.execute(text(f"PRAGMA table_info({table})"))
        existing = {row[1] for row in rows}
        for col, ddl in columns:
            if col not in existing:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
    await conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_audit_logs_trace_id ON audit_logs (trace_id)"
    ))
    # 活动 slug 部分唯一索引（迁移自 markdown 的前台标识；NULL 不去重）
    await conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_activities_slug ON activities (slug) WHERE slug IS NOT NULL"
    ))


async def _init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_columns(conn)

    # 预置系统设置记录
    async with async_session() as s:
        rec = await s.get(SystemSetting, 1)
        if not rec:
            s.add(SystemSetting(id=1))

        # 安全问题：不再预置默认问题；旧版明文答案迁移为哈希，弱默认问题直接清除
        sec_q = await s.get(SecurityQuestion, 1)
        if sec_q and (sec_q.question, sec_q.answer) == _LEGACY_SECURITY_QUESTION:
            await s.delete(sec_q)
            logger.warning("已清除旧版默认安全问题，请超级管理员在后台重新设置")
        elif sec_q and not is_bcrypt_hash(sec_q.answer):
            sec_q.answer = hash_password(security_answer_digest(sec_q.answer))

        # 初始化超级管理员：口令不满足强口令策略时自动生成随机强口令
        from sqlalchemy import select
        existing = (await s.execute(
            select(User).where(User.email == settings.FIRST_SUPERADMIN_EMAIL)
        )).scalar_one_or_none()
        username = settings.FIRST_SUPERADMIN_EMAIL.split("@")[0]
        if not existing:
            password = settings.FIRST_SUPERADMIN_PASSWORD
            if check_password_strength(password, username, settings.FIRST_SUPERADMIN_EMAIL):
                password = _generate_strong_password()
                _INITIAL_PASSWORD_FILE.write_text(
                    f"{settings.FIRST_SUPERADMIN_EMAIL}\n{password}\n", encoding="utf-8"
                )
                os.chmod(_INITIAL_PASSWORD_FILE, 0o600)
                logger.warning(
                    "已生成初始超级管理员随机口令，见 %s（首次登录后必须修改，并删除该文件）",
                    _INITIAL_PASSWORD_FILE.resolve(),
                )
            s.add(User(
                username=username,
                email=settings.FIRST_SUPERADMIN_EMAIL,
                password_hash=hash_password(password),
                role=Role.SUPER_ADMIN,
                must_change_password=True,
                student_id="00000000",
                real_name="超级管理员",
                phone="+8613800000000",
            ))
        elif verify_password("admin", existing.password_hash):
            # 旧版本默认 admin/admin 仍未修改：强制下次登录改密
            existing.must_change_password = True
            logger.warning("超级管理员仍在使用默认弱口令，已强制要求登录后修改")
        await s.commit()

        # 迁移旧 SystemSetting.ip_blacklist JSON 条目为永久 ip_rules（blacklist）
        from sqlalchemy import select
        legacy = (await s.execute(
            select(SystemSetting).where(SystemSetting.id == 1)
        )).scalar_one_or_none()
        if legacy and legacy.ip_blacklist:
            existing_rules = set((r.type, r.rule) for r in (
                await s.execute(select(IpRule))
            ).scalars().all())
            migrated = 0
            for ip_entry in legacy.ip_blacklist:
                key = (IpRuleType.BLACKLIST, ip_entry)
                if key in existing_rules:
                    continue
                s.add(IpRule(
                    type=IpRuleType.BLACKLIST,
                    rule=ip_entry,
                    reason="从旧版 IP 黑名单迁移",
                    created_by=None,
                ))
                migrated += 1
            if migrated:
                logger.info("已迁移 %d 条旧版 IP 黑名单条目到 ip_rules 表", migrated)

        # Phase 6 一次性迁移：既有后台账号（super_admin/admin/editor）视为已实名
        # （由超管创建且已登记学号/真名/手机号）；第三方注册的 member 账号需走实名审核
        unverified = (await s.execute(
            select(User).where(
                User.role.in_([Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR]),
                User.realname_verified.is_(False),
            )
        )).scalars().all()
        for u in unverified:
            u.realname_verified = True
        if unverified:
            logger.info("已将 %d 个既有后台账号标记为已实名", len(unverified))
        await s.commit()


def _generate_strong_password() -> str:
    while True:
        candidate = secrets.token_urlsafe(12) + secrets.choice("!@#$%^&*") + "Aa9"
        if not check_password_strength(candidate):
            return candidate


# ---------- 全局定时任务（P0，每小时） ----------
async def _run_maintenance() -> None:
    """①软删除超期（30 天）记录物理清除；②自动归档开关开启时归档过期活动。"""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    threshold = now - timedelta(days=RETENTION_DAYS)
    async with async_session() as s:
        # 1) 已取消（软删）的报名记录超期清除
        await s.execute(sa_delete(ActivityEnrol).where(
            ActivityEnrol.is_deleted.is_(True), ActivityEnrol.created_at < threshold))
        # 2) 软删活动超期物理清除（连同其报名记录）
        expired_activities = (await s.execute(
            select(Activity.id).where(
                Activity.is_deleted.is_(True), Activity.deleted_at < threshold)
        )).scalars().all()
        if expired_activities:
            await s.execute(sa_delete(ActivityEnrol).where(
                ActivityEnrol.activity_id.in_(expired_activities)))
            await s.execute(sa_delete(Activity).where(Activity.id.in_(expired_activities)))
            logger.info("定时任务：已物理删除 %d 个超期软删除活动", len(expired_activities))
        # 3) 软删账号超期物理清除（历史报名统计通过活动侧数据保留）
        expired_users = (await s.execute(
            select(User.id).where(User.is_deleted.is_(True), User.deleted_at < threshold)
        )).scalars().all()
        for uid in expired_users:
            await _purge_user(s, uid)
        if expired_users:
            logger.info("定时任务：已物理删除 %d 个超期软删除账号", len(expired_users))
        # 4) 活动自动归档（可配置开关，默认关）：end_at 已过 → archived
        setting = await s.get(SystemSetting, 1)
        if setting and setting.auto_archive_events:
            result = await s.execute(
                select(Activity).where(
                    Activity.is_deleted.is_(False),
                    Activity.status.in_([
                        ActivityStatus.PUBLISHED,
                        ActivityStatus.REGISTRATION_OPEN,
                        ActivityStatus.ENDED,
                    ]),
                    Activity.end_at.is_not(None),
                    Activity.end_at < now,
                )
            )
            auto_archived = 0
            for a in result.scalars():
                a.status = ActivityStatus.ARCHIVED
                auto_archived += 1
            if auto_archived:
                logger.info("定时任务：已自动归档 %d 个过期活动", auto_archived)
        await s.commit()


async def _maintenance_loop() -> None:
    """每小时执行一次维护任务；异常不中断循环。"""
    while True:
        try:
            await _run_maintenance()
        except Exception:
            logger.exception("定时维护任务执行失败")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _init_db()
    task = asyncio.create_task(_maintenance_loop())
    yield
    task.cancel()


app = FastAPI(
    title="GDUECA 社团官网后端",
    description="广东第二师范学院计算机协会官网 FastAPI 后端 — 活动发布、报名收集、Bug 反馈、权限管理、数据导出",
    version="1.0.0",
    lifespan=lifespan,
    # 生产环境默认关闭接口文档，减少攻击面
    docs_url="/docs" if settings.ENABLE_API_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_API_DOCS else None,
    openapi_url="/openapi.json" if settings.ENABLE_API_DOCS else None,
)

# ---------- 全局异常处理器（禁止向前端输出堆栈） ----------
register_exception_handlers(app)

# ---------- 中间件（后注册的在外层） ----------
# 1. CSRF：写请求校验 X-CSRF-Token 与来源（最内层，先于路由执行）
app.middleware("http")(csrf_middleware)
# 1.5 管理端全局强制门：/api/admin/* 必须已登录且为管理员级角色（P0 硬性规则），
#     否则直接 401/403；细粒度模块权限仍由各路由依赖校验（两层防御）
app.middleware("http")(admin_gate_middleware)
# 2. 限流（令牌桶，每 IP）
app.middleware("http")(rate_limit_middleware)
# 3. IP 黑白名单 + Host 白名单
app.middleware("http")(ip_rules_middleware)
# 4. 安全响应头（覆盖所有响应，包括被拦截的请求）
app.middleware("http")(security_headers_middleware)
# 5. CORS：登录态走 Cookie，必须显式列出来源，禁止 "*"
#    推荐前端通过同源反代访问 /api（Next.js rewrites / Nginx），此时无需 CORS
if settings.cors_origins_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", CSRF_HEADER],
        # 同时暴露 trace / request id 与服务器权威 UTC 时间；前端按规范读取
        expose_headers=[TRACE_HEADER, REQUEST_ID_HEADER, SERVER_TIME_HEADER],
    )
# 6. traceId（最外层）：覆盖所有请求，包括被 CORS / 黑名单 / CSRF 拦截的请求
app.middleware("http")(trace_middleware)


# ---------- 健康检查（新壳示范接口） ----------
# 旧的内联 /health 已迁移到 app.api.health 模块（响应壳统一化改造的第一批示范接口）

# ---------- 注册路由 ----------
app.include_router(health.router)
app.include_router(geo.router)
app.include_router(i18n_public.router)
app.include_router(auth.router)
app.include_router(activities.router)
app.include_router(activities.admin_router)
app.include_router(announcements.public_router)
app.include_router(announcements.admin_router)
app.include_router(notifications.router)
app.include_router(content.public_router)
app.include_router(content.admin_router)
app.include_router(members.public_router)
app.include_router(members.admin_router)
app.include_router(recruitment.public_router)
app.include_router(recruitment.admin_router)
app.include_router(blog.public_router)
app.include_router(blog.admin_router)
app.include_router(projects.public_router)
app.include_router(projects.admin_router)
app.include_router(comments.public_router)
app.include_router(comments.admin_router)
app.include_router(oauth.public_router)
app.include_router(oauth.admin_router)
app.include_router(sso.public_router)
app.include_router(sso.admin_router)
app.include_router(realname.router)
app.include_router(realname.admin_router)
app.include_router(register.router)
app.include_router(bug_report.router)
app.include_router(system.router)
app.include_router(translations.router)
app.include_router(query.router)
app.include_router(admin_stats.router)
app.include_router(stats.router)
app.include_router(media.router)
app.include_router(audit.router)
app.include_router(recycle.router)
app.include_router(security.router)
# ---------- Phase 8: Memo 碎片笔记 + 全局共享标签 ----------
# 注意：author_router 与 public_router 共享 /api/memos 前缀；
# FastAPI 按注册顺序匹配，必须先注册具体路径（公开 /shared/{share_slug} 等），再注册参数路由（{memo_id}）。
app.include_router(tags.router)
app.include_router(memos.public_router)
app.include_router(memos.author_router)
app.include_router(memos.user_router)
app.include_router(memos.admin_router)

# ---------- 静态文件服务（头像上传 + 成员头像 + 博客图片 + Memo 附件） ----------
os.makedirs("uploads/avatars", exist_ok=True)
os.makedirs("uploads/members", exist_ok=True)
os.makedirs("uploads/blog", exist_ok=True)
os.makedirs("uploads/memos", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
