import { fetchClubEvents } from "@/lib/api/activities";
import { EMPTY_HERO, fetchHero } from "@/lib/api/hero";
import { Hero } from "@/components/home/Hero";
import { EventsPreview } from "@/components/home/EventsPreview";
import { QuickNav } from "@/components/home/QuickNav";
import { AnnouncementsPreview } from "@/components/home/AnnouncementsPreview";
import { JoinCTA } from "@/components/home/JoinCTA";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";

/**
 * 首页 - 横幅（简介 + 数据格）、近期活动（便当格）、快速导航、
 * 最新公告横向预览卡片（AnnouncementsPreview）、加入社团
 * 项目预览（components/home/ProjectsPreview）暂未在首页展示
 *
 * 近期活动数据源：活动 CMS（ISR 60s）；后端不可用时降级为空列表（区块自动隐藏）
 * V0.6.1 需求4：移除 Hero 下方单行公告条，仅保留底部完整版「最新公告」模块
 */
export const revalidate = 60;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // lang=locale：后端按显示语言自动翻译活动标题/短描述（失败回退原文）
  const events = await fetchClubEvents(locale)
    .then((list) => list.slice(0, 4))
    .catch(() => []);
  // Hero 配置：后端按 locale 解析文案（Redis/CDN 缓存）；失败降级空配置，Hero 内部按 i18n 兜底
  const hero = await fetchHero(locale).catch(() => EMPTY_HERO);

  return (
    <DirectionalTransition>
      <Hero hero={hero} />
      <EventsPreview events={events} />
      <QuickNav />
      <AnnouncementsPreview />
      <JoinCTA />
    </DirectionalTransition>
  );
}
