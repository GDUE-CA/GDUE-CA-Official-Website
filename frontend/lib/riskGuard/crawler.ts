import { lookup, reverse } from "node:dns/promises";

/**
 * 搜索引擎爬虫识别
 *
 * 仅凭 User-Agent 放行会被伪造（任何人都能自称 Googlebot），因此采用各搜索引擎官方推荐的
 * 正反向 DNS 双重校验：IP 反查域名须属于该引擎，且该域名正查结果须包含原 IP。
 */

interface CrawlerRule {
  name: string;
  ua: RegExp;
  /** 反查域名必须以其中之一结尾 */
  domains: string[];
}

const CRAWLERS: CrawlerRule[] = [
  {
    name: "Google",
    ua: /Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|AdsBot-Google|Mediapartners-Google/i,
    domains: [".googlebot.com", ".google.com"],
  },
  { name: "Bing", ua: /bingbot|msnbot|BingPreview|adidxbot/i, domains: [".search.msn.com"] },
  { name: "Baidu", ua: /Baiduspider/i, domains: [".baidu.com", ".baidu.jp"] },
  { name: "Yandex", ua: /YandexBot|YandexImages|YandexMobileBot/i, domains: [".yandex.ru", ".yandex.net", ".yandex.com"] },
  { name: "Sogou", ua: /Sogou web spider|Sogou inst spider/i, domains: [".sogou.com"] },
  { name: "Applebot", ua: /Applebot/i, domains: [".applebot.apple.com"] },
  { name: "Petal", ua: /PetalBot/i, domains: [".petalsearch.com"] },
];

const DNS_TIMEOUT_MS = 4000;
const VERIFY_CACHE_MS = 24 * 3600 * 1000;
/** DNS 超时 / 故障不代表不是爬虫，只短暂缓存，稍后重试 */
const ERROR_CACHE_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;

/** IP → 校验结果（爬虫名或 null） */
const verified = new Map<string, { name: string | null; expiresAt: number }>();

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("dns timeout")), DNS_TIMEOUT_MS)),
  ]);
}

type DnsResult = "match" | "mismatch" | "error";

async function verifyByDns(ip: string, rule: CrawlerRule): Promise<DnsResult> {
  try {
    const hostnames = await withTimeout(reverse(ip));
    for (const raw of hostnames) {
      const host = raw.toLowerCase().replace(/\.$/, "");
      if (!rule.domains.some((d) => host.endsWith(d))) continue;
      const addrs = await withTimeout(lookup(host, { all: true }));
      if (addrs.some((a) => a.address.toLowerCase() === ip.toLowerCase())) return "match";
    }
    return "mismatch";
  } catch (err) {
    // 无 PTR 记录属于确定的「不是」；超时、DNS 服务故障等则短暂缓存后重试
    const code = (err as NodeJS.ErrnoException).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? "mismatch" : "error";
  }
}

/** 若请求来自经 DNS 校验的搜索引擎爬虫，返回其名称；否则 null */
export async function verifiedCrawler(ip: string, userAgent: string): Promise<string | null> {
  const rule = CRAWLERS.find((r) => r.ua.test(userAgent));
  if (!rule) return null;

  const hit = verified.get(ip);
  if (hit && hit.expiresAt > Date.now()) return hit.name;

  const result = await verifyByDns(ip, rule);
  const name = result === "match" ? rule.name : null;
  if (verified.size >= MAX_CACHE_ENTRIES) verified.clear();
  verified.set(ip, { name, expiresAt: Date.now() + (result === "error" ? ERROR_CACHE_MS : VERIFY_CACHE_MS) });
  return name;
}
