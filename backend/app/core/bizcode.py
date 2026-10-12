"""业务错误码 + i18n key 注册表。

所有业务接口的 `code` 与 HTTP 状态码绑定关系集中维护在此：
- 前端通过 `code` 字段做精细分支（不依赖 HTTP 状态码）；
- i18n 模块接管后，前端通过 `message.key` 在数据库里查翻译；现阶段后端只携带
  i18n key + params，前端 fallback 到 messages 字典（dev 期）或 key 字符串；
- 后端**绝不**在错误响应里硬编码中文字符串文案，符合"API 报错优先返回 i18n key"。

错误码分层：
- 0      = 成功
- 1xxx   = 客户端错误（与 HTTP 4xx 同向）
- 2xxx   = 业务错误（具体模块自定义，按业务前缀划分；本文件不预置）
- 5xxx   = 服务端错误
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Any


class BizCode(IntEnum):
    # 0 = 成功（保留位；本枚举本身不包含 OK，避免双轨错误）
    VALIDATION_FAILED = 1001
    UNAUTHORIZED = 1002
    FORBIDDEN = 1003
    NOT_FOUND = 1004
    CONFLICT = 1005
    BANNED_IP = 1006
    RATE_LIMITED = 1007
    CSRF_FAILED = 1008
    PAYLOAD_TOO_LARGE = 1009
    BAD_REQUEST = 1010
    UNSUPPORTED_MEDIA_TYPE = 1011
    ACCOUNT_LOCKED = 1012
    # 登录被拒（统一对外文案「用户名或密码错误」，防信息泄露；真实原因仅入审计日志）：
    # 密码错误 / 防爆破封禁 / 应急账号停用 / 应急账号外网拒绝 / 账号不存在
    LOGIN_BLOCKED = 1013
    # 系统尚未完成初始化向导（system_initialized=false），普通账号禁止登录
    SYSTEM_NOT_INITIALIZED = 1014

    INTERNAL_ERROR = 5000
    UPSTREAM_FAILURE = 5001
    MAINTENANCE = 5002


@dataclass(frozen=True)
class BizCodeMeta:
    """单条错误码登记：HTTP 状态 + i18n key + dev 期 fallback 中文文案。"""

    http_status: int
    i18n_key: str
    fallback_zh: str


# 全量错误码登记（单一来源，便于未来 codegen 给前端同步）
_BIZCODE_REGISTRY: dict[int, BizCodeMeta] = {
    BizCode.VALIDATION_FAILED: BizCodeMeta(
        http_status=422, i18n_key="error.validation_failed", fallback_zh="请求参数校验失败"
    ),
    BizCode.UNAUTHORIZED: BizCodeMeta(
        http_status=401, i18n_key="error.unauthorized", fallback_zh="请先登录"
    ),
    BizCode.FORBIDDEN: BizCodeMeta(
        http_status=403, i18n_key="error.forbidden", fallback_zh="权限不足"
    ),
    BizCode.NOT_FOUND: BizCodeMeta(
        http_status=404, i18n_key="error.not_found", fallback_zh="资源不存在"
    ),
    BizCode.CONFLICT: BizCodeMeta(
        http_status=409, i18n_key="error.conflict", fallback_zh="资源冲突"
    ),
    BizCode.BANNED_IP: BizCodeMeta(
        http_status=403, i18n_key="error.banned_ip", fallback_zh="当前 IP 已被加入黑名单"
    ),
    BizCode.RATE_LIMITED: BizCodeMeta(
        http_status=429, i18n_key="error.rate_limited", fallback_zh="请求过于频繁，请稍后重试"
    ),
    BizCode.CSRF_FAILED: BizCodeMeta(
        http_status=403, i18n_key="error.csrf_failed", fallback_zh="CSRF 校验失败，请刷新页面后重试"
    ),
    BizCode.PAYLOAD_TOO_LARGE: BizCodeMeta(
        http_status=413, i18n_key="error.payload_too_large", fallback_zh="请求体过大"
    ),
    BizCode.BAD_REQUEST: BizCodeMeta(
        http_status=400, i18n_key="error.bad_request", fallback_zh="请求无效"
    ),
    BizCode.UNSUPPORTED_MEDIA_TYPE: BizCodeMeta(
        http_status=415, i18n_key="error.unsupported_media_type", fallback_zh="不支持的文件类型"
    ),
    BizCode.ACCOUNT_LOCKED: BizCodeMeta(
        http_status=423, i18n_key="error.account_locked", fallback_zh="账号已锁定，请稍后再试"
    ),
    BizCode.LOGIN_BLOCKED: BizCodeMeta(
        http_status=401, i18n_key="error.login_blocked", fallback_zh="用户名或密码错误"
    ),
    BizCode.SYSTEM_NOT_INITIALIZED: BizCodeMeta(
        http_status=403, i18n_key="error.system_not_initialized", fallback_zh="系统尚未完成初始化，请使用应急账号登录后台完成初始化向导"
    ),
    BizCode.INTERNAL_ERROR: BizCodeMeta(
        http_status=500, i18n_key="error.internal", fallback_zh="服务器内部错误，请稍后重试"
    ),
    BizCode.UPSTREAM_FAILURE: BizCodeMeta(
        http_status=502, i18n_key="error.upstream_failure", fallback_zh="上游服务异常"
    ),
    BizCode.MAINTENANCE: BizCodeMeta(
        http_status=503, i18n_key="error.maintenance", fallback_zh="系统维护中"
    ),
}


def get_meta(code: int) -> BizCodeMeta:
    """查一条错误码的登记；未知 code 兜底为 INTERNAL_ERROR（500）。"""
    return _BIZCODE_REGISTRY.get(code) or _BIZCODE_REGISTRY[BizCode.INTERNAL_ERROR]


def to_i18n_msg(code: int, **params: Any) -> dict:
    """生成统一响应壳里的 message 字段：`{key, params}`。

    生产期前端按当前语言查翻译；dev 期前端用 `fallback_zh` 作为可见 fallback。
    """
    meta = get_meta(code)
    payload: dict[str, Any] = {"key": meta.i18n_key}
    if params:
        payload["params"] = params
    return payload


def http_status_for(code: int) -> int:
    return get_meta(code).http_status