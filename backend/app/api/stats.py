"""数据统计：访问来源（复用概览聚合）+ 活动报名统计快照 + 招新统计。

- /visits：与概览页 /api/admin-stats/access 同源逻辑（audit_logs + registrations
  + bug_reports 的 IP 聚合），此处直接转发调用以避免双份实现。
- /activities：activity_statistics 快照列表（活动结束后自动生成）。
- /recruitment：社团招新报名（registrations.registration_type=club）按
  意向部门 / 学院 / 状态聚合。
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.models import Activity, ActivityStatistics, Registration, RegistrationStatus, RegistrationType
from app.db.session import get_db
from app.schemas.common import UTCDatetime

router = APIRouter(prefix="/api/admin/stats", tags=["stats"])


# ---------- 活动报名统计 ----------

class ActivityStatOut(BaseModel):
    """单个活动的报名统计快照（含活动名便于展示）。"""
    activity_id: int
    activity_name: str
    total: int
    pending: int
    approved: int
    rejected: int
    checked_in: int
    generated_at: UTCDatetime | None = None


class ActivityLiveStatOut(BaseModel):
    """进行中活动的实时报名计数（直接聚合 registrations，非快照）。"""
    activity_id: int
    activity_name: str
    status: str
    total: int
    pending: int
    approved: int
    rejected: int
    checked_in: int


@router.get("/activities")
async def activity_statistics(
    user: dict = Depends(require_permission("stats", "view")),
    db: AsyncSession = Depends(get_db),
):
    """全部活动的报名统计快照（活动结束后自动生成的那份）。"""
    rows = (await db.execute(
        select(ActivityStatistics, Activity.title)
        .join(Activity, Activity.id == ActivityStatistics.activity_id)
        .order_by(ActivityStatistics.generated_at.desc())
    )).all()
    return [
        ActivityStatOut(
            activity_id=s.activity_id, activity_name=name,
            total=s.total, pending=s.pending, approved=s.approved,
            rejected=s.rejected, checked_in=s.checked_in,
            generated_at=s.generated_at,
        ).model_dump(mode="json")
        for s, name in rows
    ]


def _status_sum(status: RegistrationStatus):
    """条件计数：SQLite/PostgreSQL 通用（bool cast + coalesce）。"""
    return func.sum(func.coalesce(
        func.cast(Registration.status == status, Integer), 0
    ))


@router.get("/activities/live", response_model=list[ActivityLiveStatOut])
async def activity_live_statistics(
    user: dict = Depends(require_permission("stats", "view")),
    db: AsyncSession = Depends(get_db),
):
    """全部活动的实时报名计数（LEFT JOIN：无报名的活动也出现，便于进行中活动盯数）。"""
    rows = (await db.execute(
        select(
            Activity.id,
            Activity.title,
            Activity.status,
            func.count(Registration.id).label("total"),
            _status_sum(RegistrationStatus.PENDING).label("pending"),
            _status_sum(RegistrationStatus.APPROVED).label("approved"),
            _status_sum(RegistrationStatus.REJECTED).label("rejected"),
            _status_sum(RegistrationStatus.CHECKED_IN).label("checked_in"),
        )
        .outerjoin(Registration, Registration.activity_id == Activity.id)
        .group_by(Activity.id)
        .order_by(Activity.id.desc())
        .limit(100)
    )).all()
    return [
        ActivityLiveStatOut(
            activity_id=i, activity_name=name, status=st.value,
            total=int(t), pending=int(p or 0), approved=int(a or 0),
            rejected=int(r or 0), checked_in=int(c or 0),
        )
        for i, name, st, t, p, a, r, c in rows
    ]


# ---------- 招新统计 ----------

class RecruitmentGroupStat(BaseModel):
    """一个分组维度（部门 / 学院）的计数。"""
    key: str
    total: int
    pending: int
    approved: int
    rejected: int


class RecruitmentStatsOut(BaseModel):
    registration_type: str = "club"
    total: int
    by_position: list[RecruitmentGroupStat]
    by_college: list[RecruitmentGroupStat]
    by_status: list[RecruitmentGroupStat]


async def _grouped(db: AsyncSession, column) -> list[RecruitmentGroupStat]:
    """按列分组计数：status 维度用条件聚合展开为 pending/approved/rejected。"""
    is_club = Registration.registration_type == RegistrationType.CLUB
    rows = (await db.execute(
        select(
            column,
            func.count().label("total"),
            func.sum(func.coalesce(
                func.cast(Registration.status == RegistrationStatus.PENDING, Integer), 0
            )).label("pending"),
            func.sum(func.coalesce(
                func.cast(Registration.status == RegistrationStatus.APPROVED, Integer), 0
            )).label("approved"),
            func.sum(func.coalesce(
                func.cast(Registration.status == RegistrationStatus.REJECTED, Integer), 0
            )).label("rejected"),
        )
        .where(is_club, column.isnot(None), column != "")
        .group_by(column)
        .order_by(func.count().desc())
    )).all()
    return [
        RecruitmentGroupStat(
            key=k, total=t, pending=int(p or 0), approved=int(a or 0), rejected=int(r or 0)
        )
        for k, t, p, a, r in rows
    ]


@router.get("/recruitment")
async def recruitment_statistics(
    user: dict = Depends(require_permission("stats", "view")),
    db: AsyncSession = Depends(get_db),
):
    """招新（社团报名）统计：按意向部门 / 学院 / 状态聚合。"""
    is_club = Registration.registration_type == RegistrationType.CLUB
    total = (await db.execute(
        select(func.count()).select_from(Registration).where(is_club)
    )).scalar_one()
    by_status_rows = (await db.execute(
        select(Registration.status, func.count())
        .where(is_club)
        .group_by(Registration.status)
    )).all()
    out = RecruitmentStatsOut(
        total=int(total),
        by_position=await _grouped(db, Registration.position),
        by_college=await _grouped(db, Registration.college),
        by_status=[
            RecruitmentGroupStat(key=s.value, total=int(c), pending=0, approved=0, rejected=0)
            for s, c in by_status_rows
        ],
    )
    return out.model_dump(mode="json")
