/**
 * Comments API - 对应后端 app/api/comments.py
 *
 * 评论系统：公开列表/发表（双布尔软删除 + IP 属地）+ 管理列表/屏蔽/取消屏蔽/物理删除/全局开关。
 * 完整 submit_ip 仅后台接口返回；公开接口只暴露属地（location_zh/en）。
 */
import { apiFetch } from "./client";
import type {
  CommentAdmin,
  CommentCreate,
  CommentListResponse,
  CommentPublic,
  CommentSettings,
  Paginated,
} from "@/types/api";

/* ---------- 公开接口 ---------- */

/** 公开：文章评论列表（仅 is_deleted=false AND is_hidden=false，时间正序；allowed 表示当前可提交） */
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

/** 管理：评论分页列表（全部记录含 is_deleted/is_hidden + 完整 IP + 文章标题 + 状态标签） */
export function adminListComments(
  params: {
    is_deleted?: boolean;
    is_hidden?: boolean;
    post_id?: number;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.is_deleted !== undefined) qs.set("is_deleted", String(params.is_deleted));
  if (params.is_hidden !== undefined) qs.set("is_hidden", String(params.is_hidden));
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

/** 管理：屏蔽评论（is_hidden=true，软删除，后台留存） */
export function adminHideComment(id: number) {
  return apiFetch<CommentAdmin>(`/api/admin/comments/${id}/hide`, {
    method: "POST",
    withAuth: true,
  });
}

/** 管理：取消屏蔽（is_hidden=false，恢复正常展示） */
export function adminUnhideComment(id: number) {
  return apiFetch<CommentAdmin>(`/api/admin/comments/${id}/unhide`, {
    method: "POST",
    withAuth: true,
  });
}

/** 管理：永久物理删除评论（不可逆；同步 BlogPost.comment_count -= 1） */
export function adminDeleteComment(id: number) {
  return apiFetch<void>(`/api/admin/comments/${id}`, {
    method: "DELETE",
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
