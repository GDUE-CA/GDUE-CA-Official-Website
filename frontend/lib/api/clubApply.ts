/**
 * ClubApply API - 对应后端 app/api/club_apply.py（Module D-2）
 *
 * 社团报名：与学校身份验证完全隔离（报名不自动开启 identity_school_verified）。
 * 校验宽松：仅学院/专业 ID + 学号 11 位与年份区间；不校验 sys_class。
 */
import { apiFetch, secureFetch } from "./client";
import type {
  ClubApplyRecord,
  ClubApplyReviewRequest,
  ClubApplySubmit,
  ClubApplyStatus,
} from "@/types/api";

/* ---------- 用户接口 ---------- */

/** 当前用户自己的报名记录（含历史） */
export function listMyClubApplies() {
  return apiFetch<ClubApplyRecord[]>("/api/club-apply/mine");
}

/** 提交社团报名（限流 10 次/10 分钟；审核中重复提交后端 409） */
export function submitClubApply(payload: ClubApplySubmit) {
  return apiFetch<ClubApplyRecord>("/api/club-apply", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ---------- 管理接口（recruitment 权限） ---------- */

/** 报名审核队列：状态过滤 + 姓名/学号/手机号/学院/专业搜索 */
export function adminListClubApplies(
  params: {
    status?: ClubApplyStatus;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<{ total: number; items: ClubApplyRecord[] }>(
    `/api/admin/club-apply/list${query ? `?${query}` : ""}`
  );
}

/** 审核：接纳 / 拒绝（拒绝备注必填）；处理完成发送站内信 */
export function adminReviewClubApply(applyId: number, payload: ClubApplyReviewRequest) {
  return apiFetch<ClubApplyRecord>(`/api/admin/club-apply/${applyId}/review`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 报名数据导出（csv / xlsx；文本冗余字段即为本用途） */
export async function adminExportClubApplies(
  format: "csv" | "xlsx",
  status?: ClubApplyStatus
): Promise<void> {
  const qs = new URLSearchParams({ format });
  if (status) qs.set("status", status);
  const res = await secureFetch(`/api/admin/club-apply/export?${qs.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data as { detail?: string })?.detail ?? "导出失败");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `club_apply_records.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}
