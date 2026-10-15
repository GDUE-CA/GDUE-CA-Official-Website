/**
 * gen-icons.mjs —— 图标矢量化生成脚本（阶段 3-5，方案 A：@svgr/webpack + turbopack.rules）
 *
 * 职责：
 * 1. 扫描 frontend/ 下全部 .ts/.tsx（排除 node_modules/.next），提取所有 `from "lucide-react"`
 *    的具名导入（含 `X as Y` 别名与 `type X` 类型导入）；
 * 2. 从 node_modules/lucide-react 包内源文件机械提取图标几何（iconNode 数组），
 *    按规范 2.4 硬性标准生成 `.svg`（d 与 lucide 原版逐字一致，stroke=currentColor，
 *    viewBox 0 0 24 24，kebab-case 命名），落盘 assets/icons/<category>/；
 * 3. 输出 manifest（scripts/icons-manifest.json：导出名 → 分类/文件名），供导入替换脚本消费。
 *
 * 用法：
 *   node scripts/gen-icons.mjs            # 扫描 + 生成 SVG + 输出 manifest
 *   node scripts/gen-icons.mjs --dry      # 仅打印清点结果，不写文件
 *
 * 注意：lucide 的 deprecated 导出名（如 Loader2 / MoreHorizontal / AlertTriangle）由
 * 包内 aliases 映射到新几何文件，几何与旧版完全一致（lucide 官方保证），本脚本
 * 解析包主入口建立「导出名 → 源文件」映射，保证 d 一字不差。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(scriptDir, "..");
const LUCIDE = join(frontendRoot, "node_modules", "lucide-react", "dist", "esm");
const OUT_DIR = join(frontendRoot, "assets", "icons");
const DRY = process.argv.includes("--dry");

/* ---------------- 分类表（docs/icon-vectorization-exec.md 2.2 清单，kebab 名） ---------------- */
const CATEGORY_TABLE = {
  navigation: [
    "menu", "chevron-down", "chevron-up", "chevron-left", "chevron-right",
    "arrow-left", "arrow-right", "arrow-up", "arrow-down", "arrow-up-right",
    "more-horizontal", "home", "external-link", "link-2", "log-in", "log-out",
    "layout-dashboard", "layout-grid", "settings", "folder-open", "folder-kanban",
    "history", "globe",
    // 清点补充（文档 2.2 台账外新增，语义就近归入）
    "languages",
  ],
  action: [
    "search", "plus", "x", "trash-2", "pencil", "refresh-cw", "rotate-ccw",
    "download", "upload", "copy", "send", "save", "share-2", "check", "check-check",
    "square", "square-check", "reply", "file-edit", "pen-line", "image-plus",
    "paperclip", "power", "power-off", "archive", "archive-restore", "wand-2",
    "hammer", "wrench", "calculator", "qr-code", "sliders-horizontal", "type",
    "clipboard-list",
  ],
  status: [
    "loader-2", "check-circle-2", "x-circle", "alert-triangle", "info",
    "shield-alert", "shield-check", "shield-ban", "shield", "badge-check", "ban",
    "circle", "star", "bookmark", "heart", "heart-pulse", "sun", "moon", "palette",
    "sparkles", "bell", "bell-ring", "message-circle", "message-square", "bug",
    "timer", "clock", "lock", "lock-keyhole", "key-round", "eye", "eye-off",
    "fingerprint", "id-card", "mail", "mail-question", "mail-warning", "mail-plus",
    "cookie", "life-buoy", "ticket", "tag", "tags", "database", "hard-drive",
    "monitor", "monitor-smartphone", "laptop", "smartphone", "map-pin",
    "bar-chart-3", "calendar", "calendar-days", "calendar-check", "file-text",
    "newspaper", "scroll-text", "megaphone", "graduation-cap", "building-2",
    "briefcase", "wallet", "image", "image-icon",
    // 清点补充（文档 2.2 台账外新增，语义就近归入）
    "handshake", "hash", "phone",
  ],
  user: [
    "user", "users", "user-circle", "user-round", "users-round", "user-plus",
    "user-cog", "user-x", "user-pen",
  ],
  brand: ["github", "apple", "chrome"],
};
/** kebab 名 → 分类 */
const kebabToCat = {};
for (const [cat, names] of Object.entries(CATEGORY_TABLE)) {
  for (const n of names) kebabToCat[n] = cat;
}

/* ---------------- 工具函数 ---------------- */

/** PascalCase 导出名 → kebab-case（Trash2 → trash-2；CheckCircle2 → check-circle-2；ImageIcon → image-icon） */
function toKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])(\d)/g, "$1-$2")
    .toLowerCase();
}

/** iconNode 属性 key（camelCase）→ SVG 属性（kebab-case）；纯小写（d/x1/cx…）不动 */
function attrName(k) {
  return /[A-Z]/.test(k) ? k.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`) : k;
}

/** 遍历目录收集 .ts/.tsx 文件（排除 node_modules / .next / scripts / assets） */
function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(p, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !p.includes(`${join("scripts")}${join("")}`)) {
      out.push(p);
    }
  }
  return out;
}

/** 提取 lucide 导入：返回 Set<导出名>（含 `X as Y` 的 X）与 Set<type local 名>。
 * 注意不能用 local 名做去重 key——不同文件 local 名可能冲突导致导出名丢失。 */
function extractLucideImports(files) {
  const exportNames = new Set();
  const typeImports = new Set();
  const re = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']lucide-react["']/g;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    let m;
    while ((m = re.exec(src)) !== null) {
      const isTypeStmt = Boolean(m[1]);
      for (let spec of m[2].split(",")) {
        spec = spec.trim();
        if (!spec) continue;
        if (spec.startsWith("type ")) {
          typeImports.add(spec.slice(5).trim());
          continue;
        }
        if (isTypeStmt) {
          typeImports.add(spec.split(/\s+as\s+/)[0].trim());
          continue;
        }
        exportNames.add(spec.split(/\s+as\s+/)[0].trim());
      }
    }
  }
  return { exportNames, typeImports };
}

/** 建立 lucide 导出名 → 源 icon 文件名映射。
 * 主入口一行含多个 `default as X`（别名 + deprecated 旧名指向同一几何文件）。 */
function buildExportToFileMap() {
  const map = new Map(); // 导出名 → icons 文件名（不含扩展名）
  const mainSrc = readFileSync(join(LUCIDE, "lucide-react.js"), "utf8");
  const reStmt = /export\s*\{([^}]*)\}\s*from\s*["']\.\/icons\/([\w-]+)\.js["']/g;
  let stmt;
  while ((stmt = reStmt.exec(mainSrc)) !== null) {
    const file = stmt[2];
    for (const spec of stmt[1].split(",")) {
      const m = spec.trim().match(/^default\s+as\s+(\w+)$/);
      if (m && !map.has(m[1])) map.set(m[1], file);
    }
  }
  return map;
}

/** 解析 lucide icon 源文件：别名转发文件（export { default } from './x.js'）递归跟进，
 * 直到拿到含 iconNode 的真实几何文件源码 */
function resolveIconSource(srcFile) {
  let file = srcFile;
  for (let i = 0; i < 5; i++) {
    const src = readFileSync(join(LUCIDE, "icons", `${file}.js`), "utf8");
    if (/createLucideIcon\(/.test(src)) return src;
    const fwd = src.match(/export\s*\{\s*default\s*\}\s*from\s*["']\.\/([\w-]+)\.js["']/);
    if (!fwd) throw new Error("既无 iconNode 也非转发文件");
    file = fwd[1];
  }
  throw new Error("转发链过深");
}

/** 从 lucide 源 icon 文件提取 iconNode 数组并求值 */
function parseIconNode(src) {
  const m = src.match(/createLucideIcon\(\s*["'][^"']+["']\s*,\s*(\[[\s\S]*\])\s*\)\s*[;)]?/);
  if (!m) throw new Error("未找到 iconNode 数组");
  return new Function(`"use strict"; return (${m[1]});`)();
}

/** iconNode → SVG 内部元素串 */
function renderChildren(nodes) {
  return nodes
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${attrName(k)}="${v}"`)
        .join(" ");
      return `  <${tag}${attrStr ? " " + attrStr : ""} />`;
    })
    .join("\n");
}

/** 按规范 2.4 硬性标准生成完整 SVG 文本（几何逐字复刻 lucide 默认） */
function renderSvg(nodes) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${renderChildren(nodes)}
</svg>
`;
}

/* ---------------- 主流程 ---------------- */

const files = collectFiles(frontendRoot);
const { exportNames: valueExports, typeImports } = extractLucideImports(files);
const exportNames = [...valueExports].sort();
const typeNames = [...typeImports].sort();

console.log(`扫描文件数: ${files.length}`);
console.log(`lucide 值导入（去重导出名）: ${exportNames.length}`);
console.log(`lucide 类型导入: ${typeNames.join(", ") || "（无）"}`);

const exportToFile = buildExportToFileMap();
console.log(`lucide 包导出映射条目: ${exportToFile.size}`);

const manifest = {}; // 导出名 → { cat, file }
const missing = []; // 包内找不到源文件的导出名
const unknownCat = []; // 分类表未收录
const generated = [];
const skipped = [];

for (const exportName of exportNames) {
  const kebab = toKebab(exportName);
  const srcFile = exportToFile.get(exportName) ?? toKebab(exportName); // fallback：Pascal→kebab 直接匹配文件名
  const cat = kebabToCat[kebab];
  if (!cat) unknownCat.push(exportName);
  const targetCat = cat ?? "status"; // 未收录先归 status，dry-run 报告后人工修正
  const outPath = join(OUT_DIR, targetCat, `${kebab}.svg`);

  let nodes;
  try {
    const iconSrc = resolveIconSource(srcFile);
    nodes = parseIconNode(iconSrc);
  } catch (e) {
    missing.push(`${exportName}（源文件 ${srcFile}.js：${e.message}）`);
    continue;
  }

  manifest[exportName] = { cat: targetCat, file: kebab };
  if (DRY) continue;

  mkdirSync(join(OUT_DIR, targetCat), { recursive: true });
  const svg = renderSvg(nodes);
  if (existsSync(outPath) && readFileSync(outPath, "utf8") === svg) {
    skipped.push(`${targetCat}/${kebab}.svg`);
  } else {
    writeFileSync(outPath, svg, "utf8");
    generated.push(`${targetCat}/${kebab}.svg`);
  }
}

console.log(`\n分类表未收录（暂归 status，请修正分类表后重跑）: ${unknownCat.length}`);
for (const n of unknownCat) console.log(`  ? ${n} → ${toKebab(n)}`);
console.log(`包内未找到源文件: ${missing.length}`);
for (const n of missing) console.log(`  ! ${n}`);
if (!DRY) {
  console.log(`\n生成: ${generated.length}，内容未变跳过: ${skipped.length}`);
  writeFileSync(
    join(scriptDir, "icons-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
  console.log(`manifest → scripts/icons-manifest.json`);
}
