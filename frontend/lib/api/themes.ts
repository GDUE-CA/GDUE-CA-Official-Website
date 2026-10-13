/**
 * Themes API - 对应后端 app/api/themes.py（新壳）
 *
 * 公开接口：已启用主题列表（ThemeProvider / 主题选择器消费，无需登录）。
 * 管理接口：主题 CRUD（软删除），权限模块 themes。
 */
import { apiFetch } from "./client";
import type { Theme, ThemeCreate, ThemeUpdate } from "@/types/api";

/* ---------- 公开接口 ---------- */

/** 公开：已启用主题列表（sort_order 升序） */
export function listPublicThemes() {
  return apiFetch<Theme[]>("/api/themes");
}

/* ---------- 管理接口 ---------- */

/** 管理：全部未删除主题（含停用） */
export function adminListThemes() {
  return apiFetch<Theme[]>("/api/admin/themes", { withAuth: true });
}

export function adminCreateTheme(payload: ThemeCreate) {
  return apiFetch<Theme>("/api/admin/themes", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminUpdateTheme(id: number, payload: ThemeUpdate) {
  return apiFetch<Theme>(`/api/admin/themes/${id}`, {
    method: "PATCH",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminDeleteTheme(id: number) {
  return apiFetch<void>(`/api/admin/themes/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}
