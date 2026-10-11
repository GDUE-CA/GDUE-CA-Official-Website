/**
 * Recycle Bin API - 对应后端 app/api/recycle.py
 *
 * 内容回收站：统一收纳所有软删除资源（用户、活动，后续模块扩展接入）。
 * 软删除超过 30 天由定时任务物理删除；管理员可提前恢复 / 手动永久清除。
 */
import { apiFetch } from "./client";

export interface RecycleUserItem {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  real_name: string | null;
  role: string;
  deleted_at: string | null;
  /** 距物理删除剩余天数（后端计算） */
  days_left: number | null;
}

export interface RecycleActivityItem {
  id: number;
  title: string;
  status: string;
  deleted_at: string | null;
  days_left: number | null;
}

export interface RecycleList {
  retention_days: number;
  users: RecycleUserItem[];
  activities: RecycleActivityItem[];
}

/** 回收站列表（用户 + 活动） */
export function listRecycle() {
  return apiFetch<RecycleList>("/api/admin/recycle", { withAuth: true });
}

/** 恢复软删除资源（rtype = user | activity；账号恢复仅 super_admin） */
export function restoreRecycleItem(rtype: "user" | "activity", rid: number) {
  return apiFetch<{ ok: boolean }>(
    `/api/admin/recycle/${rtype}/${rid}/restore`,
    { method: "POST", withAuth: true }
  );
}

/** 永久物理删除（204 无返回体；账号物理删除仅 super_admin） */
export function purgeRecycleItem(rtype: "user" | "activity", rid: number) {
  return apiFetch<void>(`/api/admin/recycle/${rtype}/${rid}`, {
    method: "DELETE",
    withAuth: true,
  });
}
