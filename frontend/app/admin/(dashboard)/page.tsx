import { redirect } from "next/navigation";

/**
 * /admin 根路径：307 重定向到 /admin/dashboard（后台仪表盘）
 */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
