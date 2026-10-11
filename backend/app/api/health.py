"""健康检查：新壳示范接口。

GET /health → {code:0, message:"ok", data:{status,service,version,time:"...Z"}, request_id}

旧接口 `/health` 在 main.py 中内联，现迁移到本 router 以演示统一响应壳。
"""
from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.responses import ok

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    """轻量健康检查：返回新壳 + 服务版本信息（不含 DB 探活，避免误判）。"""
    return ok(
        data={
            "status": "ok",
            "service": "gdueca-backend",
            "version": "1.0.0",
            # 后端永远 UTC 存储、ISO 输出；前端按需做时区本地化
            "time": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
                "+00:00", "Z"
            ),
        }
    )