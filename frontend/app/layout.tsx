import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import Script from "next/script";
import "@/app/globals.css";

/**
 * 根 layout：所有路由（含 / 和 /admin）共享
 * 负责 <html><body>、字体变量、防 FOUC 主题脚本、全局 CSS
 * 读取 proxy.ts 生成的 CSP nonce（x-nonce），因此全站为动态渲染
 * 各子 layout（[locale] / admin）负责具体的 Provider 与框架
 */
/** 西文正文 / 标题字体；中文回退到系统黑体（见 globals.css --font-sans） */
const sansFont = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
});

/** 日期、编号、数据等辅助信息 */
const monoFont = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "广东第二师范学院计算机协会",
    template: "%s | 广东第二师范学院计算机协会",
  },
  description: "广东第二师范学院（花都校区）计算机协会官方网站",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="zh-cn"
      className={`${sansFont.variable} ${monoFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* 防 FOUC 主题初始化脚本：必须直接放在根 layout 的 <head> 内，
            不能包在子组件里——beforeInteractive 脚本仅在根 layout/page 有效，
            嵌套进子组件会触发 React "script tag inside component" 警告 */}
        <Script
          id="gdueca-theme-init"
          strategy="beforeInteractive"
          nonce={nonce}
          suppressHydrationWarning
        >
          {`(function(){try{var s=localStorage.getItem('gdueca-theme');var t=s||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-background">
        {children}
      </body>
    </html>
  );
}
