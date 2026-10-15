"use client";

/**
 * NotificationBell —— 顶部导航栏独立通知铃铛入口（从 UserMenu 下拉中迁出）。
 *
 * 显示未读角标，点击打开 NotificationDrawer 抽屉。未登录时不渲染。
 * 必须渲染为真正的 <button>（可聚焦、可键盘触发）；aria-label 本地化并带未读数，角标对读屏隐藏避免重复朗读
 */
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { listMyNotifications } from "@/lib/api/notifications";
import { isLogged } from "@/lib/auth";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";

export function NotificationBell() {
  const { t } = useI18n();
  const [loggedIn, setLoggedIn] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const logged = isLogged();
    setLoggedIn(logged);
    if (logged) {
      listMyNotifications()
        .then((data) => setUnreadCount(data.unread_count))
        .catch(() => undefined);
    }
  }, []);

  if (!loggedIn) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setNotifOpen(true)}
        className="relative"
        aria-label={
          unreadCount > 0
            ? `${t("nav.notifications")} (${t("notifications.unreadCount", { count: unreadCount })})`
            : t("nav.notifications")
        }
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-4 text-center"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
      <NotificationDrawer
        open={notifOpen}
        onOpenChange={setNotifOpen}
        onUnreadChange={setUnreadCount}
      />
    </>
  );
}
