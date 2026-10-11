import type { Metadata } from "next";
import { MediaManager } from "@/components/admin/media/MediaManager";

export const metadata: Metadata = { title: "文件资源" };

/** /admin/media - 文件资源统一管理页（页面只做组合，业务在组件内） */
export default function AdminMediaPage() {
  return <MediaManager />;
}
