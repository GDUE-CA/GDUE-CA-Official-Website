import type { Metadata } from "next";
import { StatsVisits } from "@/components/admin/stats/StatsVisits";

export const metadata: Metadata = { title: "访问统计" };

/** /admin/stats/visits - 访问统计页（页面只做组合，业务在组件内） */
export default function AdminStatsVisitsPage() {
  return <StatsVisits />;
}
