"""活动统计 Pydantic 模型。"""
from pydantic import BaseModel

from app.schemas.common import UTCDatetime


class ActivityStatisticsOut(BaseModel):
    activity_id: int
    total: int
    pending: int
    approved: int
    rejected: int
    checked_in: int
    generated_at: UTCDatetime

    model_config = {"from_attributes": True}
