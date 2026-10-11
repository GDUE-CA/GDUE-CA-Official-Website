import type { Metadata } from "next";
import { StatsRecruitment } from "@/components/admin/stats/StatsRecruitment";

export const metadata: Metadata = { title: "招新统计" };

/** /admin/stats/recruitment - 招新统计页（页面只做组合，业务在组件内） */
export default function AdminStatsRecruitmentPage() {
  return <StatsRecruitment />;
}
