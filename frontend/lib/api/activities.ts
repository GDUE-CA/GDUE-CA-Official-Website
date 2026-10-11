/**
 * Activity API - 对应后端 app/api/activities.py
 *
 * 活动的列表/创建/更新/删除。
 * 前台活动页数据源：listArchivedActivities() + mapActivityToClubEvent()
 * 映射为原有 ClubEvent 形状，列表/统计图展示逻辑保持不变。
 */
import { apiFetch } from "./client";
import type { Activity, ActivityCreate, ClubEvent } from "@/types/api";

export function listActivities() {
  return apiFetch<Activity[]>("/api/activities?status_filter=all");
}

/** 公开活动列表（P0 archived=exclude：过滤归档；lang 传入时标题/短描述由后端自动翻译） */
export function listPublicActivities(lang?: string) {
  const langQs = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  return apiFetch<Activity[]>(`/api/activities?archived=exclude${langQs}`);
}

/** 公开归档专区列表（P0 archived=only：仅归档活动；归档 ≠ 删除，仍可查阅） */
export function listArchivedOnlyActivities(lang?: string) {
  const langQs = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  return apiFetch<Activity[]>(`/api/activities?archived=only${langQs}`);
}

/** 公开归档列表：含历史已结束活动（草稿/归档不可见），供前台活动页；lang 传入时标题/短描述由后端自动翻译 */
export function listArchivedActivities(lang?: string) {
  const langQs = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  return apiFetch<Activity[]>(`/api/activities?status_filter=archive${langQs}`);
}

/** 活动详情（数字 id） */
export function fetchActivityById(id: number, lang?: string) {
  const langQs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  return apiFetch<Activity>(`/api/activities/${id}${langQs}`);
}

/**
 * 后端活动 → 前台 ClubEvent 形状（与原 markdown 数据源字段一一对应）：
 * type←category、date←start_at 前 10 位（YYYY-MM-DD）、images 保持空数组兼容
 */
export function mapActivityToClubEvent(a: Activity): ClubEvent {
  return {
    id: a.id,
    slug: a.slug ?? `activity-${a.id}`,
    title: a.title,
    type: (a.category as ClubEvent["type"]) || "workshop",
    date: a.start_at ? a.start_at.slice(0, 10) : a.created_at.slice(0, 10),
    description: a.description,
    participants: a.participants ?? 0,
    images: [],
    content: a.content,
    status: a.status,
    enrolled_count: a.enrolled_count ?? 0,
    enrolled: a.enrolled ?? false,
    runtime_status: a.runtime_status ?? null,
  };
}

/** 前台活动页数据：公开列表映射为 ClubEvent 并按活动日期降序（原 getAllEvents 语义）；lang=显示语言自动翻译 */
export async function fetchClubEvents(lang?: string): Promise<ClubEvent[]> {
  const items = await listPublicActivities(lang);
  return items
    .map(mapActivityToClubEvent)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** 归档专区数据（archived=only）：同样映射为 ClubEvent，按日期降序 */
export async function fetchArchivedClubEvents(lang?: string): Promise<ClubEvent[]> {
  const items = await listArchivedOnlyActivities(lang);
  return items
    .map(mapActivityToClubEvent)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/* ---------- 一键报名（P0：登录用户） ---------- */

/** 报名活动（需登录；归档/时间约束由后端拦截） */
export function enrolActivity(id: number) {
  return apiFetch<{ ok: boolean; enrolled_count: number }>(`/api/activities/${id}/enrol`, {
    method: "POST",
    withAuth: true,
  });
}

/** 取消报名（需登录；归档活动后端强制 403） */
export function cancelEnrolActivity(id: number) {
  return apiFetch<void>(`/api/activities/${id}/enrol`, {
    method: "DELETE",
    withAuth: true,
  });
}

export function createActivity(payload: ActivityCreate) {
  return apiFetch<Activity>("/api/activities", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function updateActivity(
  id: number,
  payload: Partial<ActivityCreate> & { checkin_open?: boolean }
) {
  return apiFetch<Activity>(`/api/activities/${id}`, {
    method: "PATCH",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function deleteActivity(id: number) {
  return apiFetch<void>(`/api/activities/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}
