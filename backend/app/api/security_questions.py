"""安全问题预设题库后台管理 API（/api/admin/security-questions/presets）。

V0.5.8 §3：
- 完整 CRUD：新增 / 编辑 / 查看 / 启用停用 / 删除；
- 管理员录入同样过黑名单过滤（app.core.security_question_filter）；
- 已被用户使用过的预设题禁止物理删除，仅可停用；
  「已被使用」判定 = user_security_questions.question 命中该题的 key / question_zh / question_en；
- 用户安全问题只存文本快照，不关联本表 ID，改题不影响老用户。
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.responses import ok
from app.core.security_question_filter import check_question_text
from app.db.models import SecurityPresetQuestion, UserSecurityQuestion
from app.db.session import get_db
from app.schemas.security_question import PresetQuestionIn, PresetQuestionUpdate

router = APIRouter(prefix="/api/admin/security-questions", tags=["admin-security-questions"])


async def _usage_count(db: AsyncSession, q: SecurityPresetQuestion) -> int:
    """统计该预设题已被多少用户安全问题引用（key / zh / en 三种快照形态）。"""
    forms = [f for f in (q.key, q.question_zh, q.question_en) if f]
    if not forms:
        return 0
    return (await db.execute(
        select(func.count()).select_from(UserSecurityQuestion).where(
            UserSecurityQuestion.question.in_(forms)
        )
    )).scalar_one()


def _out(q: SecurityPresetQuestion, usage: int) -> dict:
    return {
        "id": q.id,
        "key": q.key,
        "question_zh": q.question_zh,
        "question_en": q.question_en,
        "enabled": q.enabled,
        "sort_order": q.sort_order,
        "usage_count": usage,
        "created_at": q.created_at,
        "updated_at": q.updated_at,
    }


def _check_texts(question_zh: str, question_en: str) -> None:
    """中英文本均过黑名单；命中抛 422（与全局 validation 错误壳一致由 handler 包装）。"""
    for text in (question_zh, question_en):
        reason = check_question_text(text)
        if reason:
            raise HTTPException(status_code=422, detail=reason)


@router.get("/presets")
async def list_presets(
    ctx: dict = Depends(require_permission("security_questions", "view")),
    db: AsyncSession = Depends(get_db),
):
    """题库列表（含已停用），按 sort_order + id 排序，附使用量。"""
    rows = (await db.execute(
        select(SecurityPresetQuestion)
        .order_by(SecurityPresetQuestion.sort_order.asc(), SecurityPresetQuestion.id.asc())
    )).scalars().all()
    return ok(data={"presets": [_out(q, await _usage_count(db, q)) for q in rows]})


@router.post("/presets", status_code=status.HTTP_201_CREATED)
async def create_preset(
    req: PresetQuestionIn,
    request: Request,
    ctx: dict = Depends(require_permission("security_questions", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """新增预设题（管理员录入同样触发黑名单过滤）。"""
    _check_texts(req.question_zh, req.question_en)
    q = SecurityPresetQuestion(
        key=None,  # 管理员新选题无历史 i18n key
        question_zh=req.question_zh.strip(),
        question_en=req.question_en.strip(),
        enabled=req.enabled,
        sort_order=req.sort_order,
    )
    db.add(q)
    await db.flush()
    log_action(db, ctx, "security_preset.create",
               f"preset:{q.id} zh:{q.question_zh[:32]}", get_client_ip(request))
    return ok(data=_out(q, 0))


@router.put("/presets/{preset_id}")
async def update_preset(
    preset_id: int,
    req: PresetQuestionUpdate,
    request: Request,
    ctx: dict = Depends(require_permission("security_questions", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """编辑预设题：改文本不影响老用户（用户侧存快照）；可启用 / 停用。"""
    q = await db.get(SecurityPresetQuestion, preset_id)
    if not q:
        raise HTTPException(status_code=404, detail="预设问题不存在")
    new_zh = req.question_zh.strip() if req.question_zh is not None else q.question_zh
    new_en = req.question_en.strip() if req.question_en is not None else q.question_en
    _check_texts(new_zh, new_en)
    q.question_zh = new_zh
    q.question_en = new_en
    if req.enabled is not None:
        q.enabled = req.enabled
    if req.sort_order is not None:
        q.sort_order = req.sort_order
    await db.flush()
    log_action(db, ctx, "security_preset.update", f"preset:{q.id}", get_client_ip(request))
    return ok(data=_out(q, await _usage_count(db, q)))


@router.delete("/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preset(
    preset_id: int,
    request: Request,
    ctx: dict = Depends(require_permission("security_questions", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除预设题：已被用户使用的题禁止物理删除（400），仅可停用。"""
    q = await db.get(SecurityPresetQuestion, preset_id)
    if not q:
        raise HTTPException(status_code=404, detail="预设问题不存在")
    usage = await _usage_count(db, q)
    if usage > 0:
        raise HTTPException(status_code=400, detail="该问题已被用户使用，仅可停用")
    await db.delete(q)
    log_action(db, ctx, "security_preset.delete",
               f"preset:{preset_id} zh:{q.question_zh[:32]}", get_client_ip(request))
