/**
 * useIsMobile —— V0.5.7 后台列表统一响应式断点
 *
 * 断点定义（硬性约定）：
 *   桌面端 ≥768px：保持原生 Table 表格布局；
 *   移动端 < 768px（max-width:767px）：切换卡片式布局。
 *
 * SSR/水合安全：初始一律返回 false（与桌面端表格的 SSR 输出一致），
 * mount 后通过 matchMedia 同步真实值，避免 hydration mismatch。
 * 监听变化（如旋转屏幕/拖动窗口）实时更新。
 */
"use client";

import { useEffect, useState } from "react";

const MOBILE_MEDIA = "(max-width: 767px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_MEDIA);
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return isMobile;
}
