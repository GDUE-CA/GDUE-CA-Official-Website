/**
 * Security Questions Admin API - 对应后端 app/api/security_questions.py
 *
 * 安全问题预设题库后台 CRUD（/api/admin/security-questions/presets）：
 * 管理员录入同样触发黑名单过滤；已被用户使用的题禁止物理删除（后端 400），仅可停用。
 */
import { apiFetch } from "./client";
import type {
  AdminPresetQuestion,
  PresetQuestionIn,
  PresetQuestionUpdate,
} from "@/types/api";

/** 题库列表（含已停用），按 sort_order + id 排序，附使用量 */
export function listPresetQuestions() {
  return apiFetch<{ presets: AdminPresetQuestion[] }>(
    "/api/admin/security-questions/presets",
    { withAuth: true }
  );
}

/** 新增预设题（中英文本双必填，对应 zh-cn / en-gb 双基准） */
export function createPresetQuestion(payload: PresetQuestionIn) {
  return apiFetch<AdminPresetQuestion>("/api/admin/security-questions/presets", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 编辑预设题（部分字段；用户侧存快照，改题不影响老用户） */
export function updatePresetQuestion(id: number, payload: PresetQuestionUpdate) {
  return apiFetch<AdminPresetQuestion>(`/api/admin/security-questions/presets/${id}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 删除预设题：已使用题后端返回 400「该问题已被用户使用，仅可停用」 */
export function deletePresetQuestion(id: number) {
  return apiFetch<void>(`/api/admin/security-questions/presets/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}
