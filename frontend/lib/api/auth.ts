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
  BannerUploadOut,
  ChangePasswordRequest,
  ChangePasswordResult,
  ForgotIdentifyResult,
  ForgotPasswordRequest,
  ForgotPasswordResetRequest,
  ForgotPasswordSendCodeRequest,
  ForgotPasswordSendCodeResult,
  ManualReviewRequest,
  ManualReviewResult,
  PasswordResetItem,
  PresetSecurityQuestion,
  RecoveryResetRequest,
  RegisterRequest,
  RegisterResponse,
  RecoverRequest,
  SecurityQuestionsOut,
  SecurityQuestionsSetupRequest,
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

/**
 * 登录二次验证提交（V0.6.0 Issue7）：POST /api/auth/login/2fa/verify
 * 密码已通过、待邮箱验证码核验；成功后建立会话并返回与 login 相同的响应。
 */
export async function login2FAVerify(payload: {
  username?: string;
  email?: string;
  code: string;
  remember_device: boolean;
}): Promise<LoginResponse> {
  const fp = await getFingerprint().catch(() => "err:00000000");
  return apiFetch<LoginResponse>("/api/auth/login/2fa/verify", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { [FINGERPRINT_HEADER]: fp },
  });
}

/** 登录二次验证码重发（60s 冷却由后端控制）：POST /api/auth/login/2fa/resend */
export function login2FAResend(payload: { username?: string; email?: string }) {
  return apiFetch<{ ok: boolean; message: string }>("/api/auth/login/2fa/resend", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 公开注册（P0：后端强制 member 角色，注册页不含任何角色控件） */
export function register(payload: RegisterRequest) {
  return apiFetch<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ---------- 注册三步向导（V0.5.8） ---------- */

/** 注册第一步：向待注册邮箱发送 6 位验证码（邮箱占用时后端显式 400） */
export function sendRegisterCode(email: string) {
  return apiFetch<{ ok: boolean; message: string }>("/api/auth/register/send-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** 注册第二步：用户名占用实时检查（available=true 表示可用） */
export function checkRegisterUsername(username: string) {
  const q = encodeURIComponent(username);
  return apiFetch<{ available: boolean }>(`/api/auth/register/check-username?username=${q}`);
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

/* ---------- 个人主页封面（V0.5.5 §9.3） ---------- */

/** 上传个人主页封面（FormData；jpg/png/webp，服务端压缩） */
export async function uploadBanner(file: File): Promise<BannerUploadOut> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await secureFetch("/api/auth/banner", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(
      (data as { detail?: string })?.detail ?? "封面上传失败"
    );
  }

  return res.json();
}

/** 删除自定义封面（恢复纯色默认） */
export function deleteBanner() {
  return apiFetch<{ ok: boolean }>("/api/auth/banner", {
    method: "DELETE",
    withAuth: true,
  });
}

/* ---------- 修改密码 ---------- */

export function changePassword(payload: ChangePasswordRequest) {
  return apiFetch<ChangePasswordResult>("/api/auth/change-password", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/* ---------- 忘记密码：邮箱验证码（公开接口，未登录找回） ---------- */

/** 发送验证码到绑定邮箱（防账号枚举：响应与邮箱是否存在无关） */
export function sendForgotPasswordCode(payload: ForgotPasswordSendCodeRequest) {
  return apiFetch<ForgotPasswordSendCodeResult>("/api/auth/forgot-password/send-code", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 邮箱验证码重置密码（成功后该账号全部会话强制下线，无保留本机选项） */
export function resetPasswordWithCode(payload: ForgotPasswordResetRequest) {
  return apiFetch<{ ok: boolean }>("/api/auth/forgot-password/reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ---------- 忘记密码多分支（V0.5.8 §5） ---------- */

/** 找回入口账号识别：用户名或绑定邮箱 → 分支路由信息（脱敏邮箱 / 是否设安全问题） */
export function forgotIdentify(account: string) {
  return apiFetch<ForgotIdentifyResult>("/api/auth/forgot-password/identify", {
    method: "POST",
    body: JSON.stringify({ account }),
  });
}

/** 一次性安全恢复码找回账号：码一次性核销 + 重置密码 + 全部会话强制下线 */
export function resetPasswordWithRecoveryCode(payload: RecoveryResetRequest) {
  return apiFetch<{ ok: boolean; message?: string }>(
    "/api/auth/forgot-password/recovery-reset",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

/** 提交人工审核找回账号工单（校内 / 社会外部双表单，分支3 强制入口） */
export function submitManualReview(payload: ManualReviewRequest) {
  return apiFetch<ManualReviewResult>("/api/auth/forgot-password/manual-review", {
    method: "POST",
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

/* ---------- 安全问题（per-user 3 个，答对 2/3 可恢复账号） ---------- */

/** 获取启用中的预设安全问题（公开，前端下拉用；题库 DB 化，返回当前语言文本） */
export function fetchPresetSecurityQuestions() {
  return apiFetch<{ presets: PresetSecurityQuestion[] }>("/api/auth/security-questions/presets");
}

/** 公开获取指定用户 3 个安全问题（不含答案）；账号不存在返回固定假问题（防枚举） */
export function fetchSecurityQuestions(username: string) {
  const q = encodeURIComponent(username);
  return apiFetch<SecurityQuestionsOut>(`/api/auth/security-questions?username=${q}`);
}

/** 安全问题恢复账号：答对 3 个中 2 个即重置密码（公开 + 限流 + CSRF） */
export function recoverViaSecurityQuestions(payload: RecoverRequest) {
  return apiFetch<{ ok: boolean; username: string }>("/api/auth/recover", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 设置 / 补设自己的 3 个安全问题（登录态，需当前密码确认） */
export function setupSecurityQuestions(payload: SecurityQuestionsSetupRequest) {
  return apiFetch<{ ok: boolean }>("/api/auth/security-questions", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 修改自己的 3 个安全问题（等价 setup，走 PUT 语义） */
export function updateSecurityQuestions(payload: SecurityQuestionsSetupRequest) {
  return apiFetch<{ ok: boolean }>("/api/auth/security-questions", {
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

/** 用户详情 */
export function fetchUserDetail(id: number) {
  return apiFetch<AdminUser>(`/api/auth/users/${id}`, { withAuth: true });
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

