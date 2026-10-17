"""回执码生成：去除易混淆字符的 8 位随机码，格式 GDUECA-XXXXXXXX。

活动报名（Registration）与社团报名（ClubApplyRecord）共用同一回执码空间，
公开查询接口 /api/query/{code} 依次在两表中查找，因此生成时必须跨表查重。
"""
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# 去除 0/O、1/I/L 等易混淆字符
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def gen_receipt_code() -> str:
    return "GDUECA-" + "".join(secrets.choice(_ALPHABET) for _ in range(8))


async def unique_receipt_code(db: AsyncSession) -> str:
    """生成在 Registration / ClubApplyRecord 中均不存在的回执码（碰撞时重试）。"""
    from app.db.models import ClubApplyRecord, Registration

    for _ in range(8):
        code = gen_receipt_code()
        taken = (await db.execute(
            select(Registration.id).where(Registration.receipt_code == code).limit(1)
        )).first() or (await db.execute(
            select(ClubApplyRecord.id).where(ClubApplyRecord.receipt_code == code).limit(1)
        )).first()
        if not taken:
            return code
    # 31^8 ≈ 8.5e11 空间下连续 8 次碰撞几乎不可能；兜底仍由唯一索引拦截
    return gen_receipt_code()
