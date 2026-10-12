"""KV 抽象层 + 防爆破阶梯引擎单元测试（不依赖 HTTP / 数据库）。"""
import asyncio

from app.core import brute_force as bf
from app.core.kv import MemoryKV, get_kv, reset_kv


def run(coro):
    return asyncio.run(coro)


def fresh_engine():
    """每用例使用全新内存 KV（隔离状态）。"""
    reset_kv()
    kv = MemoryKV()
    import app.core.kv as kvmod
    kvmod._kv = kv
    return kv


# ---------- MemoryKV 基础语义 ----------

def test_kv_set_get_delete():
    kv = fresh_engine()
    run(kv.set("a", "1"))
    assert run(kv.get("a")) == "1"
    assert run(kv.delete("a", "missing")) == 1
    assert run(kv.get("a")) is None


def test_kv_ttl_expiry():
    kv = fresh_engine()
    run(kv.set("k", "v", ttl_seconds=0.05))
    assert run(kv.get("k")) == "v"
    import time
    time.sleep(0.06)
    assert run(kv.get("k")) is None  # 惰性过期
    assert run(kv.exists("k")) is False


def test_kv_incrby_atomic():
    kv = fresh_engine()
    assert run(kv.incrby("c")) == 1
    assert run(kv.incrby("c", 4)) == 5
    assert run(kv.get("c")) == "5"


def test_kv_set_operations():
    kv = fresh_engine()
    assert run(kv.sadd("s", "m1")) == 1
    assert run(kv.sadd("s", "m1")) == 0
    assert run(kv.smembers("s")) == {"m1"}
    assert run(kv.srem("s", "m1")) == 1
    assert run(kv.smembers("s")) == set()


def test_kv_sweep_clears_expired():
    kv = fresh_engine()
    run(kv.set("k1", "v", ttl_seconds=0.01))
    import time
    time.sleep(0.02)
    assert kv.sweep() >= 1
    assert run(kv.get("k1")) is None


def test_get_kv_defaults_to_memory_without_redis():
    import os
    os.environ.pop("REDIS_URL", None)
    reset_kv()
    kv = get_kv()
    assert isinstance(kv, MemoryKV)


# ---------- Break-Glass 阶梯 ----------

def _dims(ip="1.2.3.4", fp=None):
    return {"ip": ip, "fp": fp}


def test_break_glass_ladder_first_ban_after_3_failures():
    fresh_engine()
    for _ in range(2):
        entry = run(bf.record_failure(bf.BREAK_GLASS_POLICY, "bg_user", "bg_user", _dims()))
        assert entry is None
    assert run(bf.check(bf.BREAK_GLASS_POLICY, "bg_user", _dims())) is None
    entry = run(bf.record_failure(bf.BREAK_GLASS_POLICY, "bg_user", "bg_user", _dims()))
    assert entry is not None and entry.stage == 1 and entry.dim == "ip"
    banned = run(bf.check(bf.BREAK_GLASS_POLICY, "bg_user", _dims()))
    assert banned is not None and banned.permanent is False and banned.until is not None


def test_break_glass_ladder_escalates_to_permanent():
    fresh_engine()
    dims = _dims()
    account = "bg_user"
    # 第 1 次：3 错 → 5m
    for _ in range(3):
        run(bf.record_failure(bf.BREAK_GLASS_POLICY, account, account, dims))
    # 之后每阶段仅 1 次机会：解禁（手动删封禁键模拟 TTL 到期）→ 1 错 → 下一档
    expected_durations = [300, 600, 1800, 3600, 7200, 18000, 86400]
    for i, duration in enumerate(expected_durations, start=1):
        entry = run(bf.check(bf.BREAK_GLASS_POLICY, account, dims))
        assert entry is not None and entry.stage == i
        # 模拟封禁到期：直接删除封禁键（阶段保留）
        from app.core.kv import get_kv
        run(get_kv().delete(bf._ban_key(bf.BREAK_GLASS_POLICY, account, "ip", "1.2.3.4")))
        # 解禁后仅 1 次机会
        e = run(bf.record_failure(bf.BREAK_GLASS_POLICY, account, account, dims))
        assert e is not None and e.stage == i + 1
    # 最后一档：永久
    entry = run(bf.check(bf.BREAK_GLASS_POLICY, account, dims))
    assert entry is not None and entry.permanent is True and entry.until is None
    assert entry.stage == len(bf.BREAK_GLASS_POLICY.ladder_seconds)


def test_break_glass_fp_dimension_independent():
    fresh_engine()
    account = "bg_user"
    # ip 维度封禁
    for _ in range(3):
        run(bf.record_failure(bf.BREAK_GLASS_POLICY, account, account, {"ip": "1.2.3.4", "fp": None}))
    assert run(bf.check(bf.BREAK_GLASS_POLICY, account, {"ip": "1.2.3.4", "fp": None})) is not None
    # 另一 IP 不受影响（封禁是 账号×维度 组合）
    assert run(bf.check(bf.BREAK_GLASS_POLICY, account, {"ip": "5.6.7.8", "fp": None})) is None


# ---------- 普通账号阶梯 ----------

def test_normal_ladder_first_ban_after_5_failures():
    fresh_engine()
    for _ in range(4):
        entry = run(bf.record_failure(bf.NORMAL_POLICY, "42", "alice", _dims()))
        assert entry is None
    entry = run(bf.record_failure(bf.NORMAL_POLICY, "42", "alice", _dims()))
    assert entry is not None and entry.stage == 1


def test_normal_ladder_three_attempts_per_stage():
    fresh_engine()
    account = "42"
    dims = _dims()
    from app.core.kv import get_kv
    total_stages = len(bf.NORMAL_POLICY.ladder_seconds)  # 11 档（第 11 档永久）
    # 阶段 0：5 次错 → 第 1 次封禁（1 分钟）
    e = None
    for _ in range(5):
        e = run(bf.record_failure(bf.NORMAL_POLICY, account, "alice", dims))
    assert e is not None and e.stage == 1
    # 此后每档解禁（模拟 TTL 到期，阶段保留）→ 3 次机会 → 第 3 错推进下一档
    for stage in range(2, total_stages + 1):
        run(get_kv().delete(bf._ban_key(bf.NORMAL_POLICY, account, "ip", "1.2.3.4")))
        e = None
        for _ in range(2):
            e = run(bf.record_failure(bf.NORMAL_POLICY, account, "alice", dims))
            assert e is None  # 前 2 次不封
        e = run(bf.record_failure(bf.NORMAL_POLICY, account, "alice", dims))
        assert e is not None and e.stage == stage
    # 最后一档：永久
    entry = run(bf.check(bf.NORMAL_POLICY, account, dims))
    assert entry is not None and entry.permanent is True and entry.until is None


def test_reset_clears_only_target_account():
    fresh_engine()
    run(bf.record_failure(bf.NORMAL_POLICY, "1", "a", _dims(ip="9.9.9.9")))
    run(bf.record_failure(bf.NORMAL_POLICY, "2", "b", _dims(ip="9.9.9.9")))
    n = run(bf.reset(bf.NORMAL_POLICY, "1", {"ip": "9.9.9.9", "fp": None}))
    assert n >= 1
    # 账号 1 计数清零（再 4 次未达 5 不封），账号 2 计数保留（累计 5 次即封）
    for _ in range(4):
        assert run(bf.record_failure(bf.NORMAL_POLICY, "1", "a", _dims(ip="9.9.9.9"))) is None
    for _ in range(3):
        assert run(bf.record_failure(bf.NORMAL_POLICY, "2", "b", _dims(ip="9.9.9.9"))) is None
    assert run(bf.record_failure(bf.NORMAL_POLICY, "2", "b", _dims(ip="9.9.9.9"))) is not None


def test_unban_clears_permanent_ban():
    fresh_engine()
    account = "bg_user"
    dims = _dims()
    # 快进到永久封禁
    for _ in range(3):
        run(bf.record_failure(bf.BREAK_GLASS_POLICY, account, account, dims))
    from app.core.kv import get_kv
    for i in range(len(bf.BREAK_GLASS_POLICY.ladder_seconds) - 1):
        run(get_kv().delete(bf._ban_key(bf.BREAK_GLASS_POLICY, account, "ip", "1.2.3.4")))
        run(bf.record_failure(bf.BREAK_GLASS_POLICY, account, account, dims))
    assert run(bf.check(bf.BREAK_GLASS_POLICY, account, dims)).permanent is True
    # 面板解封
    assert run(bf.unban(bf.BREAK_GLASS_POLICY, account, "ip", "1.2.3.4")) is True
    assert run(bf.check(bf.BREAK_GLASS_POLICY, account, dims)) is None
    # 登记表同步清理
    assert run(bf.list_bans(bf.BREAK_GLASS_POLICY)) == []


def test_list_bans_and_reset_stage():
    fresh_engine()
    for _ in range(5):
        run(bf.record_failure(bf.NORMAL_POLICY, "7", "bob", _dims(ip="3.3.3.3")))
    bans = run(bf.list_bans(bf.NORMAL_POLICY))
    assert len(bans) == 1
    assert bans[0].account == "7" and bans[0].dim == "ip" and bans[0].dim_value == "3.3.3.3"
    # 重置计数与阶段（封禁条目保留；此处仅验证计数归零）
    assert run(bf.reset_stage(bf.NORMAL_POLICY, "7", "ip", "3.3.3.3")) is True
    from app.core.kv import get_kv
    # 模拟封禁 TTL 到期：阶段已重置 → 阈值回到 initial（5 次错误）
    run(get_kv().delete(bf._ban_key(bf.NORMAL_POLICY, "7", "ip", "3.3.3.3")))
    for _ in range(4):
        assert run(bf.record_failure(bf.NORMAL_POLICY, "7", "bob", _dims(ip="3.3.3.3"))) is None
    assert run(bf.record_failure(bf.NORMAL_POLICY, "7", "bob", _dims(ip="3.3.3.3"))) is not None
