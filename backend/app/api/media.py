"""文件资源统一管理：列表 / 上传 / 删除。

实际文件存储于 uploads/{category}/，media_files 表记录元数据（与
blog.py / members.py 中的头像与博客图片写入同一张表，后台可集中管理）。
"""
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import AuditLog, MediaCategory, MediaFile, User
from app.db.session import get_db
from app.schemas.common import UTCDatetime
from app.utils.crud import apply_eq, apply_search, paginate

router = APIRouter(prefix="/api/admin/media", tags=["media"])

# 上传上限：20MB（覆盖图片与常见文档；头像等专用入口另有更严限制）
MAX_BYTES = 20 * 1024 * 1024

# 不允许 SVG：SVG 可内嵌 <script> 属 XSS 载体（P0 图片上传须做 XSS 内容过滤），
# 静态目录按扩展名 inline 返回时浏览器会执行其脚本，故直接从允许列表移除
ALLOWED_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/zip": "zip",
}

# 图片类扩展名：统一走魔数嗅验 + 80% 质量压缩
_IMAGE_EXTS = {"jpg", "png", "webp"}


class MediaFileOut(BaseModel):
    """文件资源输出（uploader_name 由列表接口回填）。"""
    model_config = {"from_attributes": True}

    id: int
    filename: str
    original_name: str | None = None
    mime: str
    size: int
    storage_path: str
    uploader_id: int | None = None
    uploader_name: str | None = None
    category: str
    created_at: UTCDatetime


def _out(m: MediaFile, uploader_name: str | None) -> dict:
    return MediaFileOut(
        id=m.id, filename=m.filename, original_name=m.original_name,
        mime=m.mime, size=m.size, storage_path=m.storage_path,
        uploader_id=m.uploader_id, uploader_name=uploader_name,
        category=m.category.value, created_at=m.created_at,
    ).model_dump(mode="json")


@router.get("")
async def list_media(
    page: int = 1,
    page_size: int = 20,
    category: str | None = None,
    q: str | None = None,
    user: dict = Depends(require_permission("media", "view")),
    db: AsyncSession = Depends(get_db),
):
    """文件资源分页列表：分类筛选 + 文件名/原始名搜索。"""
    stmt = select(MediaFile).order_by(MediaFile.created_at.desc(), MediaFile.id.desc())
    if category:
        try:
            stmt = apply_eq(stmt, MediaFile.category, MediaCategory(category))
        except ValueError:
            raise HTTPException(status_code=400, detail="无效的分类筛选值")
    stmt = apply_search(stmt, [MediaFile.original_name, MediaFile.filename], q)

    result = await paginate(db, stmt, page, min(page_size, 100))
    # uploader 用户名回填（当页内去重查询）
    uploader_ids = {m.uploader_id for m in result["items"] if m.uploader_id}
    names: dict[int, str] = {}
    if uploader_ids:
        rows = (await db.execute(
            select(User.id, User.username).where(User.id.in_(uploader_ids))
        )).all()
        names = {uid: uname for uid, uname in rows}
    result["items"] = [_out(m, names.get(m.uploader_id)) for m in result["items"]]
    return result


@router.post("", status_code=201)
async def upload_media(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form("misc"),
    user: dict = Depends(require_permission("media", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """上传通用文件资源（图片 / 文档 / 压缩包），写入 media_files 记录。"""
    try:
        cat = MediaCategory(category)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的资源分类")
    ext = ALLOWED_MIME.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=415, detail="不支持的文件类型")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="文件不能超过 20MB")

    # 图片：按魔数识别真实类型（拒绝伪装成图片的其它内容），统一 80% 质量压缩
    if ext in _IMAGE_EXTS:
        from app.core.images import compress_image, sniff_image_ext

        sniffed = sniff_image_ext(data)
        if not sniffed:
            raise HTTPException(status_code=415, detail="文件内容与图片格式不符")
        ext = sniffed.lstrip(".")
        data, final_ext = compress_image(data, sniffed)
        ext = final_ext.lstrip(".")

    out_dir = Path("uploads") / cat.value
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{secrets.token_hex(12)}.{ext}"
    (out_dir / filename).write_bytes(data)

    m = MediaFile(
        filename=filename,
        original_name=(file.filename or filename)[:256],
        mime=file.content_type or "application/octet-stream",
        size=len(data),
        storage_path=f"/uploads/{cat.value}/{filename}",
        uploader_id=ctx_uid(user),
        category=cat,
    )
    db.add(m)
    log_action(db, user, "media.upload",
               detail=f"{m.original_name} category:{cat.value} size:{len(data)}",
               ip=get_client_ip(request))
    await db.commit()
    await db.refresh(m)
    # 上传响应直接回填上传者用户名（ctx 不含 username，按 PK 补查）
    uploader = await db.get(User, ctx_uid(user))
    return _out(m, uploader.username if uploader else None)


@router.delete("/{media_id}")
async def delete_media(
    media_id: int,
    request: Request,
    user: dict = Depends(require_permission("media", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除文件资源：同时移除物理文件（引用由使用者自行保证）。"""
    m = await db.get(MediaFile, media_id)
    if not m:
        raise HTTPException(status_code=404, detail="文件不存在")
    # 物理删除（storage_path 形如 /uploads/{cat}/{name}）
    physical = Path(m.storage_path.lstrip("/"))
    try:
        if physical.is_file():
            physical.unlink()
    except OSError:
        pass  # 文件缺失时仅移除记录
    await db.delete(m)
    log_action(db, user, "media.delete",
               target=f"media:{m.id}", detail=m.storage_path,
               ip=get_client_ip(request))
    await db.commit()
    return {"ok": True}
