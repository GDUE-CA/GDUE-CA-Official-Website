/**
 * 浏览器设备指纹（登录防爆破附加维度）
 *
 * 设计约束（规范要求）：
 * - 前端 canvas + 字体 + 屏幕 + UA 生成，localStorage 缓存
 * - 登录请求 header X-Browser-Fingerprint 携带
 * - 仅提高攻击成本，客户端可伪造；后端不信任指纹，只做附加维度
 *
 * 指纹格式：{hash}:{nonce}，hash 为 SHA-256 前 16 字符十六进制
 */
const STORAGE_KEY = "gdueca_fp";
const HEADER_NAME = "X-Browser-Fingerprint";

/** 收集浏览器特征并计算 SHA-256 指纹 */
async function computeFingerprint(): Promise<string> {
  const features: string[] = [];

  // UA + 语言
  features.push(navigator.userAgent);
  features.push(navigator.language);
  features.push((navigator.languages ?? []).join(","));

  // 屏幕参数
  features.push(`${screen.width}x${screen.height}`);
  features.push(`${screen.colorDepth}`);
  features.push(`${screen.availWidth}x${screen.availHeight}`);
  features.push(`${devicePixelRatio}`);

  // 时区
  features.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
  features.push(String(Date.prototype.getTimezoneOffset?.() ?? ""));

  // canvas 指纹：画一段文本取 toDataURL 的哈希（不同设备渲染微差）
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 100, 30);
      ctx.fillStyle = "#069";
      ctx.fillText("GDUE-CA-FP-Canvas-\u4e2d\u6587", 4, 4);
      features.push(canvas.toDataURL());
    }
  } catch {
    // canvas 不可用（隐私模式），跳过
  }

  // 字体探测：探测一组常见字体的可用性差异
  try {
    const testFonts = [
      "Arial", "Courier New", "Georgia", "Times New Roman",
      "Microsoft YaHei", "SimSun", "PingFang SC", "Hiragino Sans",
    ];
    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.fontSize = "16px";
    probe.style.fontFamily = "monospace";
    probe.textContent = "mmmmmmmmmmlli";
    document.body.appendChild(probe);
    const baseW = probe.offsetWidth;
    const baseH = probe.offsetHeight;
    const fontSig: string[] = [];
    for (const f of testFonts) {
      probe.style.fontFamily = `'${f}', monospace`;
      if (probe.offsetWidth !== baseW || probe.offsetHeight !== baseH) {
        fontSig.push(f);
      }
    }
    document.body.removeChild(probe);
    features.push(fontSig.join(","));
  } catch {
    // 忽略
  }

  // WebGL renderer（如可用）
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    if (gl && gl instanceof WebGLRenderingContext) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        features.push(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
        features.push(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      }
    }
  } catch {
    // 忽略
  }

  const raw = features.join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hash = Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const nonce = crypto.randomUUID().slice(0, 8);
  return `${hash}:${nonce}`;
}

let cached: string | null = null;

/** 获取浏览器指纹（localStorage 缓存，SSR 安全） */
export async function getFingerprint(forceRefresh = false): Promise<string> {
  if (typeof window === "undefined") return "ssr:00000000";
  if (cached && !forceRefresh) return cached;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && !forceRefresh) {
      cached = stored;
      return stored;
    }
  } catch {
    // localStorage 不可用
  }
  const fp = await computeFingerprint();
  cached = fp;
  try {
    window.localStorage.setItem(STORAGE_KEY, fp);
  } catch {
    // 忽略
  }
  return fp;
}

/** 获取指纹的 header 名称 */
export const FINGERPRINT_HEADER = HEADER_NAME;
