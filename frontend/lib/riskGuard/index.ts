import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getRiskGuardConfig, isTurnstileConfigured } from "./config";
import { verifiedCrawler } from "./crawler";
import { allowPreviewBot } from "./previewBots";
import { getClientIp, ipScope, isAllowlisted, isPrivateIp } from "./ip";
import { riskLog } from "./log";
import { gateCsp, renderGatePage, VERIFY_PATH } from "./pages";
import { issuePassToken, PASS_COOKIE, verifyPassToken } from "./passToken";
import { issuePowChallenge, verifyPow } from "./pow";
import { verifyTurnstile } from "./turnstile";

/**
 * 访问风控（由 proxy.ts 在所有页面请求前调用）
 *
 * 服务端只负责「门」：
 *   内网 IP / 白名单 / 持有有效通行凭证 / 经 DNS 校验的搜索引擎爬虫 → 放行
 *   链接预览机器人（按 UA 识别，每 IP 限次）→ 放行
 *   其余 → 返回检测页，由访客浏览器直接请求风控接口（接口按来源 IP 自行判定）：
 *     三项均为 false        → 自动完成工作量证明，换取通行凭证后刷新
 *     isIdc 且 isProxy      → 显示拒绝访问（附管理员联系方式），不发凭证
 *     其余任一为 true       → Turnstile 验证码（未配置时改用工作量证明）
 *     接口故障 / 超时 / 跨域失败 → 同上，一律要求验证
 *
 * 风控结果在浏览器端得出、服务端无法验真，因此换取凭证至少要付出一次工作量证明。
 */

export { VERIFY_PATH };

export interface GuardContext {
  /** 站点 locale，决定检测页文案语言 */
  locale: string;
  isHttps: boolean;
}

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** 沿用 Nginx 下发的 X-Request-ID（格式校验，防日志注入），否则自行生成 */
function requestIdOf(request: NextRequest): string {
  const id = request.headers.get("x-request-id");
  return id && REQUEST_ID_RE.test(id) ? id : crypto.randomUUID().replace(/-/g, "");
}

/** 返回拦截响应；返回 null 表示放行，由 proxy 继续处理 */
export async function riskGuard(request: NextRequest, ctx: GuardContext): Promise<NextResponse | null> {
  const cfg = getRiskGuardConfig();
  if (!cfg.enabled) return null;

  const ip = getClientIp(request);
  if (!ip || isPrivateIp(ip) || isAllowlisted(ip, cfg.allowlist)) return null;
  if (verifyPassToken(request.cookies.get(PASS_COOKIE)?.value, ipScope(ip), cfg)) return null;
  const userAgent = request.headers.get("user-agent") ?? "";
  if (await verifiedCrawler(ip, userAgent)) return null;
  if (cfg.allowPreviewBots && allowPreviewBot(ip, userAgent, request.method, cfg.previewBotUa)) return null;

  // 非页面请求（表单 / Server Action 等）无法展示检测页，直接拒绝
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("Verification required", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const html = renderGatePage({
    locale: ctx.locale,
    nonce,
    requestId: requestIdOf(request),
    ip,
    apiUrl: cfg.apiUrl,
    apiTimeoutMs: cfg.apiTimeoutMs,
    turnstileSiteKey: isTurnstileConfigured(cfg) ? cfg.turnstileSiteKey : "",
    pow: issuePowChallenge(ipScope(ip), cfg),
    passHours: cfg.passTtlSeconds / 3600,
    contactEmail: cfg.contactEmail,
    contactUrl: cfg.contactUrl,
  });
  return new NextResponse(html, {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": gateCsp(nonce, cfg.apiUrl),
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function json(body: object, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Origin 须与访问的主机一致（经 Nginx 时以 X-Forwarded-Host 为准）；无 Origin 头时放过，凭证本身即证明 */
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

/**
 * POST /__risk/verify：校验工作量证明或 Turnstile 令牌，成功则签发通行 Cookie
 *   { mode: "pow", challenge, nonce }
 *   { mode: "turnstile", token }
 */
export async function handleVerify(request: NextRequest, ctx: GuardContext): Promise<NextResponse> {
  const cfg = getRiskGuardConfig();
  if (request.method !== "POST") return json({ ok: false }, 405);
  if (!cfg.enabled) return json({ ok: false }, 404);
  if (!isSameOrigin(request)) return json({ ok: false }, 403);

  const ip = getClientIp(request);
  if (!ip) return json({ ok: false }, 400);
  const scope = ipScope(ip);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const requestId = requestIdOf(request);
  let passed = false;
  if (body?.mode === "pow") {
    passed = verifyPow(body.challenge, body.nonce, scope, cfg);
  } else if (body?.mode === "turnstile" && isTurnstileConfigured(cfg)) {
    const token = typeof body.token === "string" ? body.token : "";
    passed = token.length > 0 && token.length <= 2048 && (await verifyTurnstile(token, ip, cfg, requestId));
  } else {
    return json({ ok: false }, 400);
  }
  if (!passed) return json({ ok: false }, 403);

  riskLog("INFO", requestId, `检测通过 mode=${body.mode} ip=${ip}`);
  const pass = issuePassToken(scope, cfg);
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
