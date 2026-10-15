"use client";

/**
 * SearchableSelect —— 可搜索下拉（通用组件）
 *
 * - 桌面（pointer: fine）：自绘触发按钮 + 绝对定位面板（搜索框 + 滚动列表），
 *   按拼音/英文/代码关键词模糊过滤（keywords 由调用方提供），点击外部/Escape 关闭
 * - 触屏 / 粗指针：渲染原生 <select>，触发系统原生 picker
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Check from "@/assets/icons/action/check.svg";
import ChevronDown from "@/assets/icons/navigation/chevron-down.svg";
import Search from "@/assets/icons/action/search.svg";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** 额外过滤关键词（拼音/英文名/代码等，空格分隔拼接成一个字符串） */
  keywords?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

const TRIGGER_CLASS =
  "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm";

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  ariaLabel,
  className,
}: SearchableSelectProps) {
  const { t } = useI18n();
  const [finePointer, setFinePointer] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // 指针类型检测（客户端执行）
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setFinePointer(mq.matches);
    const handler = (e: MediaQueryListEvent) => setFinePointer(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // 点击外部关闭 + Escape 关闭
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (open) {
      setQuery("");
      searchRef.current?.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.keywords ?? ""} ${o.value}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  const selected = options.find((o) => o.value === value) ?? null;

  // 触屏 / 粗指针：原生 select
  if (!finePointer) {
    return (
      <select
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(TRIGGER_CLASS, "cursor-pointer", className)}
      >
        <option value="">{placeholder ?? ""}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  // 桌面：自绘可搜索面板
  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          TRIGGER_CLASS,
          "cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : (placeholder ?? "")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-border bg-background shadow-md">
          <div className="p-2 pb-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("setting.searchPlaceholder")}
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground text-center">
                {t("setting.noMatch")}
              </li>
            ) : (
              filtered.map((o) => {
                const isSelected = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
