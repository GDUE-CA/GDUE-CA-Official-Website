"use client";

/**
 * /admin/security/network - 网络配置（域名监听）
 * 主体已提取为 NetworkConfigPanel 组件，供 /admin/security/access-control Tab 复用。
 * 本页保留为薄包装，旧深链 /admin/security/network 仍可直接访问。
 */
import { NetworkConfigPanel } from "@/components/admin/security/NetworkConfigPanel";

export default function NetworkConfigPage() {
  return <NetworkConfigPanel />;
}
