"""Bug 反馈接口：访客提交 + 管理员查看 / 批量处理。"""
from datetime import datetime, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.rate_limit import rate_limit
from app.db.models import AuditLog, BugReport
from app.db.session import get_db
from app.schemas.bug import BugReportCreate, BugReportOut
from app.schemas.common import SubmitReceiptOut
from app.utils.translator import detect_lang

router = APIRouter(prefix="/api/bugs", tags=["bugs"])

# 与回执码一致的去混淆字符集（无 0/O/1/I/L）
_SAFE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def _log(db: AsyncSession, uid: int | None, action: str, target: str | None, ip: str | None):
    db.add(AuditLog(user_id=uid, action=action, target=target, ip=ip))


def _bug_receipt_code(suffix: str = "") -> str:
    """Bug 反馈回执码：REPORT- + 完整年月日时分秒（UTC，同秒冲突时追加 2 位随机字符）。"""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"REPORT-{ts}{suffix}"


async def _unique_bug_receipt_code(db: AsyncSession) -> str:
    for attempt in range(8):
        code = _bug_receipt_code("" if attempt == 0 else "".join(secrets.choice(_SAFE_ALPHABET) for _ in range(2)))
        exists = await db.execute(
            select(BugReport).where(BugReport.receipt_code == code)
        )
        if not exists.scalar_one_or_none():
            return code
    return _bug_receipt_code("".join(secrets.choice(_SAFE_ALPHABET) for _ in range(4)))


class BugBatchUpdate(BaseModel):
    ids: list[int]
    resolved: bool


# ---------- 访客提交 ----------
@router.post(
    "",
    response_model=SubmitReceiptOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("bug.submit", limit=10, window_seconds=600))],
)
async def submit_bug(
    req: BugReportCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    bug = BugReport(
        receipt_code=await _unique_bug_receipt_code(db),
        content_lang=detect_lang(req.description),
        submit_ip=get_client_ip(request),
        **req.model_dump(),
    )
    db.add(bug)
    await db.flush()
    _log(db, None, "bug.submit", f"bug:{bug.id}", bug.submit_ip)
    return SubmitReceiptOut(receipt_code=bug.receipt_code, submitted_at=bug.created_at)


# ---------- 管理员列表 ----------
@router.get("", response_model=list[BugReportOut])
async def list_bugs(
    keyword: str | None = None,
    resolved: bool | None = None,
    page: int = 1,
    per_page: int = 50,
    user: dict = Depends(require_permission("review.bugs", "view")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(BugReport)
    if keyword:
        kw = f"%{keyword}%"
        stmt = stmt.where(
            or_(
                BugReport.description.like(kw),
                BugReport.contact_email.like(kw),
                BugReport.contact_phone.like(kw),
            )
        )
    if resolved is not None:
        stmt = stmt.where(BugReport.resolved == resolved)
    stmt = stmt.order_by(BugReport.created_at.desc())
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.patch("/{bug_id}")
async def mark_bug_resolved(
    bug_id: int,
    resolved: bool = True,
    request: Request = Request,
    user: dict = Depends(require_permission("review.bugs", "manage")),
    db: AsyncSession = Depends(get_db),
):
    bug = await db.get(BugReport, bug_id)
    if not bug:
        raise HTTPException(status_code=404, detail="Bug 不存在")
    bug.resolved = resolved
    _log(db, int(user["user_id"]), "bug.resolve" if resolved else "bug.reopen",
         f"bug:{bug_id}", get_client_ip(request))
    return {"ok": True}


# ---------- 管理员：批量标记已解决 / 重新打开 ----------
@router.post("/batch")
async def batch_update_bugs(
    body: BugBatchUpdate,
    request: Request = Request,
    user: dict = Depends(require_permission("review.bugs", "manage")),
    db: AsyncSession = Depends(get_db),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="未选择任何记录")
    result = await db.execute(
        select(BugReport).where(BugReport.id.in_(body.ids))
    )
    bugs = result.scalars().all()
    for bug in bugs:
        bug.resolved = body.resolved
    _log(db, int(user["user_id"]),
         "bug.batch_resolve" if body.resolved else "bug.batch_reopen",
         ",".join(str(i) for i in body.ids), get_client_ip(request))
    return {"updated": len(bugs)}
