"use client";

/**
 * 博客标签管理组件
 *
 * - 列表：名称 / slug / 创建时间 / 编辑删除
 * - 创建与编辑共用 Dialog 表单；slug 留空由后端自动生成（tag-{id}）
 * - 删除前确认；后端自动清理文章-标签关联
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Tags } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  adminListBlogTags,
  adminCreateBlogTag,
  adminUpdateBlogTag,
  adminDeleteBlogTag,
} from "@/lib/api/blog";
import type { BlogTag } from "@/types/api";

export function BlogTagsManager() {
  const { t } = useI18n();

  const [items, setItems] = useState<BlogTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 表单
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BlogTag | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await adminListBlogTags());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setFormError(null);
    setOpen(true);
  }

  function openEdit(tg: BlogTag) {
    setEditing(tg);
    setName(tg.name);
    setSlug(tg.slug);
    setFormError(null);
    setOpen(true);
  }

  async function handleSave() {
    setFormError(null);
    if (!name.trim()) {
      setFormError(t("admin.blog.errTagNameRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), slug: slug.trim() || undefined };
      if (editing) {
        await adminUpdateBlogTag(editing.id, payload);
      } else {
        await adminCreateBlogTag(payload);
      }
      setOpen(false);
      setNotice(t("admin.blog.saved"));
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("admin.blog.tagDeleteConfirm"))) return;
    try {
      await adminDeleteBlogTag(id);
      setNotice(t("admin.blog.deleted"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t("admin.blog.tagAddBtn")}
        </Button>
      </div>

      {notice && (
        <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">
          {notice}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tags className="h-4 w-4" />
            {items.length} {t("admin.blog.colTagName")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-8 text-center">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("admin.blog.tagEmpty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("admin.blog.colTagName")}</th>
                    <th className="px-3 py-2">{t("admin.blog.colTagSlug")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">
                      {t("admin.blog.colCreatedAt")}
                    </th>
                    <th className="px-3 py-2 text-right">{t("admin.activities.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((tg) => (
                    <tr key={tg.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{tg.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {tg.slug}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        <FormattedUserActionTime utcIso={tg.created_at} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(tg)}
                            aria-label={t("admin.blog.editBtn")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(tg.id)}
                            aria-label={t("admin.blog.deleteBtn")}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建 / 编辑弹窗 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("admin.blog.tagEditTitle") : t("admin.blog.tagAddBtn")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="blog-tag-name">{t("admin.blog.colTagName")}</Label>
              <Input
                id="blog-tag-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blog-tag-slug">{t("admin.blog.colTagSlug")}</Label>
              <Input
                id="blog-tag-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={t("admin.blog.tagSlugPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("admin.blog.tagSlugHint")}</p>
            </div>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("admin.announcements.cancelBtn")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t("admin.announcements.saveBtn")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
