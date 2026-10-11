/**
 * 全站共享标签池 API 封装
 *
 * 标签池与 Memo / Document / Activity 共享；本期内 Memo 已实装。
 * 公开 GET /api/tags 返回标签 + 关联 memo 数；
 * GET /api/tags/{slug}/memos 返回该标签下的 Memo 时间线。
 */
import { apiFetch } from "@/lib/api/client";
import type {
  MemoBriefOut,
  MemoTagOut,
  MemoTagWithCount,
  PaginatedResponse,
} from "@/types/api";

export async function listTags(params: {
  q?: string;
  scope?: "memo" | "document" | "activity";
  limit?: number;
} = {}): Promise<MemoTagWithCount[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.scope) qs.set("scope", params.scope);
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return apiFetch<MemoTagWithCount[]>(`/api/tags${q ? `?${q}` : ""}`);
}

export async function getTagBySlug(slug: string): Promise<MemoTagOut> {
  return apiFetch<MemoTagOut>(`/api/tags/${slug}`);
}

export async function listMemosByTag(
  slug: string,
  params: { page?: number; page_size?: number } = {},
): Promise<PaginatedResponse<MemoBriefOut>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<MemoBriefOut>>(
    `/api/tags/${slug}/memos${q ? `?${q}` : ""}`,
  );
}