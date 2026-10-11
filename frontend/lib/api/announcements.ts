/**
 * Announcements API - 对应后端 app/api/announcements.py
 *
 * 公告 CMS：信息通知（homepage）+ 主页公告（home，官网首页「最新公告」栏目）。
 * 公开接口自动过滤【时间生效中 + 已启用】。
 */
import { apiFetch } from "./client";
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementCreate,
  AnnouncementUpdate,
  Paginated,
} from "@/types/api";

/** 公开：当前生效中的公告（自动过滤过期/未启用；lang 传入时标题/内容由后端自动翻译） */
export function listPublicAnnouncements(category?: AnnouncementCategory, lang?: string) {
  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (lang) qs.set("lang", lang);
  const query = qs.toString();
  return apiFetch<Announcement[]>(`/api/announcements${query ? `?${query}` : ""}`);
}

/** 管理：公告分页列表 */
export function adminListAnnouncements(params: {
  category?: AnnouncementCategory;
  enabled?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.enabled !== undefined) qs.set("enabled", String(params.enabled));
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<Announcement>>(
    `/api/admin/announcements${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

export function adminGetAnnouncement(id: number) {
  return apiFetch<Announcement>(`/api/admin/announcements/${id}`, { withAuth: true });
}

export function adminCreateAnnouncement(payload: AnnouncementCreate) {
  return apiFetch<Announcement>("/api/admin/announcements", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminUpdateAnnouncement(id: number, payload: AnnouncementUpdate) {
  return apiFetch<Announcement>(`/api/admin/announcements/${id}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminDeleteAnnouncement(id: number) {
  return apiFetch<void>(`/api/admin/announcements/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}
