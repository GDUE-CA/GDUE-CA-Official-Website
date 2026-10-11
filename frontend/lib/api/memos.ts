/**
 * Memo 碎片笔记 API 封装（Phase 8）
 *
 * 路由分组（与后端 app/api/memos.py 一一对应）：
 * - public  → /api/memos          （匿名 + 登录通用接口）
 * - user    → /api/me/memos       （个人中心：我的全部 / 归档 / 点赞 / 收藏）
 * - author  → /api/memos          （作者侧：创建 / 编辑 / 软删除 / 归档 / 点赞 / 收藏 / 版本 / 回滚 / 上传 / 分享）
 * - admin   → /api/admin/memos    （后台：全量浏览 / 下架 / 恢复）
 *
 * 所有方法均返回 `apiFetch<T>(...)`：成功时拿到后端 data；失败时抛 ApiError（含 i18n key）。
 */
import { apiFetch } from "@/lib/api/client";
import { listMemosByTag as listMemosByTagFromTags } from "@/lib/api/tags";
import type {
  MemoAttachmentOut,
  MemoAuthorBrief,
  MemoBriefOut,
  MemoCreate,
  MemoCreateOut,
  MemoInteractionOut,
  MemoOut,
  MemoRollback,
  MemoSearchResponse,
  MemoShareOut,
  MemoUpdate,
  MemoVersionBriefOut,
  MemoVersionOut,
  MemoVisibility,
  PaginatedResponse,
} from "@/types/api";

/* ---------- 公共：时间线 / 日历 / 检索 / 单条 / 共享匿名访问 ---------- */

export interface TimelineParams {
  page?: number;
  page_size?: number;
  /** 文本模糊搜索（按 content_md LIKE） */
  q?: string;
  /** public=仅公开；member_only=限定成员可见（未登录返回空）；all=公开+已登录可见 */
  visibility?: "public" | "member_only" | "all";
  /** 是否带图片附件 */
  has_image?: boolean;
}

export async function getTimeline(
  params: TimelineParams = {},
): Promise<PaginatedResponse<MemoBriefOut>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  if (params.q) qs.set("q", params.q);
  if (params.visibility) qs.set("visibility", params.visibility);
  if (params.has_image !== undefined)
    qs.set("has_image", String(params.has_image));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<MemoBriefOut>>(
    `/api/memos/timeline${q ? `?${q}` : ""}`,
  );
}

export async function getMemoByDate(
  date: string,
): Promise<{ date: string; total: number; items: MemoBriefOut[] }> {
  return apiFetch(`/api/memos/calendar/${date}`);
}

export interface SearchParams {
  q: string;
  page?: number;
  page_size?: number;
}

export async function searchMemos(
  params: SearchParams,
): Promise<MemoSearchResponse> {
  const qs = new URLSearchParams();
  qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  return apiFetch<MemoSearchResponse>(`/api/memos/search?${qs}`);
}

export async function getMemo(id: number): Promise<MemoOut> {
  return apiFetch<MemoOut>(`/api/memos/${id}`);
}

export async function getSharedMemo(slug: string): Promise<MemoOut> {
  return apiFetch<MemoOut>(`/api/memos/shared/${slug}`);
}

/** 标签下的 Memo 列表（转出 tags 命名空间，便于 /memo?tag=xxx 页面直接调用） */
export async function listMemosByTag(
  slug: string,
  params: { page?: number; page_size?: number } = {},
): Promise<PaginatedResponse<MemoBriefOut>> {
  return listMemosByTagFromTags(slug, params);
}

/* ---------- 个人中心 ---------- */

export async function listMyMemos(
  params: { archived?: boolean; page?: number; page_size?: number } = {},
): Promise<PaginatedResponse<MemoBriefOut>> {
  const qs = new URLSearchParams();
  if (params.archived !== undefined)
    qs.set("archived", String(params.archived));
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<MemoBriefOut>>(
    `/api/me/memos${q ? `?${q}` : ""}`,
  );
}

export async function listLikedMemos(
  params: { page?: number; page_size?: number } = {},
): Promise<PaginatedResponse<MemoBriefOut>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<MemoBriefOut>>(
    `/api/me/memos/liked${q ? `?${q}` : ""}`,
  );
}

export async function listFavoriteMemos(
  params: { page?: number; page_size?: number } = {},
): Promise<PaginatedResponse<MemoBriefOut>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<MemoBriefOut>>(
    `/api/me/memos/favorites${q ? `?${q}` : ""}`,
  );
}

/* ---------- 作者：创建 / 编辑 / 软删 / 归档 / 点赞 / 收藏 / 版本 / 分享 / 上传 ---------- */

export async function createMemo(
  payload: MemoCreate,
): Promise<MemoCreateOut> {
  return apiFetch<MemoCreateOut>(`/api/memos`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMemo(
  id: number,
  payload: MemoUpdate,
): Promise<MemoOut> {
  return apiFetch<MemoOut>(`/api/memos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteMemo(id: number): Promise<null> {
  return apiFetch<null>(`/api/memos/${id}`, { method: "DELETE" });
}

export async function archiveMemo(id: number): Promise<MemoOut> {
  return apiFetch<MemoOut>(`/api/memos/${id}/archive`, { method: "POST" });
}

export async function unarchiveMemo(id: number): Promise<MemoOut> {
  return apiFetch<MemoOut>(`/api/memos/${id}/unarchive`, { method: "POST" });
}

export async function toggleLike(id: number): Promise<MemoInteractionOut> {
  return apiFetch<MemoInteractionOut>(`/api/memos/${id}/like`, {
    method: "POST",
  });
}

export async function toggleFavorite(id: number): Promise<MemoInteractionOut> {
  return apiFetch<MemoInteractionOut>(`/api/memos/${id}/favorite`, {
    method: "POST",
  });
}

/* 版本快照 */
export async function listMemoVersions(
  id: number,
): Promise<MemoVersionBriefOut[]> {
  return apiFetch<MemoVersionBriefOut[]>(`/api/memos/${id}/versions`);
}

export async function getMemoVersion(
  id: number,
  versionNo: number,
): Promise<MemoVersionOut> {
  return apiFetch<MemoVersionOut>(`/api/memos/${id}/versions/${versionNo}`);
}

export async function rollbackMemo(
  id: number,
  payload: MemoRollback,
): Promise<MemoOut> {
  return apiFetch<MemoOut>(`/api/memos/${id}/rollback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* 公开分享链接 */
export async function createShareLink(id: number): Promise<MemoShareOut> {
  return apiFetch<MemoShareOut>(`/api/memos/${id}/share`, { method: "POST" });
}

export async function revokeShareLink(id: number): Promise<null> {
  return apiFetch<null>(`/api/memos/${id}/share`, { method: "DELETE" });
}

/* 上传附件（multipart；不走 JSON 路径） */
export async function uploadMemoAttachment(
  id: number,
  file: File,
): Promise<MemoAttachmentOut> {
  const fd = new FormData();
  fd.append("file", file);
  // 上传走 secureFetch 之外的纯 fetch：CSRF 由 secureFetch 注入，但仍走 apiFetch 错误处理
  return apiFetch<MemoAttachmentOut>(`/api/memos/${id}/upload`, {
    method: "POST",
    body: fd,
  });
}

/* ---------- 后台管理 ---------- */

export interface AdminListParams {
  page?: number;
  page_size?: number;
  author?: string;
  q?: string;
  visibility?: "public" | "member_only" | "private" | "all";
  admin_removed?: boolean;
  archived?: boolean;
}

export async function adminListMemos(
  params: AdminListParams = {},
): Promise<PaginatedResponse<MemoBriefOut>> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  const q = qs.toString();
  return apiFetch<PaginatedResponse<MemoBriefOut>>(
    `/api/admin/memos${q ? `?${q}` : ""}`,
  );
}

export async function adminGetMemo(id: number): Promise<MemoOut> {
  return apiFetch<MemoOut>(`/api/admin/memos/${id}`);
}

export async function adminRemoveMemo(id: number): Promise<MemoOut> {
  return apiFetch<MemoOut>(`/api/admin/memos/${id}/remove`, {
    method: "POST",
  });
}

export async function adminRestoreMemo(id: number): Promise<MemoOut> {
  return apiFetch<MemoOut>(`/api/admin/memos/${id}/restore`, {
    method: "POST",
  });
}

/* ---------- 类型导出（供业务页面便捷引用） ---------- */
export type { MemoAuthorBrief };