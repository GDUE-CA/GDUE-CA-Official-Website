"use client";

/**
 * CountUp - 数字滚动动效（from → to，支持倒数）
 *
 * - SSR 输出最终值：无 JS / 搜索引擎 / 动画结束后都是正确数字；挂载后先置为 from 再滚动到 to
 * - 进入视口才开始（once）；prefers-reduced-motion 时直接显示最终值
 * - 直接写 textContent，不触发 React 重渲染；tabular-nums 防止位数变化时宽度抖动
 */
import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CountUpProps {
  to: number;
  from?: number;
  /** 秒 */
  duration?: number;
  /** 秒 */
  delay?: number;
  className?: string;
}

export function CountUp({ to, from = 0, duration = 1.6, delay = 0, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reducedMotion = useReducedMotion();

  // 挂载即置为起始值（数据格此时仍处于淡入前的透明状态，不会闪现最终值）
  useEffect(() => {
    if (!reducedMotion && ref.current) ref.current.textContent = String(from);
  }, [from, reducedMotion]);

  useEffect(() => {
    if (!inView || reducedMotion) return;
    const controls = animate(from, to, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1], // easeOutExpo：开头快、结尾缓缓落定
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = String(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [inView, reducedMotion, from, to, duration, delay]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {to}
    </span>
  );
}
