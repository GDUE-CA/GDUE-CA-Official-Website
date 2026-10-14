import { BlockList, isIP } from "node:net";
import type { NextRequest } from "next/server";

/**
 * 访客 IP 工具
 *
 * 安全前提：Next.js 只能经 Nginx 访问，且 Nginx 用真实对端覆盖 X-Real-IP / X-Forwarded-For
 * （见 docker/nginx.conf）。若 Next 直接暴露在公网，这两个头可被伪造，风控即可被绕过。
 */

/** 取访客 IP；无法识别时返回 null */
export function getClientIp(request: NextRequest): string | null {
  const candidates = [
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const raw of candidates) {
    const ip = normalizeIp(raw);
    if (ip) return ip;
  }
  return null;
}

/** 去空白、去 IPv4 映射前缀（::ffff:1.2.3.4），非法返回 null */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return isIP(ip) ? ip : null;
}

function ipFamily(ip: string): "ipv4" | "ipv6" {
  return isIP(ip) === 4 ? "ipv4" : "ipv6";
}

/** 由 "1.2.3.4" / "10.0.0.0/8" / "2001:db8::/32" 列表构建匹配表，非法项忽略 */
function buildBlockList(entries: string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const [addr, prefixRaw] = entry.split("/");
    const family = isIP(addr);
    if (!family) continue;
    const type = family === 4 ? "ipv4" : "ipv6";
    if (prefixRaw === undefined) {
      list.addAddress(addr, type);
      continue;
    }
    const prefix = Number(prefixRaw);
    if (Number.isInteger(prefix) && prefix >= 0 && prefix <= (family === 4 ? 32 : 128)) {
      list.addSubnet(addr, prefix, type);
    }
  }
  return list;
}

/** 内网 / 回环 / 链路本地等不可路由地址：不查询外部风控 */
const PRIVATE_RANGES = buildBlockList([
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "100.64.0.0/10",
  "0.0.0.0/8",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
]);

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.check(ip, ipFamily(ip));
}

const allowlistCache = new Map<string, BlockList>();

export function isAllowlisted(ip: string, entries: string[]): boolean {
  if (entries.length === 0) return false;
  const key = entries.join(",");
  let list = allowlistCache.get(key);
  if (!list) {
    list = buildBlockList(entries);
    allowlistCache.set(key, list);
  }
  return list.check(ip, ipFamily(ip));
}

/**
 * 通行凭证绑定的 IP 范围：IPv4 绑定完整地址；
 * IPv6 绑定 /64（系统会定期轮换隐私地址的后 64 位，绑定完整地址会反复要求验证）
 */
export function ipScope(ip: string): string {
  if (ipFamily(ip) === "ipv4") return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...headParts, ...Array(8 - headParts.length - tailParts.length).fill("0"), ...tailParts]
    : headParts;
  return `${groups
    .slice(0, 4)
    .map((g) => g.padStart(4, "0"))
    .join(":")}::/64`;
}
