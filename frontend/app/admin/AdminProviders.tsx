"use client";

/**
 * Admin i18n Provider：管理员后台多语言
 * - locale 来源优先级：URL 顶层段（/{locale}/admin/**）→ localStorage 记忆 → defaultLocale
 *   （经 next.config rewrite 后 usePathname 返回浏览器源 URL，含 locale 段）
 * - 切换语言由 useSwitchLocale 完成（只换 URL 顶层段，保留子路径与 query，规范 §3）；
 *   setLocale 内部委托给 useSwitchLocale，保持旧调用方兼容
 * - localStorage 仅作记忆 / URL 无 locale 时的兜底
 * - 6 份字典静态打包进 admin 路由，切换无请求
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { I18nProvider } from "@/i18n/provider";
import { SessionHeartbeat } from "@/components/shared/SessionHeartbeat";
import { useSwitchLocale } from "@/lib/navigation";
import { defaultLocale, urlLangToLocale, type Locale, localeFallbackMap } from "@/lib/i18n";
import type { Messages } from "@/i18n/dictionary";
import zhCN from "@/i18n/messages/zh-cn.json";
import zhCNSG from "@/i18n/messages/zh-cn-sg.json";
import zhTW from "@/i18n/messages/zh-tw.json";
import zhMO from "@/i18n/messages/zh-mo.json";
import zhYueCN from "@/i18n/messages/zh-yue-cn.json";
import zhYueHK from "@/i18n/messages/zh-yue-hk.json";
import enGB from "@/i18n/messages/en-gb.json";
import jaJP from "@/i18n/messages/ja-jp.json";
import koKR from "@/i18n/messages/ko-kr.json";
import esES from "@/i18n/messages/es-es.json";
import frFR from "@/i18n/messages/fr-fr.json";
import deDE from "@/i18n/messages/de-de.json";
import ruRU from "@/i18n/messages/ru-ru.json";

/** 深合并：base 为底，override 的键覆盖 base（递归嵌套对象） */
function deepMerge<T>(base: T, override: unknown): T {
  if (
    base && typeof base === "object" && !Array.isArray(base) &&
    override && typeof override === "object" && !Array.isArray(override)
  ) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out as T;
  }
  return (override as T) ?? base;
}

/** 变体语言缺失词条深合并父语言（zh-cn）；非变体直接返回 */
function buildDict(loc: Locale, own: unknown): Messages {
  const fallback = localeFallbackMap[loc];
  if (!fallback) return own as Messages;
  // 变体：先加载父语言（zh-cn）再合并变体自身差异 key
  const parent = loc.startsWith("zh-") ? zhCN : enGB;
  return deepMerge(parent, own) as Messages;
}

const DICTS: Record<Locale, Messages> = {
  "zh-cn": zhCN as unknown as Messages,
  "zh-cn-sg": buildDict("zh-cn-sg", zhCNSG),
  "zh-tw": zhTW as unknown as Messages,
  "zh-mo": buildDict("zh-mo", zhMO),
  "zh-yue-cn": buildDict("zh-yue-cn", zhYueCN),
  "zh-yue-hk": buildDict("zh-yue-hk", zhYueHK),
  "en-gb": enGB as unknown as Messages,
  "ja-jp": jaJP as unknown as Messages,
  "ko-kr": koKR as unknown as Messages,
  "es-es": esES as unknown as Messages,
  "fr-fr": frFR as unknown as Messages,
  "de-de": deDE as unknown as Messages,
  "ru-ru": ruRU as unknown as Messages,
};

const STORAGE_KEY = "gdueca-admin-locale";

interface AdminLocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const AdminLocaleContext = createContext<AdminLocaleContextValue | null>(null);

export function useAdminLocale(): AdminLocaleContextValue {
  const ctx = useContext(AdminLocaleContext);
  if (!ctx) throw new Error("useAdminLocale must be used within AdminProviders");
  return ctx;
}

export function AdminProviders({ children }: { children: ReactNode }) {
  // URL 顶层段为 locale 来源（优先级最高）；取不到时降级 localStorage → default
  const pathname = usePathname() ?? "/";
  const urlLocale = urlLangToLocale(pathname.split("/")[1] ?? "");
  const switchLocale = useSwitchLocale();
  const [locale, setLocaleState] = useState<Locale>(urlLocale ?? defaultLocale);

  useEffect(() => {
    if (urlLocale) {
      // URL 有 locale：以 URL 为准，同步记忆
      window.localStorage.setItem(STORAGE_KEY, urlLocale);
      setLocaleState(urlLocale);
      return;
    }
    // URL 无 locale（理论上 proxy 已重定向；兜底读 localStorage）
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const loc = saved ? urlLangToLocale(saved) : null;
    if (loc) setLocaleState(loc);
  }, [urlLocale]);

  // setLocale：写记忆 + 切 URL 顶层段（规范 §3，保留子路径与 query）
  function setLocale(l: Locale) {
    window.localStorage.setItem(STORAGE_KEY, l);
    setLocaleState(l);
    switchLocale(l);
  }

  return (
    <AdminLocaleContext.Provider value={{ locale, setLocale }}>
      <I18nProvider locale={locale} messages={DICTS[locale]}>
        <SessionHeartbeat />
        {children}
      </I18nProvider>
    </AdminLocaleContext.Provider>
  );
}
