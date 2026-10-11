"use client";

/**
 * 服务端权威时间 Hook（规范 docs/SPEC.md §9）
 *
 * - useServerNow(): 服务器校准后的当前时间，默认每秒跳一次；偏移量校准后立即刷新
 * - useCountDown(target): 距目标时间的剩余毫秒数（服务端时钟）
 * - useCountUp(start): 自起始时间起经过的毫秒数（服务端时钟）
 *
 * 铁律：所有限时逻辑、过期判断、截止校验全部由后端执行；
 * 本 Hook 产出的时间仅用于 UI 展示，禁止参与任何业务判定。
 */
import { useEffect, useState } from "react";
import { getServerNow, subscribeServerTime } from "@/lib/serverTime";

const TICK_MS = 1000;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function useServerNow(tickMs: number = TICK_MS): Date {
  const [now, setNow] = useState<Date>(() => getServerNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(getServerNow()), tickMs);
    const unsubscribe = subscribeServerTime(() => setNow(getServerNow()));
    return () => {
      window.clearInterval(id);
      unsubscribe();
    };
  }, [tickMs]);
  return now;
}

export function useCountDown(target: string | Date | null | undefined): number {
  const now = useServerNow();
  const end = toDate(target);
  if (!end) return 0;
  return Math.max(0, end.getTime() - now.getTime());
}

export function useCountUp(start: string | Date | null | undefined): number {
  const now = useServerNow();
  const begin = toDate(start);
  if (!begin) return 0;
  return Math.max(0, now.getTime() - begin.getTime());
}
