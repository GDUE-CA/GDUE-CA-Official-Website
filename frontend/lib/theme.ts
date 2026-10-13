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

// ============ 风格主题（与颜色模式正交） ============
// 主题列表由后端 Theme 表驱动（管理员可上传/启停，无需改前端代码）；
// 颜色模式（light/dark）保留为独立维度；风格主题控制 CSS 变量包与设置页布局骨架

export const THEME_STYLE_KEY = "gdueca-theme-style";

/** 主题 key 合法形态（与后端 User.theme / Theme.key 校验一致） */
export const THEME_KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;

/** 读取存储的风格主题 key；未设置或非法值返回 "default" */
export function getStoredThemeStyle(): string {
  if (typeof window === "undefined") return "default";
  try {
    const stored = window.localStorage.getItem(THEME_STYLE_KEY);
    if (stored && THEME_KEY_RE.test(stored)) return stored;
    return "default";
  } catch {
    return "default";
  }
}

/** 应用风格主题：写入存储键 + 在 <html> 上设置 data-theme-style 属性 */
export function applyThemeStyle(style: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STYLE_KEY, style);
  } catch {
    /* 存储不可用时忽略 */
  }
  document.documentElement.setAttribute("data-theme-style", style);
}

