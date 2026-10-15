import type { Metadata } from "next";
import { MailpushGate } from "@/components/admin/mailpush/MailpushGate";

export const metadata: Metadata = { title: "邮件与推送" };

/**
 * /admin/mailpush 邮件与推送（V0.5.5 §3.3）
 * 页面不挂模块权限守卫（全部后台角色可进），可用性跟随后端 mail_system_ready：
 * false 时顶部黄色警告横幅 + 置灰导航；true 时展示中性占位。
 */
export default function AdminMailpushPage() {
  return <MailpushGate />;
}
