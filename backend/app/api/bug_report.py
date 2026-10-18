"""Bug 反馈接口：访客提交 + 管理员查看 / 批量处理。"""
from datetime import datetime, timezone
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.background_tasks import launch
from app.core.mailer import send_email
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.rate_limit import rate_limit
from app.db.models import AuditLog, BugReport
from app.db.session import get_db
from app.schemas.bug import BugReportCreate, BugReportOut
from app.schemas.common import SubmitReceiptOut
from app.utils.translator import detect_lang

logger = logging.getLogger("gdueca")

router = APIRouter(prefix="/api/bugs", tags=["bugs"])

# 与回执码一致的去混淆字符集（无 0/O/1/I/L）
_SAFE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def _log(db: AsyncSession, ctx_or_uid, action: str, target: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, target=target, ip=ip)


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


def _launch_bug_receipt_email(to: str, receipt_code: str) -> None:
    """V0.5.9 需求6：提交成功回执邮件（后台异步，不阻塞接口）。"""
    body = (
        "您好：\n\n"
        "你的反馈已提交成功，感谢你的反馈！\n"
        f"工单编号：{receipt_code}\n"
        "我们会尽快处理；处理期间可通过查询页凭回执码查看进度。\n"
    )

    async def _notify() -> None:
        sent = await send_email(to, "GDUE-CA 反馈提交成功", body)
        if not sent:
            logger.warning("Bug 反馈回执邮件未成功投递（仅限开发环境排查）邮箱=%s", to)

    launch(_notify())


def _launch_bug_status_email(to: str, receipt_code: str, resolved: bool) -> None:
    """V0.5.9 需求6：工单状态变更通知邮件（后台异步，不阻塞接口）。"""
    body = (
        "您好：\n\n"
        "你反馈的工单状态已更新。\n"
        f"工单编号：{receipt_code}\n"
        f"最新状态：{'已解决' if resolved else '待处理'}\n"
    )

    async def _notify() -> None:
        sent = await send_email(to, "GDUE-CA 反馈工单状态更新", body)
        if not sent:
            logger.warning("Bug 工单状态邮件未成功投递（仅限开发环境排查）邮箱=%s", to)

    launch(_notify())


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
    db: AsyncSession = Depends(get_db, scope="function"),
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
    await db.commit()
    # V0.5.9 需求6：commit 后异步发送回执邮件（contact_email 非空才发，不阻塞接口）
    if bug.contact_email:
        _launch_bug_receipt_email(bug.contact_email, bug.receipt_code)
    return SubmitReceiptOut(receipt_code=bug.receipt_code, submitted_at=bug.created_at)


# ---------- 管理员列表 ----------
@router.get("", response_model=list[BugReportOut])
async def list_bugs(
    keyword: str | None = None,
    resolved: bool | None = None,
    page: int = 1,
    per_page: int = 50,
    user: dict = Depends(require_permission("review.bugs", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
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
    db: AsyncSession = Depends(get_db, scope="function"),
):
    bug = await db.get(BugReport, bug_id)
    if not bug:
        raise HTTPException(status_code=404, detail="Bug 不存在")
    bug.resolved = resolved
    _log(db, user, "bug.resolve" if resolved else "bug.reopen",
         f"bug:{bug_id}", get_client_ip(request))
    await db.commit()
    # V0.5.9 需求6：状态变更 commit 后异步通知提交人（contact_email 非空才发）
    if bug.contact_email:
        _launch_bug_status_email(bug.contact_email, bug.receipt_code, resolved)
    return {"ok": True}


# ---------- 管理员：批量标记已解决 / 重新打开 ----------
@router.post("/batch")
async def batch_update_bugs(
    body: BugBatchUpdate,
    request: Request = Request,
    user: dict = Depends(require_permission("review.bugs", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="未选择任何记录")
    result = await db.execute(
        select(BugReport).where(BugReport.id.in_(body.ids))
    )
    bugs = result.scalars().all()
    for bug in bugs:
        bug.resolved = body.resolved
    _log(db, user,
         "bug.batch_resolve" if body.resolved else "bug.batch_reopen",
         ",".join(str(i) for i in body.ids), get_client_ip(request))
    await db.commit()
    # V0.5.9 需求6：状态变更 commit 后异步通知各提交人（contact_email 非空才发）
    for bug in bugs:
        if bug.contact_email:
            _launch_bug_status_email(bug.contact_email, bug.receipt_code, body.resolved)
    return {"updated": len(bugs)}
