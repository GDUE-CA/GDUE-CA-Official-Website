"use client";

/**
 * SettingsDropdown —— 导航栏齿轮设置菜单
 *
 * 桌面端提供快捷入口；点击齿轮打开 DropdownMenu：
 *   - 外观设置（主题 Popover）
 *   - 更改语言（带搜索的语言 Popover）
 *
 * 主题与语言均不再平铺进主菜单，改为通过独立 Popover 展开，
 * 与 UserMenu 的行为保持一致（统一使用 ThemePopover / LanguagePopover）。
 * 主题逻辑收敛到 useTheme hook。
 */
import { useState } from "react";
import Settings from "@/assets/icons/navigation/settings.svg";
import ChevronRight from "@/assets/icons/navigation/chevron-right.svg";
import Languages from "@/assets/icons/navigation/languages.svg";
import Palette from "@/assets/icons/status/palette.svg";
import { useI18n } from "@/i18n/provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemePopover } from "@/components/layout/ThemePopover";
import { LanguagePopover } from "@/components/layout/LanguagePopover";

export function SettingsDropdown() {
  const { t } = useI18n();

  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const subOpen = themeOpen || langOpen;

  const handleMenuOpenChange = (next: boolean) => {
    if (!next && subOpen) return;
    setMenuOpen(next);
    if (!next) {
      setThemeOpen(false);
      setLangOpen(false);
    }
  };

  const handleInteractOutside = (e: Event) => {
    if (!subOpen) return;
    e.preventDefault();
    const target = (e as CustomEvent).detail?.originalEvent?.target as HTMLElement | null;
    if (!target?.closest?.("[data-radix-popper-content-wrapper]")) {
      setThemeOpen(false);
      setLangOpen(false);
    }
  };

  const handleEscapeKeyDown = (e: KeyboardEvent) => {
    if (!subOpen) return;
    e.preventDefault();
    setThemeOpen(false);
    setLangOpen(false);
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground cursor-pointer transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("nav.settings")}
          title={t("nav.settings")}
        >
          <Settings className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-52"
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
      >
        {/* 外观设置 → 主题 Popover */}
        <ThemePopover
          open={themeOpen}
          onOpenChange={setThemeOpen}
          anchor={
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setLangOpen(false);
                setThemeOpen(true);
              }}
            >
              <Palette />
              {t("nav.appearance")}
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuItem>
          }
        />

        {/* 更改语言 → 带搜索的语言 Popover */}
        <LanguagePopover
          open={langOpen}
          onOpenChange={setLangOpen}
          anchor={
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setThemeOpen(false);
                setLangOpen(true);
              }}
            >
              <Languages />
              {t("nav.changeLanguage")}
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
