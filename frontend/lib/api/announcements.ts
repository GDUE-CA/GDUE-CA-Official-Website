/**
 * Announcements API - 对应后端 app/api/announcements.py
 *
 * 公告 CMS：信息通知（homepage）+ 主页公告（home，官网首页「最新公告」栏目）。
 * 公开接口自动过滤【时间生效中 + 已启用】。
 */
import { apiFetch } from "./client";
import type {
  Announcement,
  AnnouncementAttachment,
  AnnouncementCategory,
  AnnouncementCreate,
  AnnouncementUpdate,
  Paginated,
  PublicAnnouncement,
} from "@/types/api";

/** 公开：当前生效中的公告（自动过滤过期/未启用；lang 传入时标题/内容由后端自动翻译） */
export function listPublicAnnouncements(category?: AnnouncementCategory, lang?: string) {
  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (lang) qs.set("lang", lang);
  const query = qs.toString();
  return apiFetch<PublicAnnouncement[]>(`/api/announcements${query ? `?${query}` : ""}`);
}

/** 公开：单条公告详情（仅生效中 + 已发布，否则 404；lang 传入时标题/内容由后端自动翻译） */
export function getPublicAnnouncement(id: number, lang?: string) {
  const qs = new URLSearchParams();
  if (lang) qs.set("lang", lang);
  const query = qs.toString();
  return apiFetch<PublicAnnouncement>(`/api/announcements/${id}${query ? `?${query}` : ""}`);
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

/* ---------- 附件（详情页多媒体/办公文档在线预览） ---------- */

/**
 * 管理：上传公告附件（视频 / 音频 / PDF / Office；后端扩展名 + 魔数双白名单，≤50MB）。
 * multipart 请求，Content-Type 由浏览器自动生成（apiFetch 对 FormData 不做 JSON 处理）。
 */
export function adminUploadAnnouncementAttachment(id: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<AnnouncementAttachment>(
    `/api/admin/announcements/${id}/attachments`,
    { method: "POST", withAuth: true, body: form }
  );
}

/** 管理：删除公告附件（后端同时移除落盘文件） */
export function adminDeleteAnnouncementAttachment(id: number, attachmentId: number) {
  return apiFetch<void>(`/api/admin/announcements/${id}/attachments/${attachmentId}`, {
    method: "DELETE",
    withAuth: true,
  });
}
