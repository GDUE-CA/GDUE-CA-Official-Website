import type { Metadata } from "next";
import { ReportAuditManager } from "@/components/admin/audit/ReportAuditManager";

export const metadata: Metadata = { title: "举报审核" };

/** /admin/audit/report - 举报审核子页面（归属审核中心菜单，review.reports 权限） */
export default function AdminReportAuditPage() {
  return <ReportAuditManager />;
}
