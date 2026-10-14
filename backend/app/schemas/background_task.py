"""后台异步任务 Pydantic 模型。

时间字段统一输出带大写 Z 的 ISO-8601 UTC 字符串（UTCDatetime）。
"""
from pydantic import BaseModel

from app.db.models import BackgroundTaskCategory, BackgroundTaskStatus
from app.schemas.common import UTCDatetime


class BackgroundTaskOut(BaseModel):
    """后台任务完整信息（通知中心 / 悬浮弹窗 / 单任务轮询共用）。"""
    id: str
    title: str
    category: BackgroundTaskCategory
    status: BackgroundTaskStatus
    progress: int
    message: str
    result_payload: dict | None
    created_by_user_id: int | None
    created_at: UTCDatetime
    finished_at: UTCDatetime | None
    dismissed_at: UTCDatetime | None

    model_config = {"from_attributes": True}


class BackgroundTaskListOut(BaseModel):
    items: list[BackgroundTaskOut]


class BackgroundTaskSubmitOut(BaseModel):
    """提交后台任务的即时响应（HTTP 立刻返回，不阻塞）。"""
    task_id: str
