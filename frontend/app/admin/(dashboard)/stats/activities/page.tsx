import type { Metadata } from "next";
import { StatsActivities } from "@/components/admin/stats/StatsActivities";

export const metadata: Metadata = { title: "活动报名统计" };

/** /admin/stats/activities - 活动报名统计页（页面只做组合，业务在组件内） */
export default function AdminStatsActivitiesPage() {
  return <StatsActivities />;
}
