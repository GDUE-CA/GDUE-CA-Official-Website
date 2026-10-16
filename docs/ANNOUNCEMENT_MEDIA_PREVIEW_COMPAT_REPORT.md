# 公告详情页多媒体与办公文档在线预览 —— 各端兼容性测试报告

> 被测对象：官网公告详情页（`/{locale}/announcements/{id}`）附件预览模块
> 对应代码：[AnnouncementAttachments.tsx](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/frontend/components/announcements/AnnouncementAttachments.tsx)、[PdfPreview.tsx](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/frontend/components/announcements/PdfPreview.tsx)
> 选型依据：[ANNOUNCEMENT_MEDIA_PREVIEW_SELECTION.md](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/docs/ANNOUNCEMENT_MEDIA_PREVIEW_SELECTION.md)
> 报告口径：**如实标注局限 + 真机自查清单**（已与需求方确认）

---

## 0. 测试环境与口径声明（必须先读）

| 项 | 实际值 |
| --- | --- |
| 真实测试环境 | Windows 11 + 桌面浏览器 Chrome / Edge（Chromium 内核），本地 dev/生产构建 |
| 服务端 | FastAPI（`/uploads` 静态目录）+ Next.js 16 前端，同机回环访问 |
| 曾执行的跨端手段 | 仅 **视口尺寸模拟 + UA 模拟**（DevTools 设备模拟），**不是真机** |
| 测试素材 | 测试公告 `AID=4`，7 个附件：`sample.mp4`(789KB) / `sample.mp3` / `sample.wav` / `sample.pdf`(3 页) / `sample.docx` / `sample.xlsx` / `sample.pptx` |

**局限声明（如实标注）**

1. 本报告的全部实测数据来自 **Windows 桌面 Chromium**。**未在 iOS / Android / Linux 真机或真实浏览器上运行过**，因此 iOS 的 AirPlay 屏幕镜像「可用性」只有 **WebKit 规范与属性层面**的依据，**没有真机验证数据**。
2. 因本项目是单一 Web 应用，四端共用同一份代码；本报告中的「四端一致」指 **代码同源**，不代表已在四端逐一实机回归。
3. iOS 屏幕镜像为 **iOS/iPadOS Safari（含 WKWebView）专属增强能力**，在 Android/Windows/Linux 浏览器中被忽略（不影响正常播放）。它 **不是四端一致能力**。
4. Office（Word/Excel/PPT）按选型结论为 **下载兜底**，不存在「浏览器内在线渲染」用例，故本报告只验证「提示文案 + 下载入口可用」。

---

## 1. 桌面浏览器实测（已完成的真实证据）

### 1.1 功能用例矩阵

| # | 用例 | 预期 | 实测结果 | 结论 |
| --- | --- | --- | --- | --- |
| 1 | 详情页渲染附件标签条 | 7 个附件标签，`aria-pressed` 标记当前项 | 7 个标签，计数一致 | ✅ |
| 2 | 视频在线播放 | `<video>` 可加载并解码 | `readyState=4`、`duration=10.026667`、`controls=true`、`playsInline=true` | ✅ |
| 3 | iOS 屏幕镜像声明 | 元素带 `x-webkit-airplay="allow"` | HTML 与 DOM 各 1 处命中，属性存在 | ✅（声明层；真机待自查） |
| 4 | 音频在线播放 | `<audio>` 可加载并解码 | `readyState=4`、`duration=1.549188` | ✅ |
| 5 | PDF 在线渲染 | `<canvas>` 出现并绘制 | `canvas` 476×673，无「加载失败」 | ✅ |
| 6 | PDF 翻页 | 页码从第 1 页切到第 2 页且内容变化 | 文案「第 1 / 3 页」→「第 2 / 3 页」，`toDataURL()` 前后不同 | ✅ |
| 7 | PDF 缩放 | 100% → 125% → 回到 100% | 画布宽 476 → 595 → 476 | ✅ |
| 8 | Office 兜底 | 显示提示 + 可下载 | 3 个 Office 标签均出现提示文案，`<a download>` 的 `href` 以 `/uploads/announcements/` 开头 | ✅ |
| 9 | 控制台清洁 | 无 JS 报错、无 CSP 违规 | 无 "Setting up fake worker"、无 CSP 违规、无 JS 异常 | ✅ |
| 10 | 移动端视口不溢出 | 无横向滚动 | `scrollWidth <= 视口宽 + 2` | ✅（视口模拟，非真机） |
| 11 | 首屏文案 i18n | 中英文均能取到词条 | `announcements.preview.*` 已在 10 个完整语言包补齐 | ✅ |

### 1.2 附件类型派生（服务端）

上传 7 个文件后，后端派生的 `kind` 全部正确：

| 文件 | 期望 kind | 实测 kind |
| --- | --- | --- |
| `sample.mp4` | video | video ✅ |
| `sample.mp3` / `sample.wav` | audio | audio ✅ ×2 |
| `sample.pdf` | pdf | pdf ✅ |
| `sample.docx` / `sample.xlsx` / `sample.pptx` | office | office ✅ ×3 |

### 1.3 服务端证据

| 项 | 命令 / 条件 | 实测结果 |
| --- | --- | --- |
| 7 个附件可访问 | 直连 `/uploads/announcements/…` | 全部 `200`，单文件耗时 7.5–18.9 ms |
| MIME 正确性 | 检查 `Content-Type` | `video/mp4` / `audio/mpeg` / `audio/wav` / `application/pdf` / docx|xlsx|pptx 各自标准 MIME ✅ |
| 视频拖动前提（Range） | `Range: bytes=100000-101023` | `206 Partial Content`、`content-range: bytes 100000-101023/788493`、`accept-ranges: bytes`、8.6 ms / 1024 B ✅ |
| pdf.js Worker 可加载 | `GET /pdf/pdf.worker.min.mjs` | `200`（修复后；修复前见 §3） ✅ |
| 详情页 SSR | `GET /zh-cn/announcements/4` | `200`；CSP 含 `worker-src 'self' blob:`；HTML 内含「附件预览」、7 个附件标签、`x-webkit-airplay="allow"` 与 `playsinline` 各 1 处 ✅ |

> C1 / C2 两条约束（Range 可用、`X-Frame-Options: DENY` + CSP `sandbox` 导致 iframe 内嵌 PDF 被否决）的原始探测记录见选型文档 §2。

## 2. 性能实测（对齐「大文件首屏 ≤ 3 秒、播放/翻页无明显卡顿」）

| 指标 | 实测值 | 门槛 | 结论 |
| --- | --- | --- | --- |
| 详情页 DOM ready | `domContentLoadedEventEnd ≈ 356 ms` | ≤ 3000 ms | ✅ 大幅达标 |
| 详情页 load 完成 | `loadEventEnd ≈ 630 ms` | ≤ 3000 ms | ✅ |
| `sample.mp4` 首字节 | 请求耗时 ≈ 60 ms，大小 ≈ 789 KB | — | ✅ |
| 视频/音频拖动 | Range 请求 `206`，8.6 ms 返回 1 KB | 无明显卡顿 | ✅（桌面同机） |
| PDF 翻页/缩放 | 渲染任务可取消；画布变化即时生效 | 无明显卡顿 | ✅ |

**支撑措施（详见选型文档 §4）**：首屏只挂载 1 个附件的渲染器；`pdfjs-dist` 经 `next/dynamic({ ssr: false })` 懒加载，不进入详情页首屏 bundle；媒体 `preload="metadata"`；画布 `devicePixelRatio` 封顶 2；翻页/缩放时 `RenderTask.cancel()`；`ResizeObserver` 自适应容器宽度。

> 说明：上述性能数据为 **同机回环、桌面 Chromium** 下测得。跨端真机（尤其 iOS Safari 与 Android 中低端机）的首屏时间受网络与设备解码能力影响，需按 §5 清单复测。

## 3. 测试中发现的缺陷与修复记录

| # | 现象 | 根因 | 修复 | 复测 |
| --- | --- | --- | --- | --- |
| D1 | 附件上传接口报错（后端收到非 multipart） | `apiFetch` 对 `FormData` 仍写死 `Content-Type: application/json`，破坏 multipart 边界 | [client.ts](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/frontend/lib/api/client.ts) 增加 `isFormData` 守卫，FormData 不设置 `Content-Type`（顺带修复既有 `blog.ts#adminUploadBlogImage`、`uploadBanner` 同类缺陷） | ✅ |
| D2 | PDF 显示「文档加载失败」，控制台报 pdf worker 加载失败 + "Setting up fake worker" | ① 中间件把 `/pdf/pdf.worker.min.mjs` 当裸业务路径做 301 locale 重定向（浏览器缓存了该 301）；② `script-src` 含 `strict-dynamic`，现代浏览器忽略其中的 `'self'`，Worker 请求被 CSP 拦截 | ① [proxy.ts](file:///c:/Users/xuanxuan/Desktop/GDUE-CA-Official-Website-main/frontend/proxy.ts) 的 `matcher` 豁免 `pdf/`；② CSP 显式新增 `worker-src 'self' blob:` | ✅（新标签页避开缓存后复测通过；`curl /pdf/does-not-exist.mjs` → 404，证明 301 已消除） |
| D3 | `getDocument(url)` 报 TS2559 | pdfjs-dist v6 类型只接受 `DocumentInitParameters` | 改为 `getDocument({ url })` | ✅ |
| D4 | `PDFDocumentProxy` 无 `destroy()`，报 TS2339 | 释放入口在 loading task 上 | 持有 `PDFDocumentLoadingTask` 引用，用 `loadingTaskRef.current?.destroy()` 释放 | ✅ |
| D5 | eslint `react-hooks/set-state-in-effect`（PdfPreview 在 effect 体同步 setState） | effect 内同步重置状态 | 改为父组件 `<PdfPreview key={active.id} url={…} />` 触发重挂载，删除 effect 内的重置调用 | ✅ |

**残留项（如实标注，非本轮引入）**：`AnnouncementsManager.tsx:113` 存在 `useEffect(() => { load(); }, [load])` 的 eslint 提示。经检索，这是 **项目级既有惯例**（`ThemesManager` / `MediaManager` / `MembersManager` / `ActivityDetail` / `CommentsSection` / `SysDataManager` 等均为同写法），本轮未修改该文件既有结构，故保留并如实说明，不在本任务范围内统一整改。

## 4. 静态校验

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `node .\node_modules\typescript\bin\tsc --noEmit`（frontend） | `TSC_EXIT=0`（两次均通过） |
| 新增文件 lint | eslint（`AnnouncementAttachments.tsx`、`PdfPreview.tsx`） | 已清零 |
| i18n JSON | `announcements.preview.*` 词条在 10 个完整语言包中存在 | ✅（overlay 空壳包未手改，按设计回退） |

## 5. 四端真机自查清单（尚未执行，交付后由各端负责人完成）

> 说明：以下步骤是本 Web 交付物在四端真机上的**最小回归清单**。每项均可在对应生态的真实浏览器中完成，无需额外原生工程。

### 5.1 iOS（iPhone / iPad，Safari）

| 步骤 | 期望 |
| --- | --- |
| 打开公告详情页，切到视频附件 | 视频行内播放；控制条出现「AirPlay/屏幕镜像」按钮 |
| 点击 AirPlay 按钮 | 可搜索到 Apple TV / 支持 AirPlay 的显示设备并投屏；画面镜像成功 |
| 旋转/滚动页面 | 不强制全屏接管（`playsInline` 生效），无布局错位 |
| 切到音频附件 | 音频可播放；锁屏/控制中心显示媒体信息 |
| 切到 PDF 附件 | 逐页渲染正常；翻页/缩放可用；**注意**：iOS Safari 对 PDF 有原生预览偏好，若页面仍走 pdf.js 渲染则一致 |
| 切到 Office 附件 | 提示文案 + 下载链接可点，下载后可交由 iWork/Office 打开 |

### 5.2 Windows（Chrome / Edge）

| 步骤 | 期望 |
| --- | --- |
| 视频/音频附件 | 正常播放，进度条可拖动（依赖 Range/206） |
| PDF 附件 | 逐页渲染、翻页、缩放正常 |
| Office 附件 | 下载后由本地 Office/WPS 打开 |

### 5.3 Linux（Chrome / Firefox）

| 步骤 | 期望 |
| --- | --- |
| 视频/音频附件 | 播放正常；**注意编解码**：Firefox/部分发行版对 H.264/MP4 需系统解码器，若不可播需改投 WebM/OGV 源 |
| PDF 附件 | pdf.js 渲染正常（不依赖系统 PDF 插件） |
| Office 附件 | 下载后由 LibreOffice 打开 |

### 5.4 Android（Chrome / 系统 WebView）

| 步骤 | 期望 |
| --- | --- |
| 视频/音频附件 | 正常播放；拖动进度可用 |
| PDF 附件 | pdf.js 在 `<canvas>` 上逐页渲染正常 |
| Office 附件 | 下载后由 WPS/Office 打开 |

### 5.5 性能复测（四端通用）

| 项 | 方法 | 门槛 |
| --- | --- | --- |
| 首屏渲染 | 打开一个含约 5–10 MB 附件的公告详情页，记录首屏可见时间 | ≤ 3 s |
| 播放流畅度 | 播放视频时观察是否掉帧/卡顿 | 无明显卡顿 |
| 翻页流畅度 | 连续快速翻页 PDF 3 页以上 | 无明显卡顿、不出现空白页残留 |

## 6. 结论

| 需求 | 结论 |
| --- | --- |
| 视频 / 音频 / PDF 原生在线渲染与播放（无需跳第三方应用） | **桌面 Chromium 实测通过**；四端真机待按 §5 自查 |
| 四生态各选原生适配组件 | 通过各生态浏览器内核原生实现（AVPlayer / ExoPlayer / Blink-FFmpeg / Gecko），**代码同源保证交互一致**；详见选型文档 §1、§3 |
| iOS 屏幕镜像 | 已按标准 Web 方案声明 `x-webkit-airplay="allow"` + `playsInline`；**仅 iOS Safari 生效**，真机可用性待 §5.1 验证 |
| 四端正常加载、无渲染异常、无功能缺失、交互统一 | 桌面端已实测通过；四端真机回归清单已交付（§5），需各端执行后方可签署 |
| 大文件首屏 ≤ 3 s、播放/翻页无明显卡顿 | 桌面同机实测 356 ms / 630 ms，**大幅达标**；真机需按 §5.5 复测 |
| 交付内容 | 预览模块代码（见选型文档 §6 映射表）+ 本兼容性测试报告 + 选型说明文档 |
