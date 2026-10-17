/**
 * 后台模块级权限（前端镜像）— 与后端 app/core/permissions.py 严格一致，改动需两侧同步
 *
 * - 22 个权限模块（7 现有 + 15 CMS 扩展） × view / manage 两个动作
 * - super_admin 恒全通过
 * - override 键完全替代该模块的默认动作列表（可增可减）
 */
import { useEffect, useMemo, useState } from "react";
import { fetchMe } from "@/lib/api/auth";
import type { AdminUser } from "@/types/api";

export const PERMISSION_MODULES = [
  "dashboard",
  "activities",
  "review.registrations",
  "review.bugs",
  "review.resets",
  "review.emails", // 更改绑定邮箱人工申请审核
  "review.school", // 学校身份人工验证审核（Module D）
  "settings",
  "users",
  "badges", // 用户徽章管理（用户详情页内）
  // ---------- CMS 扩展 ----------
  "announcements",
  "content",
  "members",
  "recruitment",
  "blog",
  "blog_tags",
  "projects",
  "themes",
  "comments",
  "media",
  "security",
  "oauth",
  "sso",
  "realname",
  "stats",
  "audit_logs",
  // ---------- Phase 8 Memo 碎片笔记 ----------
  "memo",
  // ---------- V0.5.5 §3.2 角色管理 ----------
  "roles",
  // ---------- V0.5.7 系统重置（仅 super_admin；Break-Glass 应急账号旁路） ----------
  "system_reset",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];
export type PermissionAction = "view" | "manage";

/** 模块 → 动作列表 的覆盖（仅 super_admin 可写，后端强制校验取值） */
export type PermissionOverrides = Record<string, string[]>;

/** 各角色默认权限矩阵（与后端 ROLE_DEFAULTS 一致） */
export const ROLE_DEFAULTS: Record<string, Partial<Record<PermissionModule, PermissionAction[]>>> = {
  super_admin: {
    dashboard: ["view", "manage"],
    activities: ["view", "manage"],
    "review.registrations": ["view", "manage"],
    "review.bugs": ["view", "manage"],
    "review.resets": ["view", "manage"],
    "review.emails": ["view", "manage"],
    "review.school": ["view", "manage"],
    settings: ["view", "manage"],
    users: ["view", "manage"],
    badges: ["view", "manage"],
    announcements: ["view", "manage"],
    content: ["view", "manage"],
    members: ["view", "manage"],
    recruitment: ["view", "manage"],
    blog: ["view", "manage"],
    blog_tags: ["view", "manage"],
    projects: ["view", "manage"],
    themes: ["view", "manage"],
    comments: ["view", "manage"],
    media: ["view", "manage"],
    security: ["view", "manage"],
    oauth: ["view", "manage"],
    sso: ["view", "manage"],
    realname: ["view", "manage"],
    stats: ["view", "manage"],
    audit_logs: ["view", "manage"],
    roles: ["view", "manage"],
    // V0.5.7 最高危权限：仅 super_admin
    system_reset: ["view", "manage"],
  },
  admin: {
    dashboard: ["view"],
    activities: ["view", "manage"],
    "review.registrations": ["view", "manage"],
    "review.bugs": ["view", "manage"],
    "review.resets": ["view", "manage"],
    "review.emails": ["view", "manage"],
    "review.school": ["view", "manage"],
    settings: ["view", "manage"],
    users: ["view"],
    badges: ["view", "manage"],
    // 内容类：admin 可管理
    announcements: ["view", "manage"],
    content: ["view", "manage"],
    members: ["view", "manage"],
    recruitment: ["view", "manage"],
    blog: ["view", "manage"],
    blog_tags: ["view", "manage"],
    projects: ["view", "manage"],
    themes: ["view", "manage"],
    comments: ["view", "manage"],
    media: ["view", "manage"],
    // 安全/登录/实名：admin 仅查看，manage 留 super_admin
    security: ["view"],
    oauth: ["view"],
    sso: ["view"],
    realname: ["view"],
    stats: ["view"],
    audit_logs: ["view"],
    // 角色管理：安全类模块，admin 仅查看，manage 留 super_admin
    roles: ["view"],
  },
  editor: {
    dashboard: ["view"],
    activities: ["view", "manage"],
    "review.bugs": ["view"],
    users: ["view"],
    // 内容类：editor 可管理
    announcements: ["view", "manage"],
    content: ["view", "manage"],
    members: ["view", "manage"],
    recruitment: ["view", "manage"],
    blog: ["view", "manage"],
    blog_tags: ["view", "manage"],
    projects: ["view", "manage"],
    media: ["view", "manage"],
    // 其余仅查看
    comments: ["view"],
    security: ["view"],
    oauth: ["view"],
    sso: ["view"],
    realname: ["view"],
    stats: ["view"],
    audit_logs: ["view"],
    roles: ["view"],
  },
  member: {},
};

/** 判定某角色（含 override）对模块动作是否有权限 */
export function hasPermission(
  role: string,
  overrides: PermissionOverrides | null | undefined,
  module: PermissionModule,
  action: PermissionAction
): boolean {
  if (role === "super_admin") return true;
  const override = overrides?.[module];
  // override 值由后端写入时校验，运行时必为 "view"/"manage"
  const actions = (override ?? ROLE_DEFAULTS[role]?.[module]) as PermissionAction[] | undefined;
  return actions?.includes(action) ?? false;
}

/** 当前登录者的有效权限上下文（fetchMe 实时计算，不读 localStorage 旧 role） */
export function useEffectivePermissions() {
  const [ctx, setCtx] = useState<{
    role: string;
    overrides: PermissionOverrides | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me: AdminUser) => {
        if (!cancelled) setCtx({ role: me.role, overrides: me.permission_overrides ?? null });
      })
      .catch(() => {
        // 未登录等场景由布局守卫处理
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      ready: ctx !== null,
      role: ctx?.role ?? null,
      can(module: PermissionModule, action: PermissionAction) {
        if (!ctx) return false;
        return hasPermission(ctx.role, ctx.overrides, module, action);
      },
    }),
    [ctx]
  );
}
