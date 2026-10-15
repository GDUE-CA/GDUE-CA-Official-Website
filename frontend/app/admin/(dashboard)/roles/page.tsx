import type { Metadata } from "next";
import { RolesManager } from "@/components/admin/roles/RolesManager";

export const metadata: Metadata = { title: "角色管理" };

/**
 * /admin/roles 角色管理（V0.5.5 §3.2）
 * 进入权限 roles.view 由后端接口强制；无权限接口返回 403，前端不做硬锁死。
 */
export default function AdminRolesPage() {
  return <RolesManager />;
}
