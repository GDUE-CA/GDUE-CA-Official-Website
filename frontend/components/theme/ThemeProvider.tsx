"use client";

/**
 * 全局风格主题 Provider（与颜色模式 light/dark 正交）
 *
 * - 主题列表来自后端 GET /api/themes（管理员可上传/启停，无需改前端代码）；
 * - 当前主题 key 存 localStorage（gdueca-theme-style），校验在启用列表内否则回退 "default"；
 * - 应用方式：<html> data-theme-style=key + 注入 css_vars（dark 模式叠加 dark_vars）；
 * - MutationObserver 监听 <html> class 变化（dark 切换）时重注变量包。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listPublicThemes } from "@/lib/api/themes";
import { applyThemeStyle, getStoredThemeStyle } from "@/lib/theme";
import type { Theme, ThemeLayout } from "@/types/api";

interface ThemeStyleContextValue {
  /** 已启用主题列表（未加载完成前为空数组） */
  themes: Theme[];
  /** 当前主题 key */
  current: string;
  /** 当前主题布局骨架（列表未加载前按存储 key 推断：apple→apple，其余→microsoft） */
  layout: ThemeLayout;
  /** 切换主题：应用变量包 + 写 localStorage */
  setTheme: (key: string) => void;
}

const ThemeStyleContext = createContext<ThemeStyleContextValue>({
  themes: [],
  current: "default",
  layout: "microsoft",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeStyleContext);
}

/** 注入一组 CSS 变量到 <html>，返回本次注入的键集合 */
function injectVars(vars: Record<string, string>, injected: Set<string>) {
  const el = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    el.style.setProperty(k, v);
    injected.add(k);
  }
}

/** 清除上次注入的全部变量 */
function clearVars(injected: Set<string>) {
  const el = document.documentElement;
  for (const k of injected) el.style.removeProperty(k);
  injected.clear();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [current, setCurrent] = useState<string>("default");
  // 当前已注入的变量键（切换主题/dark 时先清除再注入）
  const injectedRef = useRef<Set<string>>(new Set());
  const themesRef = useRef<Theme[]>([]);
  const currentRef = useRef<string>("default");

  const applyTheme = useCallback((key: string, list: Theme[]) => {
    const theme = list.find((t) => t.key === key);
    const el = document.documentElement;
    el.setAttribute("data-theme-style", key);
    clearVars(injectedRef.current);
    if (theme) {
      injectVars(theme.css_vars ?? {}, injectedRef.current);
      const isDark = el.classList.contains("dark");
      if (isDark && theme.dark_vars) {
        injectVars(theme.dark_vars, injectedRef.current);
      }
    }
  }, []);

  // 初始化：拉取主题列表 → 校验存储 key 在启用列表内（否则回退 default）→ 应用
  useEffect(() => {
    let cancelled = false;
    const stored = getStoredThemeStyle();
    listPublicThemes()
      .then((list) => {
        if (cancelled) return;
        const valid = list.some((t) => t.key === stored) ? stored : "default";
        themesRef.current = list;
        currentRef.current = valid;
        setThemes(list);
        setCurrent(valid);
        applyTheme(valid, list);
      })
      .catch(() => {
        // 列表加载失败：仍按存储 key 设置属性（基础 CSS 变量兜底，UI 可用）
        if (cancelled) return;
        currentRef.current = stored;
        setCurrent(stored);
        applyTheme(stored, []);
      });
    return () => {
      cancelled = true;
    };
  }, [applyTheme]);

  // dark 模式切换监听：<html> class 变化时重注变量包（dark_vars 仅在 dark 生效）
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === "class") {
          applyTheme(currentRef.current, themesRef.current);
          break;
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [applyTheme]);

  const setTheme = useCallback(
    (key: string) => {
      currentRef.current = key;
      setCurrent(key);
      applyTheme(key, themesRef.current);
      // 持久化（写 localStorage + 同步 data-theme-style，applyTheme 已设属性，这里补存储）
      applyThemeStyle(key);
    },
    [applyTheme]
  );

  const layout: ThemeLayout =
    themes.find((t) => t.key === current)?.layout ??
    (current === "apple" ? "apple" : "microsoft");

  return (
    <ThemeStyleContext.Provider value={{ themes, current, layout, setTheme }}>
      {children}
    </ThemeStyleContext.Provider>
  );
}
