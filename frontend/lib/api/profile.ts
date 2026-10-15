/**
 * Profile API - 对应后端 app/api/users.py
 *
 * 用户个人主页公开接口（任何访客可查看）：
 * - 地区字段永久公开；bio/gender/birthday 受 profile_privacy 过滤
 * - 仅返回 public Memo + published 博客
 */
import { apiFetch } from "./client";
import type { UserProfile, Paginated, BlogPost, MemoBriefOut } from "@/types/api";

/** 公开：用户个人主页基本信息（隐私过滤后） */
export function fetchPublicProfile(username: string) {
  return apiFetch<UserProfile>(
    `/api/users/${encodeURIComponent(username)}/profile`
  );
}

/** 公开：用户个人主页 Memo 列表（仅 visibility=public） */
export function listUserMemos(username: string, page = 1, pageSize = 10) {
  return apiFetch<Paginated<MemoBriefOut>>(
    `/api/users/${encodeURIComponent(username)}/memos?page=${page}&page_size=${pageSize}`
  );
}

/** 公开：用户个人主页博客列表（仅 status=published） */
export function listUserBlog(username: string, page = 1, pageSize = 10) {
  return apiFetch<Paginated<BlogPost>>(
    `/api/users/${encodeURIComponent(username)}/blog?page=${page}&page_size=${pageSize}`
  );
}

/* ---------- 社交关注（V0.5.5 §9.2）：底层单向关注，互关自动视为好友 ---------- */

/** 关注用户（单向；重复关注幂等）。需登录普通账号（BG 403）。 */
export function followUser(username: string) {
  return apiFetch<{ ok: boolean; following: boolean; already?: boolean }>(
    `/api/users/${encodeURIComponent(username)}/follow`,
    { method: "POST", withAuth: true }
  );
}

/** 取消关注（幂等） */
export function unfollowUser(username: string) {
  return apiFetch<{ ok: boolean; following: boolean; removed?: number }>(
    `/api/users/${encodeURIComponent(username)}/follow`,
    { method: "DELETE", withAuth: true }
  );
}
