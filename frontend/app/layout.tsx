import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import "@/app/globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

/**
 * 根 layout：所有路由（含 / 和 /admin）共享
 * 负责 <html><body>、防 FOUC 主题脚本、全局 CSS
 * 读取 proxy.ts 生成的 CSP nonce（x-nonce），因此全站为动态渲染
 * 各子 layout（[locale] / admin）负责具体的 Provider 与框架
 *
 * 字体策略（规范 §7-5）：严禁下载任何 web 字体（无 next/font、无 @font-face），
 * 完全复用客户端本机系统字体（globals.css --font-sans 系统字体栈）。
 */

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
      className="h-full antialiased"
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
          {`(function(){try{var s=localStorage.getItem('gdueca-theme');var t=s||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');var ss=localStorage.getItem('gdueca-theme-style');if(ss&&/^[a-z][a-z0-9-]{0,31}$/.test(ss)){document.documentElement.setAttribute('data-theme-style',ss);}else{document.documentElement.setAttribute('data-theme-style','default');}}catch(e){}})();`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-background">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
