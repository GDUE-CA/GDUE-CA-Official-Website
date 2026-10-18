/**
 * ClubApply API - 对应后端 app/api/club_apply.py（Module D-2）
 *
 * 社团报名：与学校身份验证完全隔离（报名不自动开启 identity_school_verified）。
 * 校验宽松：仅学院/专业 ID + 学号 11 位与年份区间；不校验 sys_class。
 */
import { apiFetch, secureFetch } from "./client";
import type {
  ClubApplyRecord,
  MyClubApply,
  SubmitReceipt,
  ClubApplyReviewRequest,
  ClubApplySubmit,
  ClubApplyStatus,
  ClubApplyGuestSendCodeResult,
  ClubApplyGuestSubmit,
  ClubDepartment,
} from "@/types/api";

/* ---------- 用户接口 ---------- */

/** 意向部门选项（V0.6.0 Issue6 动态化；仅启用项，按 sort_order 排序） */
export function listClubDepartments() {
  return apiFetch<{ departments: ClubDepartment[] }>("/api/club-apply/departments");
}

/** 当前用户自己的报名进度（含历史；最小化字段） */
export function listMyClubApplies() {
  return apiFetch<MyClubApply[]>("/api/club-apply/mine");
}

/** 提交社团报名（限流 10 次/10 分钟；审核中重复提交后端 409）；成功返回回执码 */
export function submitClubApply(payload: ClubApplySubmit) {
  return apiFetch<SubmitReceipt>("/api/club-apply", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ---------- 访客免注册报名（公开接口） ---------- */

/** 访客报名：向邮箱发送 6 位验证码（ok:false 时 message 为冷却未到/限流/邮箱非法原因，直接展示） */
export function sendClubApplyGuestCode(email: string) {
  return apiFetch<ClubApplyGuestSendCodeResult>("/api/club-apply/public/send-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** 访客报名提交（201 返回回执码；409 = 已有 pending；400 = 验证码无效或已过期） */
export function submitClubApplyGuest(payload: ClubApplyGuestSubmit) {
  return apiFetch<SubmitReceipt>("/api/club-apply/public/submit", {
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

/* ---------- 意向部门选项管理（V0.6.0 Issue6；recruitment 权限） ---------- */

/** 选项全量列表（含停用），按 sort_order 排序 */
export function adminListClubDepartments() {
  return apiFetch<{ departments: ClubDepartment[] }>(
    "/api/admin/club-apply/departments"
  );
}

export interface ClubDepartmentPayload {
  name_zh: string;
  name_en: string;
  enabled?: boolean;
  sort_order?: number;
}

/** 新增选项 */
export function adminCreateClubDepartment(payload: ClubDepartmentPayload) {
  return apiFetch<ClubDepartment>("/api/admin/club-apply/departments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 编辑选项（部分更新） */
export function adminUpdateClubDepartment(
  deptId: number,
  payload: Partial<ClubDepartmentPayload>
) {
  return apiFetch<ClubDepartment>(`/api/admin/club-apply/departments/${deptId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** 删除选项（历史报名存文本快照，不受影响） */
export function adminDeleteClubDepartment(deptId: number) {
  return apiFetch<void>(`/api/admin/club-apply/departments/${deptId}`, {
    method: "DELETE",
  });
}
