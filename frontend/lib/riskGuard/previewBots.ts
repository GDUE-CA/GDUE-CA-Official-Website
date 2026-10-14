/**
 * 链接预览机器人（社交平台 / IM 抓取 OG 卡片）
 *
 * 这类机器人大多没有可验证的 IP 段或反查域名，只能按 User-Agent 识别，而 UA 可被任意伪造。
 * 为免成为绕过检测的后门：仅放行 GET / HEAD，且每个 IP 在时间窗内的放行次数有上限
 * （预览抓取通常一个链接只请求一两次，超出上限的照常进入检测页）。
 */

const BUILTIN_UA_MARKERS = [
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "LinkedInBot",
  "Slackbot",
  "Slack-ImgProxy",
  "Discordbot",
  "TelegramBot",
  "WhatsApp",
  "Pinterestbot",
  "redditbot",
  "SkypeUriPreview",
  "Embedly",
  "Iframely",
  "Mastodon",
  "Bluesky Cardyb",
  "vkShare",
];

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const MAX_TRACKED_IPS = 10_000;

/** IP → 当前窗口的起点与已放行次数 */
const hits = new Map<string, { start: number; count: number }>();

function matchesPreviewBot(userAgent: string, extraMarkers: string[]): boolean {
  const ua = userAgent.toLowerCase();
  return [...BUILTIN_UA_MARKERS, ...extraMarkers].some((m) => ua.includes(m.toLowerCase()));
}

/** 是否按链接预览机器人放行（命中 UA 且未超出该 IP 的次数上限） */
export function allowPreviewBot(ip: string, userAgent: string, method: string, extraMarkers: string[]): boolean {
  if ((method !== "GET" && method !== "HEAD") || !userAgent || !matchesPreviewBot(userAgent, extraMarkers)) {
    return false;
  }
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    if (hits.size >= MAX_TRACKED_IPS) hits.clear();
    hits.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}
