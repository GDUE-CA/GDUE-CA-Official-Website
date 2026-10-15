"""项目版本接口。

GET /api/version → {"version": "v0.5.0"}

公开接口，无需鉴权。按规格返回裸 JSON（不使用统一响应壳）；
版本取值来自 app.core.config.PROJECT_VERSION（全站唯一真值源）。
"""
from fastapi import APIRouter

from app.core.config import PROJECT_VERSION

router = APIRouter(tags=["version"])


@router.get("/api/version")
async def version():
    """返回当前项目版本号。"""
    return {"version": PROJECT_VERSION}
