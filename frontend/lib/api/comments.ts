/**
 * Comments API - 对应后端 app/api/comments.py
 *
 * 评论系统：公开列表/发表（软删除 + IP 属地）+ 管理列表/下架/恢复/全局开关。
 * 完整 submit_ip 仅后台接口返回；公开接口只暴露属地（location_zh/en）。
 */
import { apiFetch } from "./client";
import type {
  CommentAdmin,
  CommentCreate,
  CommentListResponse,
  CommentPublic,
  CommentSettings,
  CommentStatus,
  Paginated,
} from "@/types/api";

/* ---------- 公开接口 ---------- */

/** 公开：文章评论列表（仅 visible，时间正序；allowed 表示当前可提交） */
export function listPublicComments(postId: number, page = 1, pageSize = 10) {
  return apiFetch<CommentListResponse>(
    `/api/blog/${postId}/comments?page=${page}&page_size=${pageSize}`
  );
}

/** 公开：访客发表评论（昵称 + 内容；双开关关闭时后端 403；CSRF 由 apiFetch 自动附加） */
export function createPublicComment(postId: number, payload: CommentCreate) {
  return apiFetch<CommentPublic>(`/api/blog/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ---------- 管理接口 ---------- */

/** 管理：评论分页列表（全部状态 + 完整 IP + 文章标题） */
export function adminListComments(
  params: {
    status?: CommentStatus;
    post_id?: number;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.post_id) qs.set("post_id", String(params.post_id));
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<CommentAdmin>>(
    `/api/admin/comments${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

/** 管理：下架评论（软删除，status → admin_removed） */
export function adminRemoveComment(id: number) {
  return apiFetch<CommentAdmin>(`/api/admin/comments/${id}/remove`, {
    method: "POST",
    withAuth: true,
  });
}

/** 管理：恢复展示（status → visible） */
export function adminRestoreComment(id: number) {
  return apiFetch<CommentAdmin>(`/api/admin/comments/${id}/restore`, {
    method: "POST",
    withAuth: true,
  });
}

/** 管理：读取评论全局开关 */
export function adminGetCommentSettings() {
  return apiFetch<CommentSettings>("/api/admin/comments/settings", {
    withAuth: true,
  });
}

/** 管理：更新评论全局开关（联动的文章级开关叠加生效） */
export function adminUpdateCommentSettings(comments_enabled: boolean) {
  return apiFetch<CommentSettings>("/api/admin/comments/settings", {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify({ comments_enabled }),
  });
}
