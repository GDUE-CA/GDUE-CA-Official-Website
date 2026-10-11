/**
 * 后台概览统计接口 —— 与后端 app/api/admin_stats.py 一一对应
 * GET /api/admin-stats/access：访问来源统计（需登录）
 * GET /api/admin-stats/overview：仪表盘待办聚合（需登录）
 */
import { apiFetch } from "@/lib/api/client";
import type { AccessStats, AdminOverview } from "@/types/api";

/** 获取访问来源统计（IP 聚合 + 地区分类） */
export function fetchAccessStats(): Promise<AccessStats> {
  return apiFetch<AccessStats>("/api/admin-stats/access", { withAuth: true });
}

/** 获取仪表盘聚合（各模块待办计数，首屏单请求） */
export function fetchOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>("/api/admin-stats/overview", { withAuth: true });
}
