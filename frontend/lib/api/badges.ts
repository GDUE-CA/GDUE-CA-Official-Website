/**
 * Badges API - 对应后端 app/api/badges.py（/api/admin/users/{user_id}/badges）
 *
 * 徽章纯 UI 展示装饰，与权限彻底解耦；仅拥有 badges 模块权限的管理员可维护。
 */
import { apiFetch } from "./client";
import type {
  AdminBadgeListOut,
  AdminCustomBadge,
  CustomBadgePayload,
} from "@/types/api";

/** 徽章列表：系统徽章只读 key + 自定义徽章完整记录（含 inactive） */
export function fetchUserBadges(userId: number) {
  return apiFetch<AdminBadgeListOut>(`/api/admin/users/${userId}/badges`, {
    withAuth: true,
  });
}

/** 新增自定义徽章（active 达上限时后端返回 409） */
export function createUserBadge(userId: number, payload: CustomBadgePayload) {
  return apiFetch<AdminCustomBadge>(`/api/admin/users/${userId}/badges`, {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 修改自定义徽章（传啥改啥） */
export function updateUserBadge(
  userId: number,
  badgeId: number,
  payload: Partial<CustomBadgePayload> & { is_active?: boolean },
) {
  return apiFetch<AdminCustomBadge>(
    `/api/admin/users/${userId}/badges/${badgeId}`,
    {
      method: "PUT",
      withAuth: true,
      body: JSON.stringify(payload),
    },
  );
}

/** 整体排序：提交全部自定义徽章 id 的目标顺序 */
export function reorderUserBadges(userId: number, ids: number[]) {
  return apiFetch<{ ok: boolean }>(
    `/api/admin/users/${userId}/badges/reorder`,
    {
      method: "PUT",
      withAuth: true,
      body: JSON.stringify({ ids }),
    },
  );
}

/** 删除自定义徽章（物理删除） */
export function deleteUserBadge(userId: number, badgeId: number) {
  return apiFetch<null>(`/api/admin/users/${userId}/badges/${badgeId}`, {
    method: "DELETE",
    withAuth: true,
  });
}
