import type { PowChallenge } from "./pow";
import { TURNSTILE_ACTION } from "./turnstile";

/**
 * 访问检测页（检测中 / 人机验证 / 拒绝访问 三态）
 *
 * 由 proxy.ts 直接返回的独立 HTML（不经 React 渲染）：不依赖站点脚本包、在原 URL 原地展示，
 * 通过后刷新即进入原页面。风控接口由访客浏览器直接请求（接口按来源 IP 自行判定），
 * 视觉沿用站点「克制科技风」：中性灰 + 信号绿、细边框、等宽辅助信息。
 */

export const VERIFY_PATH = "/__risk/verify";

/** 页面文案语言：站点 locale 较多，检测页只提供四种文案，其余按语系归并 */
type PageLang = "zh-CN" | "zh-TW" | "en" | "ja";

export function pageLang(locale: string): PageLang {
  const l = locale.toLowerCase();
  if (l.startsWith("zh")) return /hk|mo|tw|hant/.test(l) ? "zh-TW" : "zh-CN";
  if (l.startsWith("ja")) return "ja";
  return "en";
}

interface Copy {
  htmlLang: string;
  tsLang: string;
  brandSub: string;
  status: string;
  checkTitle: string;
  checkLead: string;
  checking: string;
  computing: string;
  success: string;
  challengeTitle: string;
  leadRisky: string;
  leadFailed: string;
  loading: string;
  verifying: string;
  failed: string;
  widgetError: string;
  noscript: string;
  blockedStatus: string;
  blockedTitle: string;
  blockedLead: string;
  stepsTitle: string;
  step1: string;
  step2: string;
  contactEmail: string;
  contactAddr: string;
  contactLink: string;
  contactFallback: string;
  copy: string;
  copied: string;
  retry: string;
  ip: string;
  requestId: string;
  reason: string;
  time: string;
  idc: string;
  proxy: string;
  risky: string;
  checkFailed: string;
  foot: (hours: number) => string;
  footTurnstile: string;
  footBlocked: string;
  mailSubject: string;
}

const COPY: Record<PageLang, Copy> = {
  "zh-CN": {
    htmlLang: "zh-CN",
    tsLang: "zh-cn",
    brandSub: "安全检查",
    status: "安全检查",
    checkTitle: "正在检查访问环境",
    checkLead: "为保护站点与成员数据，首次访问需要确认网络环境，通常一两秒即可完成，无需任何操作。",
    checking: "正在检测网络环境…",
    computing: "正在完成安全校验…",
    success: "检测通过，正在进入页面…",
    challengeTitle: "请确认你是真人访客",
    leadRisky: "你当前的网络环境被识别为存在风险（如数据中心、代理或 VPN 出口）。完成下方验证后即可继续访问。",
    leadFailed: "暂时无法完成网络环境检测（可能是网络波动或浏览器拦截了检测请求）。完成下方验证后即可继续访问。",
    loading: "正在加载验证组件…",
    verifying: "验证通过，正在确认…",
    failed: "确认失败，请重试。",
    widgetError: "验证组件加载失败，请检查网络后刷新页面。",
    noscript: "访问本站需要启用 JavaScript，请开启后刷新页面。",
    blockedStatus: "访问被拒绝",
    blockedTitle: "当前网络无法访问本站",
    blockedLead: "你的 IP 同时被识别为数据中心地址与代理出口。为保护站点与成员数据安全，此类连接已被拦截。",
    stepsTitle: "如何恢复访问",
    step1: "关闭 VPN、代理或网络加速器，切换到常用网络（如校园网、家庭宽带、手机流量）后刷新页面。",
    step2: "如必须使用当前网络，请联系管理员，并附上下方诊断信息，申请将该 IP 加入白名单。",
    contactEmail: "发邮件给管理员",
    contactAddr: "管理员邮箱",
    contactLink: "其他联系方式",
    contactFallback: "请通过协会群聊或负责人联系网站管理员。",
    copy: "复制诊断信息",
    copied: "已复制",
    retry: "重新检测",
    ip: "IP 地址",
    requestId: "请求编号",
    reason: "识别结果",
    time: "时间",
    idc: "数据中心",
    proxy: "代理 / VPN",
    risky: "风险名单",
    checkFailed: "检测失败",
    foot: (h) => `通过后 ${h} 小时内免检`,
    footTurnstile: "由 Cloudflare Turnstile 提供验证",
    footBlocked: "HTTP 403 · 广东第二师范学院计算机协会",
    mailSubject: "官网访问被拦截，申请放行",
  },
  "zh-TW": {
    htmlLang: "zh-TW",
    tsLang: "zh-tw",
    brandSub: "安全檢查",
    status: "安全檢查",
    checkTitle: "正在檢查存取環境",
    checkLead: "為保護網站與成員資料，首次造訪需要確認網路環境，通常一兩秒即可完成，無需任何操作。",
    checking: "正在檢測網路環境…",
    computing: "正在完成安全校驗…",
    success: "檢測通過，正在進入頁面…",
    challengeTitle: "請確認你是真人訪客",
    leadRisky: "你目前的網路環境被識別為存在風險（如資料中心、代理或 VPN 出口）。完成下方驗證後即可繼續瀏覽。",
    leadFailed: "暫時無法完成網路環境檢測（可能是網路波動或瀏覽器攔截了檢測請求）。完成下方驗證後即可繼續瀏覽。",
    loading: "正在載入驗證元件…",
    verifying: "驗證通過，正在確認…",
    failed: "確認失敗，請重試。",
    widgetError: "驗證元件載入失敗，請檢查網路後重新整理頁面。",
    noscript: "瀏覽本站需要啟用 JavaScript，請開啟後重新整理頁面。",
    blockedStatus: "拒絕存取",
    blockedTitle: "目前網路無法存取本站",
    blockedLead: "你的 IP 同時被識別為資料中心位址與代理出口。為保護網站與成員資料安全，此類連線已被攔截。",
    stepsTitle: "如何恢復存取",
    step1: "關閉 VPN、代理或網路加速器，切換到常用網路（如校園網、家用寬頻、行動網路）後重新整理頁面。",
    step2: "如必須使用目前網路，請聯絡管理員並附上下方診斷資訊，申請將此 IP 加入白名單。",
    contactEmail: "寄信給管理員",
    contactAddr: "管理員信箱",
    contactLink: "其他聯絡方式",
    contactFallback: "請透過協會群組或負責人聯絡網站管理員。",
    copy: "複製診斷資訊",
    copied: "已複製",
    retry: "重新檢測",
    ip: "IP 位址",
    requestId: "請求編號",
    reason: "識別結果",
    time: "時間",
    idc: "資料中心",
    proxy: "代理 / VPN",
    risky: "風險名單",
    checkFailed: "檢測失敗",
    foot: (h) => `通過後 ${h} 小時內免檢`,
    footTurnstile: "由 Cloudflare Turnstile 提供驗證",
    footBlocked: "HTTP 403 · 廣東第二師範學院電腦協會",
    mailSubject: "官網存取被攔截，申請放行",
  },
  en: {
    htmlLang: "en",
    tsLang: "en",
    brandSub: "Security check",
    status: "Security check",
    checkTitle: "Checking your connection",
    checkLead: "To protect the site and member data, first visits need a quick network check. It takes a second or two — no action needed.",
    checking: "Checking your network…",
    computing: "Finishing security check…",
    success: "All clear, taking you in…",
    challengeTitle: "Confirm you're human",
    leadRisky: "Your connection looks risky (e.g. a data center, proxy or VPN exit). Complete the check below to continue.",
    leadFailed: "We couldn't complete the network check (a network hiccup, or your browser blocked the request). Complete the check below to continue.",
    loading: "Loading verification…",
    verifying: "Passed, confirming…",
    failed: "Confirmation failed. Please try again.",
    widgetError: "The verification widget failed to load. Check your network and reload.",
    noscript: "This site requires JavaScript. Enable it and reload the page.",
    blockedStatus: "Access denied",
    blockedTitle: "This network can't reach the site",
    blockedLead: "Your IP is identified as both a data center address and a proxy exit. Connections like this are blocked to protect the site and member data.",
    stepsTitle: "How to regain access",
    step1: "Turn off any VPN, proxy or network accelerator, switch to a regular network (campus, home broadband, mobile data) and reload.",
    step2: "If you must use this network, contact the administrator with the diagnostics below and ask for this IP to be allowlisted.",
    contactEmail: "Email the administrator",
    contactAddr: "Admin email",
    contactLink: "Other contact options",
    contactFallback: "Please reach the site administrator through the association's group chat or officers.",
    copy: "Copy diagnostics",
    copied: "Copied",
    retry: "Check again",
    ip: "IP address",
    requestId: "Request ID",
    reason: "Detected as",
    time: "Time",
    idc: "Data center",
    proxy: "Proxy / VPN",
    risky: "Risk list",
    checkFailed: "Check failed",
    foot: (h) => `No re-check for ${h} hours after passing`,
    footTurnstile: "Verification by Cloudflare Turnstile",
    footBlocked: "HTTP 403 · GDUE Computer Association",
    mailSubject: "Website access blocked - allowlist request",
  },
  ja: {
    htmlLang: "ja",
    tsLang: "ja",
    brandSub: "セキュリティチェック",
    status: "セキュリティチェック",
    checkTitle: "接続環境を確認しています",
    checkLead: "サイトとメンバーのデータを守るため、初回アクセス時にネットワーク環境を確認します。通常 1〜2 秒で完了し、操作は不要です。",
    checking: "ネットワーク環境を確認中…",
    computing: "セキュリティチェックを完了しています…",
    success: "確認できました。ページへ移動します…",
    challengeTitle: "人間であることを確認してください",
    leadRisky: "現在の接続はリスクがあると判定されました（データセンター、プロキシ、VPN など）。下の認証を完了すると閲覧を続けられます。",
    leadFailed: "ネットワーク環境を確認できませんでした（通信の不調、またはブラウザが確認リクエストをブロックした可能性があります）。下の認証を完了すると閲覧を続けられます。",
    loading: "認証コンポーネントを読み込み中…",
    verifying: "認証済み、確認しています…",
    failed: "確認に失敗しました。もう一度お試しください。",
    widgetError: "認証コンポーネントを読み込めませんでした。ネットワークを確認して再読み込みしてください。",
    noscript: "このサイトの閲覧には JavaScript が必要です。有効にしてから再読み込みしてください。",
    blockedStatus: "アクセス拒否",
    blockedTitle: "現在のネットワークからはアクセスできません",
    blockedLead: "お使いの IP はデータセンターかつプロキシの出口として判定されました。サイトとメンバーのデータを守るため、この接続はブロックされています。",
    stepsTitle: "アクセスを回復するには",
    step1: "VPN・プロキシ・ネットワーク高速化ツールをオフにし、普段のネットワーク（学内・自宅回線・モバイル通信）に切り替えて再読み込みしてください。",
    step2: "このネットワークを使う必要がある場合は、下の診断情報を添えて管理者に連絡し、IP の許可を依頼してください。",
    contactEmail: "管理者にメール",
    contactAddr: "管理者メール",
    contactLink: "その他の連絡先",
    contactFallback: "協会のグループチャットまたは担当者を通じてサイト管理者に連絡してください。",
    copy: "診断情報をコピー",
    copied: "コピーしました",
    retry: "再チェック",
    ip: "IP アドレス",
    requestId: "リクエスト ID",
    reason: "判定結果",
    time: "時刻",
    idc: "データセンター",
    proxy: "プロキシ / VPN",
    risky: "リスクリスト",
    checkFailed: "確認失敗",
    foot: (h) => `通過後 ${h} 時間は再チェック不要`,
    footTurnstile: "Cloudflare Turnstile による認証",
    footBlocked: "HTTP 403 · 広東第二師範学院コンピューター協会",
    mailSubject: "公式サイトへのアクセスがブロックされました（許可申請）",
  },
};

const STYLES = `
:root{--bg:#FAFAF9;--fg:#0F0F10;--card:#FFFFFF;--muted:#5C5C58;--soft:#F1F1EF;--border:#E5E5E2;--signal:#16A34A;--signal-text:#15803D;--danger:#C81E1E;--danger-soft:#FDECEC;--grid:rgba(15,15,16,.06);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#09090A;--fg:#EDEDEB;--card:#111113;--muted:#A1A19C;--soft:#1B1B1E;--border:#26262A;--signal:#4ADE80;--signal-text:#4ADE80;--danger:#F87171;--danger-soft:#2A1414;--grid:rgba(237,237,235,.05)}}
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none!important}
html,body{height:100%}
body{background:var(--bg);color:var(--fg);font:15px/1.6 "Instrument Sans",ui-sans-serif,system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;-webkit-font-smoothing:antialiased;display:flex;min-height:100vh;background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:22px 22px}
.mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
.shell{width:100%;max-width:520px;margin:auto;padding:40px 16px;display:flex;flex-direction:column;gap:20px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;letter-spacing:-.01em}
.mark{width:28px;height:28px;border-radius:8px;background:var(--fg);color:var(--bg);display:grid;place-items:center;font:700 11px/1 "JetBrains Mono",ui-monospace,monospace}
.brand .sub{color:var(--muted);font-weight:400}
.card{min-width:0;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px;display:flex;flex-direction:column;gap:18px;box-shadow:0 1px 2px rgba(0,0,0,.03),0 12px 32px -12px rgba(0,0,0,.08)}
.status{display:inline-flex;align-items:center;gap:8px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--signal);position:relative}
.dot::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:1px solid var(--signal);opacity:0;animation:ping 1.8s ease-out infinite}
.blocked .dot{background:var(--danger)}.blocked .dot::after{display:none}
@keyframes ping{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.6);opacity:0}}
h1{font-size:24px;line-height:1.3;letter-spacing:-.02em;font-weight:600}
.lead{color:var(--muted)}
.widget{min-height:65px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--border);border-radius:12px;padding:10px;background:var(--soft)}
.state{min-height:1.6em;color:var(--muted);display:flex;align-items:center;gap:8px}
.state[data-tone=ok]{color:var(--signal-text)}.state[data-tone=err]{color:var(--danger)}
.meta{display:grid;gap:0;border-top:1px solid var(--border)}
.meta>div{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:10px 0;border-bottom:1px solid var(--border);min-width:0}
.meta dt{color:var(--muted);font-size:13px;flex-shrink:0}
.meta dd{text-align:right;min-width:0;overflow-wrap:anywhere}
.chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.chip{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);background:var(--soft)}
.blocked .chip{border-color:color-mix(in srgb,var(--danger) 35%,var(--border));background:var(--danger-soft);color:var(--danger)}
.steps{display:flex;flex-direction:column;gap:12px;counter-reset:s}
.steps h2{font-size:14px;font-weight:600}
.steps ol{list-style:none;display:flex;flex-direction:column;gap:10px}
.steps li{counter-increment:s;display:grid;grid-template-columns:24px 1fr;gap:10px;color:var(--muted)}
.steps li::before{content:counter(s);width:22px;height:22px;border-radius:6px;border:1px solid var(--border);display:grid;place-items:center;font:600 11px/1 "JetBrains Mono",ui-monospace,monospace;color:var(--fg);margin-top:1px}
.actions{display:flex;flex-wrap:wrap;gap:10px}
.btn{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:10px;font-family:inherit;font-size:14px;font-weight:500;line-height:1;text-decoration:none;border:1px solid var(--border);background:var(--card);color:var(--fg);transition:background .15s,border-color .15s}
.btn:hover{background:var(--soft)}
.btn.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.btn.primary:hover{opacity:.9}
.btn:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
.note{color:var(--muted);font-size:14px;overflow-wrap:anywhere}
.note a{color:var(--fg);text-underline-offset:3px}
.foot{color:var(--muted);text-align:center}
.spin{width:14px;height:14px;border-radius:50%;border:2px solid var(--border);border-top-color:currentColor;animation:r .7s linear infinite}
@keyframes r{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dot::after,.spin{animation:none}}
@media (max-width:480px){.card{padding:22px 18px}h1{font-size:21px}}
.view{display:flex;flex-direction:column;gap:18px}
.bar{height:2px;border-radius:2px;background:var(--border);overflow:hidden;position:relative}
.bar span{position:absolute;inset:0 auto 0 0;width:35%;background:var(--signal);border-radius:2px;animation:slide 1.2s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
@media (prefers-reduced-motion:reduce){.bar span{animation:none;width:100%}}
`;

export interface GatePageInput {
  /** 站点 locale（如 zh-cn / ja-jp），经 pageLang 选择文案 */
  locale: string;
  nonce: string;
  requestId: string;
  /** 服务端看到的访客 IP；风控接口返回 IP 前先用它展示 */
  ip: string;
  apiUrl: string;
  apiTimeoutMs: number;
  /** 空字符串表示未配置 Turnstile，风险访客改用工作量证明 */
  turnstileSiteKey: string;
  pow: PowChallenge;
  passHours: number;
  contactEmail: string;
  contactUrl: string;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 嵌入 <script> 的 JSON：转义 < 防止提前闭合标签 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * 浏览器端流程（ES5，兼容旧浏览器）：
 *   check()     请求风控接口（不带 Cookie），按结果分流
 *   runPow()    纯 JS SHA-256 求解工作量证明（HTTP 局域网访问时 crypto.subtle 不可用）
 *   challenge() 风险 / 检测失败：Turnstile，未配置则工作量证明
 *   blocked()   IDC + 代理：拒绝页，生成带诊断信息的 mailto
 */
const CLIENT_SCRIPT = `
var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
var W=new Array(64);
function sha256(s){var n=s.length,m=((n+8)>>6)+1,b=new Array(m*16),i,j;for(i=0;i<b.length;i++)b[i]=0;for(i=0;i<n;i++)b[i>>2]|=(s.charCodeAt(i)&255)<<(24-(i&3)*8);b[n>>2]|=0x80<<(24-(n&3)*8);b[m*16-1]=n*8;
var h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
for(i=0;i<b.length;i+=16){var a=h0,bb=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;for(j=0;j<64;j++){if(j<16)W[j]=b[i+j]|0;else{var x=W[j-15],y=W[j-2];W[j]=(((x>>>7|x<<25)^(x>>>18|x<<14)^(x>>>3))+W[j-16]+((y>>>17|y<<15)^(y>>>19|y<<13)^(y>>>10))+W[j-7])|0;}
var t1=(h+((e>>>6|e<<26)^(e>>>11|e<<21)^(e>>>25|e<<7))+((e&f)^(~e&g))+K[j]+W[j])|0,t2=(((a>>>2|a<<30)^(a>>>13|a<<19)^(a>>>22|a<<10))+((a&bb)^(a&c)^(bb&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=bb;bb=a;a=(t1+t2)|0;}
h0=(h0+a)|0;h1=(h1+bb)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;}
return [h0,h1,h2,h3,h4,h5,h6,h7];}
function lz(hw){var z=0;for(var k=0;k<8;k++){if(hw[k]===0){z+=32;continue;}return z+Math.clz32(hw[k]);}return z;}

var t=C.t,$=function(id){return document.getElementById(id);};
var ip=C.ip,verdict=null,checkFailed=false;
function view(name){["check","challenge","blocked"].forEach(function(v){$("v-"+v).hidden=v!==name;});
  $("card").className="card"+(name==="blocked"?" blocked":"");
  $("status").textContent=name==="blocked"?"403 · "+t.blockedStatus:t.status;
  $("meta").hidden=name==="check";$("blocked-extra").hidden=name!=="blocked";
  $("foot").textContent=name==="blocked"?t.footBlocked:t.foot+(name==="challenge"&&C.siteKey?" · "+t.footTurnstile:"");}
function state(el,msg,tone,busy){el.setAttribute("data-tone",tone||"");el.innerHTML="";if(busy){var s=document.createElement("span");s.className="spin";el.appendChild(s);}el.appendChild(document.createTextNode(msg));}
function reasons(){if(checkFailed)return [t.checkFailed];var r=[];if(verdict.isIdc)r.push(t.idc);if(verdict.isProxy)r.push(t.proxy);if(!r.length&&verdict.isRisky)r.push(t.risky);return r;}
function fillMeta(){$("m-ip").textContent=ip||"—";var box=$("m-reason");box.innerHTML="";reasons().forEach(function(x){var c=document.createElement("span");c.className="chip";c.textContent=x;box.appendChild(c);});
  $("m-time").textContent=new Date().toISOString().replace("T"," ").slice(0,19)+" UTC";}
function post(body){return fetch(C.verifyPath,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw new Error(String(r.status));});}
function enter(el){state(el,t.success,"ok",true);setTimeout(function(){location.replace(location.href);},300);}
function solve(){var salt=C.pow.salt+":",bits=C.pow.bits,n=0;return new Promise(function(resolve){(function step(){var end=n+5000;for(;n<end;n++){if(lz(sha256(salt+n))>=bits)return resolve(n);}setTimeout(step,0);})();});}
function runPow(el){state(el,t.computing,"",true);solve().then(function(n){return post({mode:"pow",challenge:C.pow,nonce:n});}).then(function(){enter(el);},function(){state(el,t.failed,"err");});}
function turnstile(){var el=$("s-challenge");$("widget").hidden=false;state(el,t.loading,"",true);
  window.onTurnstileLoad=function(){state(el,"","");window.turnstile.render("#ts",{sitekey:C.siteKey,action:C.action,language:C.tsLang,theme:"auto",
    callback:function(token){state(el,t.verifying,"",true);post({mode:"turnstile",token:token}).then(function(){enter(el);},function(){state(el,t.failed,"err");window.turnstile.reset("#ts");});},
    "error-callback":function(){state(el,t.widgetError,"err");},"expired-callback":function(){window.turnstile.reset("#ts");}});};
  var s=document.createElement("script");s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";s.async=true;s.nonce=C.nonce;
  s.onerror=function(){state(el,t.widgetError,"err");};document.head.appendChild(s);}
function challenge(){view("challenge");fillMeta();$("challenge-lead").textContent=checkFailed?t.leadFailed:t.leadRisky;if(C.siteKey)turnstile();else runPow($("s-challenge"));}
function blocked(){view("blocked");fillMeta();
  var diag=[t.ip+": "+(ip||"-"),t.requestId+": "+C.requestId,t.reason+": "+reasons().join(" + "),t.time+": "+$("m-time").textContent].join("\\n");
  var mail=$("mail");if(mail)mail.href="mailto:"+encodeURIComponent(C.contactEmail)+"?subject="+encodeURIComponent(t.mailSubject+" ("+(ip||"-")+")")+"&body="+encodeURIComponent(diag+"\\n\\n");
  $("copy").onclick=function(){var b=this,o=b.textContent;if(navigator.clipboard)navigator.clipboard.writeText(diag).then(function(){b.textContent=t.copied;setTimeout(function(){b.textContent=o;},1600);},function(){});};}
function check(){view("check");state($("s-check"),t.checking,"",true);
  var ctl=typeof AbortController==="function"?new AbortController():null,timer=setTimeout(function(){if(ctl)ctl.abort();},C.timeout);
  var opts={credentials:"omit",cache:"no-store",headers:{Accept:"application/json"}};if(ctl)opts.signal=ctl.signal;
  fetch(C.apiUrl,opts).then(function(r){if(!r.ok)throw new Error(String(r.status));return r.json();}).then(function(d){clearTimeout(timer);
    if(!d||typeof d.isRisky!=="boolean"||typeof d.isIdc!=="boolean"||typeof d.isProxy!=="boolean")throw new Error("format");
    verdict=d;if(typeof d.ip==="string"&&d.ip.length<=64)ip=d.ip;
    if(d.isIdc&&d.isProxy)blocked();else if(d.isRisky||d.isIdc||d.isProxy)challenge();else runPow($("s-check"));
  }).catch(function(){clearTimeout(timer);if(verdict)return;checkFailed=true;challenge();});}
check();
`;

export function renderGatePage(input: GatePageInput): string {
  const t = COPY[pageLang(input.locale)];
  const config = {
    apiUrl: input.apiUrl,
    timeout: input.apiTimeoutMs,
    siteKey: input.turnstileSiteKey,
    action: TURNSTILE_ACTION,
    tsLang: t.tsLang,
    pow: input.pow,
    verifyPath: VERIFY_PATH,
    nonce: input.nonce,
    requestId: input.requestId,
    ip: input.ip,
    contactEmail: input.contactEmail,
    t: {
      status: t.status,
      checking: t.checking,
      computing: t.computing,
      success: t.success,
      leadRisky: t.leadRisky,
      leadFailed: t.leadFailed,
      loading: t.loading,
      verifying: t.verifying,
      failed: t.failed,
      widgetError: t.widgetError,
      blockedStatus: t.blockedStatus,
      ip: t.ip,
      requestId: t.requestId,
      reason: t.reason,
      time: t.time,
      idc: t.idc,
      proxy: t.proxy,
      risky: t.risky,
      checkFailed: t.checkFailed,
      copied: t.copied,
      foot: t.foot(input.passHours),
      footTurnstile: t.footTurnstile,
      footBlocked: t.footBlocked,
      mailSubject: t.mailSubject,
    },
  };

  const hasContactUrl = /^https?:\/\//i.test(input.contactUrl);
  const actions = [
    input.contactEmail ? `<a class="btn primary" id="mail" href="#">${esc(t.contactEmail)}</a>` : "",
    hasContactUrl
      ? `<a class="btn" href="${esc(input.contactUrl)}" target="_blank" rel="noopener noreferrer">${esc(t.contactLink)}</a>`
      : "",
    `<button class="btn" type="button" id="copy">${esc(t.copy)}</button>`,
    `<a class="btn" href="">${esc(t.retry)}</a>`,
  ].join("");
  const contactLine = input.contactEmail
    ? `<p class="note">${esc(t.contactAddr)}: <a class="mono" href="mailto:${esc(input.contactEmail)}">${esc(input.contactEmail)}</a></p>`
    : hasContactUrl
      ? ""
      : `<p class="note">${esc(t.contactFallback)}</p>`;

  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(t.status)} · GDUECA</title>
<link rel="preconnect" href="${esc(new URL(input.apiUrl).origin)}">
<style>${STYLES}</style>
</head>
<body>
<main class="shell">
  <header class="brand"><span class="mark" aria-hidden="true">CA</span><span>GDUECA</span><span class="sub">/ ${esc(t.brandSub)}</span></header>
  <section class="card" id="card" aria-live="polite">
    <div class="status mono"><span class="dot" aria-hidden="true"></span><span id="status">${esc(t.status)}</span></div>
    <div class="view" id="v-check">
      <h1>${esc(t.checkTitle)}</h1>
      <p class="lead">${esc(t.checkLead)}</p>
      <div class="bar" aria-hidden="true"><span></span></div>
      <p class="state" id="s-check" role="status"><span class="spin" aria-hidden="true"></span>${esc(t.checking)}</p>
      <noscript><p class="note">${esc(t.noscript)}</p></noscript>
    </div>
    <div class="view" id="v-challenge" hidden>
      <h1>${esc(t.challengeTitle)}</h1>
      <p class="lead" id="challenge-lead"></p>
      <div class="widget" id="widget" hidden><div id="ts"></div></div>
      <p class="state" id="s-challenge" role="status"></p>
    </div>
    <div class="view" id="v-blocked" hidden>
      <h1>${esc(t.blockedTitle)}</h1>
      <p class="lead">${esc(t.blockedLead)}</p>
      <div class="steps">
        <h2>${esc(t.stepsTitle)}</h2>
        <ol><li>${esc(t.step1)}</li><li>${esc(t.step2)}</li></ol>
      </div>
    </div>
    <dl class="meta" id="meta" hidden>
      <div><dt>${esc(t.ip)}</dt><dd class="mono" id="m-ip"></dd></div>
      <div><dt>${esc(t.reason)}</dt><dd class="chips" id="m-reason"></dd></div>
      <div><dt>${esc(t.requestId)}</dt><dd class="mono">${esc(input.requestId)}</dd></div>
      <div><dt>${esc(t.time)}</dt><dd class="mono" id="m-time"></dd></div>
    </dl>
    <div class="view" id="blocked-extra" hidden>
      <div class="actions">${actions}</div>
      ${contactLine}
    </div>
  </section>
  <p class="foot mono" id="foot">${esc(t.foot(input.passHours))}</p>
</main>
<script nonce="${input.nonce}">(function(){var C=${jsonForScript(config)};${CLIENT_SCRIPT}})();</script>
</body>
</html>`;
}

/**
 * 检测页专用 CSP：仅放行风控接口（connect）与 Turnstile（脚本 / iframe）。
 * 不用 strict-dynamic：Turnstile 脚本靠主机白名单放行
 */
export function gateCsp(nonce: string, apiUrl: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",
    // Turnstile 会给挂载容器写 style 属性；同时出现 nonce 时 'unsafe-inline' 会被忽略，故此处不用 nonce
    "style-src 'unsafe-inline'",
    `connect-src 'self' ${new URL(apiUrl).origin}`,
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
