"use client";

/**
 * HtmlLangSync - 客户端导航切换语言时同步 <html lang>
 *
 * 首屏 lang 由根 layout 按 proxy.ts 注入的 x-locale 在服务端直接输出；
 * 但根 layout 在客户端导航（语言切换走 router.push）时不会重新渲染，需由此组件补齐。
 */
import { useEffect } from "react";

export function HtmlLangSync({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
