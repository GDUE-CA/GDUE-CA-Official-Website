"use client";

/**
 * BannerUploader —— 个人主页封面设置（V0.5.5 §9.1/§9.3）
 *
 * - 宽幅预览（约 3:1）：有封面图显示图片；无图时显示自定义纯色；均无 = 系统默认渐变
 * - 上传：选文件 → 类型/大小校验 → 直传 POST /api/auth/banner（服务端压缩，无需前端裁切）
 * - 删除图片：DELETE /api/auth/banner（回退纯色 / 默认）
 * - 纯色：颜色选择器 + hex 输入，即时保存 profile_banner_color（空 = 系统默认色）
 * - 全部即时生效，不计入个人资料表单 dirty
 */
import { useEffect, useRef, useState } from "react";
import Upload from "@/assets/icons/action/upload.svg";
import RotateCcw from "@/assets/icons/action/rotate-ccw.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import { API_BASE_URL } from "@/lib/api/client";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { uploadBanner, deleteBanner, updateProfile } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

const MAX_SIZE = 15 * 1024 * 1024; // 与后端原始上限一致（服务端压缩）
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function bannerFullUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const base = API_BASE_URL.replace(/\/+$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export function BannerUploader({
  bannerUrl,
  bannerColor,
  onChanged,
}: {
  bannerUrl: string | null;
  bannerColor: string | null;
  onChanged: (next: { banner_url: string | null; banner_color: string | null }) => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [url, setUrl] = useState<string | null>(bannerUrl);
  const [color, setColor] = useState<string>(bannerColor ?? "");
  const [colorInput, setColorInput] = useState<string>(bannerColor ?? "");

  useEffect(() => {
    setUrl(bannerUrl);
    setColor(bannerColor ?? "");
    setColorInput(bannerColor ?? "");
  }, [bannerUrl, bannerColor]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setMsg(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setMsg({ type: "err", text: t("setting.avatar.typeError") });
      return;
    }
    if (file.size > MAX_SIZE) {
      setMsg({ type: "err", text: t("setting.banner.tooLarge") });
      return;
    }
    setBusy(true);
    try {
      const res = await uploadBanner(file);
      setUrl(res.banner_url);
      onChanged({ banner_url: res.banner_url, banner_color: color || null });
      setMsg({ type: "ok", text: t("setting.banner.success") });
    } catch (err) {
      setMsg({
        type: "err",
        text: err instanceof Error ? err.message : t("setting.banner.uploadError"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    setMsg(null);
    try {
      await deleteBanner();
      setUrl(null);
      onChanged({ banner_url: null, banner_color: color || null });
      setMsg({ type: "ok", text: t("setting.banner.resetSuccess") });
    } catch (err) {
      setMsg({
        type: "err",
        text: err instanceof Error ? err.message : t("setting.banner.uploadError"),
      });
    } finally {
      setBusy(false);
    }
  }

  /** 保存自定义纯色（空字符串 = 恢复系统默认色，存 NULL） */
  async function saveColor(next: string) {
    const normalized = next.trim();
    if (normalized && !HEX_PATTERN.test(normalized)) {
      setMsg({ type: "err", text: t("setting.banner.colorInvalid") });
      setColorInput(color);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await updateProfile({ profile_banner_color: normalized });
      setColor(normalized);
      setColorInput(normalized);
      onChanged({ banner_url: url, banner_color: normalized || null });
      setMsg({ type: "ok", text: t("setting.banner.success") });
    } catch (err) {
      setMsg({
        type: "err",
        text: err instanceof Error ? err.message : t("setting.banner.uploadError"),
      });
      setColorInput(color);
    } finally {
      setBusy(false);
    }
  }

  const fullUrl = bannerFullUrl(url);
  // color input 只接受 #rrggbb；#rgb 归一化展示
  const pickerValue = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#6366f1";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("setting.banner.title")}</CardTitle>
        <CardDescription>{t("setting.banner.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 宽幅预览 */}
        <div className="h-28 sm:h-36 w-full overflow-hidden rounded-lg border border-border">
          {fullUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fullUrl} alt="banner" className="h-full w-full object-cover" />
          ) : (
            <div
              style={color ? { backgroundColor: color } : undefined}
              className={
                color
                  ? "h-full w-full"
                  : "h-full w-full bg-gradient-to-br from-primary/25 via-muted to-secondary"
              }
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t("setting.banner.upload")}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4" />
              {t("setting.banner.reset")}
            </Button>
          )}
        </div>

        {/* 自定义纯色（无封面图时生效） */}
        <div className="space-y-2">
          <Label htmlFor="pf-banner-color">{t("setting.banner.colorLabel")}</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={pickerValue}
              onChange={(e) => void saveColor(e.target.value)}
              disabled={busy}
              aria-label={t("setting.banner.colorLabel")}
              className="h-9 w-12 cursor-pointer rounded border border-border bg-background p-1"
            />
            <Input
              id="pf-banner-color"
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              onBlur={(e) => {
                if (e.target.value.trim() !== color) void saveColor(e.target.value);
              }}
              placeholder="#6366f1"
              maxLength={7}
              className="w-32 font-mono"
            />
            {color && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void saveColor("")}
              >
                {t("setting.banner.colorDefault")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("setting.banner.colorHint")}</p>
        </div>

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
    </Card>
  );
}
