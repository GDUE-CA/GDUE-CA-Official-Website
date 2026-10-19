"""首页 Hero 区块动态配置接口。

公开接口：GET /api/hero —— 按请求 locale 返回解析后的 Hero 配置。
  缓存策略：Redis（KV）缓存整份原始配置（含全部语种），TTL 60s；
  前端页面叠加 Next.js ISR / CDN 缓存。管理员预览走管理端接口，实时读库、不走缓存。

管理接口：
  GET  /api/admin/hero        读取完整配置（全部语种原文，实时读库）
  PUT  /api/admin/hero        更新配置（保存后主动清除 Redis 缓存）
  POST /api/admin/hero/reset  一键恢复默认 Seed 首页主题（清除缓存）

权限：管理端接口需 content 模块 view / manage。
"""
import hashlib
import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.kv import get_kv
from app.core.locales import LOCALE_FALLBACK_MAP
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import HeroConfig
from app.db.session import get_db
from app.schemas.hero import (
    HeroOut,
    HeroPublicButton,
    HeroPublicOut,
    HeroPublicStat,
    HeroUpdate,
)

logger = logging.getLogger("gdueca.hero")

public_router = APIRouter(prefix="/api/hero", tags=["hero-public"])
admin_router = APIRouter(prefix="/api/admin/hero", tags=["hero-admin"])

# 缓存整份原始配置（含全部语种），键随结构变更递增版本号
HERO_CACHE_KEY = "hero:config:v1"
HERO_CACHE_TTL = 60

# 锁定的 13 个语种（与前端 lib/i18n/locales.generated.ts 一致）
HERO_LOCALES: tuple[str, ...] = (
    "zh-cn", "zh-hk", "zh-mo", "zh-tw", "ja-jp", "ko-kr",
    "en-gb", "en-us", "es-es", "fr-fr", "de-de", "pt-pt", "it-it",
)


def _ml(zh: str, en: str) -> dict[str, str]:
    """多语言文案骨架：zh-cn / en-gb 填默认值，其余语种留空（前端按兜底策略回退 zh-CN）。"""
    return {loc: (zh if loc == "zh-cn" else en if loc == "en-gb" else "") for loc in HERO_LOCALES}


_DEFAULT_ZH = {
    "eyebrow": "广东第二师范学院 · 花都校区",
    "title": "计算机协会",
    "subtitle": "服务广大同学，推广校园计算机文化",
    "description": (
        "广东二师计协成立于2008年5月31日，是花都校区学术科技类社团。"
        "我们以每周常规授课、义务维修、网络安全竞赛和电子竞技为特色，提高会员计算机应用水平。"
    ),
}
_DEFAULT_EN = {
    "eyebrow": "Guangdong University of Education · Huadu Campus",
    "title": "Computer Association",
    "subtitle": "Serving students, promoting campus computer culture",
    "description": (
        "Founded on May 31, 2008, GDUECA Computer Association is an academic and "
        "technology club on the Huadu Campus. We are known for weekly hands-on "
        "sessions, free repair clinics, anti-fraud cybersecurity competitions, and esports events."
    ),
}

# 默认 Seed 首页主题（全新部署自动载入；管理员可一键恢复）
DEFAULT_HERO_SEED: dict = {
    "background_url": None,
    "background_opacity": 30,
    "background_blur": 8,
    "texts": {
        loc: (dict(_DEFAULT_ZH) if loc == "zh-cn" else dict(_DEFAULT_EN) if loc == "en-gb"
              else {"eyebrow": "", "title": "", "subtitle": "", "description": ""})
        for loc in HERO_LOCALES
    },
    "buttons": [
        {"id": "join-club", "label": _ml("社团报名", "Club Membership"),
         "href": "/join?mode=club", "variant": "default", "enabled": True},
        {"id": "join-event", "label": _ml("活动报名", "Activity Registration"),
         "href": "/join?mode=event", "variant": "outline", "enabled": True},
        {"id": "about", "label": _ml("关于我们", "About Us"),
         "href": "/about", "variant": "outline", "enabled": True},
    ],
    "stats": [
        {"value": _ml("36", "36"), "from_value": None,
         "label": _ml("在册会员", "Registered Members"), "enabled": True},
        {"value": _ml("7", "7"), "from_value": None,
         "label": _ml("年度活动", "Annual Events"), "enabled": True},
        {"value": _ml("14", "14"), "from_value": None,
         "label": _ml("覆盖院系", "Schools Covered"), "enabled": True},
        {"value": _ml("2008", "2008"), "from_value": 2026,
         "label": _ml("成立年份", "Founded"), "enabled": True},
    ],
}


def _row_to_dict(row: HeroConfig) -> dict:
    """ORM 行 → 原始配置字典（与 DEFAULT_HERO_SEED 同构）。"""
    return {
        "background_url": row.background_url,
        "background_opacity": row.background_opacity,
        "background_blur": row.background_blur,
        "texts": row.texts or {},
        "buttons": row.buttons or [],
        "stats": row.stats or [],
    }


def _candidates(locale: str) -> list[str]:
    """locale 兜底链：自身 → 变体回退语言 → zh-cn → en-gb。"""
    chain = [locale]
    fb = LOCALE_FALLBACK_MAP.get(locale)
    if fb:
        chain.append(fb)
    chain.extend(["zh-cn", "en-gb"])
    return chain


def _pick(mapping: dict, locale: str) -> str:
    """从 {locale: text} 中按兜底链取首个非空值；全空返回空串。"""
    if not isinstance(mapping, dict):
        return ""
    for loc in _candidates(locale):
        v = mapping.get(loc)
        if isinstance(v, str) and v.strip():
            return v
    return ""


async def _get_raw(db: AsyncSession) -> dict:
    """读取原始配置：优先 Redis 缓存，未命中则读库（缺行回退默认 Seed）并回填缓存。"""
    kv = get_kv()
    try:
        cached = await kv.get(HERO_CACHE_KEY)
    except Exception:  # noqa: BLE001 —— KV 不可用时静默降级为直接读库
        cached = None
    if cached:
        try:
            return json.loads(cached)
        except (ValueError, TypeError):
            pass
    row = await db.get(HeroConfig, 1)
    raw = _row_to_dict(row) if row else dict(DEFAULT_HERO_SEED)
    try:
        await kv.set(HERO_CACHE_KEY, json.dumps(raw, ensure_ascii=False), HERO_CACHE_TTL)
    except Exception:  # noqa: BLE001
        pass
    return raw


async def _clear_cache() -> None:
    """保存/重置后主动清除缓存，下一次公开请求回源数据库。"""
    try:
        await get_kv().delete(HERO_CACHE_KEY)
    except Exception:  # noqa: BLE001
        pass


# Hero 背景图专用存储目录与限制（图片走魔数嗅验 + 压缩）
_BG_DIR = Path("uploads/hero")
_BG_MAX_BYTES = 8 * 1024 * 1024  # 8MB
_BG_ALLOWED_MIME = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def _delete_bg_file(url: str | None) -> None:
    """删除 uploads/hero/ 下的旧背景文件（防对象存储堆积）；非本目录 URL 一律不动。"""
    if not url or not url.startswith("/uploads/hero/"):
        return
    try:
        p = Path(url.lstrip("/"))
        if p.is_file():
            p.unlink()
    except OSError:
        pass


# ---------- 公开：按 locale 返回 Hero 配置 ----------
@public_router.get("", response_model=HeroPublicOut)
async def get_hero(
    response: Response,
    locale: str | None = Query(default=None, max_length=16, description="显示语言，如 zh-cn；缺失按 zh-cn 兜底"),
    fresh: bool = Query(default=False, description="true = 跳过 Redis 缓存直读数据库（管理员预览用）"),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """首页公开接口：返回按请求 locale 解析后的 Hero 文案、按钮与统计卡片。

    CDN/浏览器缓存：fresh=false 时下发 Cache-Control（60s），与 Redis TTL 对齐；
    fresh=true（管理员预览）时禁用缓存。
    """
    loc = (locale or "zh-cn").lower()
    response.headers["Cache-Control"] = (
        "no-store" if fresh else "public, max-age=60, s-maxage=60"
    )
    response.headers["Vary"] = "Accept-Language"
    if fresh:
        row = await db.get(HeroConfig, 1)
        raw = _row_to_dict(row) if row else dict(DEFAULT_HERO_SEED)
    else:
        raw = await _get_raw(db)
    texts = raw.get("texts") or {}
    texts_loc = texts.get(loc) or {}

    buttons = [
        HeroPublicButton(
            id=b.get("id", ""),
            label=_pick(b.get("label") or {}, loc) or None,
            href=b.get("href", ""),
            variant=b.get("variant", "default"),
            enabled=bool(b.get("enabled", True)),
        )
        for b in (raw.get("buttons") or [])
        if b.get("enabled", True)
    ]
    stats = [
        HeroPublicStat(
            value=_pick(s.get("value") or {}, loc) or None,
            from_value=s.get("from_value"),
            label=_pick(s.get("label") or {}, loc) or None,
            enabled=bool(s.get("enabled", True)),
        )
        for s in (raw.get("stats") or [])
        if s.get("enabled", True)
    ]

    def _text(field: str) -> str:
        v = texts_loc.get(field)
        if isinstance(v, str) and v.strip():
            return v
        return _pick({k: (m or {}).get(field, "") for k, m in texts.items()}, loc)

    return HeroPublicOut(
        locale=loc,
        background_url=raw.get("background_url"),
        background_opacity=raw.get("background_opacity", 30),
        background_blur=raw.get("background_blur", 8),
        eyebrow=_text("eyebrow"),
        title=_text("title"),
        subtitle=_text("subtitle"),
        description=_text("description"),
        buttons=buttons,
        stats=stats,
    )


# ---------- 管理：读取完整配置（实时读库，不走缓存） ----------
@admin_router.get("", response_model=HeroOut)
async def admin_get_hero(
    user: dict = Depends(require_permission("content", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    row = await db.get(HeroConfig, 1)
    data = _row_to_dict(row) if row else dict(DEFAULT_HERO_SEED)
    return HeroOut(**data, updated_at=row.updated_at if row else None)


# ---------- 管理：更新配置 ----------
@admin_router.put("", response_model=HeroOut)
async def admin_update_hero(
    req: HeroUpdate,
    request: Request,
    user: dict = Depends(require_permission("content", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    row = await db.get(HeroConfig, 1)
    if row is None:
        row = HeroConfig(id=1)
        db.add(row)
    old_bg = row.background_url
    data = req.model_dump()
    row.background_url = data["background_url"]
    row.background_opacity = data["background_opacity"]
    row.background_blur = data["background_blur"]
    row.texts = data["texts"]
    row.buttons = data["buttons"]
    row.stats = data["stats"]
    row.updated_by = ctx_uid(user)
    log_action(db, user, "hero.update", target="hero:1", ip=get_client_ip(request))
    await db.commit()
    await db.refresh(row)
    # 背景图被替换或清除时，清理旧文件（仅 uploads/hero/ 下的资源）
    if old_bg and old_bg != row.background_url:
        _delete_bg_file(old_bg)
    await _clear_cache()
    return HeroOut(**_row_to_dict(row), updated_at=row.updated_at)


# ---------- 管理：恢复默认 Seed 首页主题 ----------
@admin_router.post("/reset", response_model=HeroOut)
async def admin_reset_hero(
    request: Request,
    user: dict = Depends(require_permission("content", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    row = await db.get(HeroConfig, 1)
    if row is None:
        row = HeroConfig(id=1)
        db.add(row)
    seed = DEFAULT_HERO_SEED
    row.background_url = seed["background_url"]
    row.background_opacity = seed["background_opacity"]
    row.background_blur = seed["background_blur"]
    row.texts = seed["texts"]
    row.buttons = seed["buttons"]
    row.stats = seed["stats"]
    row.updated_by = ctx_uid(user)
    log_action(db, user, "hero.reset", target="hero:1", ip=get_client_ip(request))
    await db.commit()
    await db.refresh(row)
    await _clear_cache()
    return HeroOut(**_row_to_dict(row), updated_at=row.updated_at)


# ---------- 管理：上传 Hero 背景图 ----------
@admin_router.post("/background")
async def admin_upload_hero_background(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require_permission("content", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """上传首页 Hero 背景图。

    - MIME 白名单 jpg/png/webp + 魔数嗅验（拒绝伪装的可执行内容）+ 80% 质量压缩
    - 文件名使用内容 sha256 前 16 位（内容变更即 URL 变更，绕过 CDN 旧图缓存）
    - 替换时删除 uploads/hero/ 下的旧文件，避免对象存储堆积
    返回 {url}；随后由 PUT /api/admin/hero 写入配置。
    """
    ext = _BG_ALLOWED_MIME.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=415, detail="仅支持 jpg / png / webp 格式图片")
    data = await file.read()
    if len(data) > _BG_MAX_BYTES:
        raise HTTPException(status_code=413, detail="背景图不能超过 8MB")

    from app.core.images import compress_image, sniff_image_ext

    sniffed = sniff_image_ext(data)
    if not sniffed:
        raise HTTPException(status_code=415, detail="文件内容与图片格式不符")
    ext = sniffed.lstrip(".")
    data, final_ext = compress_image(data, sniffed)
    ext = final_ext.lstrip(".")

    _BG_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(data).hexdigest()[:16]
    filename = f"{digest}.{ext}"
    url = f"/uploads/hero/{filename}"
    (_BG_DIR / filename).write_bytes(data)

    log_action(db, user, "hero.background.upload", target="hero:1",
               detail=f"{url} size:{len(data)}", ip=get_client_ip(request))
    await db.commit()
    return {"url": url, "size": len(data)}
