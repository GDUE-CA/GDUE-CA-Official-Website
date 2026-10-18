"""系统初始化向导接口（Break-Glass 体系）。

仅 system_initialized=false 时可用；向导步骤：
1. 修改 Break-Glass 密码（校验强度 + 生成 bcrypt 哈希，运维复制更新 env 后重启）
2. 系统全局基础参数（默认语言 / IANA 时区 / 地区）
3. 创建第一位业务超级管理员
4. 确认提交 → 原子事务写入 + 自动登出 Break-Glass

向导完成后 system_initialized=true，入口永久隐藏（后台不提供重置开关）。
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_break_glass, security_answer_digest
from app.core.audit import log_action
from app.core.config import get_settings
from app.core.csrf import SESSION_COOKIE
from app.core.middleware import get_client_ip
from app.core.password_policy import (
    MAX_LENGTH as PASSWORD_MAX_LENGTH,
    check_break_glass_password,
    check_password_strength,
)
from app.core.responses import ok
from app.core.security import bg_session_revoke, hash_password
from app.db.models import SystemSetting, User, UserRole, UserSecurityQuestion
from app.db.session import get_db
from app.schemas.auth import SecurityQuestionItem
from app.schemas.common import LooseEmail, PlainText

router = APIRouter(prefix="/api/system-init", tags=["system-init"])
settings = get_settings()


class SystemInitStatusOut(BaseModel):
    system_initialized: bool
    default_locale: str | None = None
    default_timezone: str | None = None
    default_region: str | None = None
    default_currency: str | None = None


class BGPasswordVerifyRequest(BaseModel):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    confirm_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class BGPasswordHashRequest(BaseModel):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class FirstAdminCreate(BaseModel):
    username: PlainText = Field(min_length=2, max_length=64)
    display_name: PlainText = Field(min_length=1, max_length=64)
    email: LooseEmail
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    # 安全问题（per-user 3 个）：初始化向导强制设 3 个
    security_questions: list[SecurityQuestionItem]

    @model_validator(mode="after")
    def _validate_security_questions(self) -> "FirstAdminCreate":
        from app.core.security_questions import SECURITY_QUESTIONS_COUNT
        if len(self.security_questions) != SECURITY_QUESTIONS_COUNT:
            raise ValueError(f"必须设置 {SECURITY_QUESTIONS_COUNT} 个安全问题")
        positions = [q.position for q in self.security_questions]
        if len(set(positions)) != len(positions):
            raise ValueError("安全问题 position 不可重复")
        return self


class SystemInitRequest(BaseModel):
    default_locale: str = Field(min_length=2, max_length=16)    # e.g. zh-cn
    default_timezone: str = Field(min_length=2, max_length=64)  # IANA, e.g. Asia/Shanghai
    default_region: str = Field(min_length=2, max_length=16)    # e.g. CN
    default_currency: str = Field(min_length=3, max_length=8)   # ISO-4217, e.g. CNY
    admin: FirstAdminCreate


@router.get("/status")
async def get_init_status(db: AsyncSession = Depends(get_db, scope="function")):
    """公开接口：返回系统初始化状态（前端据此决定是否跳转向导）。"""
    ss = await db.get(SystemSetting, 1)
    if not ss:
        return ok({"system_initialized": False, "default_locale": None, "default_timezone": None, "default_region": None, "default_currency": None})
    return ok({
        "system_initialized": bool(ss.system_initialized),
        "default_locale": ss.sys_default_locale,
        "default_timezone": ss.sys_default_timezone,
        "default_region": ss.sys_default_region,
        "default_currency": ss.sys_default_currency,
    })


@router.post("/break-glass/verify-password")
async def verify_bg_password(
    req: BGPasswordVerifyRequest,
    user: dict = Depends(require_break_glass),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """步骤1校验：Break-Glass 新密码是否符合应急账号强密码策略（前端实时调用）。"""
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="两次输入的密码不一致")
    reason = check_break_glass_password(req.password, settings.SUPER_ADMIN_USERNAME)
    if reason:
        raise HTTPException(status_code=400, detail=reason)
    return ok({"valid": True})


@router.post("/break-glass/password-hash")
async def generate_bg_password_hash(
    req: BGPasswordHashRequest,
    request: Request,
    user: dict = Depends(require_break_glass),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """步骤1生成：校验通过后输出 bcrypt 哈希供运维复制。

    Web 端不修改环境变量（无此权限）；仅生成哈希 + 警告文案。
    运维复制后更新 SUPER_ADMIN_PASSWORD_HASH 环境变量并重启后端才生效。
    """
    reason = check_break_glass_password(req.password, settings.SUPER_ADMIN_USERNAME)
    if reason:
        raise HTTPException(status_code=400, detail=reason)
    hashed = hash_password(req.password)
    log_action(db, user, "bg_init.password_hash_generated", None, ip=get_client_ip(request))
    await db.commit()
    return ok({
        "hash": hashed,
        "warning": (
            "⚠️ Break-Glass 为系统最高权限应急账号，强制要求强密码；"
            "不允许沿用旧哈希。密码哈希复制后务必更新服务器环境变量，"
            "重启后端服务使之生效。若未更新，系统依旧使用旧凭据，存在严重安全漏洞。"
        ),
    })


@router.post("/initialize")
async def initialize_system(
    req: SystemInitRequest,
    request: Request,
    response: Response,
    user: dict = Depends(require_break_glass),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """步骤4确认提交：原子事务写入全部初始化数据 + 自动登出 Break-Glass。

    1. 写入 sys_config：default_locale / system_timezone / default_region
    2. 创建第一位业务超级管理员（普通账号密码策略）
    3. system_initialized = true
    4. 撤销 Break-Glass 会话 + 清除 Cookie
    """
    ss = await db.get(SystemSetting, 1)
    if not ss:
        ss = SystemSetting(id=1)
        db.add(ss)
        await db.flush()
    if ss.system_initialized:
        raise HTTPException(status_code=400, detail="系统已完成初始化，不可重复执行")

    # 普通账号密码强度校验（非 BG 严苛策略）
    admin_pw_reason = check_password_strength(
        req.admin.password, req.admin.username, req.admin.email
    )
    if admin_pw_reason:
        raise HTTPException(status_code=400, detail=f"管理员密码：{admin_pw_reason}")

    # 唯一性校验
    dup = (await db.execute(
        select(User).where(
            (User.username == req.admin.username) | (User.email == req.admin.email)
        )
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail="管理员用户名或邮箱已存在")

    # 1) 写入全局参数（本地化系统全局默认；写入 sys_config，不改 users）
    ss.sys_default_locale = req.default_locale
    ss.sys_default_timezone = req.default_timezone
    ss.sys_default_region = req.default_region
    ss.sys_default_currency = req.default_currency.upper()

    # 2) 创建第一位业务超级管理员（本地化字段全 NULL = 跟随系统全局）
    admin = User(
        username=req.admin.username,
        email=req.admin.email,
        password_hash=hash_password(req.admin.password),
        role=UserRole.SUPER_ADMIN,
        display_name=req.admin.display_name,
        real_name=req.admin.display_name,
        student_id="",
        phone="",
        must_change_password=False,
        realname_verified=True,
        # 初始化向导已设 3 个安全问题，清零补设标记
        must_set_security_questions=False,
    )
    db.add(admin)
    await db.flush()
    # 写入首位超管的 3 个安全问题（规范化 + bcrypt 哈希）
    for item in req.admin.security_questions:
        db.add(UserSecurityQuestion(
            user_id=admin.id,
            question=item.question,
            answer_hash=hash_password(security_answer_digest(item.answer)),
            position=item.position,
            is_custom=item.is_custom,
        ))

    # 3) 标记初始化完成
    ss.system_initialized = True

    # 审计：初始化完成（操作者 = Break-Glass，actor=[BREAK_GLASS_ESCAPE]）
    log_action(
        db, user, "system_init.complete",
        f"locale:{req.default_locale} tz:{req.default_timezone} "
        f"region:{req.default_region} currency:{req.default_currency} admin:{req.admin.username}",
        ip=get_client_ip(request),
    )
    await db.commit()

    # 4) 自动登出 Break-Glass（撤销 KV 会话 + 清 Cookie）
    jti = user.get("jti")
    if jti:
        await bg_session_revoke(jti)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return ok({"initialized": True})
