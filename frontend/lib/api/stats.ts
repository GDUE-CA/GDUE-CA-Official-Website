/**
 * Stats API - 对应后端 app/api/stats.py（+ 复用 admin_stats.py 访问来源）
 *
 * 数据统计：活动报名统计快照列表 / 招新统计聚合；访问来源复用
 * adminStats.ts 的 fetchAccessStats（同一数据源 /api/admin-stats/access）。
 */
import { apiFetch } from "./client";
import type { ActivityLiveStatRow, ActivityStatRow, RecruitmentStats } from "@/types/api";

/** 管理：活动报名统计快照列表（活动结束后自动生成） */
export function adminGetActivityStats() {
  return apiFetch<ActivityStatRow[]>("/api/admin/stats/activities");
}

/** 管理：全部活动实时报名计数（LEFT JOIN，无报名也出现） */
export function adminGetActivityLiveStats() {
  return apiFetch<ActivityLiveStatRow[]>("/api/admin/stats/activities/live");
}

/** 管理：招新（社团报名）统计：按意向部门 / 学院 / 状态聚合 */
export function adminGetRecruitmentStats() {
  return apiFetch<RecruitmentStats>("/api/admin/stats/recruitment");
}
