"use client";

/**
 * 公告附件在线预览模块（详情页）
 *
 * 统一交互骨架：附件切换 → 按类型选择渲染器，四端（iOS / Windows / Linux / Android）
 * 的浏览器内核（WebKit / Blink / Gecko）对 <video> / <audio> / <canvas> 支持一致，
 * 因此交互逻辑与渲染结果跨端统一：
 *
 * - video：原生 <video>；iOS Safari 额外声明 `x-webkit-airplay="allow"` 以启用屏幕镜像（AirPlay）
 * - audio：原生 <audio>
 * - pdf：pdf.js 客户端渲染（懒加载；翻页 / 缩放）
 * - office（Word / Excel / PPT）与 other：不做在线渲染（跨端无免插件的原生方案），提供下载兜底
 *
 * 首屏性能：默认仅渲染首个附件；pdfjs-dist 与媒体内容均按需加载
 * （视频/音频 preload="metadata" 只取元数据，不预取整个文件）。
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import Download from "@/assets/icons/action/download.svg";
import FileText from "@/assets/icons/status/file-text.svg";
import Music from "@/assets/icons/status/music.svg";
import Play from "@/assets/icons/status/play.svg";
import Paperclip from "@/assets/icons/action/paperclip.svg";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatBytes } from "@/lib/utils";
import type { AnnouncementAttachment, AnnouncementAttachmentKind } from "@/types/api";

/** pdf.js 体积较大，独立懒加载（不进入详情页首屏 bundle） */
const PdfPreview = dynamic(
  () => import("./PdfPreview").then((m) => m.PdfPreview),
  { ssr: false }
);

/** 附件类型图标（视频 / 音频 / 其余文档类） */
const KIND_ICONS: Record<AnnouncementAttachmentKind, typeof FileText> = {
  video: Play,
  audio: Music,
  pdf: FileText,
  office: FileText,
  other: FileText,
};

/** 附件类型标签的 i18n key */
const KIND_LABELS: Record<AnnouncementAttachmentKind, string> = {
  video: "announcements.preview.kind.video",
  audio: "announcements.preview.kind.audio",
  pdf: "announcements.preview.kind.pdf",
  office: "announcements.preview.kind.office",
  other: "announcements.preview.kind.other",
};

/** 展示名：优先后端存储的原始文件名，缺失时回退 URL 末段 */
function displayName(a: AnnouncementAttachment): string {
  if (a.original_name) return a.original_name;
  const last = a.url.split("/").pop() ?? a.url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function AnnouncementAttachments({
  attachments,
}: {
  attachments: AnnouncementAttachment[];
}) {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState(attachments[0]?.id ?? 0);

  const active = attachments.find((a) => a.id === activeId) ?? attachments[0];
  if (!active) return null;

  const name = displayName(active);
  const KindIcon = KIND_ICONS[active.kind];

  return (
    <section className="mt-6 space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Paperclip className="h-4 w-4" />
        {t("announcements.preview.title")}
      </h2>

      {/* 附件切换（交互骨架跨端一致） */}
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => {
          const TabIcon = KIND_ICONS[a.kind];
          const selected = a.id === active.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveId(a.id)}
              aria-pressed={selected}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <TabIcon className="h-3.5 w-3.5" aria-hidden />
              <span className="max-w-[14rem] truncate">{displayName(a)}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 p-3 md:p-4">
          {/* 当前附件信息 + 下载入口 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <KindIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">
                  {t(KIND_LABELS[active.kind])} · {formatBytes(active.size)}
                </p>
              </div>
            </div>
            <a
              href={active.url}
              download={name}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <Download className="h-4 w-4" aria-hidden />
              {t("announcements.preview.download")}
            </a>
          </div>

          {/* 渲染区 */}
          {active.kind === "video" && (
            <video
              key={active.id}
              src={active.url}
              controls
              playsInline
              preload="metadata"
              className="max-h-[70vh] w-full rounded-md bg-black"
              {...({ "x-webkit-airplay": "allow" } as Record<string, string>)}
            >
              <a href={active.url} download={name}>
                {t("announcements.preview.download")}
              </a>
            </video>
          )}

          {active.kind === "audio" && (
            <AudioPlayer key={active.id} src={active.url} />
          )}

          {active.kind === "pdf" && (
            <PdfPreview key={active.id} url={active.url} />
          )}

          {(active.kind === "office" || active.kind === "other") && (
            <div className="rounded-md bg-muted/40 px-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {t("announcements.preview.officeHint")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** 音频播放器（原生 <audio>；preload="metadata" 不预取整个文件） */
function AudioPlayer({ src }: { src: string }) {
  return <audio src={src} controls preload="metadata" className="w-full" />;
}
