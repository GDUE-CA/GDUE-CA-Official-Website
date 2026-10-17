"""社团报名：提交只回回执码；本人进度 / 公开查询均为最小化字段；存量记录补发回执码。"""
import asyncio
from datetime import datetime, timezone

from tests.conftest import csrf, make_client

PASSWORD = "Club#Apply-2026x"


def _seed_college_major() -> tuple[int, int]:
    """一次性 engine 预置学院 / 专业（不得触碰共享 engine，原因见 conftest.app）。"""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import get_settings
    from app.db.models import SysCollege, SysMajor

    async def _run() -> tuple[int, int]:
        eng = create_async_engine(get_settings().DATABASE_URL, future=True)
        try:
            async with async_sessionmaker(eng, expire_on_commit=False)() as s:
                college = SysCollege(college_name="报名测试学院")
                s.add(college)
                await s.flush()
                major = SysMajor(college_id=college.id, major_name="报名测试专业")
                s.add(major)
                await s.commit()
                return college.id, major.id
        finally:
            await eng.dispose()

    return asyncio.run(_run())


def _seed_member(username: str) -> None:
    """一次性 engine 直接预置会员账号：不依赖注册流程（V0.5.8 起注册为邮箱验证码多步向导）。"""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import get_settings
    from app.core.security import Role, hash_password
    from app.db.models import User

    async def _run() -> None:
        eng = create_async_engine(get_settings().DATABASE_URL, future=True)
        try:
            async with async_sessionmaker(eng, expire_on_commit=False)() as s:
                s.add(User(
                    username=username,
                    email=f"{username}@gdue-ca.cn",
                    password_hash=hash_password(PASSWORD),
                    role=Role.MEMBER,
                    display_name="报名测试",
                    real_name="报名测试",
                    student_id="00000001",
                    phone="+8613800000001",
                    must_set_security_questions=False,
                ))
                await s.commit()
        finally:
            await eng.dispose()

    asyncio.run(_run())


def _member_client(app):
    client = make_client(app)
    with client:  # 触发 lifespan
        pass
    _seed_member("clubapplicant")
    r = client.post("/api/auth/login", headers=csrf(client),
                    json={"username": "clubapplicant", "password": PASSWORD})
    assert r.status_code == 200, r.text
    client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    return client


def test_submit_returns_receipt_only(app):
    college_id, major_id = _seed_college_major()
    client = _member_client(app)
    year = datetime.now(timezone.utc).year
    r = client.post("/api/club-apply", json={
        "real_name": "张三",
        "phone": "+86 13800138000",
        "departments": ["活动部"],
        "student_id": f"{year % 100:02d}123456789",
        "college_id": college_id,
        "major_id": major_id,
        "enroll_year": year,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    # 只回回执码 + 提交时间，不回显主键 / user_id / 个人信息
    assert set(body) == {"receipt_code", "submitted_at"}
    code = body["receipt_code"]
    assert code.startswith("GDUECA-")

    mine = client.get("/api/club-apply/mine")
    assert mine.status_code == 200
    [item] = mine.json()
    assert item["receipt_code"] == code and item["status"] == "pending"
    assert item["reject_reason"] is None
    for leaked in ("id", "user_id", "real_name", "phone", "email", "student_id", "admin_note", "reviewed_by"):
        assert leaked not in item

    # 公开回执查询能查到社团报名，状态词与活动报名统一，不含个人信息
    q = make_client(app).get(f"/api/query/{code}")
    assert q.status_code == 200, q.text
    assert q.json()["type"] == "club" and q.json()["status"] == "pending"
    assert "real_name" not in q.json() and "phone" not in q.json()

    c = make_client(app)
    ck = c.post(f"/api/query/{code}/checkin", headers=csrf(c))
    assert ck.status_code == 400


def test_backfill_missing_receipts(app):
    """v0.5.0 后提交的存量社团报名无回执码：启动迁移应补发且不与已有回执码冲突。"""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import get_settings
    from app.main import _backfill_club_apply_receipts

    async def _run() -> list:
        eng = create_async_engine(get_settings().DATABASE_URL, future=True)
        try:
            async with eng.begin() as conn:
                uid = (await conn.execute(text("SELECT id FROM users LIMIT 1"))).scalar_one()
                for _ in range(3):
                    await conn.execute(text(
                        "INSERT INTO club_apply_records (user_id, real_name, phone, applicant_type, "
                        "departments, status, created_at) VALUES (:u, '存量', '+8613800000000', "
                        "'school', '[]', 'pending', CURRENT_TIMESTAMP)"), {"u": uid})
                await _backfill_club_apply_receipts(conn)
                return (await conn.execute(text(
                    "SELECT receipt_code FROM club_apply_records"))).scalars().all()
        finally:
            await eng.dispose()

    codes = asyncio.run(_run())
    assert codes and all(c and c.startswith("GDUECA-") for c in codes)
    assert len(set(codes)) == len(codes)

