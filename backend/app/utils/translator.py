"""内容自动翻译服务（DeepL）。

- 只维护中 / 英两个版本：原文含汉字视为中文、译英文；否则视为英文、译中文
- 显示语言归一：zh-* → 中文版，其余界面语言 → 英文版（content_lang）
- 存储：译文写入 TranslationCache 表（原文 SHA-256 + 源 / 目标语言）；
  公告在后台保存时经 pretranslate 预翻译入库，公开接口读取时直接命中
- 未配置 DEEPL_API_KEY / 接口失败：返回原文，绝不阻塞内容接口
- detect_lang 供报名 / Bug 反馈等记录原文语言使用，与翻译版本无关
"""
import hashlib
import logging
import re
from typing import Iterable, Literal, Sequence

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.locales import SUPPORTED_LOCALE_IDS
from app.db.models import TranslationCache

logger = logging.getLogger("gdueca.translator")

# i18n 字典接口的合法语言集合（V0.6.1 需求1：与前端 13 语种白名单一一对应，全小写）
UI_LANGS = set(SUPPORTED_LOCALE_IDS)

# 内容翻译接受的显示语言：13 门界面语言 + 旧调用方使用的代码（zh/en/ja 兼容保留）
_DISPLAY_LANGS = SUPPORTED_LOCALE_IDS | UI_LANGS | {"zh", "en", "ja"}

ContentLang = Literal["zh", "en"]

_DEEPL_TARGET: dict[str, str] = {"zh": "ZH-HANS", "en": "EN-US"}
_DEEPL_FREE_URL = "https://api-free.deepl.com/v2/translate"
_DEEPL_PRO_URL = "https://api.deepl.com/v2/translate"
# DeepL 单次请求最多 50 条文本
_DEEPL_BATCH = 50

_HAN_RE = re.compile(r"[一-鿿]")

_warned_no_key = False


def detect_lang(text: str) -> str:
    """简单启发式语言检测（记录原文语言用）。"""
    if not text:
        return "zh-cn"
    if re.search(r"[぀-ヿ]", text):  # 平假名/片假名
        return "ja"
    if _HAN_RE.search(text):  # 汉字（繁体不做区分，按简体处理）
        return "zh-cn"
    if re.search(r"[가-힯]", text):  # 谚文
        return "ko"
    return "en"


def content_lang(lang: str | None) -> ContentLang | None:
    """显示语言 → 内容版本：zh-* 看中文版，其余看英文版；非法语言返回 None（不翻译）。"""
    if not lang:
        return None
    lower = lang.lower()
    if lower not in _DISPLAY_LANGS:
        return None
    return "zh" if lower.startswith("zh") else "en"


def _source_of(text: str) -> ContentLang:
    """原文版本：含汉字即中文，否则按英文处理。"""
    return "zh" if _HAN_RE.search(text) else "en"


def _other(lang: ContentLang) -> ContentLang:
    return "en" if lang == "zh" else "zh"


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def _translate_deepl(texts: list[str], target: ContentLang) -> list[str] | None:
    """调用 DeepL 批量翻译（源语言交给 DeepL 自动识别）；未配置 key 返回 None。"""
    global _warned_no_key
    settings = get_settings()
    key = settings.DEEPL_API_KEY.strip()
    if not key:
        if not _warned_no_key:
            logger.warning("未配置 DEEPL_API_KEY，内容翻译已停用（展示原文）")
            _warned_no_key = True
        return None
    url = settings.DEEPL_API_URL.strip() or (_DEEPL_FREE_URL if key.endswith(":fx") else _DEEPL_PRO_URL)

    out: list[str] = []
    async with httpx.AsyncClient(timeout=8) as client:
        for i in range(0, len(texts), _DEEPL_BATCH):
            chunk = texts[i:i + _DEEPL_BATCH]
            resp = await client.post(
                url,
                headers={"Authorization": f"DeepL-Auth-Key {key}"},
                json={"text": chunk, "target_lang": _DEEPL_TARGET[target]},
            )
            resp.raise_for_status()
            items = resp.json().get("translations") or []
            if len(items) != len(chunk):
                raise ValueError("DeepL 返回条数与请求不一致")
            out.extend(str(item.get("text") or "") for item in items)
    return out


async def _translate_many(db: AsyncSession, texts: Iterable[str], target: ContentLang) -> dict[str, str]:
    """把一批原文译为 target 版本：先查库，未命中的合并成一次 DeepL 调用并写库。

    返回 {原文: 译文}；原文已是目标版本、翻译失败或译文与原文相同的不在结果中。
    """
    pending: list[str] = []
    for text in dict.fromkeys(texts):  # 去重且保序
        if isinstance(text, str) and text.strip() and _source_of(text) != target:
            pending.append(text)
    if not pending:
        return {}

    # 串行查库（AsyncSession 不允许并发操作）；缓存表无唯一约束，取最新一条
    result: dict[str, str] = {}
    misses: list[str] = []
    for text in pending:
        row = (
            await db.execute(
                select(TranslationCache).where(
                    TranslationCache.source_hash == _hash(text),
                    TranslationCache.source_lang == _source_of(text),
                    TranslationCache.target_lang == target,
                ).order_by(TranslationCache.id.desc()).limit(1)
            )
        ).scalar_one_or_none()
        if row:
            result[text] = row.translated_text
        else:
            misses.append(text)
    if not misses:
        return result

    try:
        translated = await _translate_deepl(misses, target)
    except Exception as e:
        logger.warning("DeepL 翻译失败，展示原文：%s", e.__class__.__name__)
        return result
    if translated is None:
        return result

    for text, tr in zip(misses, translated):
        if tr.strip() and tr.strip() != text.strip():
            db.add(TranslationCache(
                source_hash=_hash(text),
                source_lang=_source_of(text),
                target_lang=target,
                source_text=text[:2000],
                translated_text=tr,
            ))
            result[text] = tr
    return result


async def translate_text(db: AsyncSession, text: str, target_lang: str) -> str | None:
    """翻译单条文本到显示语言对应的版本；无需翻译 / 失败返回 None（调用方回退原文）。"""
    tl = content_lang(target_lang)
    if not tl or not text or not text.strip():
        return None
    return (await _translate_many(db, [text], tl)).get(text)


async def translate_obj_fields(
    db: AsyncSession,
    objs: Sequence,
    fields: Sequence[str],
    target_lang: str | None,
) -> None:
    """CMS 公开内容按显示语言翻译：就地替换对象列表的指定文本字段。

    仅供公开内容接口使用，必须传入 Pydantic Out 模型副本（禁止传 ORM 实体，
    否则译文会随 get_db 的统一 commit 污染源数据表）。任何异常不外抛。
    """
    tl = content_lang(target_lang)
    if not tl:
        return
    targets: list[tuple[object, str, str]] = []
    for obj in objs:
        for field in fields:
            text = getattr(obj, field, None)
            if isinstance(text, str) and text.strip():
                targets.append((obj, field, text))
    if not targets:
        return

    translated = await _translate_many(db, (text for _, _, text in targets), tl)
    for obj, field, text in targets:
        if text in translated:
            setattr(obj, field, translated[text])


async def pretranslate(db: AsyncSession, texts: Iterable[str]) -> None:
    """内容保存时预翻译：每条原文译成另一个版本（中→英 / 英→中）并写库，失败不影响保存。"""
    by_target: dict[ContentLang, list[str]] = {"zh": [], "en": []}
    for text in texts:
        if isinstance(text, str) and text.strip():
            by_target[_other(_source_of(text))].append(text)
    for target, group in by_target.items():
        if group:
            await _translate_many(db, group, target)
