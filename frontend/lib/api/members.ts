/**
 * Members API - 对应后端 app/api/members.py
 *
 * 社团成员信息（现任/往届、归档、头像上传）。
 */
import { apiFetch, secureFetch } from "./client";
import { API_BASE_URL } from "./client";
import type {
  Member,
  MemberCreate,
  MemberImportResult,
  MemberTerm,
  MemberUpdate,
  Paginated,
} from "@/types/api";

/** 公开：成员列表（按 display_order 升序，过滤归档） */
export function listPublicMembers(term?: MemberTerm) {
  const qs = term ? `?term=${term}` : "";
  return apiFetch<Member[]>(`/api/members${qs}`);
}

/** 管理：分页列表 */
export function adminListMembers(params: {
  term?: MemberTerm;
  archived?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.term) qs.set("term", params.term);
  if (params.archived !== undefined) qs.set("archived", String(params.archived));
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<Member>>(
    `/api/admin/members${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

export function adminGetMember(id: number) {
  return apiFetch<Member>(`/api/admin/members/${id}`, { withAuth: true });
}

export function adminCreateMember(payload: MemberCreate) {
  return apiFetch<Member>("/api/admin/members", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminUpdateMember(id: number, payload: MemberUpdate) {
  return apiFetch<Member>(`/api/admin/members/${id}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminDeleteMember(id: number) {
  return apiFetch<void>(`/api/admin/members/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/** 管理：下载空白 Excel 导入模板 */
export async function adminDownloadMemberTemplate(): Promise<Blob> {
  const res = await secureFetch("/api/admin/members/template");
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    const { ApiError } = await import("./client");
    throw new ApiError(
      res.status,
      detail,
      typeof detail === "string" ? detail : "模板下载失败"
    );
  }
  return res.blob();
}

/** 管理：Excel 批量导入（mode=skip 跳过重复 / update 更新信息） */
export async function adminImportMembers(
  file: File,
  mode: "skip" | "update" = "skip"
): Promise<MemberImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  const res = await secureFetch("/api/admin/members/import", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    const { ApiError } = await import("./client");
    throw new ApiError(
      res.status,
      detail,
      typeof detail === "string" ? detail : "批量导入失败"
    );
  }
  return res.json();
}

/** 管理：批量修改届别 / 职务（两项至少传一项） */
export function adminBatchUpdateMembers(payload: {
  ids: number[];
  term?: MemberTerm;
  role_title?: string;
}): Promise<{ updated: number; not_found: number[] }> {
  return apiFetch("/api/admin/members/batch", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}
/** 管理员上传成员头像（multipart/form-data，特殊：不能走 apiFetch JSON） */
export async function adminUploadMemberAvatar(file: File): Promise<{ avatar_url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await secureFetch("/api/admin/members/avatar", {
    method: "POST",
    body: fd,
    // 不设 Content-Type，让浏览器自动设置 multipart boundary
  });
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    const { ApiError } = await import("./client");
    throw new ApiError(
      res.status,
      detail,
      typeof detail === "string" ? detail : "头像上传失败"
    );
  }
  return res.json();
}

// 静态导入会循环依赖（ApiError 在 client.ts）；直接用 dynamic import 即可
// 此处保留 API_BASE_URL 引用避免未使用告警
void API_BASE_URL;
