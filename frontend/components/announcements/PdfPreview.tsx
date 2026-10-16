"use client";

/**
 * PDF 在线预览（pdf.js + Canvas 渲染）
 *
 * 为何不用 <iframe> / <embed>：`/uploads` 静态目录响应头带
 * `X-Frame-Options: DENY` 与 CSP `sandbox`（实测），内嵌 PDF 会被浏览器直接拦截。
 * 因此统一改为 pdf.js 在 <canvas> 上逐页渲染 —— WebKit / Blink / Gecko 内核表现一致。
 *
 * Worker：workerSrc 指向同源静态资源 `/pdf/pdf.worker.min.mjs`
 * （对应 CSP `worker-src 'self' blob:`）；若 Worker 不可用，pdf.js 自动降级为主线程渲染。
 *
 * 本模块通过 next/dynamic({ ssr: false }) 懒加载，pdfjs-dist 不进入详情页首屏 bundle。
 */
import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import ChevronLeft from "@/assets/icons/navigation/chevron-left.svg";
import ChevronRight from "@/assets/icons/navigation/chevron-right.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";

GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";

/** 缩放上下限与步进（相对「适宽」基准比例） */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const DEFAULT_ZOOM = 1;
/** 高分屏渲染倍率上限（超过 2 倍收益递减，徒增解码开销） */
const MAX_DEVICE_PIXEL_RATIO = 2;

type Status = "loading" | "ready" | "error";

export function PdfPreview({ url }: { url: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>("loading");
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [containerWidth, setContainerWidth] = useState(0);

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* 加载文档（调用方以 key=附件 id 挂载本组件，切换附件即重新挂载，
     故此处无需重置状态；卸载时销毁 loadingTask 释放 Worker） */
  useEffect(() => {
    let cancelled = false;

    const task = getDocument({ url });
    loadingTaskRef.current = task;
    task.promise
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      docRef.current = null;
      // 销毁 loadingTask 会一并释放 document 与其 Worker
      loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
    };
  }, [url]);

  /* 容器宽度（用于「适宽」基准比例，随窗口尺寸变化重算） */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [status]);

  /* 渲染当前页（页码 / 缩放 / 容器宽度变化时重绘） */
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (status !== "ready" || !doc || !canvas || !ctx || containerWidth <= 0) return;

    let cancelled = false;
    renderTaskRef.current?.cancel();

    doc
      .getPage(page)
      .then((pdfPage) => {
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const fitScale = containerWidth / base.width;
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
        const viewport = pdfPage.getViewport({ scale: fitScale * zoom * ratio });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
        const task = pdfPage.render({ canvasContext: ctx, viewport, canvas });
        renderTaskRef.current = task;
        return task.promise;
      })
      .catch(() => {
        /* 渲染被下一次请求取消（翻页/缩放）属正常流程；真正的加载失败已由加载阶段兜住 */
      });

    return () => {
      cancelled = true;
    };
  }, [status, page, zoom, containerWidth, numPages]);

  if (status === "error") {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("announcements.preview.pdfError")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* 工具栏：翻页 + 缩放 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("announcements.preview.pdfPrev")}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft />
          </Button>
          <span className="px-2 font-mono text-xs text-muted-foreground">
            {t("announcements.preview.pdfPage", { page, total: numPages || "—" })}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("announcements.preview.pdfNext")}
            disabled={page >= numPages}
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("announcements.preview.pdfZoomOut")}
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))))}
          >
            <span className="text-base leading-none">−</span>
          </Button>
          <span className="px-2 font-mono text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("announcements.preview.pdfZoomIn")}
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))))}
          >
            <span className="text-base leading-none">+</span>
          </Button>
        </div>
      </div>

      {/* 画布区 */}
      <div
        ref={containerRef}
        className="relative flex max-h-[70vh] justify-center overflow-auto rounded-md bg-muted/40 p-2"
      >
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("announcements.preview.pdfLoading")}
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="h-auto max-w-full rounded-sm bg-white shadow-sm"
          aria-label={t("announcements.preview.pdfPage", { page, total: numPages || "—" })}
        />
      </div>
    </div>
  );
}
