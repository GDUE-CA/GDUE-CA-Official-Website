"use client";

/**
 * useTheme —— 全局浅色/深色主题 Hook（单一真值源）
 *
 * - 读取 localStorage `gdueca-theme`，未设置时跟随系统 prefers-color-scheme
 * - setTheme 立即应用到 <html>.dark 并持久化
 * - 未手动设置时监听系统主题变化自动跟随
 *
 * 此前主题逻辑在 UserMenu / SettingsDropdown / ThemeToggle 各存一份副本，
 * 现统一收敛到本 Hook。
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "gdueca-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDocument(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setThemeState(initial);
    applyThemeToDocument(initial);
    setMounted(true);
  }, []);

  /** 未手动设置偏好时跟随系统主题 */
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!window.localStorage.getItem(THEME_KEY)) {
        const next: Theme = e.matches ? "dark" : "light";
        setThemeState(next);
        applyThemeToDocument(next);
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyThemeToDocument(next);
    window.localStorage.setItem(THEME_KEY, next);
  }, []);

  return { theme, mounted, setTheme };
}
