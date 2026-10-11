"""轻量内存限流（滑动窗口），用于登录、密码恢复、公开表单等接口防暴力 / 防刷。

单进程内存实现；多 worker 部署时每个进程独立计数（仍能大幅提高攻击成本），
如需全局精确限流可替换为 Redis 实现，接口保持不变。
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.core.middleware import get_client_ip

_buckets: dict[str, deque[float]] = defaultdict(deque)
_MAX_KEYS = 50_000


def hit(key: str, limit: int, window_seconds: int) -> bool:
    """记录一次访问；超出限额返回 False。"""
    now = time.monotonic()
    q = _buckets[key]
    while q and now - q[0] > window_seconds:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    # 防止大量不同 key 撑爆内存：超过上限时清理空桶
    if len(_buckets) > _MAX_KEYS:
        for k in [k for k, v in _buckets.items() if not v]:
            _buckets.pop(k, None)
    return True


def rate_limit(scope: str, limit: int, window_seconds: int):
    """FastAPI 依赖：按「接口 + 客户端 IP」限流，超限返回 429。"""
    async def _dep(request: Request) -> None:
        ip = get_client_ip(request) or "unknown"
        if not hit(f"{scope}:{ip}", limit, window_seconds):
            raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
    return _dep


def reset() -> None:
    """测试用：清空计数。"""
    _buckets.clear()
