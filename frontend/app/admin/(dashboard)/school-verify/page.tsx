import type { Metadata } from "next";
import { SchoolVerifyReviewManager } from "@/components/admin/schoolverify/SchoolVerifyReviewManager";

export const metadata: Metadata = { title: "学校验证审核" };

/** /admin/school-verify - 学校身份人工验证审核页（页面只做组合，业务在组件内） */
export default function AdminSchoolVerifyPage() {
  return <SchoolVerifyReviewManager />;
}
