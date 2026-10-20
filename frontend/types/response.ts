/**
 * 统一业务响应壳类型（与后端 app/core/responses.py 一一对应）
 *
 * 响应体格式：
 *   {
 *     code:        number,                    // 0=成功；>0=业务错误码
 *     message:     "" | string  | { key, params? },  // 成功空字符串；错误为 i18n 协议；仅展示，禁止参与业务判断
 *     data:        T | null,                  // 业务载荷
 *     request_id:  string,                    // 与响应头 X-Request-Id / X-Trace-Id 同值
 *   }
 *
 * 过渡期（`dual` 模式）：旧接口仍返回 `{detail, trace_id}`，apiFetch 双轨解析。
 */

/** i18n 消息协议：开发期是字符串 fallback，生产期是 {key, params} */
export type I18nMsg = string | { key: string; params?: Record<string, unknown> };

/** 统一业务响应 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: I18nMsg;
  data: T | null;
  request_id: string;
}

/** 业务错误码常量（与后端 BizCode 同步） */
export const BizCode = {
  Ok: 0,
  ValidationFailed: 1001,
  Unauthorized: 1002,
  Forbidden: 1003,
  NotFound: 1004,
  Conflict: 1005,
  BannedIp: 1006,
  RateLimited: 1007,
  CsrfFailed: 1008,
  PayloadTooLarge: 1009,
  BadRequest: 1010,
  UnsupportedMediaType: 1011,
  AccountLocked: 1012,
  LoginBlocked: 1013,
  SystemNotInitialized: 1014,
  Login2faSendFailed: 1015,
  InternalError: 5000,
  UpstreamFailure: 5001,
  Maintenance: 5002,
} as const;

export type BizCodeType = (typeof BizCode)[keyof typeof BizCode];

/** 业务码 → 通用错误文案 i18n key（与后端 bizcode._BIZCODE_REGISTRY 同步，契约测试校验） */
export const BizCodeMessageKey: Record<number, string> = {
  1001: "error.validation_failed",
  1002: "error.unauthorized",
  1003: "error.forbidden",
  1004: "error.not_found",
  1005: "error.conflict",
  1006: "error.banned_ip",
  1007: "error.rate_limited",
  1008: "error.csrf_failed",
  1009: "error.payload_too_large",
  1010: "error.bad_request",
  1011: "error.unsupported_media_type",
  1012: "error.account_locked",
  1013: "error.login_blocked",
  1014: "error.system_not_initialized",
  1015: "error.login_2fa_send_failed",
  5000: "error.internal",
  5001: "error.upstream_failure",
  5002: "error.maintenance",
};

/** 判定一个对象是否符合新壳形态（apiFetch 用） */
export function isApiResponse(value: unknown): value is ApiResponse {
  return (
    !!value &&
    typeof value === "object" &&
    "code" in (value as Record<string, unknown>) &&
    "data" in (value as Record<string, unknown>)
  );
}

/** 从 I18nMsg 抽出 i18n key（字符串协议下返回 null） */
export function getI18nKey(message: I18nMsg): string | null {
  if (typeof message === "string") return null;
  return message?.key ?? null;
}

export function getI18nParams(message: I18nMsg): Record<string, unknown> | null {
  if (typeof message === "string") return null;
  return message?.params ?? null;
}