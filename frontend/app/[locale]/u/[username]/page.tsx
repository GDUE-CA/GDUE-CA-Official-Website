"use client";

/**
 * /{locale}/u/[username] — 用户个人主页（规格第四部分）
 *
 * 任何访客（含未登录）可查看：
 * - 头像 + 昵称 + @username + 个性签名 + 地区（永久公开）+ 加入时间
 * - 两个 Tab：说说列表（public Memo）+ 博客列表（published）
 * - 性别/生日按 profile_privacy 过滤后展示
 */
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  UserCircle,
  MapPin,
  CalendarDays,
  FileText,
  Newspaper,
  Loader2,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import {
  fetchPublicProfile,
  listUserMemos,
  listUserBlog,
} from "@/lib/api/profile";
import type { UserProfile, MemoBriefOut, BlogPost } from "@/types/api";

type Tab = "memos" | "blog";

export default function UserProfilePage() {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();
  const params = useParams<{ username: string }>();
  const username = params.username;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<Tab>("memos");
  const [memos, setMemos] = useState<MemoBriefOut[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 拉取个人资料
  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError(null);
    fetchPublicProfile(username)
      .then((p) => {
        setProfile(p);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError(t("profile.notFound"));
        } else {
          setError(err instanceof Error ? err.message : t("common.error"));
        }
        setLoading(false);
      });
  }, [username, t]);

  // 拉取 Tab 内容（切换 Tab 时加载）
  useEffect(() => {
    if (!username || !profile) return;
    if (tab === "memos") {
      listUserMemos(username)
        .then((res) => setMemos(res.items ?? []))
        .catch(() => setMemos([]));
    } else {
      listUserBlog(username)
        .then((res) => setBlogPosts(res.items ?? []))
        .catch(() => setBlogPosts([]));
    }
  }, [username, profile, tab]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <UserCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{error ?? t("profile.notFound")}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/${locale}`}>{t("admin.login.backToSite")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const avatarUrl = profile.avatar_url
    ? profile.avatar_url.startsWith("http")
      ? profile.avatar_url
      : profile.avatar_url.startsWith("/")
        ? `${API_BASE_URL.replace(/\/+$/, "")}${profile.avatar_url}`
        : `${API_BASE_URL.replace(/\/+$/, "")}/${profile.avatar_url}`
    : null;

  // 地区展示文本（永久公开）
  const regionText = [
    profile.locality_text,
    profile.locality,
    profile.region,
    profile.country,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen bg-muted/10">
      {/* 个人信息头部 */}
      <div className="bg-background border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-start gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={profile.display_name}
                className="h-20 w-20 rounded-full object-cover bg-secondary shrink-0"
              />
            ) : (
              <UserCircle className="h-20 w-20 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground">
                {profile.display_name}
              </h1>
              <p className="text-sm text-muted-foreground">@{profile.username}</p>
              {profile.bio && (
                <p className="mt-2 text-sm text-foreground/90 whitespace-pre-wrap">
                  {profile.bio}
                </p>
              )}
              {/* 地区永久公开 */}
              {regionText && (
                <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {regionText}
                </div>
              )}
              <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground ml-2">
                <CalendarDays className="h-3.5 w-3.5" />
                {t("profile.joinedAt", {
                  date: new Date(profile.created_at).toLocaleDateString(locale),
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex gap-1 border-b border-border mt-4">
          <TabButton
            active={tab === "memos"}
            onClick={() => setTab("memos")}
            icon={FileText}
            label={t("profile.tabs.memos")}
          />
          <TabButton
            active={tab === "blog"}
            onClick={() => setTab("blog")}
            icon={Newspaper}
            label={t("profile.tabs.blog")}
          />
        </div>

        {/* 列表内容 */}
        <div className="py-4 space-y-3">
          {tab === "memos" &&
            (memos.length === 0 ? (
              <EmptyState icon={FileText} text={t("profile.emptyMemos")} />
            ) : (
              memos.map((m) => (
                <Link
                  key={m.id}
                  href={lp(`/memo/${m.id}`)}
                  className="block"
                >
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <p className="text-sm text-foreground line-clamp-2 whitespace-pre-wrap">
                        {m.excerpt}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString(locale)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))
            ))}

          {tab === "blog" &&
            (blogPosts.length === 0 ? (
              <EmptyState icon={Newspaper} text={t("profile.emptyBlog")} />
            ) : (
              blogPosts.map((p) => (
                <Link
                  key={p.id}
                  href={lp(`/blog/${p.slug}`)}
                  className="block"
                >
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{p.title}</CardTitle>
                    </CardHeader>
                    {p.excerpt && (
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {p.excerpt}
                        </p>
                      </CardContent>
                    )}
                  </Card>
                </Link>
              ))
            ))}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${
        active
          ? "border-primary text-primary font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: typeof FileText;
  text: string;
}) {
  return (
    <div className="text-center py-12">
      <Icon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
