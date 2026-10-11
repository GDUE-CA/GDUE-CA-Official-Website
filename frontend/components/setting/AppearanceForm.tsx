"use client";

/**
 * AppearanceForm —— Tab-3 外观与语言
 *
 * - 主题三选项（浅色/深色/跟随系统）：applyThemeMode 即时生效，不算 dirty，无保存按钮
 * - system 模式监听 matchMedia 变化自动跟随
 * - 语言：6 语言 grid；切换需确认（页面将刷新）→ setLocale + reload，同样不算 dirty
 */
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor, Check, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getStoredTheme,
  applyThemeMode,
  onSystemThemeChange,
  type ThemeMode,
} from "@/lib/theme";
import { locales, localeNames, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { mode: ThemeMode; icon: typeof Sun; labelKey: string }[] = [
  { mode: "light", icon: Sun, labelKey: "common.themeLight" },
  { mode: "dark", icon: Moon, labelKey: "common.themeDark" },
  { mode: "system", icon: Monitor, labelKey: "setting.appearance.themeSystem" },
];

export function AppearanceForm() {
  const { t, locale } = useI18n();
  const { setLocale } = useAdminLocale();

  const [theme, setTheme] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  // 语言切换确认
  const [langTarget, setLangTarget] = useState<Locale | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setMounted(true);
    // system 模式下跟随系统主题变化
    return onSystemThemeChange(() => {
      applyThemeMode("system");
    });
  }, []);

  function handleTheme(mode: ThemeMode) {
    setTheme(mode);
    applyThemeMode(mode);
  }

  function handleLangConfirm() {
    if (!langTarget) return;
    const target = langTarget;
    setSwitching(true);
    setLocale(target);
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      {/* 主题 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.appearance.title")}</CardTitle>
          <CardDescription>{t("profile.themeHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ mode, icon: Icon, labelKey }) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleTheme(mode)}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-colors",
                  mounted && theme === mode
                    ? "border-primary bg-secondary text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("setting.hints.appearanceInstant")}
          </p>
        </CardContent>
      </Card>

      {/* 语言 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("nav.language")}</CardTitle>
          <CardDescription>{t("profile.languageHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-md grid-cols-2 gap-3">
            {locales.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => loc !== locale && setLangTarget(loc)}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors",
                  loc === locale
                    ? "border-primary bg-secondary text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {localeNames[loc]}
                {loc === locale && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("setting.hints.appearanceInstant")}
          </p>
        </CardContent>
      </Card>

      {/* 本 Tab 即时生效，无统一保存按钮 */}

      {/* 语言切换确认弹窗 */}
      <Dialog
        open={!!langTarget}
        onOpenChange={(open) => {
          if (!open) setLangTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("nav.language")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {langTarget
              ? t("setting.appearance.switchLangConfirm", {
                  name: localeNames[langTarget],
                })
              : ""}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLangTarget(null)} disabled={switching}>
              {t("setting.cancel")}
            </Button>
            <Button onClick={handleLangConfirm} disabled={switching}>
              {switching && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("setting.appearance.refreshNow")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
