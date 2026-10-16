"""公告 CMS 接口。

公开接口：自动过滤【时间生效中 + 已启用】，按 priority 降序返回；过期自动隐藏。
管理接口：完整 CRUD + 多媒体/办公文档附件上传，权限模块 announcements。
"""
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import (
    Announcement,
    AnnouncementAttachment,
    AnnouncementAttachmentKind,
    AnnouncementCategory,
    AuditLog,
    MediaCategory,
    MediaFile,
    UserNotifyRead,
)
from app.db.session import get_db
from app.schemas.announcement import (
    AnnouncementAttachmentOut,
    AnnouncementCreate,
    AnnouncementOut,
    AnnouncementPublicOut,
    AnnouncementUpdate,
)
from app.utils.crud import apply_eq, apply_search, paginate
from app.utils.translator import translate_obj_fields

# 公开接口（无鉴权）
public_router = APIRouter(prefix="/api/announcements", tags=["announcements-public"])
# 管理接口（需 announcements 权限）
admin_router = APIRouter(prefix="/api/admin/announcements", tags=["announcements-admin"])


def _log(db: AsyncSession, ctx_or_uid, action: str, target: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, target=target, ip=ip)


def _is_in_effect(a: Announcement, now: datetime) -> bool:
    """生效中：start_at/end_at 任一为空表示对应方向不限，否则需在区间内。"""
    if a.start_at is not None and now < a.start_at:
        return False
    if a.end_at is not None and now > a.end_at:
        return False
    return True


# ---------- 公开：返回当前生效中的公告 ----------
@public_router.get("", response_model=list[AnnouncementPublicOut])
async def list_public_announcements(
    category: Literal["homepage", "home"] | None = Query(default=None),
    lang: str | None = Query(default=None, max_length=16, description="显示语言；传入时标题/内容自动翻译（缓存加速，失败回退原文）"),
    db: AsyncSession = Depends(get_db),
):
    """前端公开接口：自动过滤【时间生效中 + 已启用】，按 priority 降序。"""
    now = datetime.now(timezone.utc)
    # naive 与 aware 比较会抛 TypeError，SQLite 存的 datetime 是 naive；
    # 统一转 naive UTC 进行比较
    now_naive = now.replace(tzinfo=None)

    stmt = select(Announcement).where(Announcement.enabled.is_(True))
    if category:
        stmt = stmt.where(Announcement.category == category)
    # 过滤时间生效中：start_at IS NULL OR start_at <= now；
    #             end_at IS NULL OR end_at >= now
    stmt = stmt.where(
        ((Announcement.start_at.is_(None)) | (Announcement.start_at <= now_naive))
        & ((Announcement.end_at.is_(None)) | (Announcement.end_at >= now_naive))
    )
    # 同优先级按公告日期（start_at）倒序，最新公告在前；未设生效时间的按创建时间兜底
    stmt = stmt.order_by(
        Announcement.priority.desc(), Announcement.start_at.desc(), Announcement.created_at.desc()
    )
    result = await db.execute(stmt)
    # 翻译 Out 副本而非 ORM 实体，避免译文随 get_db 统一 commit 污染源数据
    outs = [AnnouncementPublicOut.model_validate(a) for a in result.scalars().all()]
    if lang:
        await translate_obj_fields(db, outs, ("title", "content"), lang)
    return outs


# ---------- 公开：单条详情（仅生效中 + 已启用，否则 404） ----------
@public_router.get("/{aid}", response_model=AnnouncementPublicOut)
async def get_public_announcement(
    aid: int,
    lang: str | None = Query(default=None, max_length=16, description="显示语言；传入时标题/内容自动翻译（缓存加速，失败回退原文）"),
    db: AsyncSession = Depends(get_db),
):
    """前端公告详情页：仅返回【时间生效中 + 已启用】的公告；过期/草稿一律 404。"""
    a = await db.get(Announcement, aid)
    if not a or not a.enabled:
        raise HTTPException(status_code=404, detail="公告不存在或已失效")
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    if not _is_in_effect(a, now_naive):
        raise HTTPException(status_code=404, detail="公告不存在或已失效")
    out = AnnouncementPublicOut.model_validate(a)
    if lang:
        # 翻译 Out 副本而非 ORM 实体，避免译文随 get_db 统一 commit 污染源数据
        await translate_obj_fields(db, [out], ("title", "content"), lang)
    return out


# ---------- 管理：分页列表 ----------
@admin_router.get("", response_model=dict)
async def admin_list_announcements(
    category: Literal["homepage", "home"] | None = Query(default=None),
    enabled: bool | None = Query(default=None),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("announcements", "view")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Announcement)
    if category:
        stmt = apply_eq(stmt, Announcement.category, AnnouncementCategory(category))
    if enabled is not None:
        stmt = apply_eq(stmt, Announcement.enabled, enabled)
    stmt = apply_search(stmt, [Announcement.title, Announcement.content], q)
    # 按公告日期（start_at）倒序，最新公告始终在最顶部；未设生效时间的按创建时间兜底
    stmt = stmt.order_by(Announcement.start_at.desc(), Announcement.created_at.desc())
    return await paginate(db, stmt, page, page_size, out_model=AnnouncementOut)


# ---------- 管理：单条详情 ----------
@admin_router.get("/{aid}", response_model=AnnouncementOut)
async def admin_get_announcement(
    aid: int,
    user: dict = Depends(require_permission("announcements", "view")),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Announcement, aid)
    if not a:
        raise HTTPException(status_code=404, detail="公告不存在")
    return a


# ---------- 管理：创建 ----------
@admin_router.post("", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def admin_create_announcement(
    req: AnnouncementCreate,
    request: Request,
    user: dict = Depends(require_permission("announcements", "manage")),
    db: AsyncSession = Depends(get_db),
):
    # 生效时间窗校验：start_at 必须早于 end_at
    if req.start_at and req.end_at and req.start_at >= req.end_at:
        raise HTTPException(status_code=400, detail="生效开始时间必须早于失效结束时间")

    a = Announcement(
        **req.model_dump(),
        created_by=ctx_uid(user),
    )
    db.add(a)
    _log(db, user, "announcement.create", None, get_client_ip(request))
    await db.commit()
    await db.refresh(a)
    return a


# ---------- 管理：更新 ----------
@admin_router.put("/{aid}", response_model=AnnouncementOut)
async def admin_update_announcement(
    aid: int,
    req: AnnouncementUpdate,
    request: Request,
    user: dict = Depends(require_permission("announcements", "manage")),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Announcement, aid)
    if not a:
        raise HTTPException(status_code=404, detail="公告不存在")

    data = req.model_dump(exclude_unset=True)
    # 时间窗校验
    new_start = data.get("start_at", a.start_at)
    new_end = data.get("end_at", a.end_at)
    if new_start and new_end and new_start >= new_end:
        raise HTTPException(status_code=400, detail="生效开始时间必须早于失效结束时间")

    if "category" in data and data["category"] is not None:
        a.category = AnnouncementCategory(data["category"])
    for k in ("title", "content", "link", "start_at", "end_at", "enabled", "priority"):
        if k in data:
            setattr(a, k, data[k])
    _log(db, user, "announcement.update", f"announcement:{aid}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(a)
    return a


# ---------- 管理：删除 ----------
@admin_router.delete("/{aid}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_announcement(
    aid: int,
    request: Request,
    user: dict = Depends(require_permission("announcements", "manage")),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Announcement, aid)
    if not a:
        raise HTTPException(status_code=404, detail="公告不存在")
    # 同步清理该通知的所有已读记录（SQLite 未开 FK pragma，需显式删除）
    await db.execute(delete(UserNotifyRead).where(UserNotifyRead.announcement_id == aid))
    # 附件行 + 落盘文件一并清理（同上，FK 未开 pragma 需显式删除）
    for att in (
        await db.execute(
            select(AnnouncementAttachment).where(AnnouncementAttachment.announcement_id == aid)
        )
    ).scalars().all():
        _unlink_attachment_file(att.url)
        await db.delete(att)
    await db.delete(a)
    _log(db, user, "announcement.delete", f"announcement:{aid}",
         get_client_ip(request))
    await db.commit()


# ---------- 管理：附件上传 / 删除 ----------
# 上传上限：50MB（覆盖常见短视频与办公文档；超限直接拒绝，不做服务端转码）
ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024
ATTACHMENT_DIR = Path("uploads/announcements")

# 规范扩展名 → (规范 MIME, 预览类型)。仅此表内类型可上传。
_ATTACHMENT_TYPES: dict[str, tuple[str, AnnouncementAttachmentKind]] = {
    # 视频：浏览器原生 <video> 播放（含 iOS Safari 的 AirPlay 投屏）
    "mp4": ("video/mp4", AnnouncementAttachmentKind.VIDEO),
    "webm": ("video/webm", AnnouncementAttachmentKind.VIDEO),
    "ogv": ("video/ogg", AnnouncementAttachmentKind.VIDEO),
    "mov": ("video/quicktime", AnnouncementAttachmentKind.VIDEO),
    # 音频：浏览器原生 <audio> 播放
    "mp3": ("audio/mpeg", AnnouncementAttachmentKind.AUDIO),
    "m4a": ("audio/mp4", AnnouncementAttachmentKind.AUDIO),
    "aac": ("audio/aac", AnnouncementAttachmentKind.AUDIO),
    "wav": ("audio/wav", AnnouncementAttachmentKind.AUDIO),
    "ogg": ("audio/ogg", AnnouncementAttachmentKind.AUDIO),
    "weba": ("audio/webm", AnnouncementAttachmentKind.AUDIO),
    # PDF：前端 pdf.js 渲染（/uploads 响应带 X-Frame-Options: DENY，iframe 方案不可用）
    "pdf": ("application/pdf", AnnouncementAttachmentKind.PDF),
    # Office：浏览器无原生渲染能力，仅下载兜底
    "doc": ("application/msword", AnnouncementAttachmentKind.OFFICE),
    "docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        AnnouncementAttachmentKind.OFFICE,
    ),
    "xls": ("application/vnd.ms-excel", AnnouncementAttachmentKind.OFFICE),
    "xlsx": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        AnnouncementAttachmentKind.OFFICE,
    ),
    "ppt": ("application/vnd.ms-powerpoint", AnnouncementAttachmentKind.OFFICE),
    "pptx": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        AnnouncementAttachmentKind.OFFICE,
    ),
}

# 浏览器 MIME 别名 → 规范扩展名（同一容器的不同声明）
_ATTACHMENT_MIME_ALIASES: dict[str, str] = {
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/vnd.wave": "wav",
    "audio/x-m4a": "m4a",
    "audio/mp4a-latm": "m4a",
    "audio/ogg": "ogg",
    "video/x-m4v": "mp4",
    "video/quicktime": "mov",
    "application/x-pdf": "pdf",
    "application/acrobat": "pdf",
}

_MIME_TO_EXT: dict[str, str] = {m: e for e, (m, _k) in _ATTACHMENT_TYPES.items()}


def _magic_ok(ext: str, data: bytes) -> bool:
    """文件头魔数校验：防止改扩展名绕过白名单（P0 安全默认拒绝）。

    未知/无法校验的类型一律拒绝，不做「默认放行」。
    """
    head = data[:16]
    if ext == "pdf":
        return data[:5] == b"%PDF-"
    if ext in ("mp4", "m4a", "mov"):
        return head[4:8] == b"ftyp"
    if ext in ("webm", "weba"):
        return head[:4] == b"\x1aE\xdf\xa3"
    if ext in ("ogg", "ogv"):
        return head[:4] == b"OggS"
    if ext == "wav":
        return head[:4] == b"RIFF" and data[8:12] == b"WAVE"
    if ext == "mp3":
        # ID3v2 标签头，或 MPEG 音频帧同步字（11 位全 1）
        return head[:3] == b"ID3" or (len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0)
    if ext == "aac":
        return len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xF6) == 0xF0
    if ext in ("docx", "xlsx", "pptx"):
        # OOXML 本质是 ZIP 容器（PK\x03\x04 普通包 / PK\x05\x06 空包）
        return head[:2] == b"PK"
    if ext in ("doc", "xls", "ppt"):
        # 旧版 OLE 复合文档魔数
        return head[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    return False


def _unlink_attachment_file(url: str) -> None:
    """删除落盘附件文件；越界 URL 直接忽略，文件不存在不报错（不阻断主流程）。"""
    prefix = "/uploads/announcements/"
    if not url.startswith(prefix):
        return
    try:
        (ATTACHMENT_DIR / url[len(prefix):]).unlink(missing_ok=True)
    except OSError:
        pass


@admin_router.post(
    "/{aid}/attachments",
    response_model=AnnouncementAttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def admin_upload_announcement_attachment(
    aid: int,
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require_permission("announcements", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """公告附件上传：视频/音频/PDF/Office 文档，≤50MB，扩展名+魔数双重白名单校验。"""
    a = await db.get(Announcement, aid)
    if not a:
        raise HTTPException(status_code=404, detail="公告不存在")

    ext = Path(file.filename or "").suffix.lower().lstrip(".")
    spec = _ATTACHMENT_TYPES.get(ext)
    if not spec:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型；仅支持：{', '.join(sorted(_ATTACHMENT_TYPES))}",
        )

    data = await file.read(ATTACHMENT_MAX_BYTES + 1)
    if len(data) > ATTACHMENT_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小不能超过 {ATTACHMENT_MAX_BYTES // (1024 * 1024)}MB",
        )
    if not data:
        raise HTTPException(status_code=400, detail="文件内容为空")

    # 声明类型与扩展名不一致才拒绝；octet-stream / 未收录声明（如 docx 被识别为 zip）
    # 一律以「扩展名 + 魔数」为准，避免误伤正常上传。
    declared = (file.content_type or "").lower()
    mapped_ext = _ATTACHMENT_MIME_ALIASES.get(declared) or _MIME_TO_EXT.get(declared)
    if mapped_ext and mapped_ext != ext:
        raise HTTPException(status_code=400, detail="文件内容与扩展名不匹配")
    if not _magic_ok(ext, data):
        raise HTTPException(status_code=400, detail="文件已损坏或内容与扩展名不符")

    mime, kind = spec
    ATTACHMENT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"ann_{uuid.uuid4().hex}.{ext}"
    (ATTACHMENT_DIR / filename).write_bytes(data)

    att = AnnouncementAttachment(
        announcement_id=a.id,
        url=f"/uploads/announcements/{filename}",
        original_name=(file.filename or "")[:256] or None,
        mime=mime,
        size=len(data),
        kind=kind,
    )
    db.add(att)
    # 同步登记统一媒体库（与 blog/memo 上传共用同一张表做后台统一管理）
    db.add(MediaFile(
        filename=filename,
        original_name=(file.filename or filename)[:256],
        mime=mime,
        size=len(data),
        storage_path=f"uploads/announcements/{filename}",
        uploader_id=ctx_uid(user),
        category=MediaCategory.MISC,
    ))
    _log(db, user, "announcement.attachment.upload", f"announcement:{aid}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(att)
    return att


@admin_router.delete(
    "/{aid}/attachments/{att_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def admin_delete_announcement_attachment(
    aid: int,
    att_id: int,
    request: Request,
    user: dict = Depends(require_permission("announcements", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除公告附件：同时移除落盘文件。"""
    att = await db.get(AnnouncementAttachment, att_id)
    if not att or att.announcement_id != aid:
        raise HTTPException(status_code=404, detail="附件不存在")
    _unlink_attachment_file(att.url)
    await db.delete(att)
    _log(db, user, "announcement.attachment.delete", f"announcement:{aid}",
         get_client_ip(request))
    await db.commit()
