/**
 * API 客户端公共层
 *
 * 统一处理：
 * - baseURL（浏览器默认同源 /api，由 Next.js rewrites 反代到后端）
 * - JSON 序列化/反序列化
 * - 错误信息提取（双轨：新壳 ApiResponse<T> 与旧壳 {detail, trace_id}）
 * - 登录态：后端下发 HttpOnly Cookie，前端脚本不接触 token（防 XSS 窃取）
 * - CSRF：写请求自动附加 X-CSRF-Token 头（双重提交令牌）
 *
 * 各 lib/api/* 业务模块基于 apiFetch 实现具体接口调用。
 */

import type { ApiResponse, BizCodeType } from "@/types/response";
import { BizCode, getI18nKey, getI18nParams, isApiResponse } from "@/types/response";
import {
  encodeApiErrorDigest,
  extractFieldErrors,
  formatEnvelopeError,
  networkErrorText,
  withRequestId,
  type FieldError,
} from "@/lib/api/errorMessages";
import { syncServerTime } from "@/lib/serverTime";
import { locales, isLocale } from "@/lib/i18n";

/**
 * 后端 API 基础地址
 *
 * 优先级：NEXT_PUBLIC_API_BASE_URL 环境变量 > 默认值
 * - 客户端（浏览器）：默认空串 = 同源请求 /api/*，由 next.config.ts rewrites 转发到后端，
 *   局域网 IP / 域名访问都无需跨域，Cookie 为第一方 Cookie
 * - 服务端（RSC/SSR）：直连后端 BACKEND_URL（默认 http://127.0.0.1:8000）
 */
// 用 || 而非 ??：.env 中写成空值（VAR=）时视同未设置
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (typeof window !== "undefined"
    ? ""
    : process.env.BACKEND_URL || "http://127.0.0.1:8000");

/**
 * 标准化后端错误响应。
 *
 * - 新壳错误（code !== 0）：`message` 一律是已本地化的人话（见 lib/api/errorMessages.ts），
 *   调用方直接 `err.message` 展示即可；需要定位表单项时用 `fieldErrors`
 * - 旧壳错误（HTTPException {detail, trace_id}）：保留兼容，按 detail 字段抽 message
 *
 * `traceId` 字段保留作为向后兼容别名，**推荐用 `requestId`** 与后端规范对齐。
 */
export class ApiError extends Error {
  status: number;
  detail: unknown;
  /** 业务码；新壳错误为 BizCode.*；旧壳错误为 BizCode.Ok(0) */
  code: BizCodeType;
  /** request_id（与后端响应体 request_id 字段、响应头 X-Request-Id、X-Trace-Id 同值） */
  requestId: string | null;
  /** 向后兼容旧调用：等价于 requestId（deprecated） */
  get traceId(): string | null {
    return this.requestId;
  }
  set traceId(v: string | null) {
    this.requestId = v;
  }
  /** i18n key（来自新壳 message.key）；非 i18n 协议时为 null */
  i18nKey: string | null;
  /** i18n params（来自新壳 message.params） */
  i18nParams: Record<string, unknown> | null;
  /** 1001 校验失败的字段级错误（其他错误为空数组） */
  fieldErrors: FieldError[];
  /**
   * 供 Next.js 错误页使用：服务端组件抛错时 message 会被抹掉，Next 会保留已有 digest，
   * 错误页据此解码出业务码与 request id（见 errorMessages.encodeApiErrorDigest）
   */
  digest: string;

  constructor(
    status: number,
    detail: unknown,
    message?: string,
    traceId: string | null = null,
  ) {
    super(message ?? (typeof detail === "string" ? detail : "API error"));
    this.status = status;
    this.detail = detail;
    this.requestId = traceId;
    this.code = BizCode.Ok;
    this.i18nKey = null;
    this.i18nParams = null;
    this.fieldErrors = [];
    this.digest = encodeApiErrorDigest(this.code, status, traceId);
  }

  /** 新壳错误工厂：根据 ApiResponse 构造带 i18n 协议的 ApiError */
  static fromEnvelope(
    status: number,
    env: ApiResponse<unknown>,
    requestId: string | null,
  ): ApiError {
    const err = new ApiError(status, env, undefined, env.request_id || requestId);
    err.code = env.code as BizCodeType;
    err.i18nKey = getI18nKey(env.message);
    err.i18nParams = getI18nParams(env.message);
    err.fieldErrors =
      env.code === BizCode.ValidationFailed ? extractFieldErrors(env.data) : [];
    err.message = withRequestId(
      formatEnvelopeError(env.code, env.message, err.fieldErrors),
      status,
      err.requestId,
    );
    err.digest = encodeApiErrorDigest(err.code, status, err.requestId);
    return err;
  }
}

/* ---------- CSRF 令牌 ---------- */

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let csrfToken: string | null = null;
let csrfPending: Promise<string> | null = null;

/** 登录成功后后端会轮换令牌，由调用方写回 */
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

/** 获取 CSRF 令牌（内存缓存，首次请求 GET /api/auth/csrf） */
export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (csrfToken && !forceRefresh) return csrfToken;
  if (!csrfPending) {
    csrfPending = fetch(`${API_BASE_URL}/api/auth/csrf`, { credentials: "include" })
      .then((res) => res.json() as Promise<{ csrf_token: string }>)
      .then((data) => {
        csrfToken = data.csrf_token;
        return csrfToken;
      })
      .finally(() => {
        csrfPending = null;
      });
  }
  return csrfPending;
}

/** 旧壳 / 非壳错误（如网关 502 HTML）：只认字符串 detail，其余一律兜底文案（不外泄原始报错） */
function extractDetail(data: unknown): string | null {
  if (typeof data === "string") return null;
  const detail = (data as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" && detail ? detail : null;
}

/** 非壳错误的 HTTP 状态 → 通用错误文案 key 后缀（与后端 _STATUS_TO_BIZ 同向） */
function httpStatusKey(status: number): string {
  const map: Record<number, string> = {
    400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found",
    409: "conflict", 413: "payload_too_large", 415: "unsupported_media_type",
    422: "validation_failed", 423: "account_locked", 429: "rate_limited",
    502: "upstream_failure", 503: "maintenance",
  };
  return map[status] ?? (status >= 500 ? "internal" : "bad_request");
}

function isCsrfFailure(status: number, data: unknown): boolean {
  // 新壳 code === 1008 或旧壳 code === "csrf_failed" 都识别
  if (status !== 403) return false;
  if (isApiResponse(data)) return data.code === BizCode.CsrfFailed;
  return (
    !!data &&
    typeof data === "object" &&
    (data as { code?: unknown }).code === "csrf_failed"
  );
}

/**
 * 从浏览器 URL 路径解析当前 locale（仅客户端可用）。
 *
 * 规范 §localization：URL 路径 /{locale}/... 的第一段即当前 UI 语言；
 * 后端 resolve_localization 读取 X-Locale 头感知匿名访客的 URL-locale。
 * 服务端渲染（RSC/SSR）无 window 对象，返回 null（后端回退 sys_default）。
 */
function getCurrentUrlLocale(): string | null {
  if (typeof window === "undefined") return null;
  const segments = window.location.pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (first && isLocale(first)) return first;
  // 兼容大小写不一致的旧链接
  const lower = first?.toLowerCase() ?? "";
  return (locales as readonly string[]).includes(lower) ? lower : null;
}

/**
 * 发送带登录态（Cookie）与 CSRF 头的请求；CSRF 令牌过期时自动刷新重试一次。
 * FormData 等非 JSON 请求也走这里（不设置 Content-Type）。
 *
 * 规范 §localization：自动注入 X-Locale 头，让后端感知当前 URL-locale
 * （仅控制 UI 翻译语言，不影响日期/货币/数字格式化）。
 */
export async function secureFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const send = async (refresh: boolean) => {
    const headers = new Headers(init.headers);
    if (UNSAFE_METHODS.has(method)) {
      headers.set("X-CSRF-Token", await getCsrfToken(refresh));
    }
    // 注入当前 URL-locale，供后端 resolve_localization 读取
    const urlLocale = getCurrentUrlLocale();
    if (urlLocale && !headers.has("X-Locale")) {
      headers.set("X-Locale", urlLocale);
    }
    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      method,
      headers,
      credentials: "include",
    });
  };

  let res = await send(false);
  if (res.status === 403 && UNSAFE_METHODS.has(method)) {
    const data: unknown = await res.clone().json().catch(() => null);
    if (isCsrfFailure(res.status, data)) res = await send(true);
  }
  // 规范 §9：每次 API 响应读取标准 Date 头（服务器时间），校准本地时钟偏移量
  syncServerTime(res.headers.get("Date"));
  return res;
}

/** 核心请求函数（双轨解析）：
 * - 新壳 `{code, message, data, request_id}`：code === 0 时取 data；code !== 0 时抛 ApiError.fromEnvelope
 * - 旧壳：维持原行为，detail 解析文本 + trace_id
 *
 * `withAuth` 保留兼容（登录态 Cookie 总是随请求携带）
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit & { withAuth?: boolean } = {}
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { withAuth: _withAuth, headers, ...rest } = options;

  // FormData 的 Content-Type 必须由浏览器自行生成（含 multipart 边界），
  // 显式写死 application/json 会让后端 multipart 解析失败。
  const isFormData =
    typeof FormData !== "undefined" && rest.body instanceof FormData;

  const finalHeaders: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(headers as Record<string, string>),
  };

  let res: Response;
  try {
    res = await secureFetch(path, { ...rest, headers: finalHeaders });
  } catch {
    throw new ApiError(0, null, networkErrorText());
  }

  // 尝试解析响应体（兼容新旧壳）
  let body: unknown = null;
  if (res.status !== 204) {
    const text = await res.text().catch(() => "");
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // 非 JSON；忽略 body
        body = null;
      }
    }
  }

  // 错误响应：双轨处理
  if (!res.ok) {
    const requestId = res.headers.get("X-Request-Id") || res.headers.get("X-Trace-Id");
    if (isApiResponse(body)) {
      throw ApiError.fromEnvelope(res.status, body, requestId);
    }
    // 旧壳 / 非壳：只透出字符串 detail，否则按 HTTP 状态走通用文案
    const message =
      extractDetail(body) ??
      formatEnvelopeError(0, { key: `error.${httpStatusKey(res.status)}` }, []);
    throw new ApiError(res.status, body, withRequestId(message, res.status, requestId), requestId);
  }

  // 成功响应：新壳取 data，旧壳取整体
  if (isApiResponse(body)) {
    if (body.code !== BizCode.Ok) {
      // 业务码非零但 HTTP 200（理论不应出现，兜底）
      const requestId =
        res.headers.get("X-Request-Id") || res.headers.get("X-Trace-Id");
      throw ApiError.fromEnvelope(res.status, body, requestId);
    }
    return body.data as T;
  }

  // 旧壳 / 非壳（裸 list / 标量）直接返回
  return (body ?? null) as T;
}
