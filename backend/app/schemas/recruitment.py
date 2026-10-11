"""招新信息 Pydantic 模型。"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import MultilineText, PlainText, UTCNaive, UTCDatetime


class RecruitmentInfoCreate(BaseModel):
    title: PlainText = Field(min_length=1, max_length=200)
    content: MultilineText = Field(min_length=1, max_length=50_000)
    target_dept: PlainText | None = Field(default=None, max_length=64)
    start_at: UTCNaive | None = None
    end_at: UTCNaive | None = None
    enabled: bool = True


class RecruitmentInfoUpdate(BaseModel):
    title: PlainText | None = Field(default=None, min_length=1, max_length=200)
    content: MultilineText | None = Field(default=None, min_length=1, max_length=50_000)
    target_dept: PlainText | None = Field(default=None, max_length=64)
    start_at: UTCNaive | None = None
    end_at: UTCNaive | None = None
    enabled: bool | None = None


class RecruitmentInfoOut(BaseModel):
    id: int
    title: str
    content: str
    target_dept: str | None
    start_at: UTCDatetime | None
    end_at: UTCDatetime | None
    enabled: bool
    created_at: UTCDatetime

    model_config = {"from_attributes": True}
