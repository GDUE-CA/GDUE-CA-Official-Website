"use client";

/**
 * AvatarUploader —— 头像上传 / 恢复默认
 *
 * - 圆形预览：有头像显示图片，无头像显示首字母 + 用户名哈希色
 * - 上传：选文件 → 校验（≤5MB，JPG/PNG/WEBP）→ 裁切弹窗（220px 方形视口，
 *   滑杆缩放 1~3 + 指针拖拽平移）→ canvas 中心裁切输出 512x512 JPEG(quality 0.8) → 上传
 * - 恢复默认：DELETE /api/auth/avatar
 * - 头像接口即时生效，不计入表单 dirty
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Upload from "@/assets/icons/action/upload.svg";
import RotateCcw from "@/assets/icons/action/rotate-ccw.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import { API_BASE_URL } from "@/lib/api/client";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadAvatar, deleteAvatar } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** 裁切视口边长（px） */
const VIEWPORT = 220;
/** 输出尺寸（px） */
const OUTPUT = 512;

/** 把用户名字符串取首字母（多字时取前两个；中文取前两个字） */
function getInitials(name: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 2);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

/** 根据用户名生成一个稳定的 HSL 色相（避免占位背景清一色） */
function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** 把可能是相对路径的 avatar_url 补全为完整 URL */
function avatarFullUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const base = API_BASE_URL.replace(/\/+$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

interface AvatarUploaderProps {
  avatarUrl: string | null;
  username: string;
  onChanged: (url: string | null) => void;
}

export function AvatarUploader({ avatarUrl, username, onChanged }: AvatarUploaderProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 上传 / 恢复状态
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 裁切状态
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImg, setCropImg] = useState<HTMLImageElement | null>(null);
  const [cropSrc, setCropSrc] = useState<string>("");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  // 恢复默认确认弹窗
  const [resetOpen, setResetOpen] = useState(false);

  // 释放 object URL
  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  /** 按当前缩放计算图片显示尺寸（cover 基准 × scale） */
  function displaySize(img: HTMLImageElement, sc: number) {
    const ratio = img.naturalWidth / img.naturalHeight;
    const baseW = ratio >= 1 ? VIEWPORT * ratio : VIEWPORT;
    const baseH = ratio >= 1 ? VIEWPORT : VIEWPORT / ratio;
    return { w: baseW * sc, h: baseH * sc };
  }

  const clampOffset = useCallback(
    (x: number, y: number, img: HTMLImageElement, sc: number) => {
      const { w, h } = displaySize(img, sc);
      const maxX = Math.max(0, (w - VIEWPORT) / 2);
      const maxY = Math.max(0, (h - VIEWPORT) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    []
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setMsg(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setMsg({ type: "err", text: t("setting.avatar.typeError") });
      return;
    }
    if (file.size > MAX_SIZE) {
      setMsg({ type: "err", text: t("setting.avatar.tooLarge") });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setCropImg(img);
      setCropSrc(url);
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setCropOpen(true);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setMsg({ type: "err", text: t("setting.avatar.uploadError") });
    };
    img.src = url;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!cropImg) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current || !cropImg) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(
      clampOffset(dragState.current.baseX + dx, dragState.current.baseY + dy, cropImg, scale)
    );
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragState.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  /** 缩放变化时重新钳制平移量，避免把图拖出视口 */
  function handleScaleChange(sc: number) {
    setScale(sc);
    if (cropImg) setOffset((o) => clampOffset(o.x, o.y, cropImg, sc));
  }

  /** 确认裁切：canvas 中心裁切输出 512x512 JPEG（80% 压缩）后上传 */
  async function handleCropConfirm() {
    if (!cropImg) return;
    setBusy(true);
    setMsg(null);
    try {
      const { w, h } = displaySize(cropImg, scale);
      const k = OUTPUT / VIEWPORT;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(t("setting.avatar.uploadError"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.drawImage(
        cropImg,
        (VIEWPORT / 2 - w / 2 + offset.x) * k,
        (VIEWPORT / 2 - h / 2 + offset.y) * k,
        w * k,
        h * k
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8)
      );
      if (!blob) throw new Error(t("setting.avatar.uploadError"));
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      const res = await uploadAvatar(file);
      onChanged(res.avatar_url);
      setMsg({ type: "ok", text: t("admin.profile.avatarSuccess") });
      setCropOpen(false);
    } catch (err) {
      setMsg({
        type: "err",
        text: err instanceof Error ? err.message : t("setting.avatar.uploadError"),
      });
    } finally {
      setBusy(false);
    }
  }

  /** 恢复默认头像 */
  async function handleReset() {
    setBusy(true);
    setMsg(null);
    try {
      await deleteAvatar();
      onChanged(null);
      setMsg({ type: "ok", text: t("setting.avatar.resetSuccess") });
      setResetOpen(false);
    } catch (err) {
      setMsg({
        type: "err",
        text: err instanceof Error ? err.message : t("setting.avatar.uploadError"),
      });
    } finally {
      setBusy(false);
    }
  }

  const fullUrl = avatarFullUrl(avatarUrl);
  const { w: dispW, h: dispH } = cropImg ? displaySize(cropImg, scale) : { w: 0, h: 0 };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("setting.avatar.title")}</CardTitle>
        <CardDescription>{t("setting.avatar.limitHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-6">
          {/* 圆形预览 */}
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
            {fullUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fullUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white select-none"
                style={{ backgroundColor: `hsl(${hashHue(username)}, 55%, 45%)` }}
              >
                {getInitials(username)}
              </span>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("setting.saving")}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {t("admin.profile.avatarUpload")}
                  </>
                )}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setResetOpen(true)}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("setting.avatar.reset")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("setting.avatar.limitHint")}</p>
          </div>
        </div>

        {/* 成功 / 失败提示条 */}
        {msg && (
          <p
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              msg.type === "ok"
                ? "bg-green-50 text-green-600 dark:bg-green-950/20"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {msg.type === "ok" && <CheckCircle2 className="h-4 w-4" />}
            {msg.text}
          </p>
        )}
      </CardContent>

      {/* 裁切弹窗 */}
      <Dialog open={cropOpen} onOpenChange={(open) => !busy && setCropOpen(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("setting.avatar.title")}</DialogTitle>
            <DialogDescription>{t("setting.avatar.limitHint")}</DialogDescription>
          </DialogHeader>

          {/* 220px 方形视口：拖拽平移 */}
          <div className="flex flex-col items-center gap-4">
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="relative h-[220px] w-[220px] cursor-grab touch-none overflow-hidden rounded-md border border-border bg-muted active:cursor-grabbing"
            >
              {cropImg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cropSrc}
                  alt="crop"
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: dispW,
                    height: dispH,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  }}
                />
              )}
            </div>

            {/* 缩放滑杆（1~3） */}
            <div className="flex w-full items-center gap-3">
              <span className="text-xs text-muted-foreground">1x</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={scale}
                onChange={(e) => handleScaleChange(Number(e.target.value))}
                className="w-full cursor-pointer accent-primary"
                aria-label={t("setting.avatar.title")}
              />
              <span className="text-xs text-muted-foreground">3x</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCropOpen(false)} disabled={busy}>
              {t("setting.cancel")}
            </Button>
            <Button onClick={() => void handleCropConfirm()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("setting.saving")}
                </>
              ) : (
                t("setting.avatar.cropConfirm")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 恢复默认确认弹窗 */}
      <Dialog open={resetOpen} onOpenChange={(open) => !open && setResetOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("setting.avatar.resetConfirm")}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={busy}>
              {t("setting.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleReset()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("setting.saving")}
                </>
              ) : (
                t("common.confirm")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
