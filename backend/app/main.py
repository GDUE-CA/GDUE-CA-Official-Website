"""FastAPI 入口：应用创建、路由注册、安全中间件、启动时初始化超级管理员。"""
import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select

from app.api import account, activities, admin_stats, announcements, audit, auth, background_tasks, badges, blog, bug_report, club_apply, comments, content, db_maintenance, email_change, geo, i18n_public, health, memos, media, members, notifications, oauth, projects, query, realname, recruitment, recycle, register, roles, school_verify, security, sso, stats, sys_data, system, system_init, tags, themes, translations, users, version
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
from app.core.security import Role, hash_password, is_bcrypt_hash
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
    Theme,
    ThemeLayout,
    User,
)
from app.db.session import async_session, engine

settings = get_settings()
# 统一日志格式（含 traceId）：get_settings() 首次加载时已初始化；
# 以 `uvicorn app.main:app` / gunicorn 启动时 uvicorn 会先套用自己的日志配置，这里再覆盖一次
setup_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
logger = logging.getLogger("gdueca")

# 旧版本预置的弱安全问题（答案可被轻易猜中），启动时自动清除
_LEGACY_SECURITY_QUESTION = ("计算机协会成立于哪一年？", "2008")


# ---------- 启动时：建表 + 轻量列迁移 + 初始化超级管理员 ----------
async def _rebuild_users_student_id_nullable(conn):
    """users.student_id 由 NOT NULL 改为可空（V1.2 Module D：社会成员无学号）。

    SQLite 不支持 ALTER COLUMN，需整表重建（12-step 流程）：
    按 sqlite_master 原始 DDL 复制建 users_new（仅补丁 student_id 可空）→
    原样复制数据 → DROP 旧表（连带旧索引）→ RENAME 回 users → 重建原索引。
    本项目 SQLite 未开启外键 pragma（announcements.py 等处已确认），
    DROP users 不会触发子表 FK 校验；子表 FK 文本引用的表名在 RENAME 后保持有效。
    """
    import re

    from sqlalchemy import text

    rows = await conn.execute(text("PRAGMA table_info(users)"))
    infos = rows.fetchall()
    if not infos:
        return  # 全新库：create_all 已按新模型建表（student_id 本就可空）
    sid = next((c for c in infos if c[1] == "student_id"), None)
    if sid is None or sid[3] == 0:
        return  # 列不存在或已可空

    ddl = (await conn.execute(text(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    ))).scalar_one()
    new_ddl = ddl.replace("CREATE TABLE users", "CREATE TABLE users_new", 1)
    patched = re.sub(
        r'(?P<col>"?student_id"?)\s+VARCHAR\(32\)\s+NOT\s+NULL',
        r"\g<col> VARCHAR(32)",
        new_ddl,
        count=1,
    )
    if patched == new_ddl:
        logger.warning("users 重建迁移：未能定位 student_id NOT NULL 定义，跳过")
        return
    # 先取出旧表索引 DDL（DROP TABLE 会连索引一起删除；索引 DDL 引用表名 users，RENAME 后可直接复用）
    idx_ddls = [r[0] for r in (await conn.execute(text(
        "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='users' "
        "AND sql IS NOT NULL"
    ))).fetchall()]
    await conn.execute(text(patched))
    await conn.execute(text("INSERT INTO users_new SELECT * FROM users"))
    await conn.execute(text("DROP TABLE users"))
    await conn.execute(text("ALTER TABLE users_new RENAME TO users"))
    for stmt in idx_ddls:
        await conn.execute(text(stmt))
    logger.info("users.student_id 已迁移为可空（整表重建，%d 列）", len(infos))


async def _migrate_columns(conn):
    """SQLite 轻量迁移：为已有表补缺失列（create_all 不会给旧表加列）。"""
    from sqlalchemy import text

    expected = {
        "audit_logs": [
            ("trace_id", "VARCHAR(64) NULL"),
            # Break-Glass 应急账号操作者标识（user_id 保持 NULL）
            ("actor", "VARCHAR(64) NULL"),
        ],
        "users": [
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
            # 本地化系统：用户个人偏好（NULL = 跟随系统全局）
            # default_currency→currency 由 renames 逻辑处理（旧库 rename，新库 create_all 直接建）
            ("locale", "VARCHAR(16) NULL"),
            ("region_code", "VARCHAR(16) NULL"),
            ("currency", "VARCHAR(8) NULL"),
            # ---- 个人资料扩展字段（规格补齐） ----
            ("gender", "VARCHAR(8) NULL"),
            ("birthday", "DATETIME NULL"),
            ("bio", "TEXT NULL"),
            ("theme", "VARCHAR(32) NULL"),
            ("profile_privacy", "JSON NULL"),
            # 更改绑定邮箱人工审核一次性豁免标记（用完即清）
            ("allow_manual_email_switch", "BOOLEAN DEFAULT 0"),
            # 社团职务（展示层，与权限解耦）：president / vice_president / member
            ("club_position", "VARCHAR(32) NULL"),
            # ---- Module D：身份分类与学校资料（外键 ID 关联系统基础表） ----
            ("identity_school_verified", "BOOLEAN DEFAULT 0"),
            ("college_id", "INTEGER NULL"),
            ("major_id", "INTEGER NULL"),
            ("grade_id", "INTEGER NULL"),
            ("class_id", "INTEGER NULL"),
            # ---- V0.5.5 §9.3：个人主页外观 ----
            ("profile_banner", "VARCHAR(256) NULL"),
            ("profile_banner_color", "VARCHAR(16) NULL"),
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
        # 博客展示用作者名（历史迁移内容无系统账号）+ 4 项统计指标
        "blog_posts": [
            ("author_name", "VARCHAR(64) NULL"),
            ("like_count", "INTEGER DEFAULT 0"),
            ("comment_count", "INTEGER DEFAULT 0"),
            ("share_count", "INTEGER DEFAULT 0"),
            ("favourite_count", "INTEGER DEFAULT 0"),
        ],
        # 评论系统：双布尔软删除字段（替代旧 CommentStatus 枚举）
        "comments": [
            ("is_deleted", "BOOLEAN DEFAULT 0"),
            ("is_hidden", "BOOLEAN DEFAULT 0"),
        ],
        # 随手笔记：分享计数
        "memos": [
            ("share_count", "INTEGER DEFAULT 0"),
        ],
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
            # system_timezone→sys_default_timezone 由 renames 处理（旧库 rename，新库 create_all 直接建）
            ("sys_default_timezone", "VARCHAR(64) DEFAULT 'Asia/Shanghai'"),
            ("network_port", "INTEGER DEFAULT 443"),
            ("network_listen_ip", "VARCHAR(64) DEFAULT '0.0.0.0'"),
            ("network_domains", "TEXT DEFAULT '[]'"),
            # 管理员可信来源 IP 白名单（Web 配置，优先于环境变量 ADMIN_TRUSTED_IPS）
            ("admin_trusted_ips", "TEXT DEFAULT '[]'"),
            # Phase 5：博客评论全局开关
            ("comments_enabled", "BOOLEAN DEFAULT 1"),
            # P0：活动自动归档开关
            ("auto_archive_events", "BOOLEAN DEFAULT 0"),
            # 全局登录会话空闲超时（分钟）
            ("session_idle_timeout_minutes", "INTEGER DEFAULT 30"),
            # ---------- 系统初始化向导（Break-Glass 体系） ----------
            ("system_initialized", "BOOLEAN DEFAULT 0"),
            # 本地化系统全局默认（default_locale→sys_default_locale 等由 renames 处理）
            ("sys_default_locale", "VARCHAR(16) NULL"),
            ("sys_default_region", "VARCHAR(16) NULL"),
            ("sys_default_currency", "VARCHAR(8) NULL"),
            # V0.5.5 §3.3：邮件收发模块就绪开关
            ("mail_system_ready", "BOOLEAN DEFAULT 0"),
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
    # 列重命名（旧列→新列）：仅当旧列存在且新列不存在时执行 ALTER TABLE RENAME COLUMN。
    # 旧库 rename 后新列已存在，下方 ADD COLUMN 循环会跳过；新库 create_all 直接建新列，rename 不触发。
    renames = {
        "users": [
            ("default_currency", "currency"),
        ],
        "system_settings": [
            ("system_timezone", "sys_default_timezone"),
            ("default_locale", "sys_default_locale"),
            ("default_region", "sys_default_region"),
        ],
    }
    for table, pairs in renames.items():
        rows = await conn.execute(text(f"PRAGMA table_info({table})"))
        existing_cols = {row[1] for row in rows}
        for old, new in pairs:
            if old in existing_cols and new not in existing_cols:
                await conn.execute(text(f"ALTER TABLE {table} RENAME COLUMN {old} TO {new}"))
                logger.info("已重命名 %s.%s → %s", table, old, new)
    for table, columns in expected.items():
        rows = await conn.execute(text(f"PRAGMA table_info({table})"))
        existing = {row[1] for row in rows}
        for col, ddl in columns:
            if col not in existing:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
    # 评论旧枚举 status → 双布尔回填（仅当 status 列存在时执行；新库无此列跳过）
    rows = await conn.execute(text("PRAGMA table_info(comments)"))
    has_status_col = any(row[1] == "status" for row in rows)
    if has_status_col:
        await conn.execute(text(
            "UPDATE comments SET is_deleted=1 WHERE status='USER_DELETED' AND is_deleted=0"
        ))
        await conn.execute(text(
            "UPDATE comments SET is_hidden=1 WHERE status='ADMIN_REMOVED' AND is_hidden=0"
        ))
        logger.info("评论旧枚举 status 已回填至 is_deleted/is_hidden")
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
        # 必须先于 _migrate_columns：重建基于原始 DDL（INSERT SELECT * 要求列数一致）
        await _rebuild_users_student_id_nullable(conn)
        await _migrate_columns(conn)

    # 预置系统设置记录
    async with async_session() as s:
        rec = await s.get(SystemSetting, 1)
        if not rec:
            rec = SystemSetting(id=1)
            s.add(rec)

        # 安全问题：不再预置默认问题；旧版明文答案迁移为哈希，弱默认问题直接清除
        sec_q = await s.get(SecurityQuestion, 1)
        if sec_q and (sec_q.question, sec_q.answer) == _LEGACY_SECURITY_QUESTION:
            await s.delete(sec_q)
            logger.warning("已清除旧版默认安全问题，请超级管理员在后台重新设置")
        elif sec_q and not is_bcrypt_hash(sec_q.answer):
            sec_q.answer = hash_password(security_answer_digest(sec_q.answer))

        # 系统初始化状态判定（Break-Glass 体系）：
        # - 存量库（users 表已有任意账号，含软删回收站中的账号）→ 视为已完成初始化；
        # - 全新库 → 保持 false，仅 Break-Glass 可登录，通过后台初始化向导完成初始化。
        # 初始化完成后向导永久隐藏（后台不提供重置开关，仅允许手动改库）。
        if not rec.system_initialized:
            user_count = (await s.execute(select(func.count()).select_from(User))).scalar_one()
            if user_count > 0:
                rec.system_initialized = True
                logger.info("检测到存量数据库（%d 个账号），系统初始化状态置为已完成", user_count)
        await s.commit()

        # 迁移旧 SystemSetting.ip_blacklist JSON 条目为永久 ip_rules（blacklist）
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

        # 预置内置主题（default / apple）：key 不存在才插入，管理员后续修改不被覆盖
        builtin_themes = [
            dict(key="default", name="默认主题", layout=ThemeLayout.MICROSOFT,
                 css_vars={}, dark_vars=None, sort_order=0),
            dict(key="apple", name="Apple 主题", layout=ThemeLayout.APPLE,
                 css_vars={"--radius": "1rem"},
                 dark_vars={"--background": "240 6% 5%"}, sort_order=10),
        ]
        for spec in builtin_themes:
            exists = (await s.execute(
                select(Theme).where(Theme.key == spec["key"])
            )).scalar_one_or_none()
            if not exists:
                s.add(Theme(**spec))
        await s.commit()


# ---------- 全局定时任务（P0，每小时） ----------
def _cleanup_expired_mail_attachments() -> int:
    """V0.5.5 §4：站内邮件大附件 7 天生命周期清理（只删磁盘文件，邮件正文不动）。

    扫描 uploads/mail-attachments/ 全部文件，mtime 超过 MAIL_ATTACHMENT_RETENTION_DAYS
    的直接删除；附件下载链接随文件删除而失效。目录不存在时为 no-op
    （邮件收发系统落地前无附件可清理，本钩子先行占位）。
    """
    from app.core.config import get_settings
    retention_days = get_settings().MAIL_ATTACHMENT_RETENTION_DAYS
    attachment_dir = Path("uploads/mail-attachments")
    if not attachment_dir.is_dir():
        return 0
    cutoff = time.time() - retention_days * 86400
    removed = 0
    for f in attachment_dir.rglob("*"):
        try:
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)
                removed += 1
        except OSError:
            logger.warning("邮件附件清理失败：%s", f)
    if removed:
        logger.info("定时任务：已清理 %d 个超期邮件附件（保存期 %d 天）", removed, retention_days)
    return removed


async def _run_maintenance() -> None:
    """①软删除超期（30 天）记录物理清除；②自动归档开关开启时归档过期活动；
    ③邮件大附件超期磁盘清理（V0.5.5 §4）。"""
    _cleanup_expired_mail_attachments()
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
        # 4) 软删主题超期物理清除
        purged_themes = await s.execute(sa_delete(Theme).where(
            Theme.is_deleted.is_(True), Theme.deleted_at < threshold))
        if purged_themes.rowcount:
            logger.info("定时任务：已物理删除 %d 个超期软删除主题", purged_themes.rowcount)
        # 5) 活动自动归档（可配置开关，默认关）：end_at 已过 → archived
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
    # Break-Glass 启动硬性校验：凭据只允许来自环境变量，缺失/非法直接崩溃退出
    _validate_break_glass_env()
    await _init_db()
    # 上次进程遗留的 pending/running 后台任务 → 标记为 failed（中断）
    from app.core.background_tasks import recover_interrupted
    from app.core.background_tasks import shutdown as bg_tasks_shutdown

    await recover_interrupted()
    task = asyncio.create_task(_maintenance_loop())
    kv_task = asyncio.create_task(_kv_sweep_loop())
    try:
        yield
    finally:
        # 必须先取消并等待后台任务收尾：它们可能正持有数据库连接，
        # 若在连接借出期间直接让事件循环退出，aiosqlite 工作线程的关闭回调
        # 会投递到已停止的循环，导致优雅关闭永久挂起（测试 / 多 worker 重启必现）。
        task.cancel()
        kv_task.cancel()
        await asyncio.gather(task, kv_task, return_exceptions=True)
        # 用户触发的后台异步任务（数据库导出等）同样先收尾
        await bg_tasks_shutdown()
        # 在当前循环内主动释放连接池，避免连接被 GC 终结时跨循环 terminate 死锁
        await engine.dispose()


def _validate_break_glass_env() -> None:
    """SUPER_ADMIN_* 三项环境变量任一缺失/非法 → FATAL 日志 + 进程退出。"""
    from app.core.security import is_bcrypt_hash

    problems = []
    if not settings.SUPER_ADMIN_USERNAME.strip():
        problems.append("SUPER_ADMIN_USERNAME is empty")
    if not is_bcrypt_hash(settings.SUPER_ADMIN_PASSWORD_HASH):
        problems.append("SUPER_ADMIN_PASSWORD_HASH is missing or not a bcrypt hash")
    if settings.SUPER_ADMIN_ENABLED.strip().lower() not in ("true", "false"):
        problems.append("SUPER_ADMIN_ENABLED must be 'true' or 'false'")
    if problems:
        # 只输出问题类别，绝不输出凭据内容（哈希/用户名不打日志）
        logger.critical(
            "FATAL: Break-Glass environment variables missing. Cannot start server. "
            "Please configure SUPER_ADMIN_* environment variables. (%s)",
            "; ".join(problems),
        )
        raise SystemExit(1)


async def _kv_sweep_loop() -> None:
    """KV 内存兜底后端的周期过期清扫（Redis 后端为空操作）。"""
    from app.core.kv import start_sweep

    while True:
        try:
            await start_sweep()
        except Exception:
            logger.exception("KV 清扫任务执行失败")
        await asyncio.sleep(60)


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
app.include_router(version.router)
app.include_router(geo.router)
app.include_router(i18n_public.router)
app.include_router(auth.router)
app.include_router(email_change.router)
app.include_router(account.router)
app.include_router(users.router)
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
app.include_router(themes.public_router)
app.include_router(themes.admin_router)
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
app.include_router(system.admin_config_router)
app.include_router(system_init.router)
app.include_router(translations.router)
app.include_router(query.router)
app.include_router(admin_stats.router)
app.include_router(stats.router)
app.include_router(media.router)
app.include_router(audit.router)
app.include_router(audit.bg_router)
app.include_router(recycle.router)
app.include_router(security.router)
app.include_router(security.admin_router)
app.include_router(roles.router)
# 后台异步任务（数据库导出等）：任务查询/关闭 + 数据库维护提交入口
app.include_router(background_tasks.router)
app.include_router(db_maintenance.router)
# ---------- Phase 8: Memo 碎片笔记 + 全局共享标签 ----------
# 注意：author_router 与 public_router 共享 /api/memos 前缀；
# FastAPI 按注册顺序匹配，必须先注册具体路径（公开 /shared/{share_slug} 等），再注册参数路由（{memo_id}）。
app.include_router(tags.router)
app.include_router(memos.public_router)
app.include_router(memos.author_router)
app.include_router(memos.user_router)
app.include_router(memos.admin_router)
app.include_router(badges.router)
# ---------- Module D：系统基础数据（学院/年级/专业/班级）+ 学校验证 + 社团报名 ----------
app.include_router(sys_data.public_router)
app.include_router(sys_data.admin_router)
app.include_router(school_verify.router)
app.include_router(school_verify.admin_router)
app.include_router(club_apply.router)
app.include_router(club_apply.admin_router)

# ---------- 静态文件服务（头像上传 + 成员头像 + 博客图片 + Memo 附件） ----------
os.makedirs("uploads/avatars", exist_ok=True)
os.makedirs("uploads/members", exist_ok=True)
os.makedirs("uploads/blog", exist_ok=True)
os.makedirs("uploads/memos", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
