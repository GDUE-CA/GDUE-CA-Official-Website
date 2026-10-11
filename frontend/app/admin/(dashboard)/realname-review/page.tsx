import type { Metadata } from "next";
import { RealnameReviewManager } from "@/components/admin/realname/RealnameReviewManager";

export const metadata: Metadata = { title: "实名审核" };

/** /admin/realname-review - 实名申请审核页（页面只做组合，业务在组件内） */
export default function AdminRealnameReviewPage() {
  return <RealnameReviewManager />;
}
