"""回执码公开查询 + 签到：报名提交后凭回执码查进度 / 到场签到（不返回个人隐私字段）。"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Activity,
    BugReport,
    ClubApplyRecord,
    Registration,
    RegistrationStatus,
    RegistrationType,
    SystemSetting,
    utcnow,
)
from app.core.rate_limit import rate_limit
from app.db.session import get_db

router = APIRouter(prefix="/api/query", tags=["query"])


async def _reg_response(db: AsyncSession, reg: Registration) -> dict:
    """组装报名查询响应（含签到开放状态，供前端决定是否显示签到按钮）。"""
    activity_title: str | None = None
    checkin_open = False
    if reg.activity_id:
        activity = await db.get(Activity, reg.activity_id)
        activity_title = activity.title if activity else None
        checkin_open = bool(activity.checkin_open) if activity else False
    else:
        # 社团报名不关联活动，使用系统设置里的全局开关
        settings = await db.get(SystemSetting, 1)
        checkin_open = bool(settings.club_checkin_open) if settings else False

    return {
        "receipt_code": reg.receipt_code,
        "type": "activity" if reg.registration_type == RegistrationType.ACTIVITY else "club",
        "activity_title": activity_title,
        "status": reg.status.value,
        "submitted_at": reg.submitted_at,
        "checkin_open": checkin_open,
        "checked_in_at": reg.checked_in_at,
    }


def _bug_response(bug: BugReport) -> dict:
    return {
        "receipt_code": bug.receipt_code,
        "type": "bug",
        "activity_title": None,
        "status": "resolved" if bug.resolved else "open",
        "submitted_at": bug.created_at,
        "checkin_open": False,
        "checked_in_at": None,
    }


# 社团报名状态（accept/reject）→ 回执查询统一状态词（与活动报名一致）
_CLUB_APPLY_STATUS = {"pending": "pending", "accept": "approved", "reject": "rejected"}


def _club_apply_response(row: ClubApplyRecord) -> dict:
    """社团报名（账号内报名）查询：只回状态，不回个人信息 / 审核备注。"""
    return {
        "receipt_code": row.receipt_code,
        "type": "club",
        "activity_title": None,
        "status": _CLUB_APPLY_STATUS.get(row.status, row.status),
        "submitted_at": row.created_at,
        "checkin_open": False,
        "checked_in_at": None,
    }


# 回执码只含字母数字和连字符；按 IP 限流防止枚举
ReceiptCode = Path(pattern=r"^[A-Za-z0-9\-]{4,40}$")


@router.get(
    "/{receipt_code}",
    dependencies=[Depends(rate_limit("receipt.query", limit=30, window_seconds=60))],
)
async def query_receipt(receipt_code: str = ReceiptCode, db: AsyncSession = Depends(get_db, scope="function")):
    code = receipt_code.strip().upper()

    reg = (
        await db.execute(select(Registration).where(Registration.receipt_code == code))
    ).scalar_one_or_none()
    if reg:
        return await _reg_response(db, reg)

    club = (
        await db.execute(select(ClubApplyRecord).where(ClubApplyRecord.receipt_code == code))
    ).scalar_one_or_none()
    if club:
        return _club_apply_response(club)

    bug = (
        await db.execute(select(BugReport).where(BugReport.receipt_code == code))
    ).scalar_one_or_none()
    if bug:
        return _bug_response(bug)

    raise HTTPException(status_code=404, detail="未找到该回执码对应的记录")


# ---------- 公开签到：报名者凭回执码签到，状态自动变为已签到 ----------
@router.post(
    "/{receipt_code}/checkin",
    dependencies=[Depends(rate_limit("receipt.checkin", limit=10, window_seconds=60))],
)
async def checkin_receipt(receipt_code: str = ReceiptCode, db: AsyncSession = Depends(get_db, scope="function")):
    code = receipt_code.strip().upper()

    reg = (
        await db.execute(select(Registration).where(Registration.receipt_code == code))
    ).scalar_one_or_none()
    if not reg:
        bug = (
            await db.execute(select(BugReport).where(BugReport.receipt_code == code))
        ).scalar_one_or_none()
        if bug:
            raise HTTPException(status_code=400, detail="Bug 反馈无需签到")
        club = (
            await db.execute(select(ClubApplyRecord).where(ClubApplyRecord.receipt_code == code))
        ).scalar_one_or_none()
        if club:
            raise HTTPException(status_code=400, detail="社团报名无需签到，请等待审核结果")
        raise HTTPException(status_code=404, detail="未找到该回执码对应的记录")

    # 已签到：幂等返回当前状态
    if reg.status.value == "checked_in":
        return await _reg_response(db, reg)

    if reg.status.value != "approved":
        raise HTTPException(status_code=400, detail="报名尚未通过审核，无法签到")

    # 校验签到是否开放
    if reg.activity_id:
        activity = await db.get(Activity, reg.activity_id)
        if not activity or activity.is_deleted:
            raise HTTPException(status_code=404, detail="活动不存在")
        # P0：归档活动强制拦截签到（历史记录保留，仅禁止新增签到）
        if activity.status.value == "archived":
            raise HTTPException(status_code=403, detail="活动已归档，签到已停止")
        if not activity.checkin_open:
            raise HTTPException(status_code=400, detail="签到尚未开放，请在活动现场关注通知")
    else:
        settings = await db.get(SystemSetting, 1)
        if not settings or not settings.club_checkin_open:
            raise HTTPException(status_code=400, detail="签到尚未开放，请关注社团通知")

    # 签到：状态 → 已签到，记录签到时间
    reg.status = RegistrationStatus.CHECKED_IN
    reg.checked_in_at = utcnow()
    await db.flush()
    return await _reg_response(db, reg)
