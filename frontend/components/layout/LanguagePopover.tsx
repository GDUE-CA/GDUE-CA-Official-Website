"use client";

/**
 * LanguagePopover —— 语言选择浮层（账号菜单 / 设置菜单共用的多语言控件）
 *
 * V0.6.1 需求1 规范化：
 * - 语种清单锁定为 lib/i18n.ts 的 LOCALE_LIST（13 语种白名单，禁止新增）；
 * - 渲染顺序、主标签 label、副标签 subLabel 与固定清单完全一致，不再按地区分组；
 * - 顶部搜索框：按主标签 / 副标签 / 语言代码实时过滤（过滤不改变固定顺序）；
 * - 选中语言立即生效（替换 URL 语言前缀）并持久化（localStorage + Cookie），
 *   下次访问由 proxy 读 Cookie 恢复上次语言；
 * - 通过 PopoverAnchor 挂在任意锚点元素上（典型：下拉菜单项），内容 Portal 挂载。
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Check from "@/assets/icons/action/check.svg";
import Search from "@/assets/icons/action/search.svg";
import { useI18n } from "@/i18n/provider";
import {
  LOCALE_LIST,
  persistLocalePreference,
  type Locale,
} from "@/lib/i18n";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface LanguagePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 锚点元素（通常是外层菜单的菜单项，仅作定位锚，不自带开关行为） */
  anchor: ReactNode;
  /** 选中语言后的额外回调（用于外层组件关闭自身菜单） */
  onPicked?: () => void;
}

export function LanguagePopover({ open, onOpenChange, anchor, onPicked }: LanguagePopoverProps) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  /** 按关键词过滤（保持 LOCALE_LIST 固定顺序） */
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LOCALE_LIST;
    return LOCALE_LIST.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.subLabel.toLowerCase().includes(q) ||
        o.code.includes(q)
    );
  }, [query]);

  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  /** 选中语言：持久化（localStorage + Cookie）→ 切 URL 前缀 → 关闭浮层 */
  function pick(target: Locale) {
    handleOpenChange(false);
    onPicked?.();
    if (target === locale) return;
    persistLocalePreference(target);
    const segments = pathname.split("/");
    segments[1] = target;
    router.push(segments.join("/"));
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={12}
        alignOffset={-6}
        className="w-64 p-0 overflow-hidden"
        onOpenAutoFocus={(e) => {
          // 聚焦搜索框而非第一个选项，打开即可输入过滤
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        {/* 搜索框 */}
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("nav.languageSearch")}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* 语言列表：LOCALE_LIST 固定顺序，固定最大高度 + 垂直滚动 */}
        <div className="max-h-64 overflow-y-auto p-1">
          {items.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {t("nav.languageEmpty")}
            </p>
          )}
          {items.map((o) => {
            const active = o.code === locale;
            return (
              <button
                key={o.code}
                type="button"
                onClick={() => pick(o.code)}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
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
      </PopoverContent>
    </Popover>
  );
}
