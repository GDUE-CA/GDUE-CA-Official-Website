import type { Metadata } from "next";
import { AuditLogsManager } from "@/components/admin/audit/AuditLogsManager";

export const metadata: Metadata = { title: "操作日志" };

/** /admin/audit-logs - 操作日志检索页（页面只做组合，业务在组件内） */
export default function AdminAuditLogsPage() {
  return <AuditLogsManager />;
}
