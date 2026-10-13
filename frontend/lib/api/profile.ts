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
