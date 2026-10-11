"""内容自动翻译服务。

- 语言检测：日文假名 -> ja；汉字 -> zh-cn；其他 -> en
- 翻译源：Google translate gtx（免费无 key）优先，MyMemory 兜底
- 缓存：TranslationCache 表，避免重复调用外部接口
- 内容翻译：translate_obj_fields 供公开内容接口按显示语言翻译 CMS 文本
"""
import asyncio
import hashlib
import logging
import re
from typing import Sequence

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TranslationCache

logger = logging.getLogger("gdueca.translator")

# 界面语言：与前端 frontend/lib/i18n.ts 的 locales 一一对应（全小写），作为外部入参的唯一合法集合
UI_LANGS = {"zh-cn", "zh-tw", "zh-hk", "en-us", "en-gb", "ja"}

# 翻译服务商语言代码（全小写）：gtx / MyMemory 不区分英语、繁体中文的区域变体
SUPPORTED_LANGS = {"zh-cn", "zh-tw", "en", "ja"}

# 前端界面语言 → 翻译服务商代码归一化
_LANG_ALIASES = {"en-us": "en", "en-gb": "en", "zh-hk": "zh-tw"}


def normalize_lang(lang: str) -> str:
    """归一化为服务商代码：统一小写，en-us / en-gb → en、zh-hk → zh-tw。"""
    lower = lang.lower()
    return _LANG_ALIASES.get(lower, lower)

_GTX_URL = "https://translate.googleapis.com/translate_a/single"
_MYMEMORY_URL = "https://api.mymemory.translated.net/get"


def detect_lang(text: str) -> str:
    """简单启发式语言检测。"""
    if not text:
        return "zh-cn"
    if re.search(r"[぀-ヿ]", text):  # 平假名/片假名
        return "ja"
    if re.search(r"[一-鿿]", text):  # 汉字（繁体不做区分，按简体处理）
        return "zh-cn"
    if re.search(r"[가-힯]", text):  # 谚文
        return "ko"
    return "en"


async def _translate_google(text: str, target_lang: str) -> str:
    # 超时 4s：gtx 在部分网络不可达时尽快回落 MyMemory，避免拖垮首次渲染
    async with httpx.AsyncClient(timeout=4) as client:
        resp = await client.get(
            _GTX_URL,
            params={"client": "gtx", "sl": "auto", "tl": target_lang, "dt": "t", "q": text},
        )
        resp.raise_for_status()
        data = resp.json()
        return "".join(seg[0] for seg in data[0] if seg and seg[0])


async def _translate_mymemory(text: str, source_lang: str, target_lang: str) -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            _MYMEMORY_URL,
            params={"q": text, "langpair": f"{source_lang}|{target_lang}"},
        )
        resp.raise_for_status()
        data = resp.json()
        return (data.get("responseData") or {}).get("translatedText", "")


async def translate_text(
    db: AsyncSession,
    text: str,
    target_lang: str,
    source_lang: str | None = None,
) -> str | None:
    """翻译单条文本；语言相同/翻译失败返回 None（调用方回退显示原文）。"""
    if not text or not text.strip():
        return None
    # 边界校验：目标语言必须是前端 6 种界面语言之一（统一小写，大小写不敏感兼容旧调用方）
    if target_lang.lower() not in UI_LANGS:
        return None
    target_lang = normalize_lang(target_lang)
    if target_lang not in SUPPORTED_LANGS:
        return None

    sl = normalize_lang(source_lang or detect_lang(text))
    if sl == target_lang:
        return None

    # 命中缓存直接返回
    h = hashlib.sha256(text.encode("utf-8")).hexdigest()
    cached = await db.execute(
        select(TranslationCache).where(
            TranslationCache.source_hash == h,
            TranslationCache.source_lang == sl,
            TranslationCache.target_lang == target_lang,
        )
    )
    row = cached.scalar_one_or_none()
    if row:
        return row.translated_text

    # 调用外部翻译（gtx 优先，MyMemory 兜底）
    translated: str | None = None
    try:
        translated = await _translate_google(text, target_lang)
    except Exception as e:
        logger.warning("Google 翻译失败，改用 MyMemory：%s", e.__class__.__name__)
        try:
            translated = await _translate_mymemory(text, sl, target_lang)
        except Exception as e2:
            logger.warning("MyMemory 翻译失败，返回原文：%s", e2.__class__.__name__)
            return None

    if translated and translated.strip() and translated.strip() != text.strip():
        db.add(TranslationCache(
            source_hash=h,
            source_lang=sl,
            target_lang=target_lang,
            source_text=text[:2000],
            translated_text=translated,
        ))
        return translated
    return None


async def translate_obj_fields(
    db: AsyncSession,
    objs: Sequence,
    fields: Sequence[str],
    target_lang: str | None,
) -> None:
    """CMS 公开内容按显示语言翻译：就地翻译对象列表的指定文本字段。

    仅供公开内容接口使用，必须传入 Pydantic Out 模型副本（禁止传 ORM 实体，
    否则译文会随 get_db 的统一 commit 污染源数据表）。

    行为：
    - 目标语言为空 / 归一化后不支持：整体跳过（返回原文）
    - 原文检测语言与目标语言相同：保留原文
    - 译文缓存命中直接采用；未命中并行走外部接口（gtx → MyMemory），失败回退原文
    - 任何异常不外抛，绝不阻塞内容接口
    """
    if not target_lang:
        return
    # 边界校验：仅接受前端 6 种界面语言（统一小写，大小写不敏感兼容旧调用方）
    if target_lang.lower() not in UI_LANGS:
        return
    tl = normalize_lang(target_lang)
    if tl not in SUPPORTED_LANGS:
        return

    # 收集待翻译字段
    targets: list[tuple[object, str, str]] = []
    for obj in objs:
        for field in fields:
            text = getattr(obj, field, None)
            if isinstance(text, str) and text.strip():
                targets.append((obj, field, text))
    if not targets:
        return

    # 第一阶段：串行查缓存（AsyncSession 不允许并发操作）
    misses: list[tuple[object, str, str]] = []
    for obj, field, text in targets:
        sl = normalize_lang(detect_lang(text))
        if sl == tl:
            continue  # 原文即目标语言，保留原文
        h = hashlib.sha256(text.encode("utf-8")).hexdigest()
        # 缓存表无唯一约束，并发未命中可能产生重复行：取最新一条，避免 MultipleResultsFound
        row = (
            await db.execute(
                select(TranslationCache).where(
                    TranslationCache.source_hash == h,
                    TranslationCache.source_lang == sl,
                    TranslationCache.target_lang == tl,
                ).order_by(TranslationCache.id.desc()).limit(1)
            )
        ).scalar_one_or_none()
        if row:
            setattr(obj, field, row.translated_text)
        else:
            misses.append((obj, field, text))

    # 第二阶段：未命中字段并行走外部接口（纯 HTTP，不触碰 session）；
    # 同一文本只调用一次（如 title 与 content 相同的场景），避免重复外部请求与重复缓存行
    unique_texts: list[str] = []
    text_to_targets: dict[str, list[tuple[object, str]]] = {}
    for obj, field, text in misses:
        if text not in text_to_targets:
            text_to_targets[text] = []
            unique_texts.append(text)
        text_to_targets[text].append((obj, field))

    async def _external(text: str) -> str | None:
        sl = normalize_lang(detect_lang(text))
        try:
            translated = await _translate_google(text, tl)
        except Exception as e:
            logger.warning("Google 翻译失败，改用 MyMemory：%s", e.__class__.__name__)
            try:
                translated = await _translate_mymemory(text, sl, tl)
            except Exception as e2:
                logger.warning("MyMemory 翻译失败，返回原文：%s", e2.__class__.__name__)
                return None
        if translated and translated.strip() and translated.strip() != text.strip():
            db.add(TranslationCache(
                source_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
                source_lang=sl,
                target_lang=tl,
                source_text=text[:2000],
                translated_text=translated,
            ))
            return translated
        return None

    results = await asyncio.gather(*(_external(t) for t in unique_texts))
    for text, translated in zip(unique_texts, results):
        if translated:
            for obj, field in text_to_targets[text]:
                setattr(obj, field, translated)
