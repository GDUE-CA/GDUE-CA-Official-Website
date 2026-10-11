"use client";

/**
 * SettingsDropdown —— 导航栏设置下拉菜单
 *
 * 齿轮图标，hover 展开下拉，包含：
 *   - 主题切换（浅色 / 深色）
 *   - 语言切换（zh-cn / zh-tw / en / ja）
 *
 * 交互方式与 UserMenu 一致：原生 div + 受控 open + 绝对定位面板，
 * trigger 和面板在同一容器内，hover 稳定不闪烁。
 * 主题：localStorage key `gdueca-theme` + <html>.dark 类
 * 语言：替换 URL 路径中的 locale 前缀（Next.js App Router [locale]）
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Settings, Sun, Moon, Check } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { locales, localeNames, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";
const THEME_KEY = "gdueca-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function SettingsDropdown() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    // 与防 FOUC 脚本 / ThemeToggle 保持一致：挂载即把主题真正应用到 <html>，
    // 避免状态显示 dark 而页面仍是 light 的分离
    applyTheme(initial);
    setMounted(true);
  }, []);

  /** 跟随系统主题变化（当用户未手动设置偏好时自动切换，与 ThemeToggle 一致） */
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      // 仅当 localStorage 中无显式设置时跟随系统
      if (!window.localStorage.getItem(THEME_KEY)) {
        const next: Theme = e.matches ? "dark" : "light";
        setTheme(next);
        applyTheme(next);
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  // Escape 关闭（与其他伸缩菜单一致的键盘交互）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 100);
  };

  const switchTheme = useCallback((next: Theme) => {
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(THEME_KEY, next);
  }, []);

  function switchLocale(target: Locale) {
    if (target === locale) return;
    const segments = pathname.split("/");
    segments[1] = target;
    router.push(segments.join("/"));
  }

  const isDark = theme === "dark";

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground cursor-pointer transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("nav.settings")}
        title={t("nav.settings")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Settings className="h-4 w-4" />
      </button>

      <div
        role="menu"
        className={cn(
          "absolute right-0 top-full mt-1 z-50 min-w-[12rem] w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md origin-top",
          "transition-[opacity,transform] motion-reduce:transition-none",
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        {/* 主题 */}
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {t("nav.theme")}
        </div>
        <button
          type="button"
          onClick={() => switchTheme("light")}
          className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Sun className="h-4 w-4" />
          {t("common.themeLight")}
          {mounted && !isDark && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
        </button>
        <button
          type="button"
          onClick={() => switchTheme("dark")}
          className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Moon className="h-4 w-4" />
          {t("common.themeDark")}
          {mounted && isDark && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
        </button>

        <div className="-mx-1 my-1 h-px bg-muted" />

        {/* 语言：列表限高滚动（滚轮菜单），语言增多时面板不会被撑爆 */}
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {t("nav.language")}
        </div>
        <div
          className="max-h-40 overflow-y-auto"
          role="group"
          aria-label={t("nav.language")}
        >
          {locales.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => switchLocale(loc)}
              className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {localeNames[loc]}
              {loc === locale && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
