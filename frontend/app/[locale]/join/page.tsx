"use client";

/**
 * /[locale]/join 报名入口页
 * 顶部三个卡片按钮：活动报名 / 社团报名 / 查询报名结果
 * 点击切换到对应表单或查询界面
 */
import { useState, ViewTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Users, Search } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EventJoinForm } from "@/components/join/EventJoinForm";
import { ClubJoinForm } from "@/components/join/ClubJoinForm";
import { RecruitmentInfoSection } from "@/components/join/RecruitmentInfoSection";
import { ReceiptQuery } from "@/components/shared/ReceiptQuery";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";

type FormMode = "event" | "club" | "query";

export default function RegisterPage() {
  return (
    <DirectionalTransition>
      <RegisterContent />
    </DirectionalTransition>
  );
}

function RegisterContent() {
  const { t } = useI18n();
  const [mode, setMode] = useState<FormMode | null>(null);

  // 入口选择界面
  if (!mode) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          {/* 与首页快速导航「加入」卡片标题共享过渡 */}
          <ViewTransition name="page-title-join" share="text-morph" default="none">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">{t("register.title")}</h1>
          </ViewTransition>
          <p className="text-muted-foreground">{t("register.subtitle")}</p>
        </div>

        {/* 最新招新信息（CMS，无数据时不渲染） */}
        <RecruitmentInfoSection />

        <div className="grid md:grid-cols-3 gap-6">
          {/* 活动报名卡片 */}
          <button
            className="text-left group"
            onClick={() => setMode("event")}
          >
            <Card className="h-full hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer border-2 hover:border-blue-500">
              <CardContent className="p-6 space-y-4">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <CalendarDays className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">{t("register.eventTitle")}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("register.eventDesc")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </button>

          {/* 社团报名卡片 */}
          <button
            className="text-left group"
            onClick={() => setMode("club")}
          >
            <Card className="h-full hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer border-2 hover:border-emerald-500">
              <CardContent className="p-6 space-y-4">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  <Users className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">{t("register.clubTitle")}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("register.clubDesc")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </button>

          {/* 查询报名结果卡片 */}
          <button
            className="text-left group"
            onClick={() => setMode("query")}
          >
            <Card className="h-full hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer border-2 hover:border-violet-500">
              <CardContent className="p-6 space-y-4">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                  <Search className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">{t("register.queryTitle")}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("register.queryDesc")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </button>
        </div>
      </div>
    );
  }

  // 表单 / 查询界面
  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setMode(null)} size="sm">
          ← {t("common.back")}
        </Button>
        {mode !== "query" && (
          <div className="flex gap-2">
            <Button
              variant={mode === "event" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("event")}
            >
              {t("register.eventTitle")}
            </Button>
            <Button
              variant={mode === "club" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("club")}
            >
              {t("register.clubTitle")}
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {mode === "event" && (
          <motion.div
            key="event"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <EventJoinForm />
          </motion.div>
        )}
        {mode === "club" && (
          <motion.div
            key="club"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ClubJoinForm />
          </motion.div>
        )}
        {mode === "query" && (
          <motion.div
            key="query"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="max-w-2xl mx-auto">
              <CardContent className="p-6 sm:p-8">
                <ReceiptQuery />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
