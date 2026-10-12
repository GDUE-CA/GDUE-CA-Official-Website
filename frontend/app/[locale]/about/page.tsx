import { getDictionary } from "@/i18n/dictionary";
import type { Locale } from "@/lib/i18n";
import { PageHeader } from "@/components/shared/PageHeader";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { ClubIntroCms } from "@/components/about/ClubIntroCms";
import { MembersSection } from "@/components/about/MembersSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Briefcase, Handshake, Megaphone, Wallet, Wrench, GraduationCap, Award, MapPin, Clock } from "lucide-react";

/**
 * 社团介绍页 - 历史时间线、组织架构、指导老师、社团荣誉、活动室位置
 * 人物与事件均取自《计算机协会》社史资料
 */
export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  /**
   * 按当前语言取值：数据内部用 "zh-cn"/"zh-tw"/"en-us"/"ja" 作 key（历史遗留）；
   * 新 13 门 locale 映射到最接近的数据 key，缺失回退简体中文。
   */
  const localeToDataKey: Record<string, string> = {
    "zh-cn": "zh-cn",
    "zh-cn-sg": "zh-cn",
    "zh-tw": "zh-tw",
    "zh-mo": "zh-tw",
    "zh-yue-cn": "zh-cn",
    "zh-yue-hk": "zh-tw",
    "en-gb": "en-us",
    "ja-jp": "ja",
    "ko-kr": "en-us",
    "es-es": "en-us",
    "fr-fr": "en-us",
    "de-de": "en-us",
    "ru-ru": "en-us",
  };
  const pick = (obj: Record<string, string>) => {
    const direct = obj[locale];
    if (direct) return direct;
    const dataKey = localeToDataKey[locale] ?? "zh-cn";
    return obj[dataKey] ?? obj["zh-cn"] ?? "";
  };

  /** 历史时间线数据（社史可考大事） */
  const timeline: { year: string; event: Record<string, string> }[] = [
    { year: "2008", event: { "zh-cn": "计算机协会成立（2008年5月31日，花都校区）", "en-us": "Computer Association founded on May 31, 2008 (Huadu Campus)", "zh-tw": "計算機協會成立（2008年5月31日，花都校區）", ja: "コンピュータ協会設立（2008年5月31日、花都キャンパス）" } },
    { year: "2013", event: { "zh-cn": "微软“创新之旅”校园巡讲，203 人到场", "en-us": "Microsoft “Innovation Journey” campus tour with 203 attendees", "zh-tw": "微軟“創新之旅”校園巡講，203 人到場", ja: "マイクロソフト「イノベーションの旅」講演、203名が参加" } },
    { year: "2017", event: { "zh-cn": "第四届 LOL 电竞比赛，冠军晋级花都区高校友谊赛", "en-us": "4th LOL esports tournament; champions advanced to the Huadu inter-university friendly", "zh-tw": "第四屆 LOL 電競比賽，冠軍晉級花都區高校友誼賽", ja: "第4回LOL eスポーツ大会、優勝チームは花都区大学対抗戦へ進出" } },
    { year: "2018", event: { "zh-cn": "首届“西普杯”网络安全技术挑战赛（实验楼 702）", "en-us": "1st “Xipu Cup” cybersecurity challenge (Lab Building 702)", "zh-tw": "首屆“西普杯”網絡安全技術挑戰賽（實驗樓 702）", ja: "第1回「西普杯」サイバーセキュリティチャレンジ（実験棟702）" } },
    { year: "2022", event: { "zh-cn": "网络安全知识竞赛“慧眼识骗 安全同行”", "en-us": "“Sharp Eyes Against Fraud”", "zh-tw": "網絡安全知識競賽“慧眼識騙 安全同行”", ja: "「慧眼識騙・安全同行」コンテスト" } },
    { year: "2024", event: { "zh-cn": "举办首个周年庆", "en-us": "First anniversary held", "zh-tw": "舉辦首個週年慶", ja: "初の周年記念を開催" } },
  ];

  /** 组织架构数据（现行“1 会长 + 1 副会长 + 5 职能理事”+ 义务维修队） */
  const departments = [
    { icon: CalendarCheck, name: dict.about.structure.activityDept, desc: dict.about.structure.activityDeptDesc, color: "bg-blue-500/10 text-blue-600" },
    { icon: Briefcase, name: dict.about.structure.officeDept, desc: dict.about.structure.officeDeptDesc, color: "bg-purple-500/10 text-purple-600" },
    { icon: Handshake, name: dict.about.structure.liaisonDept, desc: dict.about.structure.liaisonDeptDesc, color: "bg-indigo-500/10 text-indigo-600" },
    { icon: Megaphone, name: dict.about.structure.publicityDept, desc: dict.about.structure.publicityDeptDesc, color: "bg-pink-500/10 text-pink-600" },
    { icon: Wallet, name: dict.about.structure.financeDept, desc: dict.about.structure.financeDeptDesc, color: "bg-amber-500/10 text-amber-600" },
    { icon: Wrench, name: dict.about.structure.repairTeam, desc: dict.about.structure.repairTeamDesc, color: "bg-cyan-500/10 text-cyan-600" },
  ];

  /** 指导老师数据 */
  const teachers: { name: Record<string, string>; title: Record<string, string> }[] = [
    { name: { "zh-cn": "张谦", "zh-tw": "張謙", "en-us": "Qian Zhang", ja: "張謙" }, title: { "zh-cn": "指导老师 · 网络工程教研室主任（2019 年起）", "zh-tw": "指導老師 · 網絡工程教研室主任（2019 年起）", "en-us": "Advisor · Head of Network Engineering Teaching Office (since 2019)", ja: "指導教員 · ネットワーク工学教研室主任（2019年〜）" } },
    { name: { "zh-cn": "张渝荣", "zh-tw": "張渝榮", "en-us": "Yurong Zhang", ja: "張渝栄" }, title: { "zh-cn": "指导老师 · 计算机科学系（2013—2018 年）", "zh-tw": "指導老師 · 計算機科學系（2013—2018 年）", "en-us": "Advisor · Computer Science Department (2013–2018)", ja: "指導教員 · コンピュータ科学系（2013〜2018年）" } },
  ];

  /** 荣誉数据 */
  const honors: Record<string, string>[] = [
    { "zh-cn": "网络安全知识竞赛获属地街道、派出所好评，申报校“十佳品牌活动”", "zh-tw": "網絡安全知識競賽獲屬地街道、派出所好評，申報校“十佳品牌活動”", "en-us": "Anti-fraud contest praised by local authorities; nominated for Top-10 campus brand events", ja: "コンテストは地元当局から好評を得て、学十大ブランド活動に推薦" },
    { "zh-cn": "单场知识竞赛报名破千，覆盖两校区 14 个院系", "zh-tw": "單場知識競賽報名破千，覆蓋兩校區 14 個院系", "en-us": "A single knowledge contest drew 1,000+ registrations across 14 schools on two campuses", ja: "単一の知識コンテストで申込1,000名超、2キャンパス14学院をカバー" },
    { "zh-cn": "LOL 电竞校队晋级花都区高校友谊赛与技嘉 GTL 联赛", "zh-tw": "LOL 電競校隊晉級花都區高校友誼賽與技嘉 GTL 聯賽", "en-us": "LOL esports team advanced to the Huadu inter-university friendly and the Gigabyte GTL league", ja: "LOLチームは花都区大学対抗戦とGigabyte GTLリーグへ進出" },
    { "zh-cn": "义务维修与二级备考课常年服务全校多院系同学", "zh-tw": "義務維修與二級備考課常年服務全校多院系同學", "en-us": "Free repair clinics and NCRE prep courses serve students across many schools year-round", ja: "無料修理と二级試験対策講座は通年で多くの学院の学生を支援" },
  ];

  return (
    <DirectionalTransition>
      <PageHeader title={dict.about.title} subtitle={dict.about.subtitle} />

      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        {/* 社团介绍（CMS club_intro，未配置时不渲染） */}
        <ClubIntroCms />

        {/* 历史时间线 */}
        <section className="mb-20">
          <SectionHeading title={dict.about.timeline.title} subtitle={dict.about.timeline.subtitle} />
          <div className="relative max-w-3xl mx-auto">
            {/* 时间线竖线 */}
            <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2" />
            <div className="space-y-8">
              {timeline.map((item, i) => (
                <div
                  key={item.year}
                  className={`relative flex items-center gap-6 ${
                    i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                  }`}
                >
                  {/* 时间节点 */}
                  <div className="absolute left-4 md:left-1/2 w-3 h-3 rounded-full bg-primary -translate-x-1/2 ring-4 ring-background" />
                  {/* 内容卡片 */}
                  <div className={`ml-12 md:ml-0 md:w-1/2 ${i % 2 === 0 ? "md:pr-12 md:text-right" : "md:pl-12"}`}>
                    <Badge variant="accent" className="mb-2">{item.year}</Badge>
                    <p className="text-sm text-foreground">{pick(item.event)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 组织架构 */}
        <section className="mb-20">
          <SectionHeading title={dict.about.structure.title} subtitle={dict.about.structure.subtitle} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept, i) => (
              <Card key={i} className="text-center hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${dept.color} mx-auto mb-2`}>
                    <dept.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-base">{dept.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{dept.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 指导老师 */}
        <section className="mb-20">
          <SectionHeading title={dict.about.teachers.title} subtitle={dict.about.teachers.subtitle} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {teachers.map((teacher, i) => (
              <Card key={i} className="flex items-center gap-4 p-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-secondary-foreground shrink-0">
                  <GraduationCap className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{pick(teacher.name)}</h3>
                  <p className="text-sm text-muted-foreground">{pick(teacher.title)}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* 社团成员（CMS 现任/往届，无数据时不渲染） */}
        <MembersSection />
      </div>
    </DirectionalTransition>
  );
}
