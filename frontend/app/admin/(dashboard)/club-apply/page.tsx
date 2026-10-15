import type { Metadata } from "next";
import { ClubApplyReviewManager } from "@/components/admin/clubapply/ClubApplyReviewManager";

export const metadata: Metadata = { title: "社团报名审核" };

/** /admin/club-apply - 社团报名审核页（页面只做组合，业务在组件内） */
export default function AdminClubApplyPage() {
  return <ClubApplyReviewManager />;
}
