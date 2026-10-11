"use client";

/**
 * 项目编辑器（新建 / 编辑共用，对齐 BlogEditor 交互模式）
 *
 * - @uiw/react-md-editor Markdown 编辑器（dynamic import 规避 SSR window 访问）
 * - 元信息：标题 / slug（留空后端自动生成 project-{id}）/ 短描述 / 年份 /
 *   负责人 / 技术栈标签（Enter 添加） / GitHub / Demo 链接
 * - 截图多图上传（复用媒体资源接口 category="cover"，/uploads 同源反代）
 * - 状态流转：draft（草稿）/ published（发布，前台可见）/ archived（下架）
 */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ImageIcon,
  Upload,
  X,
  ArrowLeft,
  Plus,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  adminGetProject,
  adminCreateProject,
  adminUpdateProject,
} from "@/lib/api/projects";
import { adminUploadMedia } from "@/lib/api/media";
import type { Project, ProjectStatus } from "@/types/api";
import "@uiw/react-md-editor/markdown-editor.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] flex items-center justify-center text-muted-foreground border rounded-md">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
});

const STATUSES: ProjectStatus[] = ["draft", "published", "archived"];

export function ProjectEditor({ projectId }: { projectId?: number }) {
  const { t } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(!!projectId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Project | null>(null);

  // 表单字段
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [mdValue, setMdValue] = useState("");
  const [techStack, setTechStack] = useState<string[]>([]);
  const [techInput, setTechInput] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [leader, setLeader] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("draft");

  const [uploadingShot, setUploadingShot] = useState(false);
  const shotInputRef = useRef<HTMLInputElement | null>(null);
  // 编辑器配色跟随全站主题（挂载时读取，避免与暗色模式冲突）
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains("dark"));
  }, []);

  // 编辑模式：加载既有项目
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    adminGetProject(projectId)
      .then((p) => {
        if (cancelled) return;
        setExisting(p);
        setTitle(p.title);
        setSlug(p.slug);
        setDescription(p.description ?? "");
        setMdValue(p.content_md ?? "");
        setTechStack(p.tech_stack ?? []);
        setGithubUrl(p.github_url ?? "");
        setDemoUrl(p.demo_url ?? "");
        setScreenshots(p.screenshots ?? []);
        setYear(String(p.year));
        setLeader(p.leader ?? "");
        setStatus(p.status);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /** 技术栈标签：Enter 添加，重复忽略 */
  function addTech() {
    const v = techInput.trim();
    if (!v) return;
    setTechStack((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setTechInput("");
  }

  function removeTech(v: string) {
    setTechStack((prev) => prev.filter((x) => x !== v));
  }

  /** 上传截图（媒体资源接口，category=cover；返回 /uploads/... 同源路径） */
  async function handleUploadShot(file: File | null) {
    if (!file) return;
    setUploadingShot(true);
    try {
      const mf = await adminUploadMedia(file, "cover");
      setScreenshots((prev) => [...prev, mf.storage_path]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingShot(false);
    }
  }

  async function handleSave() {
    setFormError(null);
    const yearNum = Number(year);
    if (!title.trim()) {
      setFormError(t("admin.projects.errTitleRequired"));
      return;
    }
    if (!mdValue.trim()) {
      setFormError(t("admin.projects.errContentRequired"));
      return;
    }
    if (
      year === "" ||
      !Number.isInteger(yearNum) ||
      yearNum < 1900 ||
      yearNum > 3000
    ) {
      setFormError(t("admin.projects.errYearInvalid"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        content_md: mdValue,
        tech_stack: techStack,
        github_url: githubUrl.trim() || undefined,
        demo_url: demoUrl.trim() || undefined,
        screenshots,
        year: yearNum,
        leader: leader.trim() || undefined,
        status,
      };
      if (existing) {
        await adminUpdateProject(existing.id, payload);
      } else {
        await adminCreateProject(payload);
      }
      router.push("/admin/projects");
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
        <Button variant="ghost" onClick={() => router.push("/admin/projects")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {t("admin.projects.backToList")}
        </Button>
        <div className="flex items-center gap-3">
          {existing && (
            <span className="text-xs text-muted-foreground">
              {t("admin.projects.updatedAt")}：
              <FormattedUserActionTime utcIso={existing.updated_at} />
            </span>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t("admin.projects.saveBtn")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 左：编辑器 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.projects.colContent")}</CardTitle>
          </CardHeader>
          <CardContent data-color-mode={darkMode ? "dark" : "light"}>
            <MDEditor
              value={mdValue}
              onChange={(v) => setMdValue(v ?? "")}
              height={520}
            />
            <p className="text-xs text-muted-foreground mt-2">
              {t("admin.projects.contentHint")}
            </p>
          </CardContent>
        </Card>

        {/* 右：元信息 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.projects.metaTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-title">{t("admin.projects.colTitle")}</Label>
                <Input
                  id="project-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-slug">{t("admin.projects.colSlug")}</Label>
                <Input
                  id="project-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={t("admin.projects.slugPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-desc">{t("admin.projects.colDesc")}</Label>
                <Textarea
                  id="project-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("admin.projects.descPlaceholder")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="project-year">{t("admin.projects.colYear")}</Label>
                  <Input
                    id="project-year"
                    type="number"
                    min={1900}
                    max={3000}
                    step={1}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-leader">{t("admin.projects.colLeader")}</Label>
                  <Input
                    id="project-leader"
                    value={leader}
                    onChange={(e) => setLeader(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-tech">{t("admin.projects.colTech")}</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="project-tech"
                    value={techInput}
                    onChange={(e) => setTechInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTech();
                      }
                    }}
                    placeholder={t("admin.projects.techPlaceholder")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addTech}
                    aria-label={t("admin.projects.techAdd")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {techStack.map((ts) => (
                      <span
                        key={ts}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground"
                      >
                        {ts}
                        <button
                          type="button"
                          onClick={() => removeTech(ts)}
                          aria-label={`${t("admin.projects.techRemove")} ${ts}`}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-github">GitHub</Label>
                <Input
                  id="project-github"
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-demo">{t("admin.projects.colDemo")}</Label>
                <Input
                  id="project-demo"
                  type="url"
                  value={demoUrl}
                  onChange={(e) => setDemoUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.projects.publishTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-status">{t("admin.projects.colStatus")}</Label>
                <select
                  id="project-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(
                        s === "draft"
                          ? "admin.projects.statusDraft"
                          : s === "published"
                            ? "admin.projects.statusPublished"
                            : "admin.projects.statusArchived"
                      )}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("admin.projects.colScreenshots")}</Label>
                {screenshots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {screenshots.map((url, i) => (
                      <div key={`${url}-${i}`} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`screenshot-${i + 1}`}
                          className="w-full h-16 object-cover rounded-md border border-border"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setScreenshots((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80 border border-border flex items-center justify-center"
                          aria-label={t("admin.projects.removeScreenshot")}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={shotInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    handleUploadShot(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingShot}
                  onClick={() => shotInputRef.current?.click()}
                >
                  {uploadingShot ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1.5" />
                  )}
                  {t("admin.projects.uploadScreenshot")}
                </Button>
              </div>
              {formError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {formError}
                </p>
              )}
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t("admin.projects.saveBtn")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
