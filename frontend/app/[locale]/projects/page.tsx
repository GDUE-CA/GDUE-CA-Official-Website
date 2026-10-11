import { getDictionary } from "@/i18n/dictionary";
import { listPublicProjects } from "@/lib/api/projects";
import { PageHeader } from "@/components/shared/PageHeader";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";
import { ProjectList } from "@/components/projects/ProjectList";

/**
 * 项目展示页 - 项目卡片列表，支持按技术栈/年份筛选
 *
 * 数据源：项目展示 CMS（/api/projects，仅已发布，year 降序），ISR 60s；
 * 后端不可用时降级为空列表，页面仍完整渲染。
 */
export const revalidate = 60;

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  // lang=locale：后端按显示语言自动翻译标题/短描述（失败回退原文）
  const projects = await listPublicProjects({ page_size: 100, lang: locale })
    .then((r) => r.items)
    .catch(() => []);
  // 技术栈/年份筛选项由当前项目集合内联派生（与原 markdown 时代 getAllTechStacks/getAllProjectYears 语义一致）
  const techStacks = [...new Set(projects.flatMap((p) => p.tech_stack))].sort();
  const years = [...new Set(projects.map((p) => p.year))].sort((a, b) => b - a);

  return (
    <DirectionalTransition>
      <PageHeader
        title={dict.projects.title}
        subtitle={dict.projects.subtitle}
        transitionName="page-title-projects"
      />
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <ProjectList projects={projects} techStacks={techStacks} years={years} />
      </div>
    </DirectionalTransition>
  );
}
