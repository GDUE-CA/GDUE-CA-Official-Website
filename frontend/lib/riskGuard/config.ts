/**
 * 访问风控配置（仅服务端，proxy.ts 在 Node.js 运行时读取）
 * 所有项均来自环境变量，说明见 frontend/.env.example「访问风控」一节
 */

function intEnv(name: string, fallback: number, min: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function listEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface RiskGuardConfig {
  enabled: boolean;
  /** 风控接口地址模板，{ip} 替换为访客 IP */
  apiUrl: string;
  apiTimeoutMs: number;
  /** 风控结果缓存时长（秒） */
  cacheTtlSeconds: number;
  /** 免检 IP / 网段（管理员手动放行） */
  allowlist: string[];
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  /** 通过人机验证后的免检时长（秒） */
  passTtlSeconds: number;
  /** 通行凭证签名密钥；未配置时由 Turnstile 密钥派生 */
  passSecret: string;
  contactEmail: string;
  contactUrl: string;
}

let cached: RiskGuardConfig | null = null;

export function getRiskGuardConfig(): RiskGuardConfig {
  if (cached) return cached;
  cached = {
    enabled: process.env.RISK_GUARD_ENABLED === "true",
    apiUrl: process.env.RISK_API_URL || "https://risk.catyuki.com/api/v1/ip/{ip}",
    apiTimeoutMs: intEnv("RISK_API_TIMEOUT_MS", 1500, 100),
    cacheTtlSeconds: intEnv("RISK_CACHE_TTL_SECONDS", 1800, 0),
    allowlist: listEnv("RISK_IP_ALLOWLIST"),
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? "",
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
    passTtlSeconds: intEnv("RISK_PASS_TTL_HOURS", 12, 1) * 3600,
    passSecret: process.env.RISK_PASS_SECRET ?? "",
    contactEmail: process.env.RISK_CONTACT_EMAIL ?? "",
    contactUrl: process.env.RISK_CONTACT_URL ?? "",
  };
  return cached;
}

/** Turnstile 两个密钥都配置才能下发人机验证 */
export function isChallengeConfigured(cfg: RiskGuardConfig): boolean {
  return Boolean(cfg.turnstileSiteKey && cfg.turnstileSecretKey);
}
