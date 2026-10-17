import type { Metadata } from "next";
import { SystemResetPanel } from "@/components/admin/systemreset/SystemResetPanel";

export const metadata: Metadata = { title: "系统重置" };

/** /admin/system-reset - V0.5.7 高危运维：系统重置（页面只做组合，业务在组件内） */
export default function AdminSystemResetPage() {
  return <SystemResetPanel />;
}
