/**
 * Users API - 对应后端 app/api/users.py
 *
 * 用户公开个人主页：profile 隐私过滤后（bio/gender/birthday 受 profile_privacy，
 * region 永久公开）；memos 仅 public+未归档+未下架+未软删；blog 仅 published。
 */
import { apiFetch } from "./client";
import type {
  BlogPost,
  MemoBriefOut,
  Paginated,
  UserProfile,
} from "@/types/api";

/** 公开：用户个人主页基本信息（隐私过滤后） */
export function getUserProfile(username: string) {
  return apiFetch<UserProfile>(
    `/api/users/${encodeURIComponent(username)}/profile`
  );
}

/** 公开：用户个人主页 Memo 列表（仅 public 且未归档/未下架/未软删） */
export function listUserMemos(
  username: string,
  page = 1,
  pageSize = 10
) {
  return apiFetch<Paginated<MemoBriefOut>>(
    `/api/users/${encodeURIComponent(username)}/memos?page=${page}&page_size=${pageSize}`
  );
}

/** 公开：用户个人主页博客列表（仅 published） */
export function listUserBlog(
  username: string,
  page = 1,
  pageSize = 10
) {
  return apiFetch<Paginated<BlogPost>>(
    `/api/users/${encodeURIComponent(username)}/blog?page=${page}&page_size=${pageSize}`
  );
}
