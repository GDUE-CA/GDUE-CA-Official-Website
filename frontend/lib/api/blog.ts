/**
 * Blog API - 对应后端 app/api/blog.py
 *
 * 博客 CMS：Markdown 文章 + 标签体系 + 图片上传（仅无损压缩 ≤ 原体积 80%）。
 * 公开接口仅返回已发布文章（定时文章到点后由后端惰性转发布）。
 */
import { apiFetch } from "./client";
import type {
  BlogPost,
  BlogPostCreate,
  BlogPostStatus,
  BlogPostUpdate,
  BlogTag,
  BlogTagCreate,
  Paginated,
} from "@/types/api";

/* ---------- 公开接口 ---------- */

/** 公开：已发布文章分页列表（tag 传标签 slug；q 搜索标题/摘要；lang 传入时标题/摘要由后端自动翻译） */
export function listPublicPosts(
  params: { tag?: string; q?: string; page?: number; page_size?: number; lang?: string } = {}
) {
  const qs = new URLSearchParams();
  if (params.tag) qs.set("tag", params.tag);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  if (params.lang) qs.set("lang", params.lang);
  const query = qs.toString();
  return apiFetch<Paginated<BlogPost>>(`/api/blog${query ? `?${query}` : ""}`);
}

/** 公开：文章详情（含 content_md；非已发布一律 404；lang 传入时标题/摘要由后端自动翻译） */
export function getPublicPost(slug: string, lang?: string) {
  const langQs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  return apiFetch<BlogPost>(`/api/blog/${encodeURIComponent(slug)}${langQs}`);
}

/** 公开：标签列表（含全部标签，供前台筛选；lang 传入时标签名由后端自动翻译） */
export function listPublicTags(lang?: string) {
  const langQs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  return apiFetch<BlogTag[]>(`/api/blog/tags${langQs}`);
}

/* ---------- 管理接口 ---------- */

/** 管理：文章分页列表（status/tag/q 筛选） */
export function adminListBlogPosts(
  params: {
    status?: BlogPostStatus;
    tag?: string;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.tag) qs.set("tag", params.tag);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<BlogPost>>(
    `/api/admin/blog${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

export function adminGetBlogPost(id: number) {
  return apiFetch<BlogPost>(`/api/admin/blog/${id}`, { withAuth: true });
}

export function adminCreateBlogPost(payload: BlogPostCreate) {
  return apiFetch<BlogPost>("/api/admin/blog", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminUpdateBlogPost(id: number, payload: BlogPostUpdate) {
  return apiFetch<BlogPost>(`/api/admin/blog/${id}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminDeleteBlogPost(id: number) {
  return apiFetch<void>(`/api/admin/blog/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/** 管理：标签全量列表 */
export function adminListBlogTags() {
  return apiFetch<BlogTag[]>("/api/admin/blog/tags", { withAuth: true });
}

export function adminCreateBlogTag(payload: BlogTagCreate) {
  return apiFetch<BlogTag>("/api/admin/blog/tags", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminUpdateBlogTag(id: number, payload: BlogTagCreate) {
  return apiFetch<BlogTag>(`/api/admin/blog/tags/${id}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminDeleteBlogTag(id: number) {
  return apiFetch<void>(`/api/admin/blog/tags/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/** 管理：上传博客内嵌图片/封面（jpg/png/webp ≤5MB，服务端仅无损压缩） */
export function adminUploadBlogImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<{ url: string; size: number; original_size: number }>(
    "/api/admin/blog/upload",
    { method: "POST", withAuth: true, body: form }
  );
}
