"use client";

/**
 * SectionHeading - 可复用的区块标题组件
 * 用于页面内各内容区块的标题展示
 */
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  centered?: boolean;
  className?: string;
}

export function SectionHeading({
  title,
  subtitle,
  centered = true,
  className,
}: SectionHeadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4 }}
      className={cn(
        "space-y-2 mb-10",
        centered && "text-center",
        className
      )}
    >
      <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="text-muted-foreground text-sm md:text-base">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
