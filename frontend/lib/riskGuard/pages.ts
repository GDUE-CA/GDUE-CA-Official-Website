import type { RiskVerdict } from "./riskApi";
import { TURNSTILE_ACTION } from "./turnstile";

/**
 * 人机验证页 / 拒绝访问页
 *
 * 由 proxy.ts 直接返回的独立 HTML（不经 React 渲染）：不依赖站点脚本包、在原 URL 原地展示，
 * 验证通过后刷新即进入原页面。视觉沿用站点「克制科技风」：中性灰 + 信号绿、细边框、等宽辅助信息。
 */

export const VERIFY_PATH = "/__risk/verify";

/** 页面文案语言：站点 locale 较多，这两个页面只提供四种文案，其余按语系归并 */
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
  challengeStatus: string;
  challengeTitle: string;
  challengeLead: string;
  loading: string;
  verifying: string;
  success: string;
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
  footChallenge: (hours: number) => string;
  footBlocked: string;
  mailSubject: string;
}

const COPY: Record<PageLang, Copy> = {
  "zh-CN": {
    htmlLang: "zh-CN",
    tsLang: "zh-cn",
    brandSub: "安全检查",
    challengeStatus: "安全检查",
    challengeTitle: "请确认你是真人访客",
    challengeLead: "你当前的网络环境被识别为存在风险（如数据中心、代理或 VPN 出口）。完成下方验证后即可继续访问，通常只需一秒。",
    loading: "正在加载验证组件…",
    verifying: "验证通过，正在确认…",
    success: "验证成功，正在进入页面…",
    failed: "确认失败，请重新完成验证。",
    widgetError: "验证组件加载失败，请检查网络后刷新页面。",
    noscript: "验证需要启用 JavaScript，请开启后刷新页面。",
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
    footChallenge: (h) => `由 Cloudflare Turnstile 提供验证 · 通过后 ${h} 小时内免检`,
    footBlocked: "HTTP 403 · 广东第二师范学院计算机协会",
    mailSubject: "官网访问被拦截，申请放行",
  },
  "zh-TW": {
    htmlLang: "zh-TW",
    tsLang: "zh-tw",
    brandSub: "安全檢查",
    challengeStatus: "安全檢查",
    challengeTitle: "請確認你是真人訪客",
    challengeLead: "你目前的網路環境被識別為存在風險（如資料中心、代理或 VPN 出口）。完成下方驗證後即可繼續瀏覽，通常只需一秒。",
    loading: "正在載入驗證元件…",
    verifying: "驗證通過，正在確認…",
    success: "驗證成功，正在進入頁面…",
    failed: "確認失敗，請重新完成驗證。",
    widgetError: "驗證元件載入失敗，請檢查網路後重新整理頁面。",
    noscript: "驗證需要啟用 JavaScript，請開啟後重新整理頁面。",
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
    footChallenge: (h) => `由 Cloudflare Turnstile 提供驗證 · 通過後 ${h} 小時內免檢`,
    footBlocked: "HTTP 403 · 廣東第二師範學院電腦協會",
    mailSubject: "官網存取被攔截，申請放行",
  },
  en: {
    htmlLang: "en",
    tsLang: "en",
    brandSub: "Security check",
    challengeStatus: "Security check",
    challengeTitle: "Confirm you're human",
    challengeLead: "Your connection looks risky (e.g. a data center, proxy or VPN exit). Complete the check below to continue — it usually takes a second.",
    loading: "Loading verification…",
    verifying: "Passed, confirming…",
    success: "Verified, taking you in…",
    failed: "Confirmation failed. Please try the check again.",
    widgetError: "The verification widget failed to load. Check your network and reload.",
    noscript: "Verification requires JavaScript. Enable it and reload the page.",
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
    footChallenge: (h) => `Verification by Cloudflare Turnstile · No re-check for ${h} hours after passing`,
    footBlocked: "HTTP 403 · GDUE Computer Association",
    mailSubject: "Website access blocked - allowlist request",
  },
  ja: {
    htmlLang: "ja",
    tsLang: "ja",
    brandSub: "セキュリティチェック",
    challengeStatus: "セキュリティチェック",
    challengeTitle: "人間であることを確認してください",
    challengeLead: "現在の接続はリスクがあると判定されました（データセンター、プロキシ、VPN など）。下の認証を完了すると閲覧を続けられます。",
    loading: "認証コンポーネントを読み込み中…",
    verifying: "認証済み、確認しています…",
    success: "認証に成功しました。ページへ移動します…",
    failed: "確認に失敗しました。もう一度認証してください。",
    widgetError: "認証コンポーネントを読み込めませんでした。ネットワークを確認して再読み込みしてください。",
    noscript: "認証には JavaScript が必要です。有効にしてから再読み込みしてください。",
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
    footChallenge: (h) => `Cloudflare Turnstile による認証 · 通過後 ${h} 時間は再認証不要`,
    footBlocked: "HTTP 403 · 広東第二師範学院コンピューター協会",
    mailSubject: "公式サイトへのアクセスがブロックされました（許可申請）",
  },
};

export interface PageContext {
  /** 站点 locale（如 zh-cn / ja-jp），经 pageLang 选择文案 */
  locale: string;
  nonce: string;
  ip: string;
  requestId: string;
  verdict: RiskVerdict;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 嵌入 <script> 的 JSON：转义 < 防止提前闭合标签 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function reasonChips(verdict: RiskVerdict, t: Copy): string {
  const chips = [
    verdict.isIdc && t.idc,
    verdict.isProxy && t.proxy,
    verdict.isRisky && !verdict.isIdc && !verdict.isProxy && t.risky,
  ].filter((x): x is string => Boolean(x));
  return chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("");
}

function metaList(ctx: PageContext, t: Copy, time: string): string {
  return `<dl class="meta">
      <div><dt>${esc(t.ip)}</dt><dd class="mono">${esc(ctx.ip)}</dd></div>
      <div><dt>${esc(t.reason)}</dt><dd class="chips">${reasonChips(ctx.verdict, t)}</dd></div>
      <div><dt>${esc(t.requestId)}</dt><dd class="mono">${esc(ctx.requestId)}</dd></div>
      <div><dt>${esc(t.time)}</dt><dd class="mono">${esc(time)}</dd></div>
    </dl>`;
}

const STYLES = `
:root{--bg:#FAFAF9;--fg:#0F0F10;--card:#FFFFFF;--muted:#5C5C58;--soft:#F1F1EF;--border:#E5E5E2;--signal:#16A34A;--signal-text:#15803D;--danger:#C81E1E;--danger-soft:#FDECEC;--grid:rgba(15,15,16,.06);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#09090A;--fg:#EDEDEB;--card:#111113;--muted:#A1A19C;--soft:#1B1B1E;--border:#26262A;--signal:#4ADE80;--signal-text:#4ADE80;--danger:#F87171;--danger-soft:#2A1414;--grid:rgba(237,237,235,.05)}}
*{box-sizing:border-box;margin:0;padding:0}
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
`;

function layout(ctx: PageContext, t: Copy, title: string, body: string, extraHead = ""): string {
  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · GDUECA</title>
<style>${STYLES}</style>
${extraHead}
</head>
<body>
<main class="shell">
  <header class="brand"><span class="mark" aria-hidden="true">CA</span><span>GDUECA</span><span class="sub">/ ${esc(t.brandSub)}</span></header>
  ${body}
</main>
</body>
</html>`;
}

export function renderChallengePage(ctx: PageContext, siteKey: string, passHours: number): string {
  const t = COPY[pageLang(ctx.locale)];
  const time = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const config = {
    siteKey,
    action: TURNSTILE_ACTION,
    lang: t.tsLang,
    verifyPath: VERIFY_PATH,
    text: { verifying: t.verifying, success: t.success, failed: t.failed, widgetError: t.widgetError },
  };
  const script = `
(function(){
  var c=${jsonForScript(config)};
  var state=document.getElementById("state");
  function show(msg,tone,busy){state.dataset.tone=tone||"";state.innerHTML="";if(busy){var s=document.createElement("span");s.className="spin";state.appendChild(s);}state.appendChild(document.createTextNode(msg));}
  function submit(token){
    show(c.text.verifying,"",true);
    fetch(c.verifyPath,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token})})
      .then(function(r){if(!r.ok)throw new Error(String(r.status));show(c.text.success,"ok",true);setTimeout(function(){location.replace(location.href);},400);})
      .catch(function(){show(c.text.failed,"err");if(window.turnstile)window.turnstile.reset("#ts");});
  }
  window.onTurnstileLoad=function(){
    state.textContent="";
    window.turnstile.render("#ts",{sitekey:c.siteKey,action:c.action,language:c.lang,theme:"auto",callback:submit,
      "error-callback":function(){show(c.text.widgetError,"err");},
      "expired-callback":function(){window.turnstile.reset("#ts");}});
  };
  setTimeout(function(){if(!window.turnstile)show(c.text.widgetError,"err");},15000);
})();`;

  const body = `<section class="card" aria-labelledby="title">
    <div class="status mono"><span class="dot" aria-hidden="true"></span>${esc(t.challengeStatus)}</div>
    <h1 id="title">${esc(t.challengeTitle)}</h1>
    <p class="lead">${esc(t.challengeLead)}</p>
    <div class="widget"><div id="ts"></div><noscript><p class="note">${esc(t.noscript)}</p></noscript></div>
    <p class="state" id="state" role="status" aria-live="polite"><span class="spin" aria-hidden="true"></span>${esc(t.loading)}</p>
    ${metaList(ctx, t, time)}
  </section>
  <p class="foot mono">${esc(t.footChallenge(passHours))}</p>
<script nonce="${ctx.nonce}">${script}</script>
<script nonce="${ctx.nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&amp;onload=onTurnstileLoad" async defer></script>`;

  return layout(ctx, t, t.challengeTitle, body);
}

export function renderBlockedPage(ctx: PageContext, contactEmail: string, contactUrl: string): string {
  const t = COPY[pageLang(ctx.locale)];
  const time = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const diagnostics = [
    `${t.ip}: ${ctx.ip}`,
    `${t.requestId}: ${ctx.requestId}`,
    `${t.reason}: ${[ctx.verdict.isIdc && t.idc, ctx.verdict.isProxy && t.proxy].filter(Boolean).join(" + ")}`,
    `${t.time}: ${time}`,
    ctx.verdict.message && `Detail: ${ctx.verdict.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  const actions: string[] = [];
  if (contactEmail) {
    const mailto = `mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(
      `${t.mailSubject} (${ctx.ip})`,
    )}&body=${encodeURIComponent(`${diagnostics}\n\n`)}`;
    actions.push(`<a class="btn primary" href="${esc(mailto)}">${esc(t.contactEmail)}</a>`);
  }
  const hasContactUrl = /^https?:\/\//i.test(contactUrl);
  if (hasContactUrl) {
    actions.push(`<a class="btn" href="${esc(contactUrl)}" target="_blank" rel="noopener noreferrer">${esc(t.contactLink)}</a>`);
  }
  actions.push(`<button class="btn" type="button" id="copy">${esc(t.copy)}</button>`);
  actions.push(`<a class="btn" href="">${esc(t.retry)}</a>`);

  const contactLine = contactEmail
    ? `<p class="note">${esc(t.contactAddr)}: <a class="mono" href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a></p>`
    : hasContactUrl
      ? ""
      : `<p class="note">${esc(t.contactFallback)}</p>`;

  const script = `
(function(){
  var text=${jsonForScript(diagnostics)},label=${jsonForScript(t.copied)};
  var b=document.getElementById("copy");if(!b)return;
  b.addEventListener("click",function(){
    var done=function(){var o=b.textContent;b.textContent=label;setTimeout(function(){b.textContent=o;},1600);};
    if(navigator.clipboard)navigator.clipboard.writeText(text).then(done,function(){});
  });
})();`;

  const body = `<section class="card blocked" aria-labelledby="title">
    <div class="status mono"><span class="dot" aria-hidden="true"></span>403 · ${esc(t.blockedStatus)}</div>
    <h1 id="title">${esc(t.blockedTitle)}</h1>
    <p class="lead">${esc(t.blockedLead)}</p>
    <div class="steps">
      <h2>${esc(t.stepsTitle)}</h2>
      <ol><li>${esc(t.step1)}</li><li>${esc(t.step2)}</li></ol>
    </div>
    ${metaList(ctx, t, time)}
    <div class="actions">${actions.join("")}</div>
    ${contactLine}
  </section>
  <p class="foot mono">${esc(t.footBlocked)}</p>
<script nonce="${ctx.nonce}">${script}</script>`;

  return layout(ctx, t, t.blockedTitle, body);
}

/** 两个页面专用 CSP：仅放行 Turnstile 的脚本与 iframe */
export function pageCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",
    // Turnstile 会给挂载容器写 style 属性；同时出现 nonce 时 'unsafe-inline' 会被忽略，故此处不用 nonce
    "style-src 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
