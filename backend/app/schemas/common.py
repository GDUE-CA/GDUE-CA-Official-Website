"""通用 Pydantic 类型。

时区约束（Tier-0）：后端一律存储 UTC，API 输出统一为带大写 `Z` 的
ISO-8601 字符串；后端不做任何本地化转换，时间格式化全部由前端完成。
"""
import re
import unicodedata
from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, BaseModel, PlainSerializer


def _utc_z(dt: datetime) -> str:
    """naive 视为 UTC（SQLite 存储无时区标记），统一输出大写 Z 后缀。"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (
        dt.astimezone(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


UTCDatetime = Annotated[datetime, PlainSerializer(_utc_z, return_type=str)]


def _to_naive_utc(v: datetime) -> datetime:
    """输入时间统一转 naive UTC 存储：带时区 → 先转 UTC 再去 tzinfo；naive 视为 UTC。

    SQLite 存储无时区标记，aware/naive 混存会导致 SQL 比较与 Python 比较
    （now 与列值）抛 TypeError；所有 Create/Update 的时间字段必须用本类型。
    """
    if v.tzinfo is not None:
        v = v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


# 输入用：Create/Update 模型的时间字段（输出仍用 UTCDatetime 序列化 Z 后缀）
UTCNaive = Annotated[datetime, AfterValidator(_to_naive_utc)]


class SubmitReceiptOut(BaseModel):
    """公开表单提交成功的回执（GB/T 35274 最小化：不回传手机号 / 邮箱 / 提交 IP 等个人信息）。"""
    receipt_code: str
    submitted_at: UTCDatetime


# ---------- 输入过滤（纵深防御：前端 React 默认转义输出，后端在入口再做一层清洗） ----------
# C0/C1 控制字符（保留 \t \n），以及零宽 / 双向覆盖字符（可用于伪装内容）
_CTRL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]")
# 单行纯文本字段禁止出现的 HTML 标签 / 实体 / 脚本协议
_HTML_META_RE = re.compile(r"[<>]|&#|&[a-z]+;|javascript:|vbscript:|data:text/html", re.IGNORECASE)


def _clean(v: str) -> str:
    return _CTRL_RE.sub("", unicodedata.normalize("NFC", v)).strip()


def _plain_text(v: str) -> str:
    """单行纯文本：去控制字符 + 换行，拒绝 HTML 元字符。"""
    v = _clean(v).replace("\n", " ").replace("\t", " ")
    if _HTML_META_RE.search(v):
        raise ValueError("不能包含 < > 等 HTML 特殊字符或脚本内容")
    return v


def clean_multiline_text(v: str) -> str:
    """多行自由文本：去控制字符，统一换行；展示时由前端转义，不做 HTML 渲染。"""
    return _clean(v.replace("\r\n", "\n").replace("\r", "\n"))


_SAFE_URL_RE = re.compile(r"^(https?://[^\s<>\"'`]+|/[^\s<>\"'`]*)$", re.IGNORECASE)


def _safe_url(v: str) -> str:
    """URL 字段：只允许 http(s) 绝对地址或站内相对路径，拒绝 javascript: / data: 等协议。"""
    v = _clean(v)
    if v and (not _SAFE_URL_RE.match(v) or v.startswith("//")):
        raise ValueError("仅支持 http(s):// 开头的地址或以 / 开头的站内路径")
    return v


PlainText = Annotated[str, AfterValidator(_plain_text)]
MultilineText = Annotated[str, AfterValidator(clean_multiline_text)]
SafeUrl = Annotated[str, AfterValidator(_safe_url)]

# 宽松邮箱：仅校验 local@domain 基本形状（local ≤64 / domain ≤255）
# email-validator 的 EmailStr 会拒绝 RFC special-use 保留域（club.local / .dev / .test），
# 曾导致管理员占位账号响应序列化 500、无法创建/登录；占位域由管理员自行保证可用性。
_LOOSE_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}$")


def _loose_email(v: str) -> str:
    v = _clean(v).lower()
    if not _LOOSE_EMAIL_RE.match(v):
        raise ValueError("邮箱格式不正确")
    return v


LooseEmail = Annotated[str, AfterValidator(_loose_email)]
