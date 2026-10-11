"use client";

/**
 * ProjectsPreview - 首页项目预览卡片
 * 展示精选项目，接收项目数据作为 props
 */
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Github } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types/api";

interface ProjectsPreviewProps {
  projects: Project[];
}

export function ProjectsPreview({ projects }: ProjectsPreviewProps) {
  const { locale, t } = useI18n();
  const featured = projects.slice(0, 3);

  return (
    <section className="bg-muted/30 border-y border-border">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              {t("home.projects.title")}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {t("home.projects.subtitle")}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-2 self-start sm:self-auto">
            <Link href={`/${locale}/projects`}>
              {t("common.viewAll")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((project, i) => (
            <motion.div
              key={project.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
            >
              <Link href={`/${locale}/projects/${project.slug}`}>
                <Card className="h-full hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-lg leading-tight">
                        {project.title}
                      </h3>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {project.year}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {project.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {project.tech_stack.slice(0, 3).map((tech) => (
                        <Badge key={tech} variant="accent">
                          {tech}
                        </Badge>
                      ))}
                      {project.tech_stack.length > 3 && (
                        <Badge variant="outline">
                          +{project.tech_stack.length - 3}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="border-t border-border bg-muted/20">
                    <span className="text-xs text-muted-foreground">
                      {t("common.members")}: {project.leader}
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
