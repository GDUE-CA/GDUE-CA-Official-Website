"use client";

/**
 * useEffectiveTimezone —— GDUECA Tier-0 时区系统唯一可信时区来源
 *
 * 三级优先级（和后端 API 无关，纯前端客户端 hook）：
 *
 *   1. 登录管理员【用户时区】(User.timezone !== null)
 *      → 直接使用账号手动指定的 IANA 时区
 *
 *   2. 登录管理员【用户时区】为 null 或游客【无账号】
 *      → 使用 Intl 探测到的浏览器 IANA 时区
 *
 *   3. 浏览器探测失败（极罕见）
 *      → 降级到后端返回的【系统时区】(SystemSetting.system_timezone)
 *      → 系统时区本身也拿不到时，硬编码 Asia/Shanghai 兜底
 *
 * 这个 hook 和 `useI18n()` 完全解耦，任何客户端组件都能独立消费。
 * 它还负责启动时把 `User.timezone === ""` 这类脏值修正为 null。
 */
import { useEffect, useState } from "react";
import { fetchProfile } from "@/lib/api/auth";
import { fetchPublicSettings } from "@/lib/api/system";
import { isLogged } from "@/lib/auth";
import type { AdminUser } from "@/types/api";

const FALLBACK = "Asia/Shanghai";

/** 浏览器是否可探测 IANA 时区 */
function detectBrowserTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && typeof tz === "string" && tz.length > 0) return tz;
  } catch {
    /* ignore */
  }
  return "";
}

/** 当前是否处于已登录状态（本地展示信息；接口失败时视为未登录） */
function isLoggedIn(): boolean {
  return isLogged();
}

export interface EffectiveTimezone {
  /** 最终生效的 IANA 时区 */
  tz: string;
  /** 浏览器探测到的 IANA 时区（或空串） */
  browserTz: string;
  /** 后端系统时区（或 FALLBACK） */
  systemTz: string;
  /** 登录用户时区（null = 自动 / IANA = 手动） */
  userTz: string | null;
  /** 是否已挂载完成（SSR 期间为 false） */
  ready: boolean;
  /** 当前是否登录管理员 */
  loggedIn: boolean;
}

export function useEffectiveTimezone(): EffectiveTimezone {
  const [state, setState] = useState<EffectiveTimezone>({
    tz: FALLBACK,
    browserTz: "",
    systemTz: FALLBACK,
    userTz: null,
    ready: false,
    loggedIn: false,
  });

  useEffect(() => {
    const browserTz = detectBrowserTz();
    const loggedInNow = isLoggedIn();

    // 1) 先算一个同步初值（浏览器时区 + 登录状态立即可得）
    let userTz: string | null = null;
    let systemTz = FALLBACK;
    let effective = browserTz || FALLBACK;

    // 2) 异步拿后端数据（用户时区 / 系统时区），拿到后再重算
    const tasks: Promise<void>[] = [];

    if (loggedInNow) {
      tasks.push(
        fetchProfile()
          .then((p: AdminUser) => {
            // API 返回的 timezone 可能是 ""（空串），规范化为 null 以便下游统一处理
            const norm = p.timezone && p.timezone.trim() ? p.timezone : null;
            userTz = norm;
            if (norm) {
              // 用户手动指定了时区 → 最高优先级
              effective = norm;
            } else {
              // 用户开启自动 → 浏览器 > 系统
              effective = browserTz || systemTz;
            }
          })
          .catch(() => {
            /* profile 拉取失败，沿用 browser > 系统降级 */
          })
      );
    }

    tasks.push(
      fetchPublicSettings()
        .then((cfg) => {
          if (cfg.system_timezone && cfg.system_timezone.trim()) {
            systemTz = cfg.system_timezone;
          }
          // 如果还没拿到用户时区（游客 or profile 拉取失败），
          // 此时 systemTz 才可能影响 effective
          if (!loggedInNow || !userTz) {
            effective = browserTz || systemTz;
          }
        })
        .catch(() => {
          /* settings 拉取失败，硬编码 FALLBACK */
        })
    );

    Promise.allSettled(tasks).then(() => {
      setState({
        tz: effective,
        browserTz,
        systemTz,
        userTz,
        ready: true,
        loggedIn: loggedInNow,
      });
    });

    // 初次挂载先用「同步可得」的初值立即渲染，避免 SSR 水合失败
    setState({
      tz: effective,
      browserTz,
      systemTz,
      userTz,
      ready: true, // 首次同步后可视为 ready（后续后端拉到更精确值会 re-render）
      loggedIn: loggedInNow,
    });
    // 注意：这里故意不 await Promise.allSettled，
    // 让首帧立即可用；后端响应到达后再自动二次渲染刷新。
  }, []);

  return state;
}
