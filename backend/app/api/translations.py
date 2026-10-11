"""表单内容自动翻译接口：管理员批量翻译报名/Bug 文本到自己的显示语言。"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Role, require_role
from app.db.session import get_db
from app.utils.translator import detect_lang, translate_text

router = APIRouter(prefix="/api/translations", tags=["translations"])

MAX_ITEMS = 40
MAX_TEXT_LEN = 2000


class BatchItem(BaseModel):
    key: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1, max_length=MAX_TEXT_LEN)
    source_lang: str | None = None


class BatchRequest(BaseModel):
    items: list[BatchItem] = Field(max_length=MAX_ITEMS)
    target_lang: str


@router.post("/batch")
async def batch_translate(
    req: BatchRequest,
    user: dict = Depends(require_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db),
):
    """批量翻译：返回 {translations: {key: {text, source_lang, translated}}}。

    - 原文语言与目标语言相同 -> 原样返回 translated=false
    - 翻译失败 -> 原样返回 translated=false（前端回退显示原文）
    """
    translations: dict[str, dict] = {}
    for item in req.items[:MAX_ITEMS]:
        text = item.text[:MAX_TEXT_LEN]
        sl = item.source_lang or detect_lang(text)
        if sl == req.target_lang:
            translations[item.key] = {"text": item.text, "source_lang": sl, "translated": False}
            continue
        result = await translate_text(db, text, req.target_lang, sl)
        if result:
            translations[item.key] = {"text": result, "source_lang": sl, "translated": True}
        else:
            translations[item.key] = {"text": item.text, "source_lang": sl, "translated": False}

    await db.commit()
    return {"translations": translations}
