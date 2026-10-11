/**
 * Translations API - 对应后端 app/api/translations.py
 *
 * 管理员批量翻译报名 / Bug 表单文本到自己的显示语言。
 */
import { apiFetch } from "./client";
import type {
  TranslationItem,
  BatchTranslateResponse,
} from "@/types/api";

/** 批量翻译（最多 40 条，单条最长 2000 字符） */
export function batchTranslate(
  items: TranslationItem[],
  targetLang: string
) {
  return apiFetch<BatchTranslateResponse>("/api/translations/batch", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify({ items, target_lang: targetLang }),
  });
}
