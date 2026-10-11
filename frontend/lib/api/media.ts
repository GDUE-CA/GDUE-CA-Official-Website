/**
 * Media API - 对应后端 app/api/media.py
 *
 * 文件资源统一管理：分页列表（分类筛选 + 文件名搜索）/ 上传 / 删除。
 */
import { apiFetch, secureFetch } from "./client";
import type { MediaCategory, MediaFile, Paginated } from "@/types/api";

/** 管理：文件资源分页列表 */
export function adminListMedia(
  params: {
    category?: MediaCategory;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<MediaFile>>(
    `/api/admin/media${query ? `?${query}` : ""}`
  );
}

/** 管理：上传通用文件资源（≤20MB，类型白名单），返回文件记录 */
export async function adminUploadMedia(file: File, category: MediaCategory = "misc"): Promise<MediaFile> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);

  const res = await secureFetch("/api/admin/media", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data as { detail?: string })?.detail ?? "上传失败");
  }
  return (await res.json()) as MediaFile;
}

/** 管理：删除文件资源（记录 + 物理文件） */
export function adminDeleteMedia(id: number) {
  return apiFetch<{ ok: boolean }>(`/api/admin/media/${id}`, {
    method: "DELETE",
  });
}
