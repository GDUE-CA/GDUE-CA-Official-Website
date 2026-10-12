"""登录防爆破阶梯引擎（底层安全基础设施，与上层业务无关）。

模型：每个 (策略, 账号标识, 维度类型, 维度值) 组合独立计数与封禁。
- 账号标识：普通账号 = users.id 字符串；Break-Glass = 提交的用户名；
- 维度：ip（来源 IP）/ fp（浏览器指纹摘要）；指纹缺失只启用 ip 维度；
- 维度值入 key 前先 SHA-256 截断，防注入与超长 key；
- 阶梯：初始 N 次失败 → 封 ladder[0]；此后每次解禁仅 M 次机会，
  再错依次封 ladder[1..n]；末位 None = 永久封禁（无 TTL）；
- 全部状态存 KV（Redis / 内存兜底），禁止业务数据库；
- 封禁只由调用方（登录接口）用于拦截登录，不暴露剩余时长给前端。

并发语义：计数用 incrby 原子操作；跨 worker 场景依赖 Redis 后端。
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone

from app.core.kv import get_kv

DIM_IP = "ip"
DIM_FP = "fp"

# 封禁登记表（SET）：按策略记录活跃封禁复合键，供后台面板枚举；读取时惰性清理
_BAN_REGISTRY = "bf:bans:{policy}"


@dataclass(frozen=True)
class LadderPolicy:
    name: str
    initial_threshold: int            # 首次封禁前允许的失败次数
    attempts_per_stage: int           # 每次解禁后允许的失败次数
    ladder_seconds: tuple[int | None, ...]  # 各阶段封禁时长；None=永久（末位）

    def duration_for_stage(self, stage: int) -> int | None:
        """stage 从 1 开始计（第 stage 次封禁）。"""
        idx = min(stage, len(self.ladder_seconds)) - 1
        return self.ladder_seconds[idx]

    def is_permanent_stage(self, stage: int) -> bool:
        idx = min(stage, len(self.ladder_seconds)) - 1
        return self.ladder_seconds[idx] is None


# Break-Glass：3 次错 → 5 分钟；此后每次解禁 1 次机会 → 10m/30m/1h/2h/5h/24h → 永久
BREAK_GLASS_POLICY = LadderPolicy(
    "break_glass", initial_threshold=3, attempts_per_stage=1,
    ladder_seconds=(300, 600, 1800, 3600, 7200, 18000, 86400, None),
)
# 普通账号：5 次错 → 1 分钟；此后每次解禁 3 次机会 → 5m/10m/20m/30m/60m/2h/5h/12h/24h → 永久
NORMAL_POLICY = LadderPolicy(
    "normal", initial_threshold=5, attempts_per_stage=3,
    ladder_seconds=(60, 300, 600, 1200, 1800, 3600, 7200, 18000, 43200, 86400, None),
)

STAGE_0 = 0  # 尚未触发过封禁


@dataclass
class BanEntry:
    """封禁条目（KV JSON schema）；until 为 ISO 时间或 None（永久）。"""

    policy: str
    account: str
    account_label: str          # 展示用：普通账号=登录名，BG=用户名
    dim: str                    # ip / fp
    dim_value: str
    stage: int
    banned_at: str              # ISO UTC
    until: str | None           # ISO UTC；None=永久
    permanent: bool
    last_fail_at: str
    ip: str | None = None       # 触发时的来源 IP（审计用）
    fingerprint_digest: str | None = None  # 指纹摘要前 16 位（审计用）
    meta: dict = field(default_factory=dict)


def _dim_hash(dim_value: str) -> str:
    return hashlib.sha256(dim_value.encode("utf-8")).hexdigest()[:16]


def _cnt_key(policy: LadderPolicy, account: str, dim: str, dim_value: str) -> str:
    return f"bf:cnt:{policy.name}:{account}:{dim}:{_dim_hash(dim_value)}"


def _stage_key(policy: LadderPolicy, account: str, dim: str, dim_value: str) -> str:
    return f"bf:stage:{policy.name}:{account}:{dim}:{_dim_hash(dim_value)}"


def _ban_key(policy: LadderPolicy, account: str, dim: str, dim_value: str) -> str:
    return f"bf:ban:{policy.name}:{account}:{dim}:{_dim_hash(dim_value)}"


def _registry_key(policy: LadderPolicy) -> str:
    return _BAN_REGISTRY.format(policy=policy.name)


def _composite(policy: str, account: str, dim: str, dim_value: str) -> str:
    return f"{policy}|{account}|{dim}|{dim_value}"


def _parse_composite(item: str) -> tuple[str, str, str, str] | None:
    parts = item.split("|")
    if len(parts) != 4:
        return None
    return tuple(parts)  # type: ignore[return-value]


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def check(policy: LadderPolicy, account: str, dims: dict[str, str | None]) -> BanEntry | None:
    """查询是否处于封禁期：任一维度命中未过期（含永久）封禁即返回该条目。

    非永久封禁由 KV TTL 自动失效（过期后 get 返回 None）。
    """
    kv = get_kv()
    for dim, dim_value in dims.items():
        if not dim_value:
            continue
        raw = await kv.get(_ban_key(policy, account, dim, dim_value))
        if raw is None:
            continue
        try:
            return BanEntry(**json.loads(raw))
        except (ValueError, TypeError):
            continue
    return None


async def record_failure(
    policy: LadderPolicy,
    account: str,
    account_label: str,
    dims: dict[str, str | None],
    *,
    ip: str | None = None,
    fingerprint_digest: str | None = None,
    meta: dict | None = None,
) -> BanEntry | None:
    """记录一次登录失败；达到阈值触发阶段推进与封禁。

    返回「本次新触发」的 BanEntry（任意维度；供 first_ban 提示），否则 None。
    """
    kv = get_kv()
    now_iso = _utcnow_iso()
    first_ban: BanEntry | None = None
    for dim, dim_value in dims.items():
        if not dim_value:
            continue
        stage_key = _stage_key(policy, account, dim, dim_value)
        stage_raw = await kv.get(stage_key)
        stage = int(stage_raw) if stage_raw else STAGE_0
        allowed = policy.initial_threshold if stage == STAGE_0 else policy.attempts_per_stage
        count = await kv.incrby(_cnt_key(policy, account, dim, dim_value), 1)
        if count < allowed:
            continue
        # 触发封禁：阶段 +1，写封禁条目，清计数
        new_stage = stage + 1
        duration = policy.duration_for_stage(new_stage)
        permanent = duration is None
        entry = BanEntry(
            policy=policy.name,
            account=account,
            account_label=account_label,
            dim=dim,
            dim_value=dim_value,
            stage=new_stage,
            banned_at=now_iso,
            until=None if permanent else (
                datetime.now(timezone.utc) + timedelta(seconds=duration)
            ).isoformat(),
            permanent=permanent,
            last_fail_at=now_iso,
            ip=ip,
            fingerprint_digest=fingerprint_digest,
            meta=meta or {},
        )
        ban_key = _ban_key(policy, account, dim, dim_value)
        if permanent:
            await kv.set(ban_key, json.dumps(asdict(entry), ensure_ascii=False))
        else:
            await kv.setex(ban_key, duration, json.dumps(asdict(entry), ensure_ascii=False))
        await kv.set(stage_key, str(new_stage))
        await kv.delete(_cnt_key(policy, account, dim, dim_value))
        await kv.sadd(_registry_key(policy), _composite(policy.name, account, dim, dim_value))
        if first_ban is None:
            first_ban = entry
    return first_ban


async def reset(policy: LadderPolicy, account: str, dims: dict[str, str | None] | None) -> int:
    """登录成功后清零计数与惩罚阶段（仅本账号指定维度；dims=None 清全部维度由调用方枚举）。

    不解除已生效封禁。返回清理的维度数。
    """
    kv = get_kv()
    cleared = 0
    for dim, dim_value in (dims or {}).items():
        if not dim_value:
            continue
        n = await kv.delete(
            _cnt_key(policy, account, dim, dim_value),
            _stage_key(policy, account, dim, dim_value),
        )
        cleared += 1 if n else 0
    return cleared


async def unban(policy: LadderPolicy, account: str, dim: str, dim_value: str) -> bool:
    """解除封禁（含永久）：删封禁条目 + 计数 + 阶段，移出登记表。"""
    kv = get_kv()
    removed = await kv.delete(
        _ban_key(policy, account, dim, dim_value),
        _cnt_key(policy, account, dim, dim_value),
        _stage_key(policy, account, dim, dim_value),
    )
    await kv.srem(_registry_key(policy), _composite(policy.name, account, dim, dim_value))
    return removed > 0


async def reset_stage(policy: LadderPolicy, account: str, dim: str, dim_value: str) -> bool:
    """面板「重置错误计数与惩罚阶段」：删 cnt+stage；不动封禁。"""
    kv = get_kv()
    n = await kv.delete(
        _cnt_key(policy, account, dim, dim_value),
        _stage_key(policy, account, dim, dim_value),
    )
    return n > 0


async def list_bans(policy: LadderPolicy) -> list[BanEntry]:
    """枚举登记表中的封禁条目；过期条目惰性移出登记表。"""
    kv = get_kv()
    out: list[BanEntry] = []
    for item in await kv.smembers(_registry_key(policy)):
        parsed = _parse_composite(item)
        if not parsed:
            await kv.srem(_registry_key(policy), item)
            continue
        p_name, account, dim, dim_value = parsed
        raw = await kv.get(_ban_key_by_name(p_name, account, dim, dim_value))
        if raw is None:
            # TTL 到期自动消失（非永久）→ 惰性清理登记表
            await kv.srem(_registry_key(policy), item)
            continue
        try:
            data = json.loads(raw)
            out.append(BanEntry(**data))
        except (ValueError, TypeError):
            await kv.srem(_registry_key(policy), item)
    out.sort(key=lambda e: e.banned_at, reverse=True)
    return out


def _ban_key_by_name(policy_name: str, account: str, dim: str, dim_value: str) -> str:
    """已知策略名时构造 ban key（list_bans 用，避免循环构造 LadderPolicy）。"""
    # 与 _ban_key 同构；策略名仅用于命名空间
    return f"bf:ban:{policy_name}:{account}:{dim}:{_dim_hash(dim_value)}"
