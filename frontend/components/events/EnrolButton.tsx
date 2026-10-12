"use client";

/**
 * EnrolButton - 一键报名 / 取消报名交互按钮（P0 活动模块）
 *
 * ISR 列表数据中的 enrolled 字段是缓存值，本组件挂载时实时拉取：
 * 1. fetchMe() 判断登录态；未登录展示「登录后报名」入口（跳转登录页）
 * 2. 已登录拉取活动详情，取实时 enrolled / runtime_status / enrolled_count
 * 3. 报名/取消报名调用后端接口；归档、时间约束等由后端强制拦截（403），
 *    前端仅在 runtime_status = registration_open 时启用报名，其余状态禁用并提示
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { fetchActivityById, enrolActivity, cancelEnrolActivity } from "@/lib/api/activities";
import { fetchMe } from "@/lib/api/auth";
import type { RuntimeStatus } from "@/types/api";

interface EnrolButtonProps {
  eventId: number;
  /** 尺寸变体：列表行用 sm，详情页用 default */
  size?: "default" | "sm";
}

/** 各实时状态下报名按钮的可操作性：仅「报名中」可报名 */
function canEnrol(status: RuntimeStatus | null): boolean {
  return status === "registration_open";
}

/** 非报名中状态下的禁用提示文案 key */
function disabledReasonKey(status: RuntimeStatus | null): string {
  switch (status) {
    case "pre_register":
      return "events.enrol.notStarted";
    case "upcoming":
      return "events.enrol.registerClosed";
    case "ongoing":
      return "events.enrol.ongoing";
    case "ended":
      return "events.enrol.ended";
    default:
      return "events.enrol.unavailable";
  }
}

export function EnrolButton({ eventId, size = "default" }: EnrolButtonProps) {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** 挂载：并发拉取登录态与活动实时状态（游客时详情请求可能 200，仅用于状态展示） */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [me, activity] = await Promise.allSettled([
          fetchMe(),
          fetchActivityById(eventId),
        ]);
        if (!alive) return;
        if (me.status === "fulfilled") setLoggedIn(true);
        if (activity.status === "fulfilled") {
          const a = activity.value;
          setEnrolled(a.enrolled);
          setRuntimeStatus(a.runtime_status);
          setCount(a.enrolled_count);
        }
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventId]);

  const handleEnrol = useCallback(async () => {
    if (!loggedIn) {
      router.push(lp("/auth/login"));
      return;
    }
    setSubmitting(true);
    try {
      if (enrolled) {
        await cancelEnrolActivity(eventId);
        setEnrolled(false);
        setCount((c) => (c === null ? null : Math.max(0, c - 1)));
      } else {
        const res = await enrolActivity(eventId);
        setEnrolled(true);
        setCount(res.enrolled_count);
      }
    } catch (e) {
      // 归档 403 / 时间约束 / 未实名等由后端拦截，直接展示后端 message
      alert(e instanceof Error ? e.message : t("events.enrol.failed"));
    } finally {
      setSubmitting(false);
    }
  }, [loggedIn, enrolled, eventId, router, t, lp]);

  if (checking) {
    return (
      <Button variant="outline" size={size} disabled>
        {t("common.loading")}
      </Button>
    );
  }

  // 已报名：取消报名（outline），任何状态都允许尝试（归档由后端 403 拦截）
  if (enrolled) {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleEnrol}
        disabled={submitting}
      >
        {submitting ? t("common.processing") : t("events.enrol.cancel")}
      </Button>
    );
  }

  // 未报名：
  // - 游客 → 登录入口
  // - 报名中 → 立即报名
  // - 其余状态 → 禁用 + 原因提示
  if (!loggedIn) {
    return (
      <Button variant="default" size={size} onClick={handleEnrol}>
        {t("events.enrol.loginRequired")}
      </Button>
    );
  }

  if (!canEnrol(runtimeStatus)) {
    return (
      <Button
        variant="secondary"
        size={size}
        disabled
        title={count !== null ? `${t("events.enrolledCount")}: ${count}` : undefined}
      >
        {t(disabledReasonKey(runtimeStatus))}
      </Button>
    );
  }

  return (
    <Button variant="default" size={size} onClick={handleEnrol} disabled={submitting}>
      {submitting ? t("common.processing") : t("events.enrol.enrol")}
    </Button>
  );
}
