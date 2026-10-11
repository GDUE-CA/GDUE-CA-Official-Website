"use client";

/**
 * SessionHeartbeat —— 登录会话心跳保活
 *
 * 页面可见时每 4 分钟调用一次 /api/auth/heartbeat（后端滑动续期 30 分钟空闲窗口）；
 * 标签页从后台回到前台时立即补一次心跳，保持「后台挂机也能延长会话」。
 * 收到 401（会话超时/被踢出）时清除本地登录态；admin 路径下自动跳转登录页。
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { heartbeat } from "@/lib/api/auth";
import { clearLocalSession, isLogged } from "@/lib/auth";
import { ApiError } from "@/lib/api/client";

const INTERVAL_MS = 4 * 60 * 1000;

export function SessionHeartbeat() {
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;

    async function ping() {
      if (stopped) return;
      if (document.visibilityState !== "visible" || !isLogged()) return;
      try {
        await heartbeat();
      } catch (err) {
        // 会话已失效/被踢出 → 清除本地登录态
        if (err instanceof ApiError && err.status === 401) {
          clearLocalSession();
          if (pathname.startsWith("/admin")) {
            window.location.href = "/admin/login";
          }
        }
      }
    }

    const timer = window.setInterval(ping, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
