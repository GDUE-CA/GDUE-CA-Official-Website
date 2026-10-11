/**
 * 健康检查（新壳接口示例封装）。
 *
 * 后端 GET /health 返回 ApiResponse<HealthInfo>；
 * apiFetch 自动解壳，调用方直接拿到 data 字段。
 */
import { apiFetch } from "@/lib/api/client";

export interface HealthInfo {
  status: "ok" | string;
  service: string;
  version: string;
  /** ISO-8601 UTC 时间，末尾大写 Z */
  time: string;
}

export async function checkHealth(): Promise<HealthInfo> {
  return apiFetch<HealthInfo>("/health", { method: "GET" });
}