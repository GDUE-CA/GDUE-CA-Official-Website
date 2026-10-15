"use client";

/**
 * LanguagePopover —— 语言选择浮层（账号菜单 / 设置菜单共用的多语言控件）
 *
 * - 顶部搜索框：按语言本地名 / 英文名 / 语言代码实时过滤
 * - 列表固定最大高度、垂直滚动，按地区分组（东亚 / 欧美 / 东南亚），空分组自动隐藏
 * - 选中语言立即生效（替换 URL 语言前缀）并关闭浮层
 * - 通过 PopoverAnchor 挂在任意锚点元素上（典型：下拉菜单项），内容 Portal 挂载
 *
 * 新语言接入：仅需在 i18n/messages/ 目录新增 json 文件，本组件自动分组渲染。
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Check from "@/assets/icons/action/check.svg";
import Search from "@/assets/icons/action/search.svg";
import { useI18n } from "@/i18n/provider";
import {
  locales,
  localeDisplayName,
  localeEnglishName,
  localeGroup,
  localeGroupOrder,
  type Locale,
  type LocaleGroup,
} from "@/lib/i18n";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** 分组标题的 i18n key 映射 */
const GROUP_LABEL_KEYS: Record<LocaleGroup, string> = {
  eastAsia: "nav.langGroups.eastAsia",
  europeAmericas: "nav.langGroups.europeAmericas",
};

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

  /** 按关键词过滤并按分组组织；空分组不渲染 */
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = (loc: Locale) => {
      if (!q) return true;
      return (
        localeDisplayName(loc).toLowerCase().includes(q) ||
        localeEnglishName(loc).toLowerCase().includes(q) ||
        loc.includes(q)
      );
    };
    return localeGroupOrder
      .map((group) => ({
        group,
        items: locales.filter((loc) => localeGroup(loc) === group && matched(loc)),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  /** 选中语言：立即切换（替换 URL 前缀）并关闭浮层 */
  function pick(target: Locale) {
    handleOpenChange(false);
    onPicked?.();
    if (target === locale) return;
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

        {/* 语言列表：固定最大高度 + 垂直滚动 */}
        <div className="max-h-64 overflow-y-auto p-1">
          {groups.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {t("nav.languageEmpty")}
            </p>
          )}
          {groups.map(({ group, items }) => (
            <div key={group}>
              <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold text-muted-foreground">
                {t(GROUP_LABEL_KEYS[group])}
              </p>
              {items.map((loc) => {
                const active = loc === locale;
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => pick(loc)}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                      active && "text-primary"
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate leading-tight">{localeDisplayName(loc)}</span>
                      <span className="truncate text-[11px] leading-tight text-muted-foreground">
                        {localeEnglishName(loc)}
                      </span>
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
