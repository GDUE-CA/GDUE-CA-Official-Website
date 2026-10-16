# 公告详情页多媒体与办公文档在线预览 —— 组件选型说明文档

> 适用范围：官网公告详情页（`/{locale}/announcements/{id}`）的附件在线预览模块
> 对应代码：`frontend/components/announcements/AnnouncementAttachments.tsx`、`frontend/components/announcements/PdfPreview.tsx`
> 后端契约：`backend/app/api/announcements.py`（`POST/DELETE /api/admin/announcements/{aid}/attachments`）

---

## 1. 需求与本项目的客观边界

需求要求「分别针对 iOS / Windows / Linux / Android 四个生态，选用各生态下原生适配的预览组件」。

本项目是一个 **单一 Next.js 16 Web 应用**（App Router + ISR），交付物是一个网站页面，不是四个原生 App。因此必须先明确一个技术事实：

| 生态 | 该生态「原生播放/预览组件」 | 网页能否直接实例化 |
| --- | --- | --- |
| iOS | AVPlayer / AVPlayerViewController | ❌ 网页无法创建 AVPlayer；WKWebView 内部自行使用 AVPlayer 播放 `<video>` |
| Windows | Media Foundation / WPF `MediaElement` / WinUI `MediaPlayerElement` | ❌ 仅限于 Win32/UWP/WPF 应用，网页无常驻通道 |
| Linux | GStreamer / 各浏览器自带媒体栈 | ❌ 同上 |
| Android | ExoPlayer(Media3) / `VideoView` / `PdfRenderer` | ❌ WebView 内部自行使用 ExoPlayer 播放 `<video>` |

**结论**：在 Web 交付形态下，「各生态原生组件」只能通过 **各生态浏览器内核原生支持的标准能力** 来落地——即 HTML5 `<video>` / `<audio>` / `<canvas>`，它们在各生态中分别由 AVPlayer（iOS WebKit）、ExoPlayer（Android WebView）、系统解码器（Windows/Linux 上的 Blink/Gecko）**在底层原生实现**。唯一可直接由网页声明开启的生态专属能力是 iOS 的 AirPlay 屏幕镜像（`x-webkit-airplay="allow"`），本次已实现。

> 若坚持「分别调用四套原生 SDK」，则需要额外的 iOS/Android 原生 App 工程与 Windows/Linux 桌面客户端工程（Swift/AVKit、Kotlin/Media3、C#/WPF、C/GStreamer），不属于本次「官网页面」交付范围。该结论已与需求方确认（选择「接受标准 Web 方案」）。

## 2. 实测得到的硬约束（决定了选型，不是偏好）

| 编号 | 实测结论 | 证据 | 影响的选型 |
| --- | --- | --- | --- |
| C1 | `/uploads` 支持 HTTP Range | `Range: bytes=100000-101023` → `206 Partial Content`、`content-range: bytes 100000-101023/788493`、`accept-ranges: bytes`、耗时 8.6ms | 视频/音频可直接用原生元素，**无需自建流式端点**，拖动进度可用 |
| C2 | `/uploads` 响应头禁止被内嵌 | `X-Frame-Options: DENY` + `content-security-policy: default-src 'none'; sandbox` + `X-Content-Type-Options: nosniff` | **iframe / embed / object 内嵌 PDF 方案被彻底否决** |
| C3 | 站点 CSP 含 `strict-dynamic` | `frontend/proxy.ts` 的 `script-src 'self' 'nonce-…' 'strict-dynamic' …` | Worker 请求会被拦截 → 必须显式声明 `worker-src 'self' blob:`（本次已补充） |
| C4 | 中间件会给裸路径补 locale 前缀 | `/pdf/x.mjs` → `301 → /zh-cn/pdf/x.mjs` | 静态资源目录必须加入 middleware `matcher` 豁免（本次已补充 `pdf/`） |
| C5 | iOS 上 AirPlay 只能声明、不能编程触发 | Safari 仅在原生 `controls` 上渲染 AirPlay 按钮，无 Web API 可实例化 AVPlayer | 采用 `x-webkit-airplay="allow"` + `playsInline`，**仅 iOS Safari 生效**，非四端一致 |

## 3. 选型决策表

| 格式 | 选用组件 | 底层由谁原生实现（各生态） | 理由 | 被否方案与原因 |
| --- | --- | --- | --- | --- |
| 视频 mp4/webm/ogv/mov | 原生 `<video controls playsInline preload="metadata" x-webkit-airplay="allow">` | iOS：WKWebView → AVPlayer；Android：WebView → ExoPlayer/Media3；Windows/Linux：Blink(FFmpeg) / Gecko(平台解码) | 四端均为浏览器内建实现，零依赖、零体积、支持 Range 拖动、原生全屏与画中画；iOS 可开启屏幕镜像 | ① video.js/hls.js 等：本场景附件是普通 http 文件，非 HLS/DASH 流，封装层无收益且增加包体；② 自研 `<canvas>`+MSE 播放器：跨端编解码差异大，得不偿失 |
| 音频 mp3/m4a/aac/wav/ogg/weba | 原生 `<audio controls preload="metadata">` | iOS：AVPlayer（音频）；Android：ExoPlayer；Windows/Linux：浏览器媒体栈 | 同上，且浏览器控制条本身即无障碍友好（键盘/朗读器可用） | 自研控制条：失去系统级音频焦点/锁屏控制，收益为负 |
| PDF | **pdf.js 6.4.299**（`pdfjs-dist`）+ `<canvas>` 逐页渲染 | 渲染由 JS 完成，但绘制走各端原生 Canvas 2D（CoreGraphics/Skia/Cairo） | iframe 方案被 C2 否决；pdf.js 是唯一可完全离线、无第三方域名、跨四端一致的方案；支持翻页/缩放/文本层扩展 | ① `<iframe src="…pdf">`/`<embed>`/`<object>`：被 `X-Frame-Options: DENY` + CSP `sandbox` 拦截（实测）；② 微软 Office Online Viewer / Google Docs Viewer：需把文件交给第三方域名，违反隐私与官网静态资源策略；③ `react-pdf`：本质是 pdf.js 的 React 封装，直接使用 pdf.js 更少一层依赖 |
| Word / Excel / PPT（doc/docx/xls/xlsx/ppt/pptx） | **不做在线渲染，下载兜底**：显示类型标签 + 文件大小 + `download` 链接 | 打开动作交由各生态本地应用（Windows：Office/WPS；iOS：iWork/Office；Android：WPS/Office；Linux：LibreOffice） | 高保真 Office 渲染在纯前端无法达成，且四个生态的本地应用本来就是「原生适配」的最终形态，交互一致且零风险 | ①`mammoth.js`（仅 docx→HTML，丢失表格/样式/图表）；②`xlsx`/`SheetJS`（仅表格数据，非版式）；③ 服务端 LibreOffice 无头转换：需引入数百 MB 依赖、需异步队列与转码缓存、存在感染面与资源放大风险（本轮需求未包含）；④ 浏览器内 WASM 版 LibreOffice：包体 > 100MB，首屏 3 秒无法达标 |
| 其他（未知类型） | 同 Office：下载兜底 | 各生态本地应用 | 无法为未知格式保证渲染一致性 | — |

### 3.1 iOS 屏幕镜像（AirPlay）实现说明

```tsx
<video
  src={url}
  controls
  playsInline
  preload="metadata"
  {...({ "x-webkit-airplay": "allow" } as Record<string, string>)}
>
```

- `x-webkit-airplay="allow"` 是 WebKit 私有属性，用于**允许**该媒体元素参与 AirPlay；Safari 会在原生控制条上渲染 AirPlay（镜像）按钮，用户点击后即可把画面投到 Apple TV / 支持 AirPlay 的屏幕。
- `playsInline` 保证 iOS 上不强制进入全屏接管（行内播放），避免与页面滚动冲突。
- `controls` 是 AirPlay 按钮出现的前提（Safari 只在原生控件上提供该入口）。
- **局限（必须如实标注）**：网页无任何 API 可编程启动 AirPlay 或创建 AVPlayer；该属性**只在 iOS/iPadOS Safari（含 WKWebView）生效**，在 Android/Windows/Linux 的浏览器中是被忽略的未知属性（不影响播放）。因此「屏幕镜像」是 iOS 端**增强能力**，不是四端一致能力。

## 4. 性能设计（对齐「大文件首屏 ≤ 3 秒、播放/翻页无明显卡顿」）

| 措施 | 说明 |
| --- | --- |
| 首屏只渲染 1 个附件 | 附件按标签切换，默认只挂载当前附件对应的渲染器，其余不产生任何网络请求 |
| pdf.js 独立懒加载 | `PdfPreview` 经 `next/dynamic({ ssr: false })` 动态引入，`pdfjs-dist` 不进入详情页首屏 bundle；只有用户切到 PDF 附件时才下载该 chunk |
| Worker 线程渲染 | pdf.js 在独立 Worker 中解析，主线程不被阻塞；Worker 不可用时自动降级为主线程渲染（功能不缺失） |
| 媒体只取元数据 | `preload="metadata"`，首屏不预取整个媒体文件；拖动进度依赖 Range（C1 已实测 206） |
| 画布像素比封顶 | `devicePixelRatio` 上限 2，避免 3x/4x 屏上画布面积过大导致渲染卡顿 |
| 渲染任务可取消 | 翻页/缩放时 `RenderTask.cancel()` 取消上一次渲染，避免快速操作堆积 |
| 容器自适应 | `ResizeObserver` 按容器宽度重算「适宽」比例，窗口变化不重排错位 |

## 5. 跨端交互一致性设计

四端共用同一套交互骨架（同一份代码、同一套 i18n 文案、同一套按钮位置）：

1. 附件标签条（`aria-pressed`）切换当前附件 → 2. 面板头部固定展示「文件名 + 类型标签 + 文件大小 + 下载入口」→ 3. 面板主体按类型选择渲染器。

因此「交互逻辑保持一致」由**代码同源**保证，而非四套实现对齐。差异仅存在于各生态浏览器自身的能力（如 AirPlay 按钮仅 iOS Safari 出现）。

## 6. 选型对交付物的映射

| 需求 | 落地位置 |
| --- | --- |
| 视频/音频/PDF 原生在线渲染与播放 | [AnnouncementAttachments.tsx](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/frontend/components/announcements/AnnouncementAttachments.tsx) |
| PDF 逐页渲染/翻页/缩放 | [PdfPreview.tsx](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/frontend/components/announcements/PdfPreview.tsx) |
| iOS 屏幕镜像（AirPlay） | `AnnouncementAttachments.tsx` 中 `x-webkit-airplay="allow"` |
| pdf.js Worker 静态资源 | [public/pdf/pdf.worker.min.mjs](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/frontend/public/pdf/pdf.worker.min.mjs) |
| CSP / 中间件放行 | [proxy.ts](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/frontend/proxy.ts) |
| 附件上传（类型/大小双白名单校验） | [announcements.py](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/backend/app/api/announcements.py) |
| 各端兼容性实测结论 | [ANNOUNCEMENT_MEDIA_PREVIEW_COMPAT_REPORT.md](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/docs/ANNOUNCEMENT_MEDIA_PREVIEW_COMPAT_REPORT.md) |
