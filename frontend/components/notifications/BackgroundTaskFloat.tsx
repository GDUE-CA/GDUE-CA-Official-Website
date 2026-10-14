"use client";

/**
 * BackgroundTaskFloat —— 后台任务右下角悬浮弹窗（toast 式，非阻塞）
 *
 * 数据同源：与通知中心一样读取 background_tasks 表（未手动关闭的任务）。
 * - 仅管理员级角色激活（本地 session 预检 + 接口 401/403 兜底隐藏）；
 * - 存在进行中任务时以 800ms 轮询；全部进入终态（success/failed）即停止轮询，
 *   卡片留在右下角，用户手动点 X 关闭（dismiss）后才消失；
 * - 监听 BG_TASK_SUBMITTED_EVENT：设置页提交导出后立即刷新并恢复轮询，
 *   用户切到别的页面后回到本站任意页面仍能看到进度。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BG_TASK_SUBMITTED_EVENT,
  dismissBackgroundTask,
  listBackgroundTasks,
} from "@/lib/api/backgroundTasks";
import { ApiError } from "@/lib/api/client";
import { getSession, isAdminRole } from "@/lib/auth";
import type { BackgroundTask } from "@/types/api";
import { BackgroundTaskCard } from "./BackgroundTaskCard";

const POLL_INTERVAL_MS = 800;

export function BackgroundTaskFloat() {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const stoppedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** 拉取一次列表；有进行中任务则 800ms 后继续轮询，否则停止 */
  const tick = useCallback(async () => {
    try {
      const res = await listBackgroundTasks({ limit: 20 });
      if (stoppedRef.current) return;
      setTasks(res.items);
      clearTimer();
      const hasActive = res.items.some(
        (t) => t.status === "pending" || t.status === "running"
      );
      if (hasActive) {
        timerRef.current = window.setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }
    } catch (e) {
      // 未登录/非管理员/会话失效：隐藏并停止轮询
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setAllowed(false);
        setTasks([]);
      }
    }
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    // 本地预检：仅管理员级角色发起请求（普通成员/访客不打扰后端）
    const s = getSession();
    if (!s || !isAdminRole(s.role)) return;
    setAllowed(true);
    void tick();

    /** 提交导出后：立即刷新一次并恢复轮询 */
    const onSubmitted = () => {
      clearTimer();
      void tick();
    };
    window.addEventListener(BG_TASK_SUBMITTED_EVENT, onSubmitted);
    return () => {
      stoppedRef.current = true;
      clearTimer();
      window.removeEventListener(BG_TASK_SUBMITTED_EVENT, onSubmitted);
    };
  }, [tick]);

  const handleDismiss = useCallback(async (taskId: string) => {
    setDismissingId(taskId);
    try {
      await dismissBackgroundTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      // 关闭失败保留卡片，用户可重试
    } finally {
      setDismissingId(null);
    }
  }, []);

  if (!allowed || tasks.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        {tasks.map((task) => (
          <BackgroundTaskCard
            key={task.id}
            task={task}
            onDismiss={handleDismiss}
            dismissing={dismissingId === task.id}
          />
        ))}
      </div>
    </div>
  );
}
