"""Bug 反馈 Pydantic 模型。"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.schemas.common import MultilineText, UTCDatetime


class BugReportCreate(BaseModel):
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, pattern=r"^\+?[0-9\- ()]{5,48}$")
    description: MultilineText = Field(min_length=1, max_length=2000)
    extra: MultilineText | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def check_contact(self) -> "BugReportCreate":
        if not self.contact_email and not self.contact_phone:
            raise ValueError("邮箱和手机号至少填写一项")
        return self


class BugReportOut(BaseModel):
    id: int
    receipt_code: str
    content_lang: str
    contact_email: str | None
    contact_phone: str | None
    description: str
    extra: str | None
    resolved: bool
    submit_ip: str | None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}
