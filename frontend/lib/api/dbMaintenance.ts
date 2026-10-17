/**
 * DB Maintenance API - 对应后端 app/api/db_maintenance.py
 *
 * 数据库维护（备份/导出）：
 * - submitDbExport：提交全量导出异步任务（与 backgroundTasks.ts 同源，此处 re-export
 *   保持与后端模块一一对应的文件约定）；
 * - listDbExports：备份文件列表（扫描服务器 exports 目录，系统重置自动备份同样可见）；
 * - dbExportDownloadUrl：备份文件下载地址（直链，浏览器可直接打开/另存）。
 */
import { apiFetch } from "./client";

export type DbExportFile = {
  filename: string;
  size_bytes: number;
  created_at: string; // ISO-8601 UTC（大写 Z），前端负责时区格式化
};

export type DbExportListResponse = {
  items: DbExportFile[];
  total: number;
};

/** 提交一次完整数据库导出（后台异步执行），立刻返回 task_id */
export { submitDbExport } from "./backgroundTasks";

/** 列出 exports 目录内的全部备份文件（新文件在前） */
export function listDbExports() {
  return apiFetch<DbExportListResponse>("/api/admin/db/exports", {
    withAuth: true,
  });
}

/** 备份文件下载直链（走 cookie 鉴权，可直接赋给 <a href> / window.open） */
export function dbExportDownloadUrl(filename: string): string {
  return `/api/admin/db/exports/${encodeURIComponent(filename)}/download`;
}
