"use client";

/**
 * 安全问题预设题库管理（V0.5.8 §3：后台 → 内容管理 → 安全问题库）
 *
 * 完整 CRUD：新增 / 编辑 / 启用停用 / 删除；
 * 管理员录入同样触发后端黑名单过滤（422 文案直接展示）；
 * 已被用户使用的题禁止物理删除（后端 400），前端提示仅可停用。
 */
import { useEffect, useState } from "react";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import ShieldCheck from "@/assets/icons/status/shield-check.svg";
import Trash2 from "@/assets/icons/action/trash-2.svg";
import Plus from "@/assets/icons/action/plus.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminListCard } from "../shared/AdminListCard";
import { StatusBadge } from "../review/StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { useEffectivePermissions } from "@/lib/permissions";
import {
  listPresetQuestions,
  createPresetQuestion,
  updatePresetQuestion,
  deletePresetQuestion,
} from "@/lib/api/securityQuestions";
import type { AdminPresetQuestion } from "@/types/api";

/** 新增 / 编辑弹窗表单状态 */
interface FormState {
  question_zh: string;
  question_en: string;
  sort_order: number;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  question_zh: "",
  question_en: "",
  sort_order: 0,
  enabled: true,
};

export function SecurityQuestionsManager() {
  const { t } = useI18n();
  const { can } = useEffectivePermissions();
  const canManage = can("security_questions", "manage");

  const [items, setItems] = useState<AdminPresetQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPresetQuestion | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<AdminPresetQuestion | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listPresetQuestions();
      setItems(res.presets);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(item: AdminPresetQuestion) {
    setEditing(item);
    setForm({
      question_zh: item.question_zh,
      question_en: item.question_en,
      sort_order: item.sort_order,
      enabled: item.enabled,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (form.question_zh.trim().length < 2 || form.question_en.trim().length < 2) {
      setFormError(t("admin.securityQuestions.form.textRequired"));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updatePresetQuestion(editing.id, {
          question_zh: form.question_zh.trim(),
          question_en: form.question_en.trim(),
          sort_order: form.sort_order,
          enabled: form.enabled,
        });
      } else {
        await createPresetQuestion({
          question_zh: form.question_zh.trim(),
          question_en: form.question_en.trim(),
          sort_order: form.sort_order,
          enabled: form.enabled,
        });
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      // 黑名单 422 等后端文案直接展示
      setFormError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(item: AdminPresetQuestion) {
    setError(null);
    try {
      await updatePresetQuestion(item.id, { enabled: !item.enabled });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deletePresetQuestion(deleting.id);
      setDeleting(null);
      await load();
    } catch (e) {
      // 已使用题：后端 400「该问题已被用户使用，仅可停用」
      setDeleteError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.securityQuestions.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("admin.securityQuestions.desc")}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t("admin.securityQuestions.add")}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.securityQuestions.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <AdminListCard
              key={item.id}
              title={
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{item.question_zh}</span>
                </span>
              }
              badge={
                <StatusBadge tone={item.enabled ? "success" : "danger"}>
                  {item.enabled
                    ? t("admin.securityQuestions.enabled")
                    : t("admin.securityQuestions.disabled")}
                </StatusBadge>
              }
              actions={
                canManage ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                      {t("admin.securityQuestions.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleEnabled(item)}
                    >
                      {item.enabled
                        ? t("admin.securityQuestions.disable")
                        : t("admin.securityQuestions.enable")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDeleting(item);
                        setDeleteError(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("admin.securityQuestions.delete")}
                    </Button>
                  </>
                ) : undefined
              }
            >
              <div className="text-sm">
                <span className="text-muted-foreground">EN：</span>
                {item.question_en}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {t("admin.securityQuestions.colSort")}：{item.sort_order}
                </span>
                <span>
                  {t("admin.securityQuestions.colUsage")}：{item.usage_count}
                </span>
                <span>
                  {t("admin.securityQuestions.colCreatedAt")}：
                  <FormattedUserActionTime utcIso={item.created_at} />
                </span>
              </div>
            </AdminListCard>
          ))}
        </div>
      )}

      {/* 新增 / 编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("admin.securityQuestions.editTitle")
                : t("admin.securityQuestions.addTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("admin.securityQuestions.form.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sq-zh">{t("admin.securityQuestions.form.zh")}</Label>
              <Input
                id="sq-zh"
                value={form.question_zh}
                maxLength={256}
                onChange={(e) => setForm({ ...form, question_zh: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sq-en">{t("admin.securityQuestions.form.en")}</Label>
              <Input
                id="sq-en"
                value={form.question_en}
                maxLength={256}
                onChange={(e) => setForm({ ...form, question_en: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label htmlFor="sq-sort">{t("admin.securityQuestions.form.sort")}</Label>
                <Input
                  id="sq-sort"
                  type="number"
                  min={0}
                  max={9999}
                  className="w-28"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <label className="mt-7 inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="accent-primary"
                />
                {t("admin.securityQuestions.form.enabled")}
              </label>
            </div>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button disabled={saving} onClick={handleSave}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("admin.securityQuestions.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin.securityQuestions.deleteConfirm")}
            </DialogDescription>
          </DialogHeader>
          {deleting && (
            <p className="text-sm font-medium">{deleting.question_zh}</p>
          )}
          {deleting && deleting.usage_count > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("admin.securityQuestions.deleteUsedHint", {
                count: deleting.usage_count,
              })}
            </p>
          )}
          {deleteError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {deleteError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteLoading}
              onClick={handleDelete}
            >
              {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("admin.securityQuestions.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
