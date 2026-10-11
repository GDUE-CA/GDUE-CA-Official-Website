"use client";

/**
 * ThemeToggle - 深浅色主题切换按钮
 * - 读取 localStorage 中保存的主题偏好，若未设置则跟随系统 prefers-color-scheme
 * - 切换时在 <html> 上添加/移除 .dark 类，更新 localStorage
 * - 使用 AnimatePresence 实现 Sun/Moon 图标平滑过渡
 * - 系统主题变化时自动同步（matchMedia 监听）
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const STORAGE_KEY = "gdueca-theme";

/** 获取当前主题：优先 localStorage，其次系统偏好 */
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** 将主题应用到 <html> 元素 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  /** 初始化：同步当前主题状态 */
  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  /** 监听系统主题变化（当用户未手动设置偏好时跟随系统） */
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      // 仅当 localStorage 中无显式设置时跟随系统
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        const next: Theme = e.matches ? "dark" : "light";
        setTheme(next);
        applyTheme(next);
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  /** 切换主题 */
  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={t("nav.theme")}
      title={t("nav.theme")}
      className="relative"
    >
      {/* 图标动画切换 */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "moon" : "sun"}
          initial={{ rotate: -90, opacity: 0, scale: 0.8 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
      {/* 防止布局偏移的占位（宽高为 0 但保持按钮可点击区域） */}
      <span className="sr-only">
        {mounted ? t("nav.theme") : ""}
      </span>
    </Button>
  );
}
