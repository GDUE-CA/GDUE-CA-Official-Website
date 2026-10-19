"use client";

/**
 * LocaleSelector —— 语言选择折叠面板（规范 §3-3 / S08）
 *
 * - 形态：可折叠面板，默认收起；点击标题展开全部语言列表，再次点击收起；
 * - 展开后顶部内置实时搜索输入框：按语言本地名 / 英文名 / 语言代码过滤，无需回车；
 * - 列表滚动交给当前操作系统原生滚动控件（max-h + overflow-y-auto），
 *   禁止自定义滚动条样式（Apple 橡皮筋回弹 / Windows / Android 原生外观）；
 * - 选中项 Check 标记；选择后自动保存（persistOnPick 时）并关闭折叠面板；
 * - 语种清单锁定为 lib/i18n.ts 的 LOCALE_LIST（V0.6.1 需求1：13 语种白名单），
 *   渲染顺序与 label / subLabel 文案与规格定稿完全一致，不再经 Intl.DisplayNames 派生。
 */
import { useMemo, useRef, useState } from "react";
import Check from "@/assets/icons/action/check.svg";
import ChevronDown from "@/assets/icons/navigation/chevron-down.svg";
import Search from "@/assets/icons/action/search.svg";
import { useI18n } from "@/i18n/provider";
import { useSwitchLocale } from "@/lib/navigation";
import { updateProfile } from "@/lib/api/auth";
import {
  LOCALE_LIST,
  localeOption,
  persistLocalePreference,
  type Locale,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LocaleSelectorProps {
  /** 当前值：locale 码；空字符串 = 跟随系统（需 includeSystemOption） */
  value: string;
  onChange: (loc: string) => void;
  /** 是否提供「跟随系统」选项（值为 ""） */
  includeSystemOption?: boolean;
  /** 「跟随系统」选项展示文案（含当前系统默认值） */
  systemOptionLabel?: string;
  /**
   * 选择后 fire-and-forget 持久化 user.locale 并切换 URL 语言前缀。
   * 默认 false：由外层表单统一保存（LocalizationForm 的 dirty 追踪/保存按钮流程）。
   */
  persistOnPick?: boolean;
  disabled?: boolean;
}

export function LocaleSelector({
  value,
  onChange,
  includeSystemOption = false,
  systemOptionLabel,
  persistOnPick = false,
  disabled = false,
}: LocaleSelectorProps) {
  const { t } = useI18n();
  const switchLocale = useSwitchLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  /** 实时过滤：主标签 / 副标签 / 语言代码（保持 LOCALE_LIST 固定顺序） */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LOCALE_LIST;
    return LOCALE_LIST.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.subLabel.toLowerCase().includes(q) ||
        o.code.includes(q)
    );
  }, [query]);

  const currentLabel =
    value === "" && includeSystemOption
      ? (systemOptionLabel ?? value)
      : (localeOption(value)?.label ?? value);

  /** 选中语言：通知外层 → 可选持久化（后端偏好 + 本地 localStorage/Cookie）+ 切 URL → 收起面板清空搜索 */
  function pick(loc: string) {
    setOpen(false);
    setQuery("");
    if (loc === value) return;
    onChange(loc);
    if (persistOnPick) {
      void updateProfile({ locale: loc }).catch(() => undefined);
      if (loc) {
        persistLocalePreference(loc as Locale);
        switchLocale(loc as Locale);
      }
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* 折叠面板标题（始终可见，点击展开/收起） */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-4 py-3 text-left text-sm transition-colors duration-[180ms] hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate">{currentLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-[180ms]",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border">
          {/* 实时搜索框 */}
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("nav.languageSearch")}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* 语言列表：操作系统原生滚动，不自定义滚动条 */}
          <div className="max-h-64 overflow-y-auto p-1">
            {includeSystemOption && (
              <button
                type="button"
                onClick={() => pick("")}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors duration-[180ms] hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                  value === "" && "text-primary"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{systemOptionLabel}</span>
                {value === "" && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            )}
            {filtered.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {t("nav.languageEmpty")}
              </p>
            )}
            {filtered.map((o) => {
              const active = o.code === value;
              return (
                <button
                  key={o.code}
                  type="button"
                  onClick={() => pick(o.code)}
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors duration-[180ms] hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                    active && "text-primary"
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate leading-tight">{o.label}</span>
                    <span className="truncate text-[11px] leading-tight text-muted-foreground">
                      {o.subLabel}
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
