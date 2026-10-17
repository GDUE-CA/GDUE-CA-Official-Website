"""通用 KV 抽象层（底层基础设施，与任何上层业务无关）。

用途：防爆破计数/封禁登记、Break-Glass 会话等需要「可过期、可原子自增」的
短期状态存储。要求生产环境配置 REDIS_URL 使用 Redis（多 worker 共享、重启不丢）；
开发/测试环境留空时自动降级为进程内存实现（启动时会输出警告日志）。

设计约束：
- 接口与 redis.asyncio 语义对齐，替换后端不影响调用方；
- MemoryKV 使用单调时钟惰性过期 + 周期清扫（main.lifespan 启动 sweep 循环）；
- 本模块禁止 import 任何业务模型/路由，保持底层可迁移复用。
"""
from __future__ import annotations

import json
import time
from abc import ABC, abstractmethod

from app.core.config import get_settings

import logging

logger = logging.getLogger("gdueca.kv")


class KV(ABC):
    """异步 KV 接口（语义对齐 Redis）。value 一律为 str；复杂结构由调用方 JSON 序列化。"""

    @abstractmethod
    async def get(self, key: str) -> str | None: ...

    @abstractmethod
    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None: ...

    async def setex(self, key: str, ttl_seconds: int, value: str) -> None:
        await self.set(key, value, ttl_seconds)

    @abstractmethod
    async def delete(self, *keys: str) -> int: ...

    @abstractmethod
    async def exists(self, key: str) -> bool: ...

    @abstractmethod
    async def expire(self, key: str, ttl_seconds: int) -> bool: ...

    @abstractmethod
    async def incrby(self, key: str, delta: int = 1) -> int:
        """原子自增；键不存在时从 0 起。"""

    @abstractmethod
    async def sadd(self, key: str, member: str) -> int: ...

    @abstractmethod
    async def smembers(self, key: str) -> set[str]: ...

    @abstractmethod
    async def srem(self, key: str, member: str) -> int: ...

    async def delete_prefix(self, prefix: str) -> int:
        """删除所有以 prefix 开头的键，返回删除数量（默认基于 iterate_keys）。"""
        count = 0
        async for k in self.iterate_keys():
            if k.startswith(prefix):
                count += await self.delete(k)
        return count

    async def iterate_keys(self):
        """异步迭代全部键（默认实现基于 keys()；后端可覆写为 scan 游标）。"""
        for k in await self.keys():
            yield k

    @abstractmethod
    async def keys(self) -> list[str]: ...


class MemoryKV(KV):
    """进程内存兜底实现：{key: (value, expires_at_monotonic | None)}。"""

    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float | None]] = {}
        self._sets: dict[str, dict[str, None]] = {}

    # ---- 内部：惰性过期 ----
    def _live(self, key: str) -> str | None:
        item = self._data.get(key)
        if item is None:
            return None
        value, exp = item
        if exp is not None and time.monotonic() >= exp:
            self._data.pop(key, None)
            return None
        return value

    # ---- KV 接口 ----
    async def get(self, key: str) -> str | None:
        return self._live(key)

    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None:
        self._data[key] = (value, (time.monotonic() + ttl_seconds) if ttl_seconds else None)

    async def delete(self, *keys: str) -> int:
        n = 0
        for k in keys:
            if self._data.pop(k, None) is not None:
                n += 1
            if self._sets.pop(k, None) is not None:
                n += 1
        return n

    async def exists(self, key: str) -> bool:
        return self._live(key) is not None or key in self._sets

    async def expire(self, key: str, ttl_seconds: int) -> bool:
        if not self._live(key):
            return False
        self._data[key] = (self._data[key][0], time.monotonic() + ttl_seconds)
        return True

    async def incrby(self, key: str, delta: int = 1) -> int:
        current = int(self._live(key) or 0)
        current += delta
        # 已带 TTL 的键自增后保留原 TTL
        item = self._data.get(key)
        exp = item[1] if item else None
        self._data[key] = (str(current), exp)
        return current

    async def sadd(self, key: str, member: str) -> int:
        bucket = self._sets.setdefault(key, {})
        added = 0 if member in bucket else 1
        bucket[member] = None
        return added

    async def smembers(self, key: str) -> set[str]:
        return set(self._sets.get(key, ()))

    async def srem(self, key: str, member: str) -> int:
        bucket = self._sets.get(key)
        if bucket and member in bucket:
            del bucket[member]
            return 1
        return 0

    async def keys(self) -> list[str]:
        return list(self._data.keys()) + [k for k in self._sets if k not in self._data]

    # ---- 清扫 ----
    def sweep(self) -> int:
        """物理清除全部已过期键，返回清除数量（周期任务调用）。"""
        now = time.monotonic()
        expired = [k for k, (_, exp) in self._data.items() if exp is not None and now >= exp]
        for k in expired:
            self._data.pop(k, None)
        return len(expired)


class RedisKV(KV):
    """Redis 后端（redis.asyncio）。"""

    def __init__(self, url: str) -> None:
        import redis.asyncio as aioredis

        self._redis = aioredis.from_url(url, decode_responses=True)

    async def get(self, key: str) -> str | None:
        return await self._redis.get(key)

    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None:
        if ttl_seconds:
            await self._redis.set(key, value, ex=ttl_seconds)
        else:
            await self._redis.set(key, value)

    async def delete(self, *keys: str) -> int:
        return int(await self._redis.delete(*keys)) if keys else 0

    async def exists(self, key: str) -> bool:
        return bool(await self._redis.exists(key))

    async def expire(self, key: str, ttl_seconds: int) -> bool:
        return bool(await self._redis.expire(key, ttl_seconds))

    async def incrby(self, key: str, delta: int = 1) -> int:
        return int(await self._redis.incrby(key, delta))

    async def sadd(self, key: str, member: str) -> int:
        return int(await self._redis.sadd(key, member))

    async def smembers(self, key: str) -> set[str]:
        return await self._redis.smembers(key)

    async def srem(self, key: str, member: str) -> int:
        return int(await self._redis.srem(key, member))

    async def keys(self) -> list[str]:
        return [k async for k in self._redis.scan_iter("*")]

    async def iterate_keys(self):
        # Redis 用 scan 游标迭代，避免 KEYS * 阻塞
        async for k in self._redis.scan_iter("*"):
            yield k


_kv: KV | None = None


def get_kv() -> KV:
    """进程级 KV 单例：REDIS_URL 非空 → Redis；否则内存兜底 + 警告。"""
    global _kv
    if _kv is None:
        url = get_settings().REDIS_URL.strip()
        if url:
            _kv = RedisKV(url)
            logger.info("KV 存储已连接 Redis（防爆破/封禁/应急会话共享）")
        else:
            _kv = MemoryKV()
            logger.warning(
                "REDIS_URL 未配置，防爆破计数/封禁/Break-Glass 会话使用进程内存兜底"
                "（仅单进程开发可用；多 worker 部署不共享，重启即丢失）"
            )
    return _kv


def reset_kv() -> None:
    """测试辅助：清空单例（切库/隔离用）。"""
    global _kv
    _kv = None


async def start_sweep() -> None:
    """周期清扫入口（lifespan 调用）；Redis 后端空操作。"""
    kv = get_kv()
    if isinstance(kv, MemoryKV):
        kv.sweep()


# ---------- JSON 便捷方法（供会话/封禁条目等结构化存储） ----------

async def kv_set_json(key: str, payload: dict, ttl_seconds: int | None = None) -> None:
    await get_kv().set(key, json.dumps(payload, ensure_ascii=False), ttl_seconds)


async def kv_get_json(key: str) -> dict | None:
    raw = await get_kv().get(key)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None
