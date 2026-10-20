/**
 * 角色管理接口 —— 对应后端 app/api/roles.py（V0.5.5 §3.2 + V0.6.3 需求7）
 *
 * 内置 4 角色（super_admin 仅查看；admin/editor/member 可编辑不可删除）+
 * 自定义角色组完整 CRUD；三级权限矩阵（允许=[view,manage]/只读=[view]/拒绝=[]）
 * 通过 PUT /matrix 原子批量保存；账号级覆盖写入复用 updateUser。
 */
import { apiFetch } from "@/lib/api/client";
import type { CustomRoleDef, OverrideUser, RolesOverview } from "@/types/api";

/** 角色定义 + 各角色有效账号数 + 自定义角色组 + 权限模块清单 */
export function fetchRolesOverview(): Promise<RolesOverview> {
  return apiFetch<RolesOverview>("/api/admin/roles", { withAuth: true });
}

/** 列出所有配置了权限覆盖矩阵的账号 */
export function fetchRoleOverrides(): Promise<OverrideUser[]> {
  return apiFetch<OverrideUser[]>("/api/admin/roles/overrides", { withAuth: true });
}

/** 新建自定义角色组（权限在矩阵区配置，初始为空矩阵） */
export function createCustomRole(payload: {
  name: string;
  description?: string | null;
}): Promise<CustomRoleDef> {
  return apiFetch<CustomRoleDef>("/api/admin/roles/custom", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 编辑自定义角色组名称/描述 */
export function updateCustomRole(
  id: number,
  payload: { name: string; description?: string | null }
): Promise<CustomRoleDef> {
  return apiFetch<CustomRoleDef>(`/api/admin/roles/custom/${id}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 删除自定义角色组（关联账号回落内置角色矩阵） */
export function deleteCustomRole(id: number): Promise<void> {
  return apiFetch<void>(`/api/admin/roles/custom/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/** 三级权限矩阵原子批量保存：builtin = {role_key: {module: actions}}；custom = {role_id_str: {...}} */
export function saveRolesMatrix(payload: {
  builtin: Record<string, Record<string, string[]>>;
  custom: Record<string, Record<string, string[]>>;
}): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/admin/roles/matrix", {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}
