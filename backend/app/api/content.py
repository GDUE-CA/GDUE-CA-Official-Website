"""内容块接口：社团介绍、招新说明等富文本 Markdown。

公开接口：GET /api/content/{key} 返回内容块原文（Markdown），前端自行渲染。
管理接口：PUT /api/admin/content/{key} 更新内容块，权限 content。
不存在的内容块在 GET 时返回空 body_md，由管理员首次写入时自动创建。
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import AuditLog, ContentBlock
from app.db.session import get_db
from app.schemas.content import ContentBlockOut, ContentBlockUpdate

# 公开接口
public_router = APIRouter(prefix="/api/content", tags=["content-public"])
# 管理接口
admin_router = APIRouter(prefix="/api/admin/content", tags=["content-admin"])


def _log(db: AsyncSession, uid: int, action: str, target: str | None, ip: str | None):
    db.add(AuditLog(user_id=uid, action=action, target=target, ip=ip))


# ---------- 公开：按 key 取内容块 ----------
@public_router.get("/{key}", response_model=ContentBlockOut)
async def get_content_block(
    key: str,
    db: AsyncSession = Depends(get_db),
):
    """公开获取内容块；不存在时返回空 body_md（前端按空内容渲染）。"""
    row = (
        await db.execute(select(ContentBlock).where(ContentBlock.key == key))
    ).scalar_one_or_none()
    if not row:
        # 不自动创建，仅返回占位结构
        return ContentBlockOut(id=0, key=key, title=None, body_md="", updated_at=None)
    return row


# ---------- 管理：更新或创建内容块 ----------
@admin_router.put("/{key}", response_model=ContentBlockOut)
async def upsert_content_block(
    key: str,
    req: ContentBlockUpdate,
    request: Request,
    user: dict = Depends(require_permission("content", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """首次写入则创建，已存在则更新；key 大小写敏感。"""
    # 限制 key 长度与字符集
    if not key or len(key) > 64 or not all(c.isalnum() or c in "-_" for c in key):
        raise HTTPException(status_code=400, detail="key 仅支持字母数字与 -_，长度 1-64")

    row = (
        await db.execute(select(ContentBlock).where(ContentBlock.key == key))
    ).scalar_one_or_none()
    if row is None:
        row = ContentBlock(key=key, title=req.title, body_md=req.body_md)
        db.add(row)
    else:
        row.title = req.title
        row.body_md = req.body_md
    row.updated_by = int(user["user_id"])
    _log(db, int(user["user_id"]), "content.upsert", f"content:{key}", get_client_ip(request))
    await db.commit()
    await db.refresh(row)
    return row
