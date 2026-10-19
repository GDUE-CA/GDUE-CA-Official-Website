/**
 * Hero API - 对应后端 app/api/hero.py
 *
 * 首页 Hero 区块动态配置（V0.6.1 需求3）：
 * - 公开：按 locale 拉取解析后的配置（后端 Redis + 前端 ISR/CDN 缓存）
 * - 管理：读取/更新/重置完整配置（全语种）+ 背景图上传（内容哈希命名）
 */
import { apiFetch, secureFetch } from "./client";
import type { HeroConfig, HeroPublic, HeroUpdate } from "@/types/api";

/** 后端不可用时的空 Hero：Hero 组件按 i18n 文案与标准入口兜底渲染，页面不会空白 */
export const EMPTY_HERO: HeroPublic = {
  locale: "",
  background_url: null,
  background_opacity: 30,
  background_blur: 8,
  eyebrow: "",
  title: "",
  subtitle: "",
  description: "",
  buttons: [],
  stats: [],
};

/**
 * 公开 Hero 配置。lang 传当前显示语言，后端按兜底链解析文案。
 * fresh=true 时绕过后端缓存直读数据库（管理员预览用）。
 */
export function fetchHero(locale: string, fresh = false) {
  const qs = new URLSearchParams({ locale });
  if (fresh) qs.set("fresh", "true");
  return apiFetch<HeroPublic>(`/api/hero?${qs.toString()}`);
}

/** 管理：读取完整 Hero 配置（含全部语种原文，实时读库） */
export function adminGetHero() {
  return apiFetch<HeroConfig>("/api/admin/hero");
}

/** 管理：保存 Hero 配置（后端提交后自动清除 Redis 缓存） */
export function adminUpdateHero(payload: HeroUpdate) {
  return apiFetch<HeroConfig>("/api/admin/hero", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** 管理：一键恢复默认 Seed 首页主题 */
export function adminResetHero() {
  return apiFetch<HeroConfig>("/api/admin/hero/reset", { method: "POST" });
}

/** 管理：上传 Hero 背景图（jpg/png/webp，≤8MB，内容哈希命名，返回 /uploads/hero/ 路径） */
export async function adminUploadHeroBackground(file: File): Promise<{ url: string; size: number }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await secureFetch("/api/admin/hero/background", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data as { detail?: string })?.detail ?? "背景图上传失败");
  }
  return (await res.json()) as { url: string; size: number };
}
