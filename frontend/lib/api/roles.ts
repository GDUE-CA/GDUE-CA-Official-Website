/**
 * 角色管理接口 —— 对应后端 app/api/roles.py（V0.5.5 §3.2）
 *
 * 角色与默认矩阵为代码内置（lib/permissions.ts ROLE_DEFAULTS），无角色 CRUD；
 * 本模块只读角色定义/成员分布/权限覆盖账号清单，覆盖写入复用 updateUser。
 */
import { apiFetch } from "@/lib/api/client";
import type { OverrideUser, RolesOverview } from "@/types/api";

/** 角色定义 + 各角色有效账号数 + 权限模块清单 */
export function fetchRolesOverview(): Promise<RolesOverview> {
  return apiFetch<RolesOverview>("/api/admin/roles", { withAuth: true });
}

/** 列出所有配置了权限覆盖矩阵的账号 */
export function fetchRoleOverrides(): Promise<OverrideUser[]> {
  return apiFetch<OverrideUser[]>("/api/admin/roles/overrides", { withAuth: true });
}
