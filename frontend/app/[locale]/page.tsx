import { fetchClubEvents } from "@/lib/api/activities";
import { Hero } from "@/components/home/Hero";
import { Announcements } from "@/components/home/Announcements";
import { EventsPreview } from "@/components/home/EventsPreview";
import { QuickNav } from "@/components/home/QuickNav";
import { AnnouncementsPreview } from "@/components/home/AnnouncementsPreview";
import { JoinCTA } from "@/components/home/JoinCTA";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";

/**
 * 首页 - 横幅（简介 + 数据格）、顶部公告栏、近期活动（便当格）、快速导航、
 * 最新公告横向预览卡片（AnnouncementsPreview）、加入社团
 * 项目预览（components/home/ProjectsPreview）暂未在首页展示
 *
 * 近期活动数据源：活动 CMS（ISR 60s）；后端不可用时降级为空列表（区块自动隐藏）
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

  return (
    <DirectionalTransition>
      <Hero />
      <Announcements />
      <EventsPreview events={events} />
      <QuickNav />
      <AnnouncementsPreview />
      <JoinCTA />
    </DirectionalTransition>
  );
}
