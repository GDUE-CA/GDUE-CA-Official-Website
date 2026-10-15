"use client";

/**
 * BlogList - 博客列表组件（含标签筛选）
 * 接收所有文章数据，客户端按标签筛选
 */
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Calendar from "@/assets/icons/status/calendar.svg";
import Tag from "@/assets/icons/status/tag.svg";
import Heart from "@/assets/icons/status/heart.svg";
import MessageCircle from "@/assets/icons/status/message-circle.svg";
import Share2 from "@/assets/icons/action/share-2.svg";
import Star from "@/assets/icons/status/star.svg";
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
    /** 4 项冗余计数（列表卡片底部展示） */
    like_count: number;
    comment_count: number;
    share_count: number;
    favourite_count: number;
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
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                    {/* 指标计数条 */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" />
                        {post.like_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {post.comment_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Share2 className="h-3.5 w-3.5" />
                        {post.share_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5" />
                        {post.favourite_count}
                      </span>
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
