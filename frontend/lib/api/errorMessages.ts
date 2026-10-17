/**
 * API 错误 → 用户可读文案（与后端 core/exceptions.py + core/validation_errors.py 对齐）
 *
 * 展示优先级：
 *   1. message.params.detail —— 后端写好的具体原因（BizException reason / HTTPException detail）
 *   2. 1001 校验失败 —— data.errors[0]：自定义 message > 「字段名 + 原因」翻译
 *   3. message.key —— 通用错误码文案（error.not_found 等）
 *   4. 兜底「请求失败，请稍后重试」——**永远不把 i18n key 或原始报错裸露给用户**
 *
 * 这里不是 React 组件（apiFetch 在任何地方都可能抛错），字典由 I18nProvider
 * 挂载时通过 setErrorMessages 注入；SSR / 未挂载 Provider 时走内置中文兜底。
 * 本文件不能带 "use client"：lib/api/client.ts 同时被 RSC 引用。
 */

import type { I18nMsg } from "@/types/response";
import { BizCode, getI18nKey, getI18nParams } from "@/types/response";

/** 字段错误原因（与后端 FieldReason 枚举一一对应） */
export type FieldReason =
  | "required"
  | "too_short"
  | "too_long"
  | "invalid_format"
  | "invalid_type"
  | "out_of_range"
  | "invalid_choice"
  | "malformed_body"
  | "invalid";

/** 1001 校验失败时 data.errors 的元素 */
export interface FieldError {
  /** 字段路径（已去掉 body/query/path 前缀），如 "receipt_code"、"items.0.name"；模型级错误为 "" */
  field: string;
  reason: FieldReason;
  params?: { min?: number; max?: number };
  /** 业务 validator 写好的中文原因；存在时直接展示 */
  message?: string;
}

type Dict = Record<string, unknown>;

let activeMessages: Dict | null = null;

/** I18nProvider 注入当前语言字典（多 Provider 时以最后挂载者为准，同页 locale 一致） */
export function setErrorMessages(messages: unknown): void {
  activeMessages = messages && typeof messages === "object" ? (messages as Dict) : null;
}

/** SSR / Provider 未挂载时的最小兜底（与 zh-cn.json error.validation.* 同义） */
const FALLBACK: Record<string, string> = {
  "error.validation.generic": "提交的内容有误：{reason}",
  "error.validation.withField": "{field}{reason}",
  "error.validation.network": "网络错误，无法连接到服务器",
  "error.validation.fallback": "请求失败，请稍后重试",
  "error.validation.requestId": "（错误编号：{id}）",
  "error.validation.reason.invalid": "取值无效",
};

function interpolate(text: string, vars?: Record<string, unknown>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    vars[name] === undefined || vars[name] === null ? m : String(vars[name]),
  );
}

/** 查字典；缺失返回 null（调用方决定兜底，绝不回传 key 本身） */
function tr(key: string, vars?: Record<string, unknown>): string | null {
  let node: unknown = activeMessages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Dict)) {
      node = (node as Dict)[part];
    } else {
      node = undefined;
      break;
    }
  }
  const text = typeof node === "string" && node ? node : FALLBACK[key];
  return text ? interpolate(text, vars) : null;
}

/** 通用兜底文案「请求失败，请稍后重试」（已本地化） */
export function fallbackText(): string {
  return tr("error.validation.fallback") ?? "请求失败，请稍后重试";
}

export function networkErrorText(): string {
  return tr("error.validation.network") ?? fallbackText();
}

/** 5xx 附加错误编号，便于用户反馈时定位日志 */
export function withRequestId(message: string, status: number, requestId: string | null): string {
  if (status < 500 || !requestId) return message;
  return message + (tr("error.validation.requestId", { id: requestId.slice(0, 12) }) ?? "");
}

/** 只要原因、不带字段名（字段下方行内提示用，标签已在旁边）：「格式不正确」「长度不能少于 8」 */
export function formatFieldReason(err: FieldError): string {
  if (err.message) return err.message;
  return (
    tr(`error.validation.reason.${err.reason}`, err.params) ??
    tr("error.validation.reason.invalid")!
  );
}

/** 单条字段错误 → 文案，如「回执码格式不正确」「密码长度不能少于 8」 */
export function formatFieldError(err: FieldError): string {
  if (err.message) return err.message;
  const reason = formatFieldReason(err);
  // 字段路径取末段查标签：items.0.name → name；数字下标跳过
  const leaf = err.field.split(".").filter((p) => !/^\d+$/.test(p)).pop();
  const label = leaf ? tr(`error.validation.field.${leaf}`) : null;
  return label
    ? tr("error.validation.withField", { field: label, reason })!
    : tr("error.validation.generic", { reason })!;
}

/** 从 1001 响应的 data 中安全取出字段错误（形态不符一律丢弃） */
export function extractFieldErrors(data: unknown): FieldError[] {
  const list = (data as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is FieldError =>
      !!e && typeof e === "object" &&
      typeof (e as FieldError).field === "string" &&
      typeof (e as FieldError).reason === "string",
  );
}

/** 新壳错误 → 展示文案（不含错误编号，见 withRequestId） */
export function formatEnvelopeError(
  code: number,
  message: I18nMsg,
  fieldErrors: FieldError[],
): string {
  if (typeof message === "string" && message) return message;
  const detail = getI18nParams(message)?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (code === BizCode.ValidationFailed && fieldErrors.length > 0) {
    return formatFieldError(fieldErrors[0]);
  }
  const key = getI18nKey(message);
  return (key && tr(key, getI18nParams(message) ?? undefined)) || fallbackText();
}
