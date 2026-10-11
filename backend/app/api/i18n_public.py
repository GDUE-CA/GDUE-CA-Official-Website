"""i18n 字典公开接口（示例新壳接口；数据库化在后续 /plan 中落地）。

GET /api/i18n/{lang_code}
    → {
        code: 0,
        message: "ok",
        data: {
          revision: 0,                  # 数据库化后会随翻译变更自增
          lang: "zh-cn",
          translations: { ... }          # 当前阶段留空，等待 i18n 模块填充
        },
        request_id: "..."
      }

注意：当前阶段只搭壳，不查数据库；前端按现有静态 messages/* JSON 工作。
后续模块（i18n 数据库化）接管后，本接口将返回数据库中的 revision + translations。
"""
from fastapi import APIRouter, Path

from app.core.bizcode import BizCode
from app.core.responses import BizException, ok
from app.utils.translator import UI_LANGS

router = APIRouter(prefix="/api/i18n", tags=["i18n"])

# 合法语言标识：与前端 frontend/lib/i18n.ts 的 locales 一一对应
_LANG_DESC = "语言代码：" + "/".join(sorted(UI_LANGS))


@router.get("/{lang_code}")
async def get_i18n_dict(
    lang_code: str = Path(..., min_length=2, max_length=10, description=_LANG_DESC),
):
    # 语言标识与前端 locales 严格对齐（统一小写，大小写不敏感兼容旧调用方）
    lang = lang_code.lower()
    if lang not in UI_LANGS:
        raise BizException(BizCode.VALIDATION_FAILED, params={"lang": lang_code})
    # 业务模块未来要做的：查 i18n_key / i18n_translation 两表，按 lang 拼字典
    return ok(
        data={
            "revision": 0,
            "lang": lang,
            "translations": {},
            "_placeholder": True,
        }
    )