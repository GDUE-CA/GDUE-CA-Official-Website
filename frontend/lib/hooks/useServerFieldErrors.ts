"use client";

/**
 * useServerFieldErrors —— 手写 state 表单（未用 react-hook-form）的字段错误行内展示
 *
 * 用法（字段名一律用后端字段名，与请求体 / 1001 data.errors[].field 对齐）：
 *
 *   const fieldErrors = useServerFieldErrors<"title" | "content">();
 *   const fe = fieldErrors.errors;
 *   ...
 *   } catch (err) {
 *     setError(fieldErrors.capture(err));        // 能对位的进行内，其余返回给横幅
 *   }
 *   ...
 *   <form {...fieldErrors.rootProps}>
 *     <div data-field="title">
 *       <Input aria-invalid={!!fe.title} ... />
 *       <FieldError>{fe.title}</FieldError>
 *     </div>
 *
 * 约定：
 * - 对位依据是 rootProps 所在容器内的 `data-field` 元素：页面上没渲染的字段错误自动进横幅；
 * - 用户在某个 data-field 容器内输入时自动清除该字段错误（Radix Select 等不触发 input 事件
 *   的控件，在 onValueChange 里手动 clear）；
 * - 写入错误后自动聚焦第一个出错字段（DOM 顺序）；
 * - 前端预校验用 set({...}) 写进同一套行内错误，保证前后端错误展示位置一致。
 */
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { splitServerErrors, type FieldMap } from "@/lib/api/formErrors";

const FOCUSABLE =
  "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function useServerFieldErrors<K extends string = string>(
  options: { fieldMap?: FieldMap; fallback?: string } = {},
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const { fieldMap, fallback } = options;

  const fieldHolders = useCallback((): HTMLElement[] => {
    const root = rootRef.current;
    return root ? Array.from(root.querySelectorAll<HTMLElement>("[data-field]")) : [];
  }, []);

  const focusFirst = useCallback(
    (next: Partial<Record<K, string>>) => {
      const holder = fieldHolders().find((el) => next[el.dataset.field as K]);
      if (!holder) return;
      const target = holder.matches(FOCUSABLE)
        ? holder
        : holder.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus({ preventScroll: true });
      (target ?? holder).scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [fieldHolders],
  );

  /** 直接写入行内错误（前端预校验用），返回是否有错 */
  const set = useCallback(
    (next: Partial<Record<K, string>>): boolean => {
      const clean = Object.fromEntries(
        Object.entries(next).filter(([, v]) => !!v),
      ) as Partial<Record<K, string>>;
      setErrors(clean);
      const hasError = Object.keys(clean).length > 0;
      if (hasError) focusFirst(clean);
      return hasError;
    },
    [focusFirst],
  );

  /**
   * 解析 API 错误：能对位的写入行内，返回横幅文案（全部已行内展示时为 null）。
   * override.fieldMap：单次调用的字段映射（同页多份同构表单时按实例前缀对位）。
   */
  const capture = useCallback(
    (err: unknown, override?: { fieldMap?: FieldMap }): string | null => {
      const known = new Set(fieldHolders().map((el) => el.dataset.field));
      const { inline, banner } = splitServerErrors(err, (n) => known.has(n), {
        fieldMap: override?.fieldMap ?? fieldMap,
        fallback,
      });
      set(inline as Partial<Record<K, string>>);
      return banner;
    },
    [fieldHolders, fieldMap, fallback, set],
  );

  /** 清除单个字段或全部 */
  const clear = useCallback((field?: K) => {
    setErrors((prev) => {
      if (field === undefined) return Object.keys(prev).length ? {} : prev;
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  /** 挂到表单根容器：提供对位范围 + 输入即清除 */
  const rootProps = useMemo(
    () => ({
      ref: (el: HTMLElement | null) => {
        rootRef.current = el;
      },
      onInputCapture: (e: FormEvent) => {
        const holder = (e.target as HTMLElement).closest<HTMLElement>("[data-field]");
        if (holder?.dataset.field) clear(holder.dataset.field as K);
      },
    }),
    [clear],
  );

  return { errors, capture, set, clear, rootProps };
}
