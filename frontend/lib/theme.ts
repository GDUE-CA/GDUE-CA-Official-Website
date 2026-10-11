/**
 * 主题模式工具（全站统一）
 *
 * - localStorage key：gdueca-theme（与根布局初始化脚本、ThemeToggle、SettingsDropdown 一致）
 * - 三种模式：light / dark / system（system = 移除存储键，跟随 prefers-color-scheme）
 * - 应用方式：在 <html> 上增删 .dark 类
 */

export const THEME_KEY = "gdueca-theme";

export type ThemeMode = "light" | "dark" | "system";

/** 读取存储的主题模式；未设置或非法值返回 "system" */
export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return "system";
  } catch {
    return "system";
  }
}

/** 当前实际生效的主题（system 模式按 prefers-color-scheme 解析） */
export function getResolvedTheme(): "light" | "dark" {
  const stored = getStoredTheme();
  if (stored !== "system") return stored;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 应用主题模式：写入/清除存储键，并把解析结果同步到 <html>.dark */
export function applyThemeMode(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  try {
    if (mode === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* 存储不可用时忽略，仅本次生效 */
  }
  const dark =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : mode === "dark";
  document.documentElement.classList.toggle("dark", dark);
}

/** 供组件监听系统主题变化：仅在 system 模式下跟随切换 */
export function onSystemThemeChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => {
    if (getStoredTheme() === "system") handler();
  };
  mql.addEventListener("change", listener);
  return () => mql.removeEventListener("change", listener);
}
