"use client";

/**
 * NavDropdown —— 桌面端导航栏独立下拉（hover + click 双触发）
 *
 * 交互规格：
 *   - 悬浮进入外层容器 → 立刻展开 Popover（桌面端 hover 快捷入口）
 *   - 点击触发器 → 也展开/收起（兼容触屏，手机无 hover）
 *   - 鼠标离开外层容器（Trigger + PopoverContent 整体）→ 220ms 延迟后关闭
 *   - 220ms 内鼠标回到容器（Trigger 或 Content）→ 清除定时器，保持打开
 *   - 全局 pointerdown 在容器以外 → 立刻关闭，清除定时器
 *
 * 关键设计：Trigger 和 PopoverContent 的事件统一绑定在外层 div + PopoverContent，
 * 不单独给 Trigger 绑 mouseLeave，避免跨空隙时弹出层闪退。
 *
 * 互斥：父组件维护 open 状态，打开一个时置另一个为 false。
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  Languages,
  Moon,
  Palette,
  Search,
  Sun,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useSwitchLocale } from "@/lib/navigation";
import { useTheme, type Theme } from "@/lib/hooks/useTheme";
import {
  locales,
  localeDisplayName,
  localeEnglishName,
  localeGroup,
  localeGroupOrder,
  type Locale,
  type LocaleGroup,
} from "@/lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/* ===================== 通用 NavDropdown ===================== */

interface NavDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 触发器图标/文本（渲染在 button 内部） */
  trigger: ReactNode;
  /** Popover 内容 */
  children: ReactNode;
  contentClassName?: string;
  /** Popover 打开时焦点劫持（如聚焦搜索框） */
  onOpenAutoFocus?: (e: Event) => void;
}

export function NavDropdown({
  open,
  onOpenChange,
  trigger,
  children,
  contentClassName,
  onOpenAutoFocus,
}: NavDropdownProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearCloseTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    timerRef.current = setTimeout(() => onOpenChange(false), 220);
  };

  // 卸载时清理
  useEffect(() => () => clearCloseTimer(), []);

  // 外部点击关闭：document mousedown 在容器与 Portal 浮层以外 → 立刻关闭
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 点击在容器内（Trigger）不处理
      if (containerRef.current?.contains(target)) return;
      // 点击在 Portal 挂载的 PopoverContent 内不处理
      if (target.closest("[data-radix-popper-content-wrapper]")) return;
      onOpenChange(false);
      clearCloseTimer();
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open, onOpenChange]);

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={() => {
        clearCloseTimer();
        onOpenChange(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            // 阻止 pointerdown 冒泡到 document，防止 Radix DismissableLayer 误判为外部点击
            onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            {trigger}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className={contentClassName}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          {children}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ===================== 主题下拉 ===================== */

const THEME_OPTIONS: { value: Theme; labelKey: string; icon: typeof Sun }[] = [
  { value: "light", labelKey: "common.themeLight", icon: Sun },
  { value: "dark", labelKey: "common.themeDark", icon: Moon },
];

interface ThemeNavDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ThemeNavDropdown({ open, onOpenChange }: ThemeNavDropdownProps) {
  const { t } = useI18n();
  const { theme, mounted, setTheme } = useTheme();

  return (
    <NavDropdown
      open={open}
      onOpenChange={onOpenChange}
      trigger={<Palette className="h-4 w-4" />}
      contentClassName="w-44 p-1"
    >
      {THEME_OPTIONS.map(({ value, labelKey, icon: Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTheme(value);
              onOpenChange(false);
            }}
            className={cn(
              "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
              active && "text-primary"
            )}
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
            {active && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </button>
        );
      })}
    </NavDropdown>
  );
}

/* ===================== 语言下拉 ===================== */

const GROUP_LABEL_KEYS: Record<LocaleGroup, string> = {
  eastAsia: "nav.langGroups.eastAsia",
  europeAmericas: "nav.langGroups.europeAmericas",
};

interface LanguageNavDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function LanguageNavDropdown({ open, onOpenChange }: LanguageNavDropdownProps) {
  const { locale, t } = useI18n();
  const switchLocale = useSwitchLocale();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

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
        items: locales.filter(
          (loc) => localeGroup(loc) === group && matched(loc)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  function pick(target: Locale) {
    handleOpenChange(false);
    if (target === locale) return;
    switchLocale(target);
  }

  return (
    <NavDropdown
      open={open}
      onOpenChange={handleOpenChange}
      trigger={<Languages className="h-4 w-4" />}
      contentClassName="w-64 p-0 overflow-hidden"
      onOpenAutoFocus={(e) => {
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
                    "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                    active && "text-primary"
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate leading-tight">
                      {localeDisplayName(loc)}
                    </span>
                    <span className="truncate text-[11px] leading-tight text-muted-foreground">
                      {localeEnglishName(loc)}
                    </span>
                  </span>
                  {active && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </NavDropdown>
  );
}

/* ===================== 导航栏下拉组（互斥管理） ===================== */

/**
 * NavDropdownBar —— 桌面端导航栏的两个独立下拉（外观设置 + 更改语言）
 *
 * 互斥：打开其中一个时立刻关闭另一个。
 * 两个下拉各自独立的 hover + click + 220ms 延迟关闭。
 */
export function NavDropdownBar() {
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const handleThemeOpenChange = (next: boolean) => {
    if (next) setLangOpen(false);
    setThemeOpen(next);
  };

  const handleLangOpenChange = (next: boolean) => {
    if (next) setThemeOpen(false);
    setLangOpen(next);
  };

  return (
    <>
      <ThemeNavDropdown open={themeOpen} onOpenChange={handleThemeOpenChange} />
      <LanguageNavDropdown open={langOpen} onOpenChange={handleLangOpenChange} />
    </>
  );
}
