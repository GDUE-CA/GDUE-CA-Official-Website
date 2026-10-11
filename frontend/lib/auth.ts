/**
 * 前端登录态工具
 *
 * 安全设计：
 * - 登录凭据（JWT）由后端写入 HttpOnly + SameSite=Strict Cookie，前端脚本无法读取，
 *   即使页面存在 XSS 也无法窃取登录态
 * - localStorage 只缓存「用户名 + 角色」用于界面展示（非敏感），真实权限一律以后端校验为准
 * - 不在浏览器中保存任何密码（记住密码交给浏览器自带的密码管理器）
 */
import { secureFetch, setCsrfToken } from "@/lib/api/client";

const USER_KEY = "gdueca_user";
/** 旧版本遗留的本地存储键：令牌 / base64 明文密码 / 自动登录标记，启动时清除 */
const LEGACY_KEYS = [
  "gdueca_admin_token",
  "gdueca_admin_user",
  "gdueca_saved_creds",
  "gdueca_autologin",
];

/** 可进入后台管理的角色（普通成员 member 与访客不可进入） */
export const ADMIN_ROLES = new Set(["super_admin", "admin", "editor"]);

export interface AdminSession {
  username: string;
  role: string;
  /** 实名验证状态：admin/editor 未实名仅可浏览前台，进后台会被守卫跳转 /realname */
  realnameVerified: boolean;
}

function purgeLegacyStorage() {
  try {
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
  } catch {
    /* 存储不可用时忽略 */
  }
}

/** 写入登录会话展示信息（登录成功后调用） */
export function saveSession(session: AdminSession, csrfToken?: string) {
  if (typeof window === "undefined") return;
  purgeLegacyStorage();
  if (csrfToken) setCsrfToken(csrfToken);
  window.localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      username: session.username,
      role: session.role,
      realnameVerified: session.realnameVerified,
    })
  );
}

/** 读取当前会话展示信息（仅客户端；不代表服务端会话仍有效） */
export function getSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  purgeLegacyStorage();
  const userStr = window.localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    const user = JSON.parse(userStr) as {
      username: string;
      role: string;
      realnameVerified?: boolean;
    };
    return {
      username: user.username,
      role: user.role,
      // 旧缓存无该字段时默认按已实名处理，以后端 403 守卫为准
      realnameVerified: user.realnameVerified !== false,
    };
  } catch {
    return null;
  }
}

/** 是否（可能）已登录：用于决定是否请求需要登录的接口 */
export function isLogged(): boolean {
  return !!getSession();
}

/** 是否具备后台管理角色 */
export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_ROLES.has(role);
}

/** 仅清除本地展示信息（会话已在服务端失效时使用） */
export function clearLocalSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_KEY);
  setCsrfToken(null);
}

/** 退出登录：服务端撤销会话并清除 Cookie，再清除本地展示信息 */
export async function logout() {
  if (typeof window === "undefined") return;
  try {
    await secureFetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* 网络异常时仍清除本地信息 */
  }
  clearLocalSession();
}
