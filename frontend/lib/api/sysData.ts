/**
 * SysData API - 对应后端 app/api/sys_data.py（Module D-0）
 *
 * 学院 / 年级 / 专业 / 班级系统基础数据：
 * - 公开列表：仅启用条目（is_disabled=0），前端表单下拉数据源（禁止硬编码学院/专业文本）
 * - 后台管理：新增 / 编辑 / 拖拽排序 / 启用禁用；无物理删除（软禁用）
 */
import { apiFetch } from "./client";
import type {
  SysClass,
  SysClassAdmin,
  SysClassCreate,
  SysClassUpdate,
  SysCollege,
  SysCollegeAdmin,
  SysCollegeCreate,
  SysCollegeUpdate,
  SysEnabledRequest,
  SysGrade,
  SysGradeAdmin,
  SysGradeCreate,
  SysGradeUpdate,
  SysMajor,
  SysMajorAdmin,
  SysMajorCreate,
  SysMajorUpdate,
  SysSortRequest,
} from "@/types/api";

/* ---------- 公开列表（表单下拉数据源） ---------- */

/** 获取全部启用的学院 */
export function listSysColleges() {
  return apiFetch<SysCollege[]>("/api/sys/college/list");
}

/** 获取全部启用的年级 */
export function listSysGrades() {
  return apiFetch<SysGrade[]>("/api/sys/grade/list");
}

/** 根据学院 ID 获取该学院下启用的专业 */
export function listSysMajors(collegeId: number) {
  return apiFetch<SysMajor[]>(`/api/sys/major/list?college_id=${collegeId}`);
}

/** 学院/年级/专业三条件联动获取班级（学校身份验证页使用） */
export function listSysClasses(collegeId: number, gradeId: number, majorId: number) {
  const qs = new URLSearchParams({
    college_id: String(collegeId),
    grade_id: String(gradeId),
    major_id: String(majorId),
  });
  return apiFetch<SysClass[]>(`/api/sys/class/list?${qs.toString()}`);
}

/* ---------- 后台管理（settings 权限） ---------- */

/* 学院 */
export function adminListSysColleges() {
  return apiFetch<SysCollegeAdmin[]>("/api/admin/sys/college/list");
}
export function adminCreateSysCollege(payload: SysCollegeCreate) {
  return apiFetch<SysCollegeAdmin>("/api/admin/sys/college", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function adminUpdateSysCollege(id: number, payload: SysCollegeUpdate) {
  return apiFetch<SysCollegeAdmin>(`/api/admin/sys/college/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function adminToggleSysCollege(id: number, payload: SysEnabledRequest) {
  return apiFetch<SysCollegeAdmin>(`/api/admin/sys/college/${id}/enabled`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
export function adminSortSysColleges(payload: SysSortRequest) {
  return apiFetch<SysCollegeAdmin[]>("/api/admin/sys/college/sort", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/* 年级 */
export function adminListSysGrades() {
  return apiFetch<SysGradeAdmin[]>("/api/admin/sys/grade/list");
}
export function adminCreateSysGrade(payload: SysGradeCreate) {
  return apiFetch<SysGradeAdmin>("/api/admin/sys/grade", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function adminUpdateSysGrade(id: number, payload: SysGradeUpdate) {
  return apiFetch<SysGradeAdmin>(`/api/admin/sys/grade/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function adminToggleSysGrade(id: number, payload: SysEnabledRequest) {
  return apiFetch<SysGradeAdmin>(`/api/admin/sys/grade/${id}/enabled`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
export function adminSortSysGrades(payload: SysSortRequest) {
  return apiFetch<SysGradeAdmin[]>("/api/admin/sys/grade/sort", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/* 专业 */
export function adminListSysMajors(collegeId?: number) {
  const qs = collegeId != null ? `?college_id=${collegeId}` : "";
  return apiFetch<SysMajorAdmin[]>(`/api/admin/sys/major/list${qs}`);
}
export function adminCreateSysMajor(payload: SysMajorCreate) {
  return apiFetch<SysMajorAdmin>("/api/admin/sys/major", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function adminUpdateSysMajor(id: number, payload: SysMajorUpdate) {
  return apiFetch<SysMajorAdmin>(`/api/admin/sys/major/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function adminToggleSysMajor(id: number, payload: SysEnabledRequest) {
  return apiFetch<SysMajorAdmin>(`/api/admin/sys/major/${id}/enabled`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
export function adminSortSysMajors(payload: SysSortRequest) {
  return apiFetch<SysMajorAdmin[]>("/api/admin/sys/major/sort", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/* 班级 */
export function adminListSysClasses(filter?: {
  college_id?: number;
  grade_id?: number;
  major_id?: number;
}) {
  const qs = new URLSearchParams();
  if (filter?.college_id != null) qs.set("college_id", String(filter.college_id));
  if (filter?.grade_id != null) qs.set("grade_id", String(filter.grade_id));
  if (filter?.major_id != null) qs.set("major_id", String(filter.major_id));
  const query = qs.toString();
  return apiFetch<SysClassAdmin[]>(`/api/admin/sys/class/list${query ? `?${query}` : ""}`);
}
export function adminCreateSysClass(payload: SysClassCreate) {
  return apiFetch<SysClassAdmin>("/api/admin/sys/class", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function adminUpdateSysClass(id: number, payload: SysClassUpdate) {
  return apiFetch<SysClassAdmin>(`/api/admin/sys/class/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function adminToggleSysClass(id: number, payload: SysEnabledRequest) {
  return apiFetch<SysClassAdmin>(`/api/admin/sys/class/${id}/enabled`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
export function adminSortSysClasses(payload: SysSortRequest) {
  return apiFetch<SysClassAdmin[]>("/api/admin/sys/class/sort", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
