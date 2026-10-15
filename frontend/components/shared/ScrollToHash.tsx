"use client";

/**
 * ScrollToHash —— 挂载后按 location.hash 滚动到对应锚点。
 *
 * Next 客户端导航（link 点击）不保证自动滚动到 hash 目标；服务端初始渲染
 * 的 hash 定位也依赖元素已存在。为满足「访问 /{locale}/about#contact 自动滚动」
 * 的规格要求，在页面内挂载本组件做一次性滚动定位。
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ScrollToHash() {
  const pathname = usePathname();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) {
      // 等一帧确保布局稳定后再滚动
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [pathname]);

  return null;
}
