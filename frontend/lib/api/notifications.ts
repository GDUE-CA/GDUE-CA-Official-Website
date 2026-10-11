/**
 * Notifications API - 对应后端 app/api/notifications.py
 *
 * 用户信息通知：有效通知列表（后端过滤生效中/未过期/可见，含 is_read 与
 * unread_count）+ 单条已读 + 全部已读。通知来源为后台「信息通知」。
 */
import { apiFetch } from "./client";
import type {
  MarkReadResponse,
  NotificationListResponse,
} from "@/types/api";

/** 当前登录用户的有效通知列表（生效中、未过期、对该用户可见） */
export function listMyNotifications() {
  return apiFetch<NotificationListResponse>("/api/notifications", {
    withAuth: true,
  });
}

/** 单条通知标记为已读（幂等），返回最新未读数 */
export function markNotificationRead(id: number) {
  return apiFetch<MarkReadResponse>(`/api/notifications/${id}/read`, {
    method: "POST",
    withAuth: true,
  });
}

/** 全部标为已读，返回未读数（恒为 0） */
export function markAllNotificationsRead() {
  return apiFetch<MarkReadResponse>("/api/notifications/read-all", {
    method: "POST",
    withAuth: true,
  });
}
