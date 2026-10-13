"use client";

/**
 * Admin i18n Provider：管理员后台多语言
 * - locale 来源优先级：URL 顶层段（/{locale}/admin/**）→ localStorage 记忆 → defaultLocale
 *   （经 next.config rewrite 后 usePathname 返回浏览器源 URL，含 locale 段）
 * - 切换语言由 useSwitchLocale 完成（只换 URL 顶层段，保留子路径与 query，规范 §3）；
 *   setLocale 内部委托给 useSwitchLocale，保持旧调用方兼容
 * - localStorage 仅作记忆 / URL 无 locale 时的兜底
 * - 字典懒加载：仅打包兜底 zh-cn，其余语言经 dictionaryLoaders 动态 import；
 *   沿 localeFallbackChain 合并（扁平 key 展开 + 空串剔除），切换语言零整页刷新
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { I18nProvider } from "@/i18n/provider";
import { SessionHeartbeat } from "@/components/shared/SessionHeartbeat";
import { useSwitchLocale } from "@/lib/navigation";
import {
  defaultLocale,
  urlLangToLocale,
  localeFallbackChain,
  dictionaryLoaders,
  type Locale,
} from "@/lib/i18n";
import type { Messages } from "@/i18n/dictionary";
import {
  expandFlatKeys,
  stripEmptyLeaves,
  mergeLocaleChain,
  type Dict,
} from "@/i18n/merge";
import zhCN from "@/i18n/messages/zh-cn.json";

const ZH_CN_MESSAGES = zhCN as unknown as Messages;

/** 已合并字典缓存（切回已加载语言无需重新请求） */
const dictCache = new Map<Locale, Messages>([["zh-cn", ZH_CN_MESSAGES]]);

/** 按回退链加载并合并某语言字典（扁平 key 展开 + 空串剔除，最终兜底 zh-cn） */
async function loadMergedDict(loc: Locale): Promise<Messages> {
  const cached = dictCache.get(loc);
  if (cached) return cached;
  const chain = localeFallbackChain(loc);
  const dicts = await Promise.all(
    chain.map(async (l) => {
      const raw = (await dictionaryLoaders[l]()) as unknown as Dict;
      return stripEmptyLeaves(expandFlatKeys(raw));
    })
  );
  const merged = mergeLocaleChain(dicts) as unknown as Messages;
  dictCache.set(loc, merged);
  return merged;
}

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
  // 当前生效字典：初始用缓存/zh-cn 兜底，目标语言加载完成后异步替换
  const [messages, setMessages] = useState<Messages>(
    () => dictCache.get(urlLocale ?? defaultLocale) ?? ZH_CN_MESSAGES
  );

  useEffect(() => {
    let cancelled = false;
    loadMergedDict(locale).then((m) => {
      if (!cancelled) setMessages(m);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

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
      <I18nProvider locale={locale} messages={messages}>
        <SessionHeartbeat />
        {children}
      </I18nProvider>
    </AdminLocaleContext.Provider>
  );
}
