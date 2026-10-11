"use client";

/**
 * BlogList - 博客列表组件（含标签筛选）
 * 接收所有文章数据，客户端按标签筛选
 */
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, Tag } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";

interface BlogListProps {
  posts: {
    slug: string;
    title: string;
    excerpt: string;
    /** 原始 UTC ISO（发布时间），由客户端组件按用户时区渲染 */
    date: string;
    tags: string[];
    author: string;
  }[];
  tags: string[];
}

export function BlogList({ posts, tags }: BlogListProps) {
  const { locale, t } = useI18n();
  const [selectedTag, setSelectedTag] = useState<string>("all");

  const filtered =
    selectedTag === "all"
      ? posts
      : posts.filter((p) => p.tags.includes(selectedTag));

  return (
    <div>
      {/* 标签筛选 */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setSelectedTag("all")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            selectedTag === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {t("common.all")}
        </button>
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1 ${
              selectedTag === tag
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <Tag className="h-3 w-3" />
            {tag}
          </button>
        ))}
      </div>

      {/* 文章列表 */}
      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{t("blog.noResults")}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((post, i) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link href={`/${locale}/blog/${post.slug}`}>
                <Card className="h-full hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                  <CardHeader>
                    <h3 className="font-semibold text-lg leading-tight mb-1">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {/* 原始 UTC ISO → 客户端按用户时区渲染 */}
                      <FormattedUserActionTime utcIso={post.date} />
                      <span>·</span>
                      <span>{post.author}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                      {post.excerpt}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
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
