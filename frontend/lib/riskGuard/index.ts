import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getRiskGuardConfig, isChallengeConfigured } from "./config";
import { verifiedCrawler } from "./crawler";
import { getClientIp, ipScope, isAllowlisted, isPrivateIp } from "./ip";
import { riskLog } from "./log";
import { pageCsp, renderBlockedPage, renderChallengePage, VERIFY_PATH } from "./pages";
import { issuePassToken, PASS_COOKIE, verifyPassToken } from "./passToken";
import { lookupRisk } from "./riskApi";
import { verifyTurnstile } from "./turnstile";

/**
 * 访问风控（由 proxy.ts 在所有页面请求前调用）
 *
 * 判定顺序：
 *   内网 IP / 白名单 / 持有有效通行凭证 → 放行
 *   查询外部风控（失败则放行）→ 三项均为 false → 放行
 *   经 DNS 校验的搜索引擎爬虫 → 放行
 *   isIdc 且 isProxy → 403 拒绝访问页（附管理员联系方式）
 *   其余（任一为 true）→ Turnstile 人机验证页，通过后签发绑定 IP 的通行 Cookie
 */

export { VERIFY_PATH };

export interface GuardContext {
  /** 站点 locale，决定挑战页 / 拒绝页文案语言 */
  locale: string;
  isHttps: boolean;
}

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** 沿用 Nginx 下发的 X-Request-ID（格式校验，防日志注入），否则自行生成 */
function requestIdOf(request: NextRequest): string {
  const id = request.headers.get("x-request-id");
  return id && REQUEST_ID_RE.test(id) ? id : crypto.randomUUID().replace(/-/g, "");
}

function htmlResponse(html: string, status: number, nonce: string): NextResponse {
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": pageCsp(nonce),
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/** 返回拦截响应；返回 null 表示放行，由 proxy 继续处理 */
export async function riskGuard(request: NextRequest, ctx: GuardContext): Promise<NextResponse | null> {
  const cfg = getRiskGuardConfig();
  if (!cfg.enabled) return null;

  const ip = getClientIp(request);
  if (!ip || isPrivateIp(ip) || isAllowlisted(ip, cfg.allowlist)) return null;
  if (verifyPassToken(request.cookies.get(PASS_COOKIE)?.value, ipScope(ip), cfg)) return null;

  const requestId = requestIdOf(request);
  const verdict = await lookupRisk(ip, cfg, requestId);
  if (!verdict || (!verdict.isRisky && !verdict.isIdc && !verdict.isProxy)) return null;

  const crawler = await verifiedCrawler(ip, request.headers.get("user-agent") ?? "");
  if (crawler) return null;

  const blocked = verdict.isIdc && verdict.isProxy;
  if (!blocked && !isChallengeConfigured(cfg)) {
    riskLog("WARN", requestId, "未配置 TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY，风险 IP 无法下发验证，已放行");
    return null;
  }

  // 非页面请求（表单 / Server Action 等）无法展示页面，直接拒绝
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse(blocked ? "Forbidden" : "Verification required", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  riskLog(
    "INFO",
    requestId,
    `${blocked ? "拒绝" : "验证"} ip=${ip} idc=${verdict.isIdc} proxy=${verdict.isProxy} risky=${verdict.isRisky}`,
  );
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const page = { locale: ctx.locale, nonce, ip, requestId, verdict };
  return blocked
    ? htmlResponse(renderBlockedPage(page, cfg.contactEmail, cfg.contactUrl), 403, nonce)
    : htmlResponse(renderChallengePage(page, cfg.turnstileSiteKey, cfg.passTtlSeconds / 3600), 403, nonce);
}

function json(body: object, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Origin 须与访问的主机一致（经 Nginx 时以 X-Forwarded-Host 为准）；无 Origin 头时放过，令牌本身即凭证 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** POST /__risk/verify：校验 Turnstile 令牌，成功则签发通行 Cookie */
export async function handleVerify(request: NextRequest, ctx: GuardContext): Promise<NextResponse> {
  const cfg = getRiskGuardConfig();
  if (request.method !== "POST") return json({ ok: false }, 405);
  if (!cfg.enabled || !isChallengeConfigured(cfg)) return json({ ok: false }, 404);

  // 仅接受本站页面发起的请求
  if (!isSameOrigin(request)) return json({ ok: false }, 403);

  const ip = getClientIp(request);
  if (!ip) return json({ ok: false }, 400);

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token || token.length > 2048) return json({ ok: false }, 400);

  const requestId = requestIdOf(request);
  if (!(await verifyTurnstile(token, ip, cfg, requestId))) return json({ ok: false }, 403);

  const pass = issuePassToken(ipScope(ip), cfg);
  riskLog("INFO", requestId, `人机验证通过 ip=${ip}`);
  const res = json({ ok: true }, 200);
  res.cookies.set(PASS_COOKIE, pass.value, {
    httpOnly: true,
    secure: ctx.isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: pass.maxAge,
  });
  return res;
}
