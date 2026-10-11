/**
 * Content Blocks API - 对应后端 app/api/content.py
 *
 * 富文本内容块（社团介绍、招新说明等），存储原始 Markdown，前端用 Markdown 阅读器渲染。
 */
import { apiFetch } from "./client";
import type { ContentBlock, ContentBlockUpdate } from "@/types/api";

/** 公开：按 key 获取内容块；不存在时返回空 body_md */
export function getContentBlock(key: string) {
  return apiFetch<ContentBlock>(`/api/content/${key}`);
}

/** 管理：更新或创建内容块（首次写入则创建） */
export function upsertContentBlock(key: string, payload: ContentBlockUpdate) {
  return apiFetch<ContentBlock>(`/api/admin/content/${key}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}
