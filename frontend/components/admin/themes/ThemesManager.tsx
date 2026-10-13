"use client";

/**
 * 界面主题管理组件（对齐后端 app/api/themes.py 管理接口）
 *
 * - 列表：key / 名称 / 布局骨架 / 启停 / 排序 / 编辑 / 删除（无分页，主题为少量数据）
 * - 内置主题（default / apple）：禁用删除与停用（后端同样强制 BAD_REQUEST）
 * - 新建/编辑共用 Dialog：css_vars 与 dark_vars 以 JSON 文本编辑，保存前解析校验
 * - 「导入 JSON」：读取本地 .json 文件预填新建表单（管理员上传节日主题无需改前端代码）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Palette, Upload } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  adminListThemes,
  adminCreateTheme,
  adminUpdateTheme,
  adminDeleteTheme,
} from "@/lib/api/themes";
import { THEME_KEY_RE } from "@/lib/theme";
import type { Theme, ThemeLayout } from "@/types/api";

/** 内置主题 key：禁删、禁停（与后端一致） */
const BUILTIN_KEYS = new Set(["default", "apple"]);

/** 表单状态（css_vars / dark_vars 以 JSON 文本编辑） */
interface ThemeFormState {
  key: string;
  name: string;
  layout: ThemeLayout;
  cssVarsText: string;
  darkVarsText: string;
  enabled: boolean;
  sortOrder: string;
}

const EMPTY_FORM: ThemeFormState = {
  key: "",
  name: "",
  layout: "microsoft",
  cssVarsText: "",
  darkVarsText: "",
  enabled: true,
  sortOrder: "0",
};

type DialogState = { mode: "create" } | { mode: "edit"; theme: Theme } | null;

/** 解析 JSON 文本为 Record；空文本返回 fallback；非法 JSON 抛错 */
function parseVars(text: string, fallback: Record<string, string> | null) {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  const parsed: unknown = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("not an object");
  }
  return parsed as Record<string, string>;
}

export function ThemesManager() {
  const { t } = useI18n();

  const [items, setItems] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 新建/编辑 Dialog
  const [dialog, setDialog] = useState<DialogState>(null);
  const [form, setForm] = useState<ThemeFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 导入 JSON 文件输入
  const importRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await adminListThemes());
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
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialog({ mode: "create" });
  }

  function openEdit(theme: Theme) {
    setForm({
      key: theme.key,
      name: theme.name,
      layout: theme.layout,
      cssVarsText:
        Object.keys(theme.css_vars ?? {}).length > 0
          ? JSON.stringify(theme.css_vars, null, 2)
          : "",
      darkVarsText: theme.dark_vars ? JSON.stringify(theme.dark_vars, null, 2) : "",
      enabled: theme.enabled,
      sortOrder: String(theme.sort_order),
    });
    setFormError(null);
    setDialog({ mode: "edit", theme });
  }

  /** 导入 JSON：解析成功预填新建表单 */
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Record<string, unknown>;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        const key = typeof parsed.key === "string" ? parsed.key : "";
        const name = typeof parsed.name === "string" ? parsed.name : "";
        const layout =
          parsed.layout === "apple" || parsed.layout === "microsoft"
            ? parsed.layout
            : "microsoft";
        setForm({
          key,
          name,
          layout,
          cssVarsText:
            parsed.css_vars && typeof parsed.css_vars === "object"
              ? JSON.stringify(parsed.css_vars, null, 2)
              : "",
          darkVarsText:
            parsed.dark_vars && typeof parsed.dark_vars === "object"
              ? JSON.stringify(parsed.dark_vars, null, 2)
              : "",
          enabled: parsed.enabled !== false,
          sortOrder:
            typeof parsed.sort_order === "number" ? String(parsed.sort_order) : "0",
        });
        setFormError(null);
        setDialog({ mode: "create" });
      } catch {
        alert(t("admin.themes.errImportInvalid"));
      }
    };
    reader.readAsText(file);
  }

  async function handleSave() {
    if (!dialog) return;
    // 校验
    if (dialog.mode === "create" && !THEME_KEY_RE.test(form.key)) {
      setFormError(t("admin.themes.errKeyInvalid"));
      return;
    }
    if (!form.name.trim()) {
      setFormError(t("admin.themes.errNameRequired"));
      return;
    }
    let cssVars: Record<string, string>;
    let darkVars: Record<string, string> | null;
    try {
      cssVars = parseVars(form.cssVarsText, {}) ?? {};
      darkVars = parseVars(form.darkVarsText, null);
    } catch {
      setFormError(t("admin.themes.errJsonInvalid"));
      return;
    }
    const sortOrder = Number.parseInt(form.sortOrder, 10);

    setSaving(true);
    setFormError(null);
    try {
      if (dialog.mode === "create") {
        await adminCreateTheme({
          key: form.key,
          name: form.name.trim(),
          layout: form.layout,
          css_vars: cssVars,
          dark_vars: darkVars,
          enabled: form.enabled,
          sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
        });
      } else {
        await adminUpdateTheme(dialog.theme.id, {
          name: form.name.trim(),
          layout: form.layout,
          css_vars: cssVars,
          dark_vars: darkVars,
          enabled: form.enabled,
          sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
        });
      }
      setDialog(null);
      setNotice(t("admin.themes.saved"));
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(theme: Theme, enabled: boolean) {
    try {
      await adminUpdateTheme(theme.id, { enabled });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function handleDelete(theme: Theme) {
    if (!confirm(t("admin.themes.deleteConfirm", { name: theme.name }))) return;
    try {
      await adminDeleteTheme(theme.id);
      setNotice(t("admin.themes.deleted"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function layoutLabel(layout: ThemeLayout) {
    return layout === "apple"
      ? t("admin.themes.layoutApple")
      : t("admin.themes.layoutMicrosoft");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />
        <Button variant="outline" onClick={() => importRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1.5" />
          {t("admin.themes.importBtn")}
        </Button>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t("admin.themes.newBtn")}
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
            <Palette className="h-4 w-4" />
            {items.length} {t("admin.themes.colName")}
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
              {t("admin.themes.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("admin.themes.colKey")}</th>
                    <th className="px-3 py-2">{t("admin.themes.colName")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">
                      {t("admin.themes.colLayout")}
                    </th>
                    <th className="px-3 py-2">{t("admin.themes.colEnabled")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">
                      {t("admin.themes.colSort")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("admin.themes.colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((th) => {
                    const builtin = BUILTIN_KEYS.has(th.key);
                    return (
                      <tr key={th.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">
                          {th.key}
                          {builtin && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-sans">
                              {t("admin.themes.builtin")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium max-w-[200px]">
                          <div className="truncate">{th.name}</div>
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          {layoutLabel(th.layout)}
                        </td>
                        <td className="px-3 py-2">
                          {/* 无 Switch 组件：原生 checkbox + accent-primary（与全站一致） */}
                          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="size-4 rounded accent-primary cursor-pointer disabled:cursor-not-allowed"
                              checked={th.enabled}
                              disabled={builtin}
                              onChange={(e) => handleToggleEnabled(th, e.target.checked)}
                            />
                            {th.enabled ? t("common.enabled") : t("common.disabled")}
                          </label>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                          {th.sort_order}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(th)}
                              aria-label={t("admin.themes.editBtn")}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={builtin}
                              onClick={() => handleDelete(th)}
                              aria-label={t("admin.themes.deleteBtn")}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新建/编辑 Dialog */}
      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit"
                ? t("admin.themes.editTitle")
                : t("admin.themes.newTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="theme-key">{t("admin.themes.fieldKey")}</Label>
                <Input
                  id="theme-key"
                  value={form.key}
                  disabled={dialog?.mode === "edit"}
                  placeholder={t("admin.themes.keyPlaceholder")}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="theme-name">{t("admin.themes.fieldName")}</Label>
                <Input
                  id="theme-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("admin.themes.fieldLayout")}</Label>
                <Select
                  value={form.layout}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, layout: v as ThemeLayout }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="microsoft">
                      {t("admin.themes.layoutMicrosoft")}
                    </SelectItem>
                    <SelectItem value="apple">{t("admin.themes.layoutApple")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="theme-sort">{t("admin.themes.fieldSort")}</Label>
                <Input
                  id="theme-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="theme-css-vars">{t("admin.themes.fieldCssVars")}</Label>
              <Textarea
                id="theme-css-vars"
                rows={5}
                className="font-mono text-xs"
                placeholder='{"--radius": "1rem"}'
                value={form.cssVarsText}
                onChange={(e) => setForm((f) => ({ ...f, cssVarsText: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="theme-dark-vars">{t("admin.themes.fieldDarkVars")}</Label>
              <Textarea
                id="theme-dark-vars"
                rows={5}
                className="font-mono text-xs"
                placeholder='{"--background": "240 6% 5%"}'
                value={form.darkVarsText}
                onChange={(e) => setForm((f) => ({ ...f, darkVarsText: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.themes.cssVarsHint")}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                className="size-4 rounded accent-primary cursor-pointer"
                checked={form.enabled}
                disabled={dialog?.mode === "edit" && BUILTIN_KEYS.has(dialog.theme.key)}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              {t("admin.themes.fieldEnabled")}
            </label>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialog(null)} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
