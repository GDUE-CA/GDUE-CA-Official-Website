import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale, urlLangToLocale, localeToUrlLang, type Locale } from "@/lib/i18n";

/**
 * Proxy（原 middleware，Next.js 16 唯一入口：禁止再新建 middleware.ts，
 * 否则启动时 Unhandled Rejection 导致所有请求永久挂起）
 * 1. 后台守卫（P0 第二层防护）：拦截 /admin/**，无会话 Cookie 重定向登录页；
 *    真正的「已登录 && 管理员角色」校验由后端全局中间件强制执行（403）
 * 2. 设置页守卫：拦截 /setting/**，无会话 Cookie 重定向登录页（携带 returnUrl 回跳）；
 *    账号设置与后台相互独立，所有角色的个人设置统一走 /setting
 * 3. 内容安全策略（CSP）：每个请求生成随机 nonce，只允许带 nonce 的脚本执行，
 *    即使页面被注入 <script> / 事件处理器也无法运行（XSS 纵深防御）
 * 4. 国际化路由：检测请求路径是否包含语言前缀，若无则根据浏览器偏好重定向（admin 后台除外）
 */

const SESSION_COOKIE = "gdueca_session";

/** 无需登录即可访问的后台页面（登录流程自身 + 紧急恢复） */
const PUBLIC_ADMIN_PATHS = new Set([
  "/admin/login",
  "/admin/forgot-password",
  "/admin/recover",
]);

/**
 * 后台守卫：未登录访问 /admin/** 时返回重定向到登录页；放行返回 null。
 * 仅判断 Cookie 存在性，不解析 JWT / 不做角色判断——
 * HttpOnly Cookie 在 Edge Runtime 无法验签，任何角色决策必须由后端完成。
 */
function adminGuard(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;

  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!isAdminPath) return null;

  // 放行登录流程页面（含子路径，如 /admin/login/x）
  if (PUBLIC_ADMIN_PATHS.has(pathname) || pathname.startsWith("/admin/login/")) {
    return null;
  }

  if (request.cookies.has(SESSION_COOKIE)) return null;

  // 未登录：重定向到后台登录页，并携带原始地址供登录后回跳
  const loginUrl = new URL("/admin/login", request.url);
  const next = pathname + (request.nextUrl.search || "");
  if (next && next !== "/admin") loginUrl.searchParams.set("next", next);
  return loginUrl;
}

/**
 * 设置页守卫：未登录访问 /setting/** 时重定向到登录页并携带回跳地址；放行返回 null。
 * 与 adminGuard 一致仅判断 Cookie 存在性——真实登录态由后端接口与 SettingRoot 客户端校验；
 * 设置页数据一律取自当前登录会话，不存在通过 query 参数访问他人设置页的路径。
 */
function settingGuard(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;

  const isSettingPath = pathname === "/setting" || pathname.startsWith("/setting/");
  if (!isSettingPath) return null;

  if (request.cookies.has(SESSION_COOKIE)) return null;

  // 未登录：重定向到登录页，携带 returnUrl 供登录后回跳
  const loginUrl = new URL("/auth/login", request.url);
  const next = pathname + (request.nextUrl.search || "");
  if (next && next !== "/setting") loginUrl.searchParams.set("returnUrl", next);
  return loginUrl;
}

/** 允许额外连接 / 加载脚本的外部来源（后端跨域部署地址、Umami 统计） */
function externalOrigins(): string[] {
  const origins: string[] = [];
  for (const url of [process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NEXT_PUBLIC_UMAMI_SRC]) {
    if (!url) continue;
    try {
      origins.push(new URL(url).origin);
    } catch {
      /* 非法 URL 忽略 */
    }
  }
  return origins;
}

function buildCsp(nonce: string, isHttps: boolean): string {
  const isDev = process.env.NODE_ENV === "development";
  const extra = externalOrigins().join(" ");
  return [
    "default-src 'self'",
    // strict-dynamic：由带 nonce 的脚本动态加载的脚本同样可信，其余一律拒绝
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // 组件库（Radix / framer-motion）通过 style 属性写动画样式，需允许内联样式
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // nominatim：个人资料页「自动定位」的逆地理编码（用户主动点击触发）
    `connect-src 'self' https://nominatim.openstreetmap.org${extra ? ` ${extra}` : ""}${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // 仅 HTTPS 访问时升级子资源；局域网 HTTP 访问不能加，否则资源全部加载失败
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** 从 Cookie / Accept-Language 检测用户语言偏好（返回全小写 Locale） */
function detectLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get("locale")?.value;
  if (cookieLocale) {
    // 兼容旧版混合大小写 Cookie（如 zh-CN），统一归一为小写
    const loc = urlLangToLocale(cookieLocale);
    if (loc) return loc;
  }

  const acceptLang = request.headers.get("accept-language");
  if (acceptLang) {
    const langs = acceptLang
      .split(",")
      .map((l) => l.trim().split(";")[0].toLowerCase());
    for (const l of langs) {
      if (l.startsWith("zh")) {
        // tw → 台湾繁体；hk / mo（澳门）→ 香港繁体；其余 zh（zh / zh-cn / zh-sg 等）→ 简体
        return l.includes("tw")
          ? "zh-tw"
          : l.includes("hk") || l.includes("mo")
            ? "zh-hk"
            : "zh-cn";
      }
      if (l.startsWith("ja")) return "ja";
      if (l.startsWith("en")) {
        // en-gb 优先匹配英式英语，其余英语（en / en-us / en-ca 等）归入美式
        return l.includes("gb") ? "en-gb" : "en-us";
      }
    }
  }
  return defaultLocale;
}

/** 登录页多语言路由：返回需要重定向的 URL；无需重定向返回 null；非登录页路径返回 undefined */
function adminLoginRedirect(request: NextRequest): URL | null | undefined {
  const { pathname } = request.nextUrl;

  // 裸路径 /admin/login → 按检测到的语言补全前缀
  if (pathname === "/admin/login" || pathname === "/admin/login/") {
    const url = request.nextUrl.clone();
    url.pathname = `/${localeToUrlLang(detectLocale(request))}/admin/login`;
    return url;
  }

  // /{lang}/admin/login：合法语言段统一规范为小写；已在规范形式则放行
  const match = pathname.match(/^\/([A-Za-z-]+)\/admin\/login\/?$/);
  if (match) {
    const locale = urlLangToLocale(match[1]);
    if (locale) {
      const canonical = `/${localeToUrlLang(locale)}/admin/login`;
      if (pathname !== canonical) {
        const url = request.nextUrl.clone();
        url.pathname = canonical;
        return url;
      }
      return null;
    }
  }

  return undefined;
}

/** 若路径缺少语言前缀，返回应重定向到的 URL；否则返回 null */
function localeRedirect(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;

  // 登录页多语言路由优先处理（admin 前缀豁免规则之前）
  const adminLogin = adminLoginRedirect(request);
  if (adminLogin !== undefined) return adminLogin;

  // admin 后台不走 locale 前缀
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  // 旧 /en 前缀兼容重定向（英语拆分为 en-us / en-gb 之前的旧链接、收藏与搜索索引）
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/en-us${pathname.slice(3)}`;
    return url;
  }

  // 旧版混合大小写语言前缀（如 /zh-CN/...）统一 301 到全小写规范形式
  const firstSeg = pathname.split("/")[1] ?? "";
  const segLocale = firstSeg ? urlLangToLocale(firstSeg) : null;
  if (segLocale && firstSeg !== segLocale) {
    const url = request.nextUrl.clone();
    url.pathname = `/${segLocale}${pathname.slice(firstSeg.length + 1)}`;
    return url;
  }

  // 检查路径是否已包含语言前缀
  const pathnameHasLocale = locales.some(
    (loc) => pathname.startsWith(`/${loc}/`) || pathname === `/${loc}`
  );
  if (pathnameHasLocale) return null;

  const detectedLocale = detectLocale(request);

  const url = request.nextUrl.clone();
  url.pathname = `/${detectedLocale}${pathname}`;
  return url;
}

export function proxy(request: NextRequest) {
  // 后台守卫优先于 i18n 路由（/admin/** 豁免语言前缀）
  const guardRedirect = adminGuard(request);
  if (guardRedirect) return NextResponse.redirect(guardRedirect);

  // 设置页守卫：/setting/** 需登录（回跳地址在登录后由登录页消费）
  const settingRedirect = settingGuard(request);
  if (settingRedirect) return NextResponse.redirect(settingRedirect);

  const redirectUrl = localeRedirect(request);
  if (redirectUrl) return NextResponse.redirect(redirectUrl);

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const isHttps = (forwardedProto ?? request.nextUrl.protocol.replace(":", "")) === "https";
  const csp = buildCsp(nonce, isHttps);

  // 通过请求头把 nonce 传给渲染层：Next.js 自动为框架脚本加 nonce，布局中手写脚本读 x-nonce
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // 匹配所有页面路径，排除后端反代（api / uploads）、静态资源、图片优化、特殊文件与预取请求
  matcher: [
    {
      source:
        "/((?!api|uploads|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png$|.*\\.svg$|.*\\.ico$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
