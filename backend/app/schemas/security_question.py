"""安全问题预设题库 Pydantic 模型（V0.5.8）。"""
from pydantic import BaseModel, Field

from app.schemas.common import PlainText


class PresetQuestionIn(BaseModel):
    """新增预设问题：中英文本双必填（对应 zh-cn / en-gb 双基准）。"""
    question_zh: PlainText = Field(min_length=2, max_length=256)
    question_en: PlainText = Field(min_length=2, max_length=256)
    enabled: bool = True
    sort_order: int = Field(default=0, ge=0, le=9999)


class PresetQuestionUpdate(BaseModel):
    """编辑预设问题：全部字段可选，仅更新传入字段。"""
    question_zh: PlainText | None = Field(default=None, min_length=2, max_length=256)
    question_en: PlainText | None = Field(default=None, min_length=2, max_length=256)
    enabled: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=9999)
