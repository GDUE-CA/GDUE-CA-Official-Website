/**
 * Auth API - 对应后端 app/api/auth.py
 *
 * 管理员登录、当前用户、个人资料、头像上传、改密、忘记密码、安全问题恢复。
 */
import { apiFetch, secureFetch } from "./client";
import { getFingerprint, FINGERPRINT_HEADER } from "@/lib/fingerprint";
import type {
  LoginRequest,
  LoginResponse,
  LoginSessionInfo,
  AdminUser,
  ProfileUpdate,
  AvatarUploadOut,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  PasswordResetItem,
  RegisterRequest,
  RegisterResponse,
  SecurityQuestionOut,
  SecurityAnswerRequest,
  SecurityQuestionUpdate,
  UserCreatePayload,
  UserUpdatePayload,
  SystemInitStatus,
  SystemInitRequest,
  SystemInitResult,
  BGPasswordHashResult,
  BGPasswordVerifyRequest,
} from "@/types/api";

/* ---------- 登录 / 当前用户 ---------- */

/**
 * 登录：POST /api/auth/login
 * 自动附加 X-Browser-Fingerprint header（防爆破附加维度）；
 * 登录失败时后端返回 401 + BizCode.LOGIN_BLOCKED(1013)，data 带 first_ban 标记首次封禁。
 */
export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const fp = await getFingerprint().catch(() => "err:00000000");
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { [FINGERPRINT_HEADER]: fp },
  });
}

/** 公开注册（P0：后端强制 member 角色，注册页不含任何角色控件） */
export function register(payload: RegisterRequest) {
  return apiFetch<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchMe() {
  return apiFetch<AdminUser>("/api/auth/me", { withAuth: true });
}

/* ---------- 登录会话管理（设备 / 踢出 / 心跳） ---------- */

/** 心跳：页面可见时定时调用，滑动续期会话 */
export function heartbeat() {
  return apiFetch<{ ok: boolean }>("/api/auth/heartbeat", { withAuth: true });
}

/** 当前用户的登录设备列表 */
export function fetchSessions() {
  return apiFetch<LoginSessionInfo[]>("/api/auth/sessions", { withAuth: true });
}

/** 踢出指定登录会话 */
export function revokeSession(sessionRowId: number) {
  return apiFetch<{ ok: boolean; current_kicked: boolean }>(
    `/api/auth/sessions/${sessionRowId}`,
    { method: "DELETE", withAuth: true }
  );
}

/* ---------- 个人资料 ---------- */

/** 获取当前用户完整资料 */
export function fetchProfile() {
  return apiFetch<AdminUser>("/api/auth/profile", { withAuth: true });
}

/** 更新个人资料 */
export function updateProfile(payload: ProfileUpdate) {
  return apiFetch<AdminUser>("/api/auth/profile", {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/* ---------- 头像上传 ---------- */

/** 上传头像（FormData，不走 apiFetch 的 JSON 逻辑） */
export async function uploadAvatar(file: File): Promise<AvatarUploadOut> {
  const formData = new FormData();
  formData.append("file", file);

  // 登录态走 HttpOnly Cookie；secureFetch 自动附加 CSRF 头
  const res = await secureFetch("/api/auth/avatar", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(
      (data as { detail?: string })?.detail ?? "头像上传失败"
    );
  }

  return res.json();
}

/** 恢复默认头像（删除自定义头像，回到首字母占位） */
export function deleteAvatar() {
  return apiFetch<{ ok: boolean }>("/api/auth/avatar", {
    method: "DELETE",
    withAuth: true,
  });
}

/* ---------- 修改密码 ---------- */

export function changePassword(payload: ChangePasswordRequest) {
  return apiFetch<{ ok: boolean }>("/api/auth/change-password", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 下线全部其他设备（保留当前设备会话），返回被下线数量 */
export function revokeOtherSessions() {
  return apiFetch<{ ok: boolean; revoked: number }>(
    "/api/auth/sessions/revoke-others",
    { method: "POST", withAuth: true }
  );
}

/* ---------- 忘记密码申请 ---------- */

/** 访客提交忘记密码申请（公开接口） */
export function submitForgotPassword(payload: ForgotPasswordRequest) {
  return apiFetch<{ ok: boolean; id: number }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 管理员查看忘记密码申请列表 */
export function listPasswordResets(statusFilter?: string) {
  const query = statusFilter ? `?status_filter=${statusFilter}` : "";
  return apiFetch<PasswordResetItem[]>(`/api/auth/password-resets${query}`, {
    withAuth: true,
  });
}

/** 管理员处理忘记密码申请 */
export function handlePasswordReset(
  id: number,
  payload: { status: "handled" | "rejected"; admin_note?: string }
) {
  return apiFetch<PasswordResetItem>(`/api/auth/password-resets/${id}`, {
    method: "PATCH",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 批量处理忘记密码申请（仅 通过/拒绝） */
export function batchHandlePasswordResets(ids: number[], status: "handled" | "rejected") {
  return apiFetch<{ updated: number }>("/api/auth/password-resets/batch", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify({ ids, status }),
  });
}

/* ---------- 安全问题 ---------- */

/** 公开获取安全问题（不含答案） */
export function fetchSecurityQuestion() {
  return apiFetch<SecurityQuestionOut>("/api/auth/security-question");
}

/** 紧急恢复：答对安全问题 → 重置超管密码 */
export function recoverViaSecurityQuestion(payload: SecurityAnswerRequest) {
  return apiFetch<{ ok: boolean; username: string }>("/api/auth/recover", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 管理员更新安全问题（仅 super_admin） */
export function updateSecurityQuestion(payload: SecurityQuestionUpdate) {
  return apiFetch<SecurityQuestionOut>("/api/auth/security-question", {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/* ---------- 用户管理 ---------- */

/** 列出管理员账号（支持搜索/角色/状态筛选） */
export function listUsers(params?: {
  q?: string;
  role?: string;
  is_active?: boolean;
}) {
  const sp = new URLSearchParams();
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.role) sp.set("role", params.role);
  if (params?.is_active !== undefined)
    sp.set("is_active", String(params.is_active));
  const qs = sp.toString();
  return apiFetch<AdminUser[]>(`/api/auth/users${qs ? `?${qs}` : ""}`, {
    withAuth: true,
  });
}

/** 创建管理员账号 */
export function createUser(payload: UserCreatePayload) {
  return apiFetch<AdminUser>("/api/auth/users", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 删除管理员账号 */
export function deleteUser(id: number) {
  return apiFetch<void>(`/api/auth/users/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/** 更新账号信息（自己可改基础资料，super_admin 额外可改 role/is_active/permission_overrides） */
export function updateUser(id: number, payload: UserUpdatePayload) {
  return apiFetch<AdminUser>(`/api/auth/users/${id}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** super_admin 批量启停账号（不能包含自己） */
export function batchUpdateUsers(ids: number[], is_active: boolean) {
  return apiFetch<{ updated: number; not_found: number[] }>("/api/auth/users/batch", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify({ ids, is_active }),
  });
}

/** super_admin 重置账号密码：生成一次性临时密码，账号下次登录强制改密 */
export function resetUserPassword(id: number) {
  return apiFetch<{ temp_password: string }>(
    `/api/auth/users/${id}/reset-password`,
    { method: "POST", withAuth: true }
  );
}

/* ---------- 系统初始化向导（Break-Glass 体系） ---------- */

/** 公开接口：系统初始化状态（未登录可读，前端据此决定是否跳转向导） */
export function fetchSystemInitStatus() {
  return apiFetch<SystemInitStatus>("/api/system-init/status");
}

/** 步骤1校验：Break-Glass 新密码是否符合应急账号强密码策略（前端实时调用） */
export function verifyBGPassword(payload: BGPasswordVerifyRequest) {
  return apiFetch<{ valid: boolean }>("/api/system-init/break-glass/verify-password", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 步骤1生成：校验通过后输出 bcrypt 哈希供运维复制 */
export function generateBGPasswordHash(password: string) {
  return apiFetch<BGPasswordHashResult>("/api/system-init/break-glass/password-hash", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify({ password }),
  });
}

/** 步骤4确认提交：原子事务写入全部初始化数据 + 自动登出 Break-Glass */
export function initializeSystem(payload: SystemInitRequest) {
  return apiFetch<SystemInitResult>("/api/system-init/initialize", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** Break-Glass 灾难修复：清空数据库内全部 admin 账号（仅 BG 可调用） */
export function purgeAdmins() {
  return apiFetch<{ purged: number }>("/api/auth/users/purge-admins", {
    method: "POST",
    withAuth: true,
  });
}

