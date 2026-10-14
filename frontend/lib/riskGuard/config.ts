/**
 * 访问风控配置（仅服务端，proxy.ts 在 Node.js 运行时读取）
 * 所有项均来自环境变量，说明见 frontend/.env.example「访问风控」一节
 */

function intEnv(name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

const DEFAULT_API_URL = "https://risk.catyuki.com/api/v2/ip";

/** 须为 http(s) 绝对地址（风控接口会写入 CSP connect-src），非法时回退默认值 */
function urlEnv(name: string, fallback: string): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    /* 落到下方告警 */
  }
  console.warn(`risk_guard | ${name} 非法（${raw}），改用默认 ${fallback}`);
  return fallback;
}

/** 允许的令牌 aud：RISK_TOKEN_AUD，未配置时取站点地址的主机名 */
function audiencesEnv(): string[] {
  const list = listEnv("RISK_TOKEN_AUD").map((a) => a.toLowerCase());
  if (list.length > 0) return list;
  try {
    return process.env.NEXT_PUBLIC_SITE_URL ? [new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname] : [];
  } catch {
    return [];
  }
}

function listEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface RiskGuardConfig {
  enabled: boolean;
  /** 风控接口（v2，签名版）：由访客浏览器直接请求，接口按请求来源 IP 自行判定并签发令牌 */
  apiUrl: string;
  /** 验签公钥集（JWK Set） */
  keysUrl: string;
  /** 本站可接受的令牌 aud（主机名）；须与浏览器访问本站时的主机名一致 */
  audiences: string[];
  /** 浏览器端请求风控接口的超时（毫秒），超时按「检测失败」处理 */
  apiTimeoutMs: number;
  /** 免检 IP / 网段（管理员手动放行） */
  allowlist: string[];
  /** 是否放行链接预览机器人（按 UA 识别，每 IP 限次） */
  allowPreviewBots: boolean;
  /** 追加的预览机器人 UA 关键字（不区分大小写的子串匹配） */
  previewBotUa: string[];
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  /** 工作量证明难度（SHA-256 前导零位数），每 +1 计算量翻倍；仅在未配置 Turnstile 时用于人机验证 */
  powDifficulty: number;
  /** 通过检测后的免检时长（秒） */
  passTtlSeconds: number;
  /** 通行凭证 / nonce / PoW 题目签名密钥；未配置时由 Turnstile 密钥派生 */
  passSecret: string;
  contactEmail: string;
  contactUrl: string;
}

let cached: RiskGuardConfig | null = null;

export function getRiskGuardConfig(): RiskGuardConfig {
  if (cached) return cached;
  cached = {
    enabled: process.env.RISK_GUARD_ENABLED === "true",
    apiUrl: urlEnv("RISK_API_URL", DEFAULT_API_URL),
    keysUrl: urlEnv("RISK_KEYS_URL", new URL("/.well-known/risk-keys.json", urlEnv("RISK_API_URL", DEFAULT_API_URL)).toString()),
    audiences: audiencesEnv(),
    apiTimeoutMs: intEnv("RISK_API_TIMEOUT_MS", 4000, 500),
    allowlist: listEnv("RISK_IP_ALLOWLIST"),
    allowPreviewBots: process.env.RISK_ALLOW_PREVIEW_BOTS !== "false",
    previewBotUa: listEnv("RISK_PREVIEW_BOT_UA"),
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? "",
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
    powDifficulty: intEnv("RISK_POW_DIFFICULTY", 16, 8, 24),
    passTtlSeconds: intEnv("RISK_PASS_TTL_HOURS", 12, 1) * 3600,
    passSecret: process.env.RISK_PASS_SECRET ?? "",
    contactEmail: process.env.RISK_CONTACT_EMAIL ?? "",
    contactUrl: process.env.RISK_CONTACT_URL ?? "",
  };
  return cached;
}

/** Turnstile 两个密钥都配置才使用验证码；否则风险访客改用工作量证明 */
export function isTurnstileConfigured(cfg: RiskGuardConfig): boolean {
  return Boolean(cfg.turnstileSiteKey && cfg.turnstileSecretKey);
}
