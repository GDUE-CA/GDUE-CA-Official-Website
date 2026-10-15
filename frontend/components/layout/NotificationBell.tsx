"use client";

/**
 * NotificationBell —— 顶部导航栏独立通知铃铛入口（从 UserMenu 下拉中迁出）。
 *
 * 显示未读角标，点击打开 NotificationDrawer 抽屉。未登录时不渲染。
 */
import { useEffect, useState } from "react";
import Bell from "@/assets/icons/status/bell.svg";
import { Button } from "@/components/ui/button";
import { listMyNotifications } from "@/lib/api/notifications";
import { isLogged } from "@/lib/auth";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";

export function NotificationBell() {
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
        asChild
        variant="ghost"
        size="icon"
        onClick={() => setNotifOpen(true)}
        className="relative"
        aria-label="Notifications"
      >
        <span>
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-4 text-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </span>
      </Button>
      <NotificationDrawer
        open={notifOpen}
        onOpenChange={setNotifOpen}
        onUnreadChange={setUnreadCount}
      />
    </>
  );
}
