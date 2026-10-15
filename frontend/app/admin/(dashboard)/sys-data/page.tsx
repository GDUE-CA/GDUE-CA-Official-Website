import type { Metadata } from "next";
import { SysDataManager } from "@/components/admin/sysdata/SysDataManager";

export const metadata: Metadata = { title: "学院专业班级管理" };

/** /admin/sys-data - 学院/年级/专业/班级基础数据管理（页面只做组合，业务在组件内） */
export default function AdminSysDataPage() {
  return <SysDataManager />;
}
