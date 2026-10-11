"use client";

/**
 * PageHeader - 栏目页顶部标题区（克制科技风）
 * 面包屑（首页 / 当前页）+ 左对齐大标题 + 副标题 + 可选摘要行（children）
 * 传入 transitionName 时，标题与来源页（如首页快速导航卡片）同名元素做共享过渡
 */
import { ViewTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n/provider";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** 共享元素过渡名称，需与来源页对应元素一致且全局唯一 */
  transitionName?: string;
  /** 标题下方的摘要行（如统计数据） */
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, transitionName, children }: PageHeaderProps) {
  const { locale, t } = useI18n();

  const heading = (
    <h1 className="text-[40px] md:text-[56px] leading-[1.1] font-bold tracking-[-0.03em]">{title}</h1>
  );

  return (
    <header className="border-b border-border">
      <div className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 pt-12 pb-10 md:pt-[72px] md:pb-14">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col"
        >
          <nav aria-label="Breadcrumb" className="font-mono text-xs md:text-[13px] text-muted-foreground">
            <ol className="flex items-center gap-2">
              <li>
                <Link
                  href={`/${locale}`}
                  transitionTypes={["nav-back"]}
                  className="transition-colors hover:text-foreground"
                >
                  {t("nav.home")}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-foreground">
                {title}
              </li>
            </ol>
          </nav>
          <div className="mt-4 md:mt-5">
            {transitionName ? (
              <ViewTransition name={transitionName} share="text-morph" default="none">
                {heading}
              </ViewTransition>
            ) : (
              heading
            )}
          </div>
          {subtitle && (
            <p className="mt-3 md:mt-3.5 max-w-2xl text-base md:text-lg leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
          {children && <div className="mt-6 md:mt-7">{children}</div>}
        </motion.div>
      </div>
    </header>
  );
}
