"use client";

/**
 * NotificationDrawer —— 用户通知列表侧边抽屉
 *
 * 展示当前登录用户的有效通知（后端过滤：生效中、未过期、对该用户可见）：
 *   - 单条点击：标记为已读；若配置了跳转链接则自动跳转
 *     （站内路径 → 路由跳转；外链 → 新标签页打开）
 *   - 「全部标为已读」：一次标记全部通知
 *   - 未读变化通过 onUnreadChange 同步给父级（头像菜单未读角标）
 *
 * 实现：复用 ui/dialog（Radix Dialog）并覆盖为右侧滑入面板，
 * 自动获得 Portal（避免祖先 transform 影响定位）、焦点圈定与 Escape 关闭。
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/notifications";
import type { NotificationItem } from "@/types/api";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { cn } from "@/lib/utils";

export function NotificationDrawer({
  open,
  onOpenChange,
  onUnreadChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 未读数变化时同步给父级（未登录时父级传 undefined 也可安全调用） */
  onUnreadChange?: (unread: number) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [acting, setActing] = useState(false);

  const syncUnread = useCallback(
    (n: number) => {
      setUnread(n);
      onUnreadChange?.(n);
    },
    [onUnreadChange]
  );

  // 打开抽屉时拉取最新通知列表
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    listMyNotifications()
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        syncUnread(data.unread_count);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, syncUnread]);

  /** 站内路径走路由跳转；外链新标签页打开（noopener 防止反向标签劫持） */
  const navigate = (link: string) => {
    onOpenChange(false);
    if (link.startsWith("/")) {
      router.push(link);
    } else {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.is_read) {
      try {
        const res = await markNotificationRead(item.id);
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        );
        syncUnread(res.unread_count);
      } catch {
        // 已读标记失败不阻断跳转
      }
    }
    if (item.link) navigate(item.link);
  };

  const handleMarkAll = async () => {
    if (acting) return;
    setActing(true);
    try {
      const res = await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      syncUnread(res.unread_count);
    } catch {
      // 静默失败：保持当前状态，用户可重试
    } finally {
      setActing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // 覆盖居中弹窗样式 → 右侧全高抽屉（twMerge 处理与基类冲突）
          "left-auto right-0 top-0 h-full max-h-screen w-full max-w-md translate-x-0 translate-y-0 p-0 rounded-none sm:rounded-none",
          "flex flex-col gap-0",
          "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
        )}
      >
        <DialogHeader className="px-4 pt-4 pb-3 border-b space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4" aria-hidden />
            {t("notifications.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("notifications.title")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
          <span className="text-xs text-muted-foreground">
            {t("notifications.unreadCount", { count: unread })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAll}
            disabled={acting || unread === 0}
            className="h-7 gap-1.5 px-2 text-xs"
          >
            {acting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            {t("notifications.markAllRead")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : loadFailed ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {t("notifications.loadFailed")}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <BellRing className="h-8 w-8 opacity-40" aria-hidden />
              <span className="text-sm">{t("notifications.empty")}</span>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left px-4 py-3 transition-colors hover:bg-accent/60 focus:bg-accent/60 focus:outline-none cursor-pointer"
                  >
                    <div className="flex items-start gap-2">
                      {/* 未读蓝点 */}
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          item.is_read ? "bg-transparent" : "bg-primary"
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-sm leading-snug line-clamp-1",
                              item.is_read
                                ? "text-foreground"
                                : "font-semibold text-foreground"
                            )}
                          >
                            {item.title}
                          </span>
                          {item.link && (
                            <ExternalLink
                              className="h-3 w-3 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2 whitespace-pre-line">
                          {item.content}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <FormattedUserActionTime
                            utcIso={item.published_at}
                            className="text-xs text-muted-foreground"
                          />
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full",
                              item.is_read
                                ? "bg-muted text-muted-foreground"
                                : "bg-primary/10 text-primary font-medium"
                            )}
                          >
                            {item.is_read
                              ? t("notifications.read")
                              : t("notifications.unread")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
