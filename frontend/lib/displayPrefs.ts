/**
 * 界面显示偏好应用工具（/setting/界面与显示）
 *
 * - color_scheme：复用 lib/theme 的 light/dark/system
 * - font_scale：以 <html> 根字号缩放全站 rem 尺寸（1.0 = 浏览器默认 16px）
 * - enable_landscape：移动端横屏允许标记（data 属性 + 尝试解锁/锁定屏幕方向）
 *
 * 本地缓存（gdueca-display）仅用于下次打开页面时即时应用、减少闪烁；
 * 权威值以 /api/account/display（跟随账号多端同步）为准。
 */
import { applyThemeMode, type ThemeMode } from "@/lib/theme";
import type { ColorScheme } from "@/types/api";

const DISPLAY_CACHE_KEY = "gdueca-display";

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.30;
export const FONT_SCALE_STEP = 0.05;
export const FONT_SCALE_DEFAULT = 1.0;

export interface DisplayPrefsCache {
  theme_name: string | null;
  color_scheme: ColorScheme;
  font_scale: number;
  enable_landscape: boolean;
}

const DEFAULTS: DisplayPrefsCache = {
  theme_name: null,
  color_scheme: "system",
  font_scale: FONT_SCALE_DEFAULT,
  enable_landscape: true,
};

export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return FONT_SCALE_DEFAULT;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Number(value.toFixed(2))));
}

export function readDisplayCache(): DisplayPrefsCache {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(DISPLAY_CACHE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<DisplayPrefsCache>;
    return {
      theme_name: typeof parsed.theme_name === "string" ? parsed.theme_name : null,
      color_scheme:
        parsed.color_scheme === "light" ||
        parsed.color_scheme === "dark" ||
        parsed.color_scheme === "system"
          ? parsed.color_scheme
          : "system",
      font_scale: clampFontScale(
        typeof parsed.font_scale === "number" ? parsed.font_scale : FONT_SCALE_DEFAULT
      ),
      enable_landscape: parsed.enable_landscape !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writeDisplayCache(prefs: DisplayPrefsCache) {
  try {
    window.localStorage.setItem(DISPLAY_CACHE_KEY, JSON.stringify(prefs));
  } catch {
    /* 存储不可用时忽略 */
  }
}

/** 应用深浅色模式 */
export function applyColorScheme(scheme: ColorScheme) {
  applyThemeMode(scheme as ThemeMode);
}

/** 应用字体缩放（根字号 px） */
export function applyFontScale(scale: number) {
  if (typeof document === "undefined") return;
  const value = clampFontScale(scale);
  document.documentElement.style.fontSize = `${Math.round(16 * value)}px`;
  document.documentElement.dataset.fontScale = String(value);
}

/**
 * 应用横屏偏好（移动端）。
 * 网站仅能在全屏等受限场景锁定方向，这里：
 * - 允许横屏：解锁方向；
 * - 不允许横屏：尝试竖屏锁定（不支持/不在全屏时静默失败），并打 data 标记供 CSS 兜底。
 */
export async function applyLandscape(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.allowLandscape = enabled ? "1" : "0";
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
      unlock?: () => void;
    };
    if (!enabled && typeof orientation?.lock === "function") {
      await orientation.lock("portrait").catch(() => undefined);
    } else if (enabled && typeof orientation?.unlock === "function") {
      orientation.unlock();
    }
  } catch {
    /* 浏览器不支持方向锁定时忽略 */
  }
}

/** 一次性应用全部显示偏好 */
export function applyDisplayPrefs(prefs: DisplayPrefsCache) {
  applyColorScheme(prefs.color_scheme);
  applyFontScale(prefs.font_scale);
  void applyLandscape(prefs.enable_landscape);
}
