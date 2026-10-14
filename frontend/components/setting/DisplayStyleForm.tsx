"use client";

/**
 * DisplayStyleForm —— 界面与显示：深色模式 / 风格主题 / 字体大小 / 横屏
 *
 * 全部即时生效（无需保存按钮），并持久化到 /api/account/display（跟随账号多端同步），
 * 同时写本地缓存 gdueca-display 供下次进入时即时应用。
 */
import { useEffect, useState } from "react";
import {
  Sun,
  Moon,
  Monitor,
  LayoutGrid,
  Apple,
  Sparkles,
  Loader2,
  RotateCcw,
  Smartphone,
  Type,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStoredTheme, onSystemThemeChange } from "@/lib/theme";
import { useTheme } from "@/components/theme/ThemeProvider";
import { fetchDisplayPreference, updateDisplayPreference } from "@/lib/api/account";
import type { ColorScheme } from "@/types/api";
import {
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  applyColorScheme,
  applyFontScale,
  applyLandscape,
  clampFontScale,
  readDisplayCache,
  writeDisplayCache,
  type DisplayPrefsCache,
} from "@/lib/displayPrefs";
import { cn } from "@/lib/utils";

const SCHEME_OPTIONS: { mode: ColorScheme; icon: typeof Sun; labelKey: string }[] = [
  { mode: "light", icon: Sun, labelKey: "common.themeLight" },
  { mode: "dark", icon: Moon, labelKey: "common.themeDark" },
  { mode: "system", icon: Monitor, labelKey: "setting.appearance.themeSystem" },
];

/** 风格主题图标：按布局骨架推断，节日/自定义主题用 Sparkles */
function styleIcon(layout: string) {
  if (layout === "microsoft") return LayoutGrid;
  if (layout === "apple") return Apple;
  return Sparkles;
}

export function DisplayStyleForm() {
  const { t } = useI18n();
  const { themes, current: style, setTheme: setStyleTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [scheme, setScheme] = useState<ColorScheme>("system");
  const [fontScale, setFontScaleState] = useState(FONT_SCALE_DEFAULT);
  const [landscape, setLandscape] = useState(true);
  const [prefs, setPrefs] = useState<DisplayPrefsCache>(readDisplayCache());

  // 进入时先按本地缓存即时应用，再拉账号偏好校正（多端同步）
  useEffect(() => {
    setScheme(getStoredTheme());
    setMounted(true);
    const cache = readDisplayCache();
    setFontScaleState(cache.font_scale);
    setLandscape(cache.enable_landscape);
    applyFontScale(cache.font_scale);
    void applyLandscape(cache.enable_landscape);

    let cancelled = false;
    fetchDisplayPreference()
      .then((p) => {
        if (cancelled) return;
        const next: DisplayPrefsCache = {
          theme_name: p.theme_name,
          color_scheme: p.color_scheme,
          font_scale: clampFontScale(p.font_scale),
          enable_landscape: p.enable_landscape,
        };
        setPrefs(next);
        writeDisplayCache(next);
        setScheme(p.color_scheme);
        applyColorScheme(p.color_scheme);
        setFontScaleState(next.font_scale);
        applyFontScale(next.font_scale);
        setLandscape(p.enable_landscape);
        void applyLandscape(p.enable_landscape);
        if (p.theme_name) setStyleTheme(p.theme_name);
      })
      .catch(() => {
        /* 未登录/网络失败时沿用本地缓存 */
      });

    return onSystemThemeChange(() => {
      if (readDisplayCache().color_scheme === "system") applyColorScheme("system");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 本地立即应用 + 缓存 + 异步持久化到账号 */
  function persist(patch: Partial<DisplayPrefsCache>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writeDisplayCache(next);
    void updateDisplayPreference(patch).catch(() => {
      /* 持久化失败不影响本地体验 */
    });
  }

  function handleScheme(mode: ColorScheme) {
    setScheme(mode);
    applyColorScheme(mode);
    persist({ color_scheme: mode });
  }

  function handleStyle(key: string) {
    setStyleTheme(key);
    persist({ theme_name: key });
  }

  function handleFontScale(value: number) {
    const v = clampFontScale(value);
    setFontScaleState(v);
    applyFontScale(v);
    persist({ font_scale: v });
  }

  function handleLandscape(enabled: boolean) {
    setLandscape(enabled);
    void applyLandscape(enabled);
    persist({ enable_landscape: enabled });
  }

  return (
    <div className="space-y-6">
      {/* 深色模式 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.display.colorSchemeTitle")}</CardTitle>
          <CardDescription>{t("setting.display.colorSchemeHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {SCHEME_OPTIONS.map(({ mode, icon: Icon, labelKey }) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleScheme(mode)}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-colors",
                  mounted && scheme === mode
                    ? "border-primary bg-secondary text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 风格主题 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.appearance.styleTitle")}</CardTitle>
          <CardDescription>{t("setting.appearance.styleHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {themes.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <div className="grid max-w-md grid-cols-3 gap-3">
              {themes.map((th) => {
                const Icon = styleIcon(th.layout);
                return (
                  <button
                    key={th.key}
                    type="button"
                    onClick={() => handleStyle(th.key)}
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-colors",
                      mounted && style === th.key
                        ? "border-primary bg-secondary text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {th.name}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 字体大小 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Type className="h-4 w-4" />
            {t("setting.display.fontScaleTitle")}
          </CardTitle>
          <CardDescription>{t("setting.display.fontScaleHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 max-w-md">
            <span className="text-xs text-muted-foreground">A</span>
            <input
              type="range"
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={FONT_SCALE_STEP}
              value={fontScale}
              onChange={(e) => handleFontScale(Number(e.target.value))}
              className="flex-1 accent-primary cursor-pointer"
              aria-label={t("setting.display.fontScaleTitle")}
            />
            <span className="text-lg text-muted-foreground">A</span>
            <span className="w-14 text-right text-sm font-medium tabular-nums">
              {Math.round(fontScale * 100)}%
            </span>
            <ButtonLikeReset
              disabled={fontScale === FONT_SCALE_DEFAULT}
              onClick={() => handleFontScale(FONT_SCALE_DEFAULT)}
              label={t("setting.display.resetFont")}
            />
          </div>
          <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm" style={{ fontSize: "0.95em" }}>
            {t("setting.display.fontPreview")}
          </p>
        </CardContent>
      </Card>

      {/* 横屏模式（移动端） */}
      <Card className="md:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Smartphone className="h-4 w-4" />
            {t("setting.display.landscapeTitle")}
          </CardTitle>
          <CardDescription>{t("setting.display.landscapeHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            role="switch"
            aria-checked={landscape}
            onClick={() => handleLandscape(!landscape)}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",
              landscape ? "bg-primary" : "bg-muted-foreground/40"
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                landscape ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function ButtonLikeReset({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <RotateCcw className="h-3 w-3" />
      {label}
    </button>
  );
}
