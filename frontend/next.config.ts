import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

/**
 * Next.js 配置文件
 * - Turbopack 构建工具（Next.js 16 默认启用）
 * - 图片优化配置
 * - 安全响应头（CSP 由 proxy.ts 按请求生成 nonce 后下发）
 * - /api、/uploads 同源反代到 FastAPI 后端
 * - i18n：启动时扫描 i18n/messages/*.json，自动生成语言列表与 rewrites 正则
 *   （规范 §3-2：前端自动扫描 message 目录，禁止硬编码语言列表）
 */

/** 后端地址（仅服务端使用，不暴露给浏览器） */
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

/** i18n 语言文件目录（单一真值源：新增/删除语言只需增删该目录下的 *.json） */
const MESSAGES_DIR = path.join(__dirname, "i18n", "messages");
const GENERATED_I18N_PATH = path.join(__dirname, "lib", "i18n", "locales.generated.ts");

/** 扫描 messages 目录生成 locale 列表：zh-cn 固定置顶，其余按字典序 */
function scanLocales(): string[] {
  const ids = fs
    .readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  const rest = ids.filter((l) => l !== "zh-cn").sort((a, b) => (a < b ? -1 : 1));
  return ["zh-cn", ...rest];
}

const SCANNED_LOCALES = scanLocales();

/** 由扫描结果生成 lib/i18n/locales.generated.ts（仅内容变化时写入，避免 watch 重建循环） */
function writeGeneratedLocalesModule(localeIds: string[]): void {
  const list = localeIds.map((l) => `  ${JSON.stringify(l)},`).join("\n");
  const loaders = localeIds
    .map(
      (l) =>
        `  ${JSON.stringify(l)}: () => import("@/i18n/messages/${l}.json").then((m) => m.default),`
    )
    .join("\n");
  const content = `/**
 * AUTO-GENERATED FILE — 请勿手改
 * 由 next.config.ts 扫描 i18n/messages/*.json 自动生成；
 * 新增/删除语言文件后重启 dev（或重新 build）自动更新。
 */
export const locales = [
${list}
] as const;

export type Locale = (typeof locales)[number];

/** 字典动态加载器（键与 locales 一一对应；打包器需要字面量 import 路径） */
export const dictionaryLoaders = {
${loaders}
} as const;
`;
  try {
    if (
      fs.existsSync(GENERATED_I18N_PATH) &&
      fs.readFileSync(GENERATED_I18N_PATH, "utf8") === content
    )
      return;
    fs.writeFileSync(GENERATED_I18N_PATH, content, "utf8");
  } catch {
    /* 只读文件系统（部分部署环境）忽略写入失败：构建期已生成过即可 */
  }
}

writeGeneratedLocalesModule(SCANNED_LOCALES);

/**
 * 合法 locale 正则片段（rewrites / redirects 共用，来自上方目录扫描，禁止手改）。
 * 长码在前（zh-yue-cn 先于 zh-cn），避免交替分支前缀抢占。
 */
const LANG = [...SCANNED_LOCALES]
  .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
  .join("|");

const nextConfig: NextConfig = {
  // 不暴露 X-Powered-By: Next.js（减少指纹信息）
  poweredByHeader: false,

  // Docker 镜像构建时输出精简的独立服务端（node server.js）；本地 pnpm start 不受影响
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,

  // dev 服务器跨源白名单（仅 development 生效）：
  // Next 16 默认只允许 localhost 访问 HMR websocket 与跨源资源，
  // 用回环 IP / 局域网 IP / 域名访问时客户端运行时会被阻塞 → 页面停留在 SSR 初始态（白屏无文字）。
  // 本机网卡 IP 变动时无需改代码：用 DEV_ALLOWED_ORIGINS 环境变量追加（逗号分隔）。
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "10.0.146.41", // 本机局域网（以太网）
    "100.67.253.101", // 本机 Tailscale 虚拟网卡
    "gdue-ca.paperee.guru",
    "*.paperee.guru",
    ...(process.env.DEV_ALLOWED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []),
  ],

  // 浏览器统一请求同源 /api/*，由 Next.js 转发到后端：
  // 登录 Cookie 为第一方 Cookie（SameSite=Strict 生效），无需开放 CORS
  //
  // 多语言路由（i18n URL 规范 §1）：所有浏览器 URL 必须带 /{locale}/ 前缀，
  // 但页面源文件仍按业务域组织在 app/admin、app/auth、app/setting（不在 [locale] 下）。
  // 这里用 rewrite 把带 locale 前缀的 URL 内部映射到实际页面路由，浏览器 URL 保持带前缀。
  // :lang 仅匹配白名单内的合法 locale，非法 locale 不被 rewrite、由 proxy 接管做防护重定向。
  async rewrites() {
    return [
      // 后台多语言路由：/zh-cn/admin/** → 内部渲染 /admin/**
      { source: `/:lang(${LANG})/admin/:path*`, destination: "/admin/:path*" },
      // 用户端认证页多语言路由：/zh-cn/auth/** → /auth/**
      { source: `/:lang(${LANG})/auth/:path*`, destination: "/auth/:path*" },
      // /setting 个人设置页多语言路由
      { source: `/:lang(${LANG})/setting/:path*`, destination: "/setting/:path*" },
      // 统一登录入口多语言路由：/zh-cn/login → /login
      { source: `/:lang(${LANG})/login`, destination: "/login" },
      // 忘记密码页多语言路由：/zh-cn/forgot-password → /forgot-password
      { source: `/:lang(${LANG})/forgot-password`, destination: "/forgot-password" },
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/uploads/:path*", destination: `${BACKEND_URL}/uploads/:path*` },
    ];
  },

  // 旧审核页书签兜底：三类审核已合并至统一审核中心 /{locale}/admin/review?tab=
  // 旧登录页书签兜底：两套登录页已合并为统一 /login
  // proxy 会先把裸路径补上 locale 前缀，再匹配以下带 :lang 的 source。
  async redirects() {
    return [
      { source: `/:lang(${LANG})/admin/registrations`, destination: "/:lang/admin/review?tab=registrations", permanent: false },
      { source: `/:lang(${LANG})/admin/bugs`, destination: "/:lang/admin/review?tab=bugs", permanent: false },
      { source: `/:lang(${LANG})/admin/password-resets`, destination: "/:lang/admin/review?tab=resets", permanent: false },
      // 旧 /admin/login、/auth/login → 统一 /login（permanent=false 临时重定向，便于后续清理）
      { source: `/:lang(${LANG})/admin/login`, destination: "/:lang/login", permanent: false },
      { source: `/:lang(${LANG})/auth/login`, destination: "/:lang/login", permanent: false },
    ];
  },

  // 图片优化配置
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "trae-api-cn.mchost.guru",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
    // 允许的图片质量
    qualities: [50, 75, 100],
  },

  // 自定义响应头：安全头
  // 注意：Alt-Svc (HTTP/3) 头不应由 Next.js 应用设置，
  // 应由前端 CDN/Nginx/Caddy 反向代理层在 443 端口上添加。
  // 在 Next.js 层设置 h3=":443" 会导致非 443 端口环境下的远程设备
  // 浏览器尝试通过 443 端口 HTTP/3 加载资源→失败→页面空白。
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // 安全头
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // 禁止被任何页面嵌入（防点击劫持），与 CSP frame-ancestors 'none' 一致
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), payment=(), usb=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },

  // Turbopack 配置（顶层，Next.js 16 不再需要 experimental）
  turbopack: {
    // 根目录别名已在 tsconfig.json 中配置
  },
};

export default nextConfig;
