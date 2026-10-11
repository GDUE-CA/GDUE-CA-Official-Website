/**
 * Projects API - 对应后端 app/api/projects.py（新壳）
 *
 * 项目展示 CMS：技术栈/年份筛选 + Markdown 正文。
 * 公开接口仅返回已发布项目（列表 year 降序 + id 升序）；
 * 管理接口支持草稿/发布/下架完整 CRUD。
 */
import { apiFetch } from "./client";
import type { Paginated, Project, ProjectCreate, ProjectStatus, ProjectUpdate } from "@/types/api";

/* ---------- 公开接口 ---------- */

/** 公开：已发布项目分页列表（tech 按技术栈筛选；lang 传入时标题/短描述由后端自动翻译） */
export function listPublicProjects(
  params: { tech?: string; year?: number; q?: string; page?: number; page_size?: number; lang?: string } = {}
) {
  const qs = new URLSearchParams();
  if (params.tech) qs.set("tech", params.tech);
  if (params.year) qs.set("year", String(params.year));
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  if (params.lang) qs.set("lang", params.lang);
  const query = qs.toString();
  return apiFetch<Paginated<Project>>(`/api/projects${query ? `?${query}` : ""}`);
}

/** 公开：项目详情（含 content_md；非已发布一律 404；lang 传入时标题/短描述由后端自动翻译） */
export function getPublicProject(slug: string, lang?: string) {
  const langQs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  return apiFetch<Project>(`/api/projects/${encodeURIComponent(slug)}${langQs}`);
}

/* ---------- 管理接口 ---------- */

/** 管理：项目分页列表（status/q 筛选） */
export function adminListProjects(
  params: { status?: ProjectStatus; q?: string; page?: number; page_size?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<Project>>(
    `/api/admin/projects${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

export function adminGetProject(id: number) {
  return apiFetch<Project>(`/api/admin/projects/${id}`, { withAuth: true });
}

export function adminCreateProject(payload: ProjectCreate) {
  return apiFetch<Project>("/api/admin/projects", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminUpdateProject(id: number, payload: ProjectUpdate) {
  return apiFetch<Project>(`/api/admin/projects/${id}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminDeleteProject(id: number) {
  return apiFetch<void>(`/api/admin/projects/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}
