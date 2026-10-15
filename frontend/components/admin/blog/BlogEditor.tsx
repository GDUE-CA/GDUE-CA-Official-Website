"use client";

/**
 * 博客文章编辑器（新建 / 编辑共用）
 *
 * - @uiw/react-md-editor Markdown 编辑器（dynamic import 规避 SSR window 访问）
 * - 状态流转：草稿 / 发布 / 定时发布（scheduled_at 未来时间）/ 下架归档
 * - 封面与编辑器内嵌图片上传（后端仅无损压缩 ≤ 原体积 80%）
 * - 标签多选（toggle 按钮）；slug 留空由后端自动生成
 * - 时间输入用 datetime-local（浏览器本地时区），提交时转 UTC ISO；
 *   回填时把后端 UTC 字符串转为本地时间再填入，避免时区错位
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import ImageIcon from "@/assets/icons/status/image-icon.svg";
import Upload from "@/assets/icons/action/upload.svg";
import X from "@/assets/icons/action/x.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { utcToLocalInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  adminGetBlogPost,
  adminCreateBlogPost,
  adminUpdateBlogPost,
  adminListBlogTags,
  adminUploadBlogImage,
} from "@/lib/api/blog";
import type { BlogPost, BlogPostStatus, BlogTag } from "@/types/api";
import "@uiw/react-md-editor/markdown-editor.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] flex items-center justify-center text-muted-foreground border rounded-md">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
});

export function BlogEditor({ postId }: { postId?: number }) {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();

  const [loading, setLoading] = useState(!!postId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [existing, setExisting] = useState<BlogPost | null>(null);

  // 表单字段
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [mdValue, setMdValue] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [status, setStatus] = useState<BlogPostStatus>("draft");
  const [scheduledAt, setScheduledAt] = useState(""); // datetime-local（本地时区）
  const [allowComments, setAllowComments] = useState(true);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  // 上传状态
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  // 编辑器配色跟随全站主题（挂载时读取，避免与暗色模式冲突）
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    adminListBlogTags()
      .then(setTags)
      .catch(() => setTags([]));
  }, []);

  // 编辑模式：加载既有文章
  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    adminGetBlogPost(postId)
      .then((p) => {
        if (cancelled) return;
        setExisting(p);
        setTitle(p.title);
        setSlug(p.slug);
        setMdValue(p.content_md);
        setExcerpt(p.excerpt ?? "");
        setCoverUrl(p.cover_url ?? "");
        setStatus(p.status);
        setScheduledAt(p.scheduled_at ? utcToLocalInput(p.scheduled_at) : "");
        setAllowComments(p.allow_comments);
        setSelectedTagIds(p.tags.map((tg) => tg.id));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const toggleTag = useCallback((id: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  /** 上传文件（封面 / 内嵌图片共用后端接口） */
  async function uploadFile(file: File): Promise<string | null> {
    try {
      const res = await adminUploadBlogImage(file);
      return res.url;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
      return null;
    }
  }

  async function handleCoverChange(file: File | null) {
    if (!file) return;
    setUploadingCover(true);
    const url = await uploadFile(file);
    if (url) setCoverUrl(url);
    setUploadingCover(false);
  }

  /** 编辑器内嵌图片：上传成功后追加 Markdown 图片语法到文末 */
  async function handleInsertImage(file: File | null) {
    if (!file) return;
    setUploadingImage(true);
    const url = await uploadFile(file);
    if (url) {
      setMdValue((prev) => `${prev}${prev.endsWith("\n") || !prev ? "" : "\n"}![${file.name}](${url})\n`);
    }
    setUploadingImage(false);
  }

  async function handleSave() {
    setFormError(null);
    if (!title.trim()) {
      setFormError(t("admin.blog.errTitleRequired"));
      return;
    }
    if (!mdValue.trim()) {
      setFormError(t("admin.blog.errContentRequired"));
      return;
    }
    if (status === "scheduled" && !scheduledAt) {
      setFormError(t("admin.blog.errScheduledAtRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        content_md: mdValue,
        excerpt: excerpt.trim() || undefined,
        cover_url: coverUrl || undefined,
        status,
        // datetime-local 为浏览器本地时间，转 UTC ISO 提交
        scheduled_at:
          status === "scheduled" && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : undefined,
        allow_comments: allowComments,
        tag_ids: selectedTagIds,
      };
      if (existing) {
        await adminUpdateBlogPost(existing.id, payload);
      } else {
        await adminCreateBlogPost(payload);
      }
      router.push(lp("/admin/blog"));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || error) {
    return (
      <Card>
        <CardContent className="py-10">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={() => router.push(lp("/admin/blog"))}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {t("admin.blog.backToList")}
        </Button>
        <div className="flex items-center gap-3">
          {existing && (
            <span className="text-xs text-muted-foreground">
              {t("admin.blog.updatedAt")}：
              <FormattedUserActionTime utcIso={existing.updated_at} />
            </span>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t("admin.blog.saveBtn")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 左：编辑器 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.blog.colContent")}</CardTitle>
          </CardHeader>
          <CardContent data-color-mode={darkMode ? "dark" : "light"}>
            <MDEditor
              value={mdValue}
              onChange={(v) => setMdValue(v ?? "")}
              height={520}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                handleInsertImage(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={uploadingImage}
              onClick={() => imageInputRef.current?.click()}
            >
              {uploadingImage ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <ImageIcon className="h-4 w-4 mr-1.5" />
              )}
              {t("admin.blog.insertImage")}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              {t("admin.blog.imageHint")}
            </p>
          </CardContent>
        </Card>

        {/* 右：元信息 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.blog.metaTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="blog-title">{t("admin.blog.colTitle")}</Label>
                <Input
                  id="blog-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-slug">{t("admin.blog.colSlug")}</Label>
                <Input
                  id="blog-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={t("admin.blog.slugPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-excerpt">{t("admin.blog.colExcerpt")}</Label>
                <Textarea
                  id="blog-excerpt"
                  rows={3}
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("admin.blog.colCover")}</Label>
                {coverUrl ? (
                  <div className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={coverUrl}
                      alt="cover"
                      className="w-full h-32 object-cover rounded-md border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setCoverUrl("")}
                      className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-background/80 border border-border flex items-center justify-center"
                      aria-label={t("admin.blog.removeCover")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingCover}
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {uploadingCover ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1.5" />
                    )}
                    {t("admin.blog.uploadCover")}
                  </Button>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    handleCoverChange(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.blog.publishTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="blog-status">{t("admin.blog.colStatus")}</Label>
                <select
                  id="blog-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as BlogPostStatus)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="draft">{t("admin.blog.statusDraft")}</option>
                  <option value="published">{t("admin.blog.statusPublished")}</option>
                  <option value="scheduled">{t("admin.blog.statusScheduled")}</option>
                  <option value="archived">{t("admin.blog.statusArchived")}</option>
                </select>
              </div>
              {status === "scheduled" && (
                <div className="space-y-2">
                  <Label htmlFor="blog-scheduled">{t("admin.blog.colScheduledAt")}</Label>
                  <Input
                    id="blog-scheduled"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("admin.blog.scheduledHint")}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("admin.blog.colTags")}</Label>
                {tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("admin.blog.noTags")}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tg) => (
                      <button
                        key={tg.id}
                        type="button"
                        onClick={() => toggleTag(tg.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          selectedTagIds.includes(tg.id)
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {tg.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowComments}
                  onChange={(e) => setAllowComments(e.target.checked)}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
                {t("admin.blog.allowComments")}
              </label>
              {formError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {formError}
                </p>
              )}
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t("admin.blog.saveBtn")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
