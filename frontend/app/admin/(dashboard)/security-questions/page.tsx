import type { Metadata } from "next";
import { SecurityQuestionsManager } from "@/components/admin/securityQuestions/SecurityQuestionsManager";

export const metadata: Metadata = { title: "安全问题库" };

/** /admin/security-questions - 安全问题预设题库管理页（页面只做组合，业务在组件内） */
export default function AdminSecurityQuestionsPage() {
  return <SecurityQuestionsManager />;
}
