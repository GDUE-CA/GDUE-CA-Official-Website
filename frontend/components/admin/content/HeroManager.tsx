"use client";

/**
 * HeroManager - 首页 Hero 区块管理（V0.6.1 需求3）
 *
 * - 语种选择：可滚动下拉选择器（固定 13 语种），统一驱动文本 / 按钮 / 统计卡片的编辑语种
 * - 文本配置：Hero 描述 i18n 编辑器，置于页面标题下方、背景上传模块上方
 * - 背景设置：上传图片（jpg/png/webp，≤8MB，内容哈希命名绕过 CDN 旧图）+ 透明度 / 磨砂模糊滑块
 * - 按钮组 / 统计卡片：动态增删，逐语种文字 + 链接 / 开关
 * - 操作：保存（后端清缓存）、预览（仅前端渲染，不保存）、重置（放弃未保存改动）、恢复默认 Seed（二次确认）
 *
 * 说明：文案仅 zh-CN / en-GB 预置内容，其余语种为空时前台按 i18n 兜底链回退。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Plus from "@/assets/icons/action/plus.svg";
import Trash2 from "@/assets/icons/action/trash-2.svg";
import Save from "@/assets/icons/action/save.svg";
import Upload from "@/assets/icons/action/upload.svg";
import Eye from "@/assets/icons/status/eye.svg";
import ImageIcon from "@/assets/icons/status/image.svg";
import RotateCcw from "@/assets/icons/action/rotate-ccw.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hero } from "@/components/home/Hero";
import {
  adminGetHero,
  adminResetHero,
  adminUpdateHero,
  adminUploadHeroBackground,
} from "@/lib/api/hero";
import { locales, localeDisplayName, localeFallbackChain, type Locale } from "@/lib/i18n";
import type { HeroConfig, HeroPublic, HeroTexts } from "@/types/api";

const EMPTY_TEXTS: HeroTexts = { eyebrow: "", title: "", subtitle: "", description: "" };
const MAX_STATS = 4;

/** 兜底链：自身 → 变体父语言 → 终态语言 → zh-cn / en-gb */
function chainFor(loc: string): string[] {
  return [...localeFallbackChain(loc as Locale), "zh-cn", "en-gb"];
}

/** 从 {locale: text} 按兜底链取首个非空值 */
function pick(mapping: Record<string, string> | undefined, loc: string): string {
  if (!mapping) return "";
  for (const l of chainFor(loc)) {
    const v = mapping[l];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/** 由表单当前内容构建预览用 HeroPublic（仅前端渲染，不落库、不走缓存） */
function buildPreview(cfg: HeroConfig, loc: string): HeroPublic {
  const text = (field: keyof HeroTexts) => {
    for (const l of chainFor(loc)) {
      const v = cfg.texts[l]?.[field];
      if (typeof v === "string" && v.trim()) return v;
    }
    return "";
  };
  return {
    locale: loc,
    background_url: cfg.background_url,
    background_opacity: cfg.background_opacity,
    background_blur: cfg.background_blur,
    eyebrow: text("eyebrow"),
    title: text("title"),
    subtitle: text("subtitle"),
    description: text("description"),
    buttons: cfg.buttons
      .filter((b) => b.enabled)
      .map((b) => ({
        id: b.id,
        label: pick(b.label, loc) || null,
        href: b.href,
        variant: b.variant,
        enabled: true,
      })),
    stats: cfg.stats
      .filter((s) => s.enabled)
      .map((s) => ({
        value: pick(s.value, loc) || null,
        from_value: s.from_value,
        label: pick(s.label, loc) || null,
        enabled: true,
      })),
  };
}

export function HeroManager() {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<HeroConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLoc, setActiveLoc] = useState<string>("zh-cn");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCfg(await adminGetHero());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.content.hero.saveFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adminGetHero();
        if (!cancelled) {
          setCfg(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("admin.content.hero.saveFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  /** 更新当前语种的某个文本字段 */
  function setText(field: keyof HeroTexts, value: string) {
    setCfg((prev) => {
      if (!prev) return prev;
      const cur = prev.texts[activeLoc] ?? EMPTY_TEXTS;
      return { ...prev, texts: { ...prev.texts, [activeLoc]: { ...cur, [field]: value } } };
    });
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { url } = await adminUploadHeroBackground(file);
      setCfg((prev) => (prev ? { ...prev, background_url: url } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.content.hero.saveFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await adminUpdateHero({
        background_url: cfg.background_url,
        background_opacity: cfg.background_opacity,
        background_blur: cfg.background_blur,
        texts: cfg.texts,
        buttons: cfg.buttons,
        stats: cfg.stats,
      });
      setCfg(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.content.hero.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore() {
    setSaving(true);
    setError(null);
    try {
      setCfg(await adminResetHero());
      setSaved(true);
      setResetOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.content.hero.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  if (!cfg) {
    return (
      <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
    );
  }

  const texts = cfg.texts[activeLoc] ?? EMPTY_TEXTS;
  const hasTexts = Object.values(texts).some((v) => v?.trim());

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}
      {saved && (
        <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">
          {t("admin.content.hero.saved")}
        </p>
      )}

      {/* ---------- 语种选择：滚动下拉选择器（固定 13 语种，替代原横向 Tab） ---------- */}
      <div className="flex items-center gap-2">
        <Label htmlFor="hero-locale">{t("admin.content.hero.localeLabel")}</Label>
        <Select value={activeLoc} onValueChange={setActiveLoc}>
          <SelectTrigger id="hero-locale" className="h-9 w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {locales.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {localeDisplayName(loc)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ---------- 文本配置（Hero 描述 i18n 编辑器，移至背景上传模块上方） ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.content.hero.texts")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasTexts && (
            <p className="text-xs text-amber-600 bg-amber-500/10 px-3 py-2 rounded-md">
              {t("admin.content.hero.emptyLocaleHint")}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hero-eyebrow">{t("admin.content.hero.eyebrow")}</Label>
              <Input
                id="hero-eyebrow"
                value={texts.eyebrow}
                onChange={(e) => setText("eyebrow", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-title">{t("admin.content.hero.mainTitle")}</Label>
              <Input
                id="hero-title"
                value={texts.title}
                onChange={(e) => setText("title", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-subtitle">{t("admin.content.hero.subtitle")}</Label>
            <Input
              id="hero-subtitle"
              value={texts.subtitle}
              onChange={(e) => setText("subtitle", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-description">{t("admin.content.hero.description")}</Label>
            <Textarea
              id="hero-description"
              rows={4}
              maxLength={2000}
              value={texts.description}
              onChange={(e) => setText("description", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ---------- 背景设置 ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            {t("admin.content.hero.background")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative h-32 w-full sm:w-56 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
              {cfg.background_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cfg.background_url}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ opacity: cfg.background_opacity / 100 }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground px-3 text-center">
                  {t("admin.content.hero.backgroundNone")}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {cfg.background_url
                  ? t("admin.content.hero.replaceImage")
                  : t("admin.content.hero.uploadImage")}
              </Button>
              {cfg.background_url && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCfg({ ...cfg, background_url: null })}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("admin.content.hero.removeImage")}
                </Button>
              )}
              <p className="text-xs text-muted-foreground max-w-xs">
                {t("admin.content.hero.uploadHint")}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <div className="space-y-2">
              <Label htmlFor="hero-opacity">
                {t("admin.content.hero.opacity")} · {cfg.background_opacity}%
              </Label>
              <input
                id="hero-opacity"
                type="range"
                min={0}
                max={100}
                value={cfg.background_opacity}
                onChange={(e) =>
                  setCfg({ ...cfg, background_opacity: Number(e.target.value) })
                }
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-blur">
                {t("admin.content.hero.blur")} · {cfg.background_blur}px
              </Label>
              <input
                id="hero-blur"
                type="range"
                min={0}
                max={24}
                value={cfg.background_blur}
                onChange={(e) => setCfg({ ...cfg, background_blur: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- 按钮组 ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            {t("admin.content.hero.buttons")}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setCfg({
                  ...cfg,
                  buttons: [
                    ...cfg.buttons,
                    {
                      id: `btn-${Date.now()}`,
                      label: { [activeLoc]: "" },
                      href: "/",
                      variant: "outline",
                      enabled: true,
                    },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4" />
              {t("admin.content.hero.addButton")}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cfg.buttons.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("admin.content.hero.emptyLocaleHint")}</p>
          )}
          {cfg.buttons.map((btn, idx) => (
            <div key={btn.id} className="grid gap-3 sm:grid-cols-12 items-end border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="space-y-2 sm:col-span-4">
                <Label>{t("admin.content.hero.buttonLabel")}（{localeDisplayName(activeLoc)}）</Label>
                <Input
                  value={btn.label[activeLoc] ?? ""}
                  onChange={(e) => {
                    const next = [...cfg.buttons];
                    next[idx] = { ...btn, label: { ...btn.label, [activeLoc]: e.target.value } };
                    setCfg({ ...cfg, buttons: next });
                  }}
                />
              </div>
              <div className="space-y-2 sm:col-span-4">
                <Label>{t("admin.content.hero.buttonHref")}</Label>
                <Input
                  value={btn.href}
                  onChange={(e) => {
                    const next = [...cfg.buttons];
                    next[idx] = { ...btn, href: e.target.value };
                    setCfg({ ...cfg, buttons: next });
                  }}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("admin.content.hero.buttonVariant")}</Label>
                <Select
                  value={btn.variant}
                  onValueChange={(v) => {
                    const next = [...cfg.buttons];
                    next[idx] = { ...btn, variant: v as "default" | "outline" };
                    setCfg({ ...cfg, buttons: next });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t("admin.content.hero.variantDefault")}</SelectItem>
                    <SelectItem value="outline">{t("admin.content.hero.variantOutline")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={btn.enabled}
                    onChange={(e) => {
                      const next = [...cfg.buttons];
                      next[idx] = { ...btn, enabled: e.target.checked };
                      setCfg({ ...cfg, buttons: next });
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  {t("admin.content.hero.enabled")}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    setCfg({ ...cfg, buttons: cfg.buttons.filter((_, i) => i !== idx) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---------- 统计卡片 ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>
              {t("admin.content.hero.stats")}
              <span className="block text-xs font-normal text-muted-foreground mt-1">
                {t("admin.content.hero.statsHint")}
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={cfg.stats.length >= MAX_STATS}
              onClick={() =>
                setCfg({
                  ...cfg,
                  stats: [
                    ...cfg.stats,
                    { value: { [activeLoc]: "" }, from_value: null, label: { [activeLoc]: "" }, enabled: true },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4" />
              {t("admin.content.hero.addStat")}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cfg.stats.map((stat, idx) => (
            <div key={`stat-${idx}`} className="grid gap-3 sm:grid-cols-12 items-end border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="space-y-2 sm:col-span-3">
                <Label>{t("admin.content.hero.statValue")}</Label>
                <Input
                  value={stat.value[activeLoc] ?? ""}
                  onChange={(e) => {
                    const next = [...cfg.stats];
                    next[idx] = { ...stat, value: { ...stat.value, [activeLoc]: e.target.value } };
                    setCfg({ ...cfg, stats: next });
                  }}
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label>{t("admin.content.hero.statLabel")}</Label>
                <Input
                  value={stat.label[activeLoc] ?? ""}
                  onChange={(e) => {
                    const next = [...cfg.stats];
                    next[idx] = { ...stat, label: { ...stat.label, [activeLoc]: e.target.value } };
                    setCfg({ ...cfg, stats: next });
                  }}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("admin.content.hero.statFrom")}</Label>
                <Input
                  type="number"
                  value={stat.from_value ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const next = [...cfg.stats];
                    next[idx] = { ...stat, from_value: raw === "" ? null : Number(raw) };
                    setCfg({ ...cfg, stats: next });
                  }}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stat.enabled}
                    onChange={(e) => {
                      const next = [...cfg.stats];
                      next[idx] = { ...stat, enabled: e.target.checked };
                      setCfg({ ...cfg, stats: next });
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  {t("admin.content.hero.enabled")}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setCfg({ ...cfg, stats: cfg.stats.filter((_, i) => i !== idx) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---------- 操作按钮 ---------- */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("admin.content.hero.save")}
        </Button>
        <Button variant="outline" onClick={() => setPreviewOpen(true)}>
          <Eye className="h-4 w-4" />
          {t("admin.content.hero.preview")}
        </Button>
        <Button variant="outline" onClick={() => void load()} disabled={saving}>
          <RotateCcw className="h-4 w-4" />
          {t("admin.content.hero.reset")}
        </Button>
        <Button variant="destructive" onClick={() => setResetOpen(true)} disabled={saving}>
          <RotateCcw className="h-4 w-4" />
          {t("admin.content.hero.restoreDefault")}
        </Button>
      </div>

      {/* 预览：仅前端渲染当前编辑内容 */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{t("admin.content.hero.previewTitle")}</DialogTitle>
            <DialogDescription>{t("admin.content.hero.previewNote")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto border-t border-border">
            <Hero hero={buildPreview(cfg, activeLoc)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* 恢复默认 Seed：二次确认 */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.content.hero.restoreConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("admin.content.hero.restoreConfirmDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleRestore()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
