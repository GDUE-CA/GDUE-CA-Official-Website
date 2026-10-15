"use client";

/**
 * /[locale]/submit 提交页
 * 提供两项独立入口（原全局底栏「提交」按钮已移除，目前站内无链接指向本页）：
 *   ① 社团报名（复用 ClubJoinForm）
 *   ② Bug 提交 / 问题反馈（复用 BugForm）
 * 点击卡片切换到对应表单。
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Users from "@/assets/icons/user/users.svg";
import Bug from "@/assets/icons/status/bug.svg";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClubJoinForm } from "@/components/join/ClubJoinForm";
import { BugForm } from "@/components/contact/BugForm";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";

type SubmitMode = "club" | "bug";

export default function SubmitPage() {
  return (
    <DirectionalTransition>
      <SubmitContent />
    </DirectionalTransition>
  );
}

function SubmitContent() {
  const { t } = useI18n();
  const [mode, setMode] = useState<SubmitMode | null>(null);

  // 入口选择界面
  if (!mode) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">{t("submit.title")}</h1>
          <p className="text-muted-foreground">{t("submit.subtitle")}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* 社团报名 */}
          <button className="text-left group" onClick={() => setMode("club")}>
            <Card className="h-full hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer border-2 hover:border-emerald-500">
              <CardContent className="p-6 space-y-4">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  <Users className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">{t("register.clubTitle")}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("register.clubDesc")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </button>

          {/* Bug 提交 / 问题反馈 */}
          <button className="text-left group" onClick={() => setMode("bug")}>
            <Card className="h-full hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer border-2 hover:border-rose-500">
              <CardContent className="p-6 space-y-4">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                  <Bug className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">{t("bug.title")}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("bug.subtitle")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </button>
        </div>
      </div>
    );
  }

  // 表单界面
  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setMode(null)} size="sm">
          ← {t("common.back")}
        </Button>
        <div className="flex gap-2">
          <Button
            variant={mode === "club" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("club")}
          >
            {t("register.clubTitle")}
          </Button>
          <Button
            variant={mode === "bug" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("bug")}
          >
            {t("bug.title")}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
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
        {mode === "bug" && (
          <motion.div
            key="bug"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <BugForm />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
