"use client";

/**
 * ProjectList - 项目列表组件（含筛选功能）
 * 接收所有项目数据，客户端按技术栈和年份筛选
 */
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Github, ExternalLink } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types/api";

interface ProjectListProps {
  projects: Project[];
  techStacks: string[];
  years: number[];
}

export function ProjectList({ projects, techStacks, years }: ProjectListProps) {
  const { locale, t } = useI18n();
  const [selectedTech, setSelectedTech] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const filtered = projects.filter((p) => {
    const techMatch = selectedTech === "all" || p.tech_stack.includes(selectedTech);
    const yearMatch = selectedYear === "all" || p.year.toString() === selectedYear;
    return techMatch && yearMatch;
  });

  return (
    <div>
      {/* 筛选栏 */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedTech("all")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedTech === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {t("common.all")}
          </button>
          {techStacks.map((tech) => (
            <button
              key={tech}
              onClick={() => setSelectedTech(tech)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedTech === tech
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {tech}
            </button>
          ))}
        </div>
      </div>

      {/* 项目网格 */}
      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{t("projects.noResults")}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((project, i) => (
            <motion.div
              key={project.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link href={`/${locale}/projects/${project.slug}`}>
                <Card className="h-full hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-lg leading-tight">{project.title}</h3>
                      <span className="text-xs text-muted-foreground shrink-0">{project.year}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                      {project.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {project.tech_stack.map((tech) => (
                        <Badge key={tech} variant="accent">{tech}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {project.github_url && <Github className="h-3.5 w-3.5" />}
                      {project.demo_url && <ExternalLink className="h-3.5 w-3.5" />}
                      <span>{t("common.members")}: {project.leader}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
