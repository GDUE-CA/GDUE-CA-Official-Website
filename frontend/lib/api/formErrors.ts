/**
 * 后端 1001 字段错误 → 表单输入框（行内提示）
 *
 * 拆分规则：
 * - 能对上表单字段的错误 → 行内（只显示原因，如「格式不正确」，标签已在输入框旁）；
 * - 对不上的（模型级错误 field=""、表单里没有的字段、嵌套数组项…）→ 顶部横幅；
 * - 非 1001 错误（未登录、限流、500…）→ 原样走横幅（err.message 已本地化）。
 *
 * 字段名匹配顺序：fieldMap[后端路径] → 后端路径原样 → snake_case 转 camelCase；
 * 都不中时逐级退到父路径再试（cors_origins.2 → cors_origins）。
 * 例：student_id 自动匹配表单字段 studentId；contact_email → contact 需写进 fieldMap。
 */
import type { FieldValues, Path, UseFormGetValues, UseFormSetError } from "react-hook-form";
import { BizCode } from "@/types/response";
import { ApiError } from "@/lib/api/client";
import {
  fallbackText,
  formatFieldError,
  formatFieldReason,
  type FieldError,
} from "@/lib/api/errorMessages";

/** 后端字段路径 → 表单字段名 */
export type FieldMap = Record<string, string>;

export interface SplitServerErrors {
  /** 表单字段名 → 行内文案（每个字段只保留第一条） */
  inline: Record<string, string>;
  /** 顶部横幅文案；全部错误都已行内展示时为 null */
  banner: string | null;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function resolveField(
  fe: FieldError,
  isKnownField: (name: string) => boolean,
  fieldMap?: FieldMap,
): string | null {
  if (!fe.field) return null;
  // 逐级退到父路径：redirect_uris.0 → redirect_uris（列表某一项出错，标到整个输入框）
  const parts = fe.field.split(".");
  for (let n = parts.length; n > 0; n--) {
    const path = parts.slice(0, n).join(".");
    const candidates = [fieldMap?.[path], path, snakeToCamel(path)];
    const hit = candidates.find((c): c is string => !!c && isKnownField(c));
    if (hit) return hit;
  }
  return null;
}

export function splitServerErrors(
  err: unknown,
  isKnownField: (name: string) => boolean,
  options: { fieldMap?: FieldMap; fallback?: string } = {},
): SplitServerErrors {
  // 非 Error 抛出物（理论上不应出现）也要给用户一句话，绝不返回空
  const fallbackBanner =
    err instanceof Error && err.message ? err.message : options.fallback ?? fallbackText();
  if (
    !(err instanceof ApiError) ||
    err.code !== BizCode.ValidationFailed ||
    err.fieldErrors.length === 0
  ) {
    return { inline: {}, banner: fallbackBanner };
  }

  const inline: Record<string, string> = {};
  const unmapped: FieldError[] = [];
  for (const fe of err.fieldErrors) {
    const name = resolveField(fe, isKnownField, options.fieldMap);
    if (name === null) unmapped.push(fe);
    else inline[name] ??= formatFieldReason(fe);
  }
  return { inline, banner: unmapped.length > 0 ? formatFieldError(unmapped[0]) : null };
}

/**
 * react-hook-form 版：把可映射的错误写进 setError（并聚焦第一个），返回横幅文案。
 *
 *   } catch (err) {
 *     setSubmitError(applyServerErrors(err, { setError, getValues }));
 *   }
 *
 * 写入的错误 type 为 "server"，用户修改该字段 / 再次提交时由 resolver 重新校验自动清除。
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  form: { setError: UseFormSetError<T>; getValues: UseFormGetValues<T> },
  options: { fieldMap?: FieldMap; fallback?: string } = {},
): string | null {
  const values = form.getValues() as Record<string, unknown>;
  const { inline, banner } = splitServerErrors(err, (name) => name in values, options);
  Object.entries(inline).forEach(([name, message], i) => {
    form.setError(name as Path<T>, { type: "server", message }, { shouldFocus: i === 0 });
  });
  return banner;
}
