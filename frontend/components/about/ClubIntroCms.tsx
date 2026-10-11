"use client";

/**
 * ClubIntroCms - 社团介绍（CMS 内容块 club_intro）
 * 读取 Markdown 正文；未配置 / 为空 / 接口异常时整体不渲染，
 * 页面保留原有内置介绍内容作为回退
 */
import { useEffect, useState } from "react";
import { getContentBlock } from "@/lib/api/content";
import { MarkdownProse } from "@/components/shared/MarkdownProse";
import { SectionHeading } from "@/components/shared/SectionHeading";
import type { ContentBlock } from "@/types/api";

export function ClubIntroCms() {
  const [block, setBlock] = useState<ContentBlock | null>(null);

  useEffect(() => {
    let cancelled = false;
    getContentBlock("club_intro")
      .then((b) => {
        if (!cancelled) setBlock(b);
      })
      .catch(() => {
        /* CMS 未配置或网络错误：静默跳过，保留页面内置内容 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!block || !block.body_md || !block.body_md.trim()) return null;

  return (
    <section className="mb-20">
      {block.title && <SectionHeading title={block.title} />}
      <MarkdownProse content={block.body_md} className="max-w-3xl mx-auto text-sm md:text-base" />
    </section>
  );
}
