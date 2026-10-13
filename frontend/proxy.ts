import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale, urlLangToLocale, localeToUrlLang, type Locale } from "@/lib/i18n";

/**
 * Proxy（原 middleware，Next.js 16 唯一入口：禁止再新建 middleware.ts，
 * 否则启动时 Unhandled Rejection 导致所有请求永久挂起）
 * 1. 后台守卫（P0 第二层防护）：拦截 /{locale}/admin/**（及裸 /admin/**），无会话 Cookie 重定向登录页；
 *    真正的「已登录 && 管理员角色」校验由后端全局中间件强制执行（403）
 * 2. 设置页守卫：拦截 /{locale}/setting/**（及裸 /setting/**），无会话 Cookie 重定向登录页（携带 returnUrl 回跳）；
 *    账号设置与后台相互独立，所有角色的个人设置统一走 /{locale}/setting
 * 3. 内容安全策略（CSP）：每个请求生成随机 nonce，只允许带 nonce 的脚本执行，
 *    即使页面被注入 <script> / 事件处理器也无法运行（XSS 纵深防御）
 * 4. 国际化路由（i18n URL 规范）：
 *    - 无 locale 前缀的裸路径 → 按用户偏好（cookie → Accept-Language → zh-cn）307 补前缀，子路径与 query 完整保留
 *    - 非法 locale（首段形似 locale 但不在白名单，如 /fr/about、/zh/blog）→ 剥离非法段后补检测到的 locale
 *    - 混合大小写（如 /zh-CN/x）→ 301 归一到全小写规范形式
 *    - 旧 /en 前缀 → 兼容重定向到 /en-us
 *    admin/setting/auth 全部纳入 locale 前缀规则（经 next.config rewrites 内部映射到实际页面路由）
 */

const SESSION_COOKIE = "gdueca_session";

/** 形似 locale 的首段（xx 或 xx-xx），用于识别非法 locale 前缀（spec §4） */
const LOCALE_LIKE_RE = /^[a-z]{2}(-[a-z]{2,3})?$/i;

/**
 * 旧 locale 前缀 → 新 locale 前缀的 301 永久重定向映射。
 * en-us 已移除（统一 en-gb）；zh-hk 改名 zh-yue-hk；ja 改名 ja-jp。
 * 放在 localeRedirect 最早处，优先于非法 locale 剥离逻辑。
 */
const OLD_LOCALE_REDIRECTS: Record<string, string> = {
  "en-us": "en-gb",
  "zh-hk": "zh-yue-hk",
  ja: "ja-jp",
};

/**
 * 剥离 pathname 首段 locale 前缀，返回去掉 locale 的剩余路径与解析到的 locale。
 * - "/zh-cn/admin/login" → { rest: "/admin/login", locale: "zh-cn" }
 * - "/admin/login"       → { rest: "/admin/login", locale: null }
 * - "/about"             → { rest: "/about",       locale: null }
 */
function stripLocale(pathname: string): { rest: string; locale: Locale | null } {
  const first = pathname.split("/")[1] ?? "";
  const loc = urlLangToLocale(first); // 大小写不敏感，非法值返回 null
  if (loc) {
    // 去掉首段 locale："/zh-cn/admin" → "/admin"；"/zh-cn" → "/"
    const rest = pathname.slice(first.length + 1); // 去掉 "/{locale}"
    return { rest: rest === "" ? "/" : rest, locale: loc };
  }
  return { rest: pathname, locale: null };
}

/** 无需登录即可访问的后台页面（admin 相对路径，已剥离 locale 前缀）。
 *  注：/admin/login 已合并入统一 /login（由 next.config redirects 兜底），
 *  此处不再放行；/admin/forgot-password、/admin/recover、/admin/setup 仍属 admin
 *  域公开流程页，保留放行。 */
const PUBLIC_ADMIN_REST = new Set([
  "/admin/forgot-password",
  "/admin/recover",
  "/admin/setup",
]);

/**
 * 后台守卫：未登录访问 /{locale}/admin/** 或裸 /admin/** 时重定向到统一登录页 /{locale}/login；放行返回 null。
 * 仅判断 Cookie 存在性，不解析 JWT / 不做角色判断——
 * HttpOnly Cookie 在 Edge Runtime 无法验签，任何角色决策必须由后端完成。
 */
function adminGuard(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;
  const { rest, locale } = stripLocale(pathname);

  // 是否为 admin 路径（裸 /admin 或 /{locale}/admin 剥离后 /admin/**）
  const isAdminPath = rest === "/admin" || rest.startsWith("/admin/");
  if (!isAdminPath) return null;

  // 放行登录流程页面 + 初始化向导 /admin/setup
  if (
    PUBLIC_ADMIN_REST.has(rest) ||
    rest.startsWith("/admin/setup") ||
    rest.startsWith("/admin/forgot-password/") ||
    rest.startsWith("/admin/recover/")
  )
    return null;

  if (request.cookies.has(SESSION_COOKIE)) return null;

  // 未登录：重定向到统一登录页 /{locale}/login，并携带原始地址（含 locale 前缀）供登录后回跳
  const detected = locale ?? detectLocale(request);
  const loginUrl = new URL(`/${localeToUrlLang(detected)}/login`, request.url);
  // admin 根路径不携带 next（登录后按角色落地首页即可）
  const next = pathname + (request.nextUrl.search || "");
  const isAdminRoot = rest === "/admin" || rest === "/admin/";
  if (next && !isAdminRoot) loginUrl.searchParams.set("next", next);
  return loginUrl;
}

/**
 * 设置页守卫：未登录访问 /{locale}/setting/** 或裸 /setting/** 时重定向到统一登录页 /{locale}/login 并携带回跳地址；放行返回 null。
 * 与 adminGuard 一致仅判断 Cookie 存在性——真实登录态由后端接口与 SettingRoot 客户端校验；
 * 设置页数据一律取自当前登录会话，不存在通过 query 参数访问他人设置页的路径。
 */
function settingGuard(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;
  const { rest, locale } = stripLocale(pathname);

  const isSettingPath = rest === "/setting" || rest.startsWith("/setting/");
  if (!isSettingPath) return null;

  if (request.cookies.has(SESSION_COOKIE)) return null;

  // 未登录：重定向到统一登录页 /{locale}/login，携带 returnUrl 供登录后回跳
  const detected = locale ?? detectLocale(request);
  const loginUrl = new URL(`/${localeToUrlLang(detected)}/login`, request.url);
  const next = pathname + (request.nextUrl.search || "");
  const isSettingRoot = rest === "/setting" || rest === "/setting/";
  if (next && !isSettingRoot) loginUrl.searchParams.set("returnUrl", next);
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
      // 中文变体
      if (l.startsWith("zh")) {
        if (l.includes("tw")) return "zh-tw";
        if (l.includes("mo")) return "zh-mo";
        if (l.includes("hk") || l.includes("yue-hk") || l.includes("hant-hk")) return "zh-yue-hk";
        if (l.includes("yue") || l.includes("cn")) return l.includes("yue") ? "zh-yue-cn" : "zh-cn";
        if (l.includes("sg")) return "zh-cn-sg";
        return "zh-cn";
      }
      if (l.startsWith("ja")) return "ja-jp";
      if (l.startsWith("ko")) return "ko-kr";
      if (l.startsWith("es")) return "es-es";
      if (l.startsWith("fr")) return "fr-fr";
      if (l.startsWith("de")) return "de-de";
      if (l.startsWith("ru")) return "ru-ru";
      if (l.startsWith("en")) {
        // 所有英语统一归入 en-gb（en-us 已移除）
        return "en-gb";
      }
    }
  }
  return defaultLocale;
}

/** 若路径缺少合法 locale 前缀（或为非法 / 旧版前缀），返回应重定向到的 URL；否则返回 null */
function localeRedirect(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;

  // 旧 /en 前缀兼容重定向 → 直跳 en-gb（en-us 已废弃，不再中转）
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/en-gb${pathname.slice(3)}`;
    return url;
  }

  const firstSeg = pathname.split("/")[1] ?? "";

  // 旧 locale 前缀 301 永久重定向（en-us→en-gb、zh-hk→zh-yue-hk、ja→ja-jp）
  if (firstSeg && firstSeg.toLowerCase() in OLD_LOCALE_REDIRECTS) {
    const newLocale = OLD_LOCALE_REDIRECTS[firstSeg.toLowerCase()];
    const rest = pathname.slice(firstSeg.length + 1); // 去掉 /{oldLocale}
    const url = request.nextUrl.clone();
    url.pathname = `/${newLocale}${rest === "" ? "" : "/" + rest}`;
    return url;
  }

  const segLocale = firstSeg ? urlLangToLocale(firstSeg) : null;

  // 旧版混合大小写语言前缀（如 /zh-CN/...）统一 301 到全小写规范形式
  if (segLocale && firstSeg !== segLocale) {
    const url = request.nextUrl.clone();
    url.pathname = `/${segLocale}${pathname.slice(firstSeg.length + 1)}`;
    return url;
  }

  // 路径已含合法 locale 前缀 → 放行（admin/setting/auth 同样在此放行，
  // 由 next.config rewrites 内部映射到实际页面路由）
  const pathnameHasLocale = locales.some(
    (loc) => pathname.startsWith(`/${loc}/`) || pathname === `/${loc}`
  );
  if (pathnameHasLocale) return null;

  // 非法 locale 防护（spec §4）：首段形似 locale（xx 或 xx-xx）但不在白名单，
  // 例如 /fr/about、/zh/blog、/de → 剥离非法段，用检测到的 locale 重新拼前缀，
  // 保留后续全部子路径与 query。注意：/en 已被上方旧前缀兼容处理。
  if (firstSeg && !segLocale && LOCALE_LIKE_RE.test(firstSeg)) {
    const detected = detectLocale(request);
    const rest = pathname.replace(/^\/[^/]+/, ""); // 去掉非法首段："/fr/about"→"/about"，"/fr"→""
    const url = request.nextUrl.clone();
    url.pathname = `/${localeToUrlLang(detected)}${rest}`;
    return url;
  }

  // 裸路径（无 locale 前缀，首段为业务页面如 /about、/admin、/events）
  // → 307 补上检测到的 locale 前缀，子路径与 query 完整保留
  const detected = detectLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${localeToUrlLang(detected)}${pathname}`;
  return url;
}

export function proxy(request: NextRequest) {
  // 后台守卫优先于 i18n 路由（/admin/** 不再豁免 locale 前缀，guard 在剥离 locale 后判定）
  const guardRedirect = adminGuard(request);
  if (guardRedirect) return NextResponse.redirect(guardRedirect);

  // 设置页守卫：/{locale}/setting/** 需登录（回跳地址在登录后由登录页消费）
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
  // x-locale / x-pathname：供服务端组件取当前 locale 与浏览器路径（locale 已由上方重定向补全）
  // 服务端 redirect() 用 x-locale 拼 locale 前缀路径；[locale] layout 用 x-pathname 生成每页 hreflang
  const firstSeg = request.nextUrl.pathname.split("/")[1] ?? "";
  requestHeaders.set("x-locale", urlLangToLocale(firstSeg) ?? defaultLocale);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
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
