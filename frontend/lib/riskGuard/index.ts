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
import { issueNonce, verifyRiskToken } from "./riskToken";
import { verifyTurnstile } from "./turnstile";

/**
 * 访问风控（由 proxy.ts 在所有页面请求前调用）
 *
 * 服务端只负责「门」：
 *   内网 IP / 白名单 / 持有有效通行凭证 / 经 DNS 校验的搜索引擎爬虫 → 放行
 *   链接预览机器人（按 UA 识别，每 IP 限次）→ 放行
 *   其余 → 返回检测页，由访客浏览器带上本站下发的 aud / nonce 直接请求风控接口 v2
 *          （接口按来源 IP 自行判定，并对结果做 Ed25519 签名），再把令牌原样交回本站验签：
 *     三项均为 false 且令牌有效 → 签发通行凭证，刷新进入
 *     isIdc 且 isProxy          → 显示拒绝访问（附管理员联系方式），不发凭证
 *     其余任一为 true           → Turnstile 验证码（未配置时改用工作量证明）
 *     接口故障 / 超时 / 令牌无效（验签、过期、aud、nonce、IP 不一致）→ 同上，一律要求验证
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
  const turnstile = isTurnstileConfigured(cfg);
  const html = renderGatePage({
    locale: ctx.locale,
    nonce,
    requestId: requestIdOf(request),
    ip,
    apiUrl: cfg.apiUrl,
    apiTimeoutMs: cfg.apiTimeoutMs,
    aud: audienceFor(request, cfg.audiences),
    riskNonce: issueNonce(ipScope(ip), cfg),
    turnstileSiteKey: turnstile ? cfg.turnstileSiteKey : "",
    pow: turnstile ? null : issuePowChallenge(ipScope(ip), cfg),
    powMinSeconds: cfg.powMinSeconds,
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

/**
 * 页面请求风控令牌时使用的 aud：风控接口要求它等于浏览器 Origin 的主机名，
 * 因此优先用本次访问的主机名（须在白名单内）；验签时只认白名单，不信任 Host 头
 */
function audienceFor(request: NextRequest, audiences: string[]): string {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  let hostname = "";
  try {
    hostname = new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    /* 非法 Host 走白名单首项 */
  }
  return audiences.includes(hostname) ? hostname : (audiences[0] ?? hostname);
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
 * POST /__risk/verify：校验后签发通行 Cookie
 *   { mode: "token", token }          风控接口签名令牌；判定为风险时返回 next 指示前端下一步
 *   { mode: "turnstile", token }      Turnstile 令牌
 *   { mode: "pow", challenge, nonces } 工作量证明（每道子题一个 nonce；仅在未配置 Turnstile 时接受，避免攻击者选择更便宜的路径）
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
  const turnstile = isTurnstileConfigured(cfg);
  let passed = false;
  if (body?.mode === "token") {
    const token = typeof body.token === "string" && body.token.length <= 4096 ? body.token : "";
    const result = await verifyRiskToken(token, ip, cfg, requestId);
    if (!result.ok) {
      riskLog("INFO", requestId, `风控令牌无效（${result.reason}）ip=${ip}，转人机验证`);
      return json({ ok: false, next: "challenge" }, 403);
    }
    const { isRisky, isIdc, isProxy } = result.claims;
    if (isIdc && isProxy) return json({ ok: false, next: "blocked" }, 403);
    if (isRisky || isIdc || isProxy) return json({ ok: false, next: "challenge" }, 403);
    passed = true;
  } else if (body?.mode === "pow" && !turnstile) {
    passed = verifyPow(body.challenge, body.nonces, scope, cfg);
  } else if (body?.mode === "turnstile" && turnstile) {
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
