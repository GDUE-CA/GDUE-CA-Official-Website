"use client";

/**
 * SysDataManager —— 后台系统基础数据管理（Module D-0，/admin/sys-data）
 *
 * 四个 Tab：学院 / 年级 / 专业 / 班级。
 * 能力：新增、编辑、上移/下移排序（调 sort API）、启用/禁用；
 * **不提供物理删除**（存在业务引用禁止删除，仅软禁用 is_disabled）。
 * 专业归属学院；班级关联学院/年级/专业。全部下拉数据来自后台列表 API。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import ArrowDown from "@/assets/icons/navigation/arrow-down.svg";
import ArrowUp from "@/assets/icons/navigation/arrow-up.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Pencil from "@/assets/icons/action/pencil.svg";
import Plus from "@/assets/icons/action/plus.svg";
import RefreshCw from "@/assets/icons/action/refresh-cw.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdminListCard } from "@/components/admin/shared/AdminListCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminCreateSysClass,
  adminCreateSysCollege,
  adminCreateSysGrade,
  adminCreateSysMajor,
  adminListSysClasses,
  adminListSysColleges,
  adminListSysGrades,
  adminListSysMajors,
  adminSortSysClasses,
  adminSortSysColleges,
  adminSortSysGrades,
  adminSortSysMajors,
  adminToggleSysClass,
  adminToggleSysCollege,
  adminToggleSysGrade,
  adminToggleSysMajor,
  adminUpdateSysClass,
  adminUpdateSysCollege,
  adminUpdateSysGrade,
  adminUpdateSysMajor,
} from "@/lib/api/sysData";
import type {
  SysClassAdmin,
  SysCollegeAdmin,
  SysGradeAdmin,
  SysMajorAdmin,
} from "@/types/api";
import { cn } from "@/lib/utils";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

type SysTab = "college" | "grade" | "major" | "class";
const TABS: SysTab[] = ["college", "grade", "major", "class"];

/** 行的统一视图（四类实体字段归一化展示） */
interface RowView {
  id: number;
  title: string;
  subtitle: string;
  is_disabled: boolean;
  sort_order: number;
}

/** 后端请求体字段名（学院/年级/专业/班级四类对话框共用一个 hook，data-field 对位） */
type SysDataField =
  | "college_name" | "grade_year" | "major_name" | "display_name"
  | "class_suffix" | "college_id" | "grade_id" | "major_id";

export function SysDataManager() {
  const { t } = useI18n();
  const [tab, setTab] = useState<SysTab>("college");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useServerFieldErrors<SysDataField>({ fallback: t("common.error") });
  const fe = fieldErrors.errors;
  const [busyId, setBusyId] = useState<number | null>(null);

  const [colleges, setColleges] = useState<SysCollegeAdmin[]>([]);
  const [grades, setGrades] = useState<SysGradeAdmin[]>([]);
  const [majors, setMajors] = useState<SysMajorAdmin[]>([]);
  const [classes, setClasses] = useState<SysClassAdmin[]>([]);

  // 编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null); // null = 新增
  const [formName, setFormName] = useState("");
  const [formYear, setFormYear] = useState("");
  const [formCollegeId, setFormCollegeId] = useState("");
  const [formGradeId, setFormGradeId] = useState("");
  const [formMajorId, setFormMajorId] = useState("");
  const [formSuffix, setFormSuffix] = useState("");
  const [saving, setSaving] = useState(false);

  const nameOfCollege = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of colleges) m.set(c.id, c.college_name);
    return m;
  }, [colleges]);
  const nameOfGrade = useMemo(() => {
    const m = new Map<number, number>();
    for (const g of grades) m.set(g.id, g.grade_year);
    return m;
  }, [grades]);
  const nameOfMajor = useMemo(() => {
    const m = new Map<number, string>();
    for (const x of majors) m.set(x.id, x.major_name);
    return m;
  }, [majors]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, g, m, cl] = await Promise.all([
        adminListSysColleges(),
        adminListSysGrades(),
        adminListSysMajors(),
        adminListSysClasses(),
      ]);
      setColleges(c);
      setGrades(g);
      setMajors(m);
      setClasses(cl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  /** 当前 Tab 的归一化行 */
  const rows: RowView[] = useMemo(() => {
    if (tab === "college") {
      return colleges.map((c) => ({
        id: c.id,
        title: c.college_name,
        subtitle: "",
        is_disabled: c.is_disabled,
        sort_order: c.sort_order,
      }));
    }
    if (tab === "grade") {
      return grades.map((g) => ({
        id: g.id,
        title: String(g.grade_year),
        subtitle: "",
        is_disabled: g.is_disabled,
        sort_order: g.sort_order,
      }));
    }
    if (tab === "major") {
      return majors.map((m) => ({
        id: m.id,
        title: m.major_name,
        subtitle: nameOfCollege.get(m.college_id) ?? "-",
        is_disabled: m.is_disabled,
        sort_order: m.sort_order,
      }));
    }
    return classes.map((c) => ({
      id: c.id,
      title: c.display_name,
      subtitle: [
        c.college_id != null ? nameOfCollege.get(c.college_id) : null,
        c.grade_id != null ? nameOfGrade.get(c.grade_id) : null,
        c.major_id != null ? nameOfMajor.get(c.major_id) : null,
        c.class_suffix,
      ]
        .filter(Boolean)
        .join(" / "),
      is_disabled: c.is_disabled,
      sort_order: c.sort_order,
    }));
  }, [tab, colleges, grades, majors, classes, nameOfCollege, nameOfGrade, nameOfMajor]);

  function openCreate() {
    setEditId(null);
    setFormName("");
    setFormYear("");
    setFormCollegeId("");
    setFormGradeId("");
    setFormMajorId("");
    setFormSuffix("");
    fieldErrors.clear();
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(r: RowView) {
    setEditId(r.id);
    setFormName(tab === "college" || tab === "major" || tab === "class" ? r.title : "");
    setFormYear(tab === "grade" ? r.title : "");
    if (tab === "major") {
      const row = majors.find((m) => m.id === r.id);
      setFormCollegeId(row ? String(row.college_id) : "");
    } else if (tab === "class") {
      const row = classes.find((c) => c.id === r.id);
      setFormCollegeId(row?.college_id != null ? String(row.college_id) : "");
      setFormGradeId(row?.grade_id != null ? String(row.grade_id) : "");
      setFormMajorId(row?.major_id != null ? String(row.major_id) : "");
      setFormSuffix(row?.class_suffix ?? "");
    }
    fieldErrors.clear();
    setError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (tab === "college") {
        const name = formName.trim();
        if (!name) throw new Error(t("admin.sysdata.nameRequired"));
        if (editId == null) await adminCreateSysCollege({ college_name: name });
        else await adminUpdateSysCollege(editId, { college_name: name });
      } else if (tab === "grade") {
        const y = Number.parseInt(formYear, 10);
        if (!Number.isInteger(y) || y < 1900 || y > 2999) throw new Error(t("admin.sysdata.yearInvalid"));
        if (editId == null) await adminCreateSysGrade({ grade_year: y });
        else await adminUpdateSysGrade(editId, { grade_year: y });
      } else if (tab === "major") {
        const name = formName.trim();
        if (!formCollegeId) throw new Error(t("admin.sysdata.collegeRequired"));
        if (!name) throw new Error(t("admin.sysdata.nameRequired"));
        const college_id = Number.parseInt(formCollegeId, 10);
        if (editId == null) await adminCreateSysMajor({ college_id, major_name: name });
        else await adminUpdateSysMajor(editId, { college_id, major_name: name });
      } else {
        const name = formName.trim();
        if (!name) throw new Error(t("admin.sysdata.nameRequired"));
        const payload = {
          display_name: name,
          college_id: formCollegeId ? Number.parseInt(formCollegeId, 10) : null,
          grade_id: formGradeId ? Number.parseInt(formGradeId, 10) : null,
          major_id: formMajorId ? Number.parseInt(formMajorId, 10) : null,
          class_suffix: formSuffix.trim() ? formSuffix.trim().toUpperCase() : null,
        };
        if (editId == null) await adminCreateSysClass(payload);
        else await adminUpdateSysClass(editId, payload);
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      setError(fieldErrors.capture(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(r: RowView) {
    setBusyId(r.id);
    setError(null);
    try {
      const next = !r.is_disabled;
      if (tab === "college") await adminToggleSysCollege(r.id, { is_disabled: next });
      else if (tab === "grade") await adminToggleSysGrade(r.id, { is_disabled: next });
      else if (tab === "major") await adminToggleSysMajor(r.id, { is_disabled: next });
      else await adminToggleSysClass(r.id, { is_disabled: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  /** 上移/下移：交换后按新顺序整体提交 sort API */
  async function handleMove(r: RowView, dir: -1 | 1) {
    const idx = rows.findIndex((x) => x.id === r.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= rows.length) return;
    const ids = rows.map((x) => x.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    setBusyId(r.id);
    setError(null);
    try {
      if (tab === "college") await adminSortSysColleges({ ids });
      else if (tab === "grade") await adminSortSysGrades({ ids });
      else if (tab === "major") await adminSortSysMajors({ ids });
      else await adminSortSysClasses({ ids });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  const collegeOptions = colleges.map((c) => ({
    value: String(c.id),
    label: c.college_name,
  }));
  const gradeOptions = grades.map((g) => ({
    value: String(g.id),
    label: String(g.grade_year),
  }));
  const majorOptions = majors
    .filter((m) => !formCollegeId || String(m.college_id) === formCollegeId)
    .map((m) => ({ value: String(m.id), label: m.major_name }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.sysdata.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.sysdata.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh")}
        </Button>
      </div>

      {/* Tab 切换 + 新增 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-input overflow-hidden">
          {TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={`px-4 h-9 text-sm transition-colors ${
                tab === s ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"
              }`}
            >
              {t(`admin.sysdata.tab.${s}`)}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t("admin.sysdata.create")}
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* 桌面端：保持原分隔列表布局（V0.5.7 PC 零变化） */}
          <div className="hidden md:block divide-y divide-border rounded-md border border-border bg-background">
            {rows.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("admin.sysdata.empty")}
              </p>
            )}
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={i === 0 || busyId === r.id}
                    onClick={() => handleMove(r, -1)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    aria-label={t("admin.sysdata.moveUp")}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === rows.length - 1 || busyId === r.id}
                    onClick={() => handleMove(r, 1)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    aria-label={t("admin.sysdata.moveDown")}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.title}
                    {r.is_disabled && (
                      <Badge variant="secondary" className="ml-2">
                        {t("admin.sysdata.disabled")}
                      </Badge>
                    )}
                  </p>
                  {r.subtitle && (
                    <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === r.id}
                  onClick={() => handleToggle(r)}
                >
                  {r.is_disabled ? t("admin.sysdata.enable") : t("admin.sysdata.disable")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
                </Button>
              </div>
            ))}
          </div>

          {/* 移动端：卡片式布局（V0.5.7，无横向滚动，功能完整保留） */}
          <div className="md:hidden space-y-3">
            {rows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("admin.sysdata.empty")}
              </p>
            )}
            {rows.map((r) => (
              <AdminListCard
                key={r.id}
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate">{r.title}</span>
                    {r.is_disabled && (
                      <Badge variant="secondary" className="shrink-0">
                        {t("admin.sysdata.disabled")}
                      </Badge>
                    )}
                  </span>
                }
                meta={r.subtitle || undefined}
                footerClassName="gap-1.5"
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => handleMove(r, -1)}
                      aria-label={t("admin.sysdata.moveUp")}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => handleMove(r, 1)}
                      aria-label={t("admin.sysdata.moveDown")}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => handleToggle(r)}
                    >
                      {r.is_disabled ? t("admin.sysdata.enable") : t("admin.sysdata.disable")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                      {t("common.edit")}
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t("admin.sysdata.noDeleteHint")}</p>

      {/* 新增 / 编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent {...fieldErrors.rootProps}>
          <DialogHeader>
            <DialogTitle>
              {editId == null ? t("admin.sysdata.create") : t("admin.sysdata.edit")}
              {"　"}
              {t(`admin.sysdata.tab.${tab}`)}
            </DialogTitle>
            <DialogDescription>{t("admin.sysdata.dialogHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {tab === "college" && (
              <div className="space-y-2" data-field="college_name">
                <Label htmlFor="sd-name">{t("admin.sysdata.collegeName")}</Label>
                <Input
                  id="sd-name"
                  aria-invalid={!!fe.college_name}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={128}
                />
                <FieldError>{fe.college_name}</FieldError>
              </div>
            )}
            {tab === "grade" && (
              <div className="space-y-2" data-field="grade_year">
                <Label htmlFor="sd-year">{t("admin.sysdata.gradeYear")}</Label>
                <Input
                  id="sd-year"
                  aria-invalid={!!fe.grade_year}
                  value={formYear}
                  onChange={(e) => setFormYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="2026"
                />
                <FieldError>{fe.grade_year}</FieldError>
              </div>
            )}
            {tab === "major" && (
              <>
                <div className="space-y-2">
                  <Label>{t("admin.sysdata.belongCollege")}</Label>
                  <select
                    value={formCollegeId}
                    onChange={(e) => setFormCollegeId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t("admin.sysdata.selectCollege")}</option>
                    {collegeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2" data-field="major_name">
                  <Label htmlFor="sd-major-name">{t("admin.sysdata.majorName")}</Label>
                  <Input
                    id="sd-major-name"
                    aria-invalid={!!fe.major_name}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    maxLength={128}
                  />
                  <FieldError>{fe.major_name}</FieldError>
                </div>
              </>
            )}
            {tab === "class" && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t("admin.sysdata.belongCollege")}</Label>
                    <select
                      value={formCollegeId}
                      onChange={(e) => {
                        setFormCollegeId(e.target.value);
                        setFormMajorId("");
                      }}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{t("admin.sysdata.selectCollege")}</option>
                      {collegeOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin.sysdata.belongGrade")}</Label>
                    <select
                      value={formGradeId}
                      onChange={(e) => setFormGradeId(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{t("admin.sysdata.selectGrade")}</option>
                      {gradeOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin.sysdata.belongMajor")}</Label>
                    <select
                      value={formMajorId}
                      onChange={(e) => setFormMajorId(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{t("admin.sysdata.selectMajor")}</option>
                      {majorOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2" data-field="display_name">
                    <Label htmlFor="sd-class-name">{t("admin.sysdata.classDisplayName")}</Label>
                    <Input
                      id="sd-class-name"
                      aria-invalid={!!fe.display_name}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      maxLength={128}
                    />
                    <FieldError>{fe.display_name}</FieldError>
                  </div>
                  <div className="space-y-2" data-field="class_suffix">
                    <Label htmlFor="sd-suffix">{t("admin.sysdata.classSuffix")}</Label>
                    <Input
                      id="sd-suffix"
                      aria-invalid={!!fe.class_suffix}
                      value={formSuffix}
                      onChange={(e) => setFormSuffix(e.target.value.toUpperCase().slice(0, 8))}
                      maxLength={8}
                      placeholder="A"
                    />
                    <FieldError>{fe.class_suffix}</FieldError>
                  </div>
                </div>
              </>
            )}

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className={cn("h-4 w-4 animate-spin")} />}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
