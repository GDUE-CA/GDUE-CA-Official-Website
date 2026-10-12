"use client";

/**
 * ThemeToggle - 深浅色主题切换按钮（admin 后台使用）
 * - 主题逻辑收敛于 useTheme hook（localStorage `gdueca-theme` + <html>.dark）
 * - 使用 AnimatePresence 实现 Sun/Moon 图标平滑过渡
 */
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useTheme } from "@/lib/hooks/useTheme";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, mounted, setTheme } = useTheme();

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
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
