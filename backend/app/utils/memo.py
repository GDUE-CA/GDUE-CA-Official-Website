"""Memo 模块工具：标签 slug 派生、Markdown 渲染、标签懒创建、版本号、分享 slug、防灌水限流。"""
from __future__ import annotations

import io
import re
import secrets
import time
import unicodedata
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Iterable

import nh3
from markdown_it import MarkdownIt
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AuditLog,
    MediaCategory,
    MediaFile,
    Memo,
    MemoAttachment,
    MemoVersion,
    Tag,
    TagScope,
    User,
)


# ---------- Markdown 渲染 ----------
_md = MarkdownIt().enable(["table", "strikethrough"])

# nh3 白名单：与 blog 一致；Memo 允许更轻量的属性集
_NH3_TAGS = {
    "a", "b", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4",
    "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre",
    "q", "s", "span", "strong", "sub", "sup", "table", "tbody", "td", "th",
    "thead", "tr", "u", "ul", "div", "figure", "figcaption", "caption",
}
_NH3_ATTRS = {
    "a": {"href", "title", "target"},
    "code": {"class"},
    "div": {"class"},
    "img": {"src", "alt", "title", "width", "height", "loading"},
    "pre": {"class"},
    "span": {"class"},
    "td": {"align"},
    "th": {"align"},
}


def render_html(md_text: str) -> str:
    """Markdown → HTML，原始 HTML 经 nh3 消毒，剔除脚本与事件属性。"""
    return nh3.clean(
        _md.render(md_text),
        tags=_NH3_TAGS,
        attributes=_NH3_ATTRS,
        url_schemes={"http", "https", "mailto"},
    )


# ---------- 标签 slug 派生 ----------
# 保留中文 / 英文 / 数字 / 连字符 / 下划线；其他字符替换为连字符；连续连字符折叠
_TAG_SLUG_RE = re.compile(r"[^\w\-\u4e00-\u9fff]+", re.UNICODE)


def slugify_tag(name: str) -> str:
    """派生标签 slug：小写化 + 仅保留字母数字 / 连字符 / 下划线 / 中文。

    输入 '前端笔记' → '前端笔记'
    输入 'My Tag!' → 'my-tag'
    输入 'C++/Java' → 'c-java'
    """
    n = unicodedata.normalize("NFKC", name).strip().lower()
    n = _TAG_SLUG_RE.sub("-", n).strip("-")
    return n or "tag"


# ---------- 从正文提取 #TagName（仅供编辑器预览 / 推荐；最终以 tag_names 字段为准） ----------
_INLINE_TAG_RE = re.compile(r"#([\w\u4e00-\u9fff][\w\-/\u4e00-\u9fff]{0,63})(?![/\w\-])")


def extract_inline_tags(md_text: str) -> list[str]:
    """提取 Markdown 正文中的 #TagName（去重 + 保持原大小写顺序）。

    不作为权威数据源；编辑器提交时按用户实际选定的 tag_names 持久化。
    """
    seen: set[str] = set()
    out: list[str] = []
    for m in _INLINE_TAG_RE.finditer(md_text or ""):
        name = m.group(1)
        if name and name not in seen:
            seen.add(name)
            out.append(name)
    return out


# ---------- 时间 ----------
def naive_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------- 标签懒创建 ----------
async def upsert_tags(db: AsyncSession, names: Iterable[str]) -> tuple[list[Tag], list[str]]:
    """按 name 集合懒创建 tags：已存在复用，scopes 追加 MEMO；返回 (全部 Tag, 本次新创建 name)。

    - 通过 name 一次性查询已存在；name 不重复（应用层去重）。
    - 新建时同时计算 slug；冲突时附加短随机后缀。
    """
    name_list = [n for n in names if n]
    if not name_list:
        return [], []

    existing_rows = (await db.execute(
        select(Tag).where(Tag.name.in_(name_list), Tag.deleted_at.is_(None))
    )).scalars().all()
    by_name = {t.name: t for t in existing_rows}

    new_names: list[str] = []
    new_tags: list[Tag] = []
    all_tags: list[Tag] = list(existing_rows)

    for name in name_list:
        if name in by_name:
            t = by_name[name]
            if TagScope.MEMO.value not in t.scopes:
                t.scopes = sorted(set(t.scopes) | {TagScope.MEMO.value})
                t.updated_at = naive_utc_now()
            continue
        slug = slugify_tag(name)
        # 同名 slug 已存在时附加短随机后缀（理论上 name 唯一已能避免）
        slug_exists = (await db.execute(
            select(Tag.id).where(Tag.slug == slug)
        )).scalar_one_or_none()
        if slug_exists:
            slug = f"{slug}-{secrets.token_hex(3)}"
        t = Tag(name=name, slug=slug, scopes=[TagScope.MEMO.value])
        db.add(t)
        new_tags.append(t)
        new_names.append(name)

    if new_tags:
        await db.flush()
        all_tags.extend(new_tags)

    return all_tags, new_names


# ---------- Memo 摘要 ----------
def excerpt_of(content_md: str, max_len: int = 280) -> str:
    """从 Markdown 派生摘要：去首行 # 标题、合并空白、裁切到 max_len。"""
    if not content_md:
        return ""
    # 跳过开头的 H1 标题
    lines = []
    seen_h1 = False
    for ln in (content_md or "").splitlines():
        if not seen_h1 and ln.lstrip().startswith("# "):
            seen_h1 = True
            continue
        lines.append(ln)
    text = " ".join(" ".join(lines).split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


# ---------- 下一个版本号 ----------
async def next_version_no(db: AsyncSession, memo_id: int) -> int:
    """同 memo 内递增版本号；返回 1 表示首版。"""
    cur = (await db.execute(
        select(func.coalesce(func.max(MemoVersion.version_no), 0)).where(
            MemoVersion.memo_id == memo_id
        )
    )).scalar_one()
    return int(cur) + 1


# ---------- 公开分享 slug ----------
def gen_share_slug() -> str:
    """16 位 URL-safe 随机串；不可枚举。"""
    return secrets.token_urlsafe(12)


# ---------- 防灌水限流（创建/编辑） ----------
# 每 IP 每分钟最多 10 次；内存滑动窗口，重启即清零
_MEMO_RATE_LIMIT = 10
_MEMO_RATE_WINDOW = 60.0
_memo_rate: dict[str, deque[float]] = defaultdict(deque)


def check_memo_rate(ip: str | None) -> None:
    """创建/编辑 Memo 防刷：内存滑动窗口；超限由调用方决定如何返回（4xx）。

    返回 None 表示通过；返回 int 表示剩余冷却秒数。
    """
    if not ip:
        return None
    now = time.monotonic()
    if len(_memo_rate) > 10000:
        # 兜底清理防内存膨胀
        stale = [k for k, v in _memo_rate.items()
                 if not v or now - v[-1] > _MEMO_RATE_WINDOW]
        for k in stale:
            _memo_rate.pop(k, None)
    dq = _memo_rate[ip]
    while dq and now - dq[0] > _MEMO_RATE_WINDOW:
        dq.popleft()
    if len(dq) >= _MEMO_RATE_LIMIT:
        retry_after = max(1, int(_MEMO_RATE_WINDOW - (now - dq[0])))
        return retry_after
    dq.append(now)
    return None


# ---------- 图片嗅探 + 无损压缩 ----------
_IMG_SNIFF_JPEG = b"\xff\xd8\xff"
_IMG_SNIFF_PNG = b"\x89PNG\r\n\x1a\n"
_IMG_SNIFF_WEBP = (b"RIFF", b"WEBP")


def sniff_image(data: bytes) -> str | None:
    """按文件头识别图片类型；返回 'JPEG' / 'PNG' / 'WEBP'，其它返回 None。"""
    if data.startswith(_IMG_SNIFF_JPEG):
        return "JPEG"
    if data.startswith(_IMG_SNIFF_PNG):
        return "PNG"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"
    return None


def compress_lossless_80(data: bytes, fmt: str) -> tuple[bytes, str, str]:
    """复用 blog 模块的策略：仅无损压缩，目标 ≤ 原体积 80%。"""
    img = Image.open(io.BytesIO(data))
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.save(buf, format="JPEG", quality="keep", optimize=True)
        return buf.getvalue(), ".jpg", "image/jpeg"
    if fmt == "PNG":
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), ".png", "image/png"
    img.save(buf, format="WEBP", lossless=True)
    return buf.getvalue(), ".webp", "image/webp"


# ---------- 附件写入 ----------
async def create_memo_attachment(
    db: AsyncSession,
    memo: Memo,
    *,
    url: str,
    original_name: str | None,
    mime: str,
    size: int,
    kind: str,
) -> MemoAttachment:
    """为指定 memo 新增一条附件记录。"""
    a = MemoAttachment(
        memo_id=memo.id,
        url=url,
        original_name=(original_name or "")[:256] or None,
        mime=mime,
        size=size,
        kind=kind,
        tenant_id=1,
    )
    db.add(a)
    await db.flush()
    return a


# ---------- 媒体文件登记 ----------
async def record_media_file(
    db: AsyncSession,
    *,
    filename: str,
    original_name: str | None,
    mime: str,
    size: int,
    storage_path: str,
    uploader_id: int | None,
) -> MediaFile:
    """在 media_files 写一条记录（Memo 附件来源；与 blog 共用同一张表做统一管理）。"""
    m = MediaFile(
        filename=filename,
        original_name=(original_name or filename)[:256],
        mime=mime,
        size=size,
        storage_path=storage_path,
        uploader_id=uploader_id,
        category=MediaCategory.MISC,
    )
    db.add(m)
    await db.flush()
    return m


# ---------- 审计日志快捷封装 ----------
def log_memo(db: AsyncSession, uid: int | None, action: str, target: str | None,
             ip: str | None, detail: str | None = None) -> None:
    db.add(AuditLog(user_id=uid, action=action, target=target, ip=ip, detail=detail))


# ---------- 列表输出：填充 MemoBriefOut 派生字段 ----------
async def first_image_attachment(db: AsyncSession, memo_id: int) -> tuple[bool, str | None]:
    """返回 (has_image, first_image_url)；用于时间线卡片缩略图。"""
    row = (await db.execute(
        select(MemoAttachment.url).where(
            MemoAttachment.memo_id == memo_id,
            MemoAttachment.kind == "image",
            MemoAttachment.deleted_at.is_(None),
        ).order_by(MemoAttachment.id.asc()).limit(1)
    )).scalar_one_or_none()
    return (row is not None, row)


# ---------- 短随机 ID（路径中） ----------
def short_uuid_hex(n: int = 12) -> str:
    return uuid.uuid4().hex[:n]