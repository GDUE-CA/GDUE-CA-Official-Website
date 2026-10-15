"use client";

/**
 * SchoolCascadeSelects —— 学院 → 年级 → 专业 → 班级 联动下拉（Module D 共享组件）
 *
 * - 数据全部来自 /api/sys/* 公开接口（仅启用条目），前端禁止硬编码学院/专业文本
 * - 学院/年级一次性拉取；专业随学院联动；班级需学院+年级+专业三条件
 * - 上游变更时自动清空下游选择
 */
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/setting/SearchableSelect";
import {
  listSysClasses,
  listSysColleges,
  listSysGrades,
  listSysMajors,
} from "@/lib/api/sysData";
import type { SysClass, SysCollege, SysGrade, SysMajor } from "@/types/api";

export interface SchoolCascadeValue {
  college_id: number | null;
  major_id: number | null;
  grade_id: number | null;
  class_id: number | null;
}

export const EMPTY_SCHOOL_CASCADE: SchoolCascadeValue = {
  college_id: null,
  major_id: null,
  grade_id: null,
  class_id: null,
};

interface SchoolCascadeSelectsProps {
  value: SchoolCascadeValue;
  onChange: (v: SchoolCascadeValue) => void;
  /** 是否渲染班级下拉（默认 true；社团报名表单不用班级下拉） */
  withClass?: boolean;
  disabled?: boolean;
}

function toOptions(
  items: { id: number; label: string; keywords?: string }[]
): SearchableSelectOption[] {
  return items.map((it) => ({ value: String(it.id), label: it.label, keywords: it.keywords }));
}

export function SchoolCascadeSelects({
  value,
  onChange,
  withClass = true,
  disabled = false,
}: SchoolCascadeSelectsProps) {
  const { t } = useI18n();

  const [colleges, setColleges] = useState<SysCollege[]>([]);
  const [grades, setGrades] = useState<SysGrade[]>([]);
  const [majors, setMajors] = useState<SysMajor[]>([]);
  const [classes, setClasses] = useState<SysClass[]>([]);

  // 学院 / 年级：一次性拉取
  useEffect(() => {
    listSysColleges().then(setColleges).catch(() => setColleges([]));
    listSysGrades().then(setGrades).catch(() => setGrades([]));
  }, []);

  // 专业：随学院联动
  useEffect(() => {
    setMajors([]);
    if (value.college_id == null) return;
    listSysMajors(value.college_id).then(setMajors).catch(() => setMajors([]));
  }, [value.college_id]);

  // 班级：学院+年级+专业三条件
  useEffect(() => {
    setClasses([]);
    if (!withClass) return;
    if (value.college_id == null || value.grade_id == null || value.major_id == null) return;
    listSysClasses(value.college_id, value.grade_id, value.major_id)
      .then(setClasses)
      .catch(() => setClasses([]));
  }, [withClass, value.college_id, value.grade_id, value.major_id]);

  const collegeOptions = useMemo(
    () => toOptions(colleges.map((c) => ({ id: c.id, label: c.college_name }))),
    [colleges]
  );
  const gradeOptions = useMemo(
    () => toOptions(grades.map((g) => ({ id: g.id, label: String(g.grade_year), keywords: `${g.grade_year} 级` }))),
    [grades]
  );
  const majorOptions = useMemo(
    () => toOptions(majors.map((m) => ({ id: m.id, label: m.major_name }))),
    [majors]
  );
  const classOptions = useMemo(
    () => toOptions(classes.map((c) => ({ id: c.id, label: c.display_name }))),
    [classes]
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>{t("setting.school.college")}</Label>
        <SearchableSelect
          value={value.college_id != null ? String(value.college_id) : ""}
          onChange={(v) =>
            onChange({
              college_id: v ? Number(v) : null,
              major_id: null,
              grade_id: value.grade_id,
              class_id: null,
            })
          }
          options={collegeOptions}
          placeholder={t("setting.school.collegePlaceholder")}
          disabled={disabled}
          ariaLabel={t("setting.school.college")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("setting.school.grade")}</Label>
        <SearchableSelect
          value={value.grade_id != null ? String(value.grade_id) : ""}
          onChange={(v) =>
            onChange({
              college_id: value.college_id,
              major_id: value.major_id,
              grade_id: v ? Number(v) : null,
              class_id: null,
            })
          }
          options={gradeOptions}
          placeholder={t("setting.school.gradePlaceholder")}
          disabled={disabled}
          ariaLabel={t("setting.school.grade")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("setting.school.major")}</Label>
        <SearchableSelect
          value={value.major_id != null ? String(value.major_id) : ""}
          onChange={(v) =>
            onChange({
              college_id: value.college_id,
              major_id: v ? Number(v) : null,
              grade_id: value.grade_id,
              class_id: null,
            })
          }
          options={majorOptions}
          placeholder={
            value.college_id == null ? t("setting.school.majorSelectCollegeFirst") : t("setting.school.majorPlaceholder")
          }
          disabled={disabled || value.college_id == null}
          ariaLabel={t("setting.school.major")}
        />
      </div>
      {withClass && (
        <div className="space-y-2">
          <Label>{t("setting.school.class")}</Label>
          <SearchableSelect
            value={value.class_id != null ? String(value.class_id) : ""}
            onChange={(v) =>
              onChange({
                college_id: value.college_id,
                major_id: value.major_id,
                grade_id: value.grade_id,
                class_id: v ? Number(v) : null,
              })
            }
            options={classOptions}
            placeholder={t("setting.school.classPlaceholder")}
            disabled={disabled || value.college_id == null || value.grade_id == null || value.major_id == null}
            ariaLabel={t("setting.school.class")}
          />
        </div>
      )}
    </div>
  );
}
