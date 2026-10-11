"""用户信息通知 Pydantic 模型。

通知来源：announcements 表（category=homepage 信息通知）。
时间字段统一输出带大写 Z 的 ISO-8601 UTC 字符串（UTCDatetime）。
"""
from pydantic import BaseModel

from app.schemas.common import UTCDatetime


class NotificationOut(BaseModel):
    """单条通知（仅含用户侧可见字段，不含 enabled/priority 等管理信息）。"""
    id: int
    title: str
    content: str
    link: str | None
    # 发布时间 = 公告创建时间（UTC-Z 字符串，前端负责本地化渲染）
    published_at: UTCDatetime
    is_read: bool

    model_config = {"from_attributes": True}


class NotificationListOut(BaseModel):
    """当前登录用户的有效通知列表：仅生效中、未过期且对该用户可见。"""
    items: list[NotificationOut]
    unread_count: int


class MarkReadOut(BaseModel):
    """标记已读结果：返回最新未读数（前端角标直接使用）。"""
    unread_count: int
