"use client";

/**
 * /{locale}/u/[username] — 用户个人主页（V0.5.5 §9，Discord + X 风格）
 *
 * 结构：
 * 1. 顶部全屏宽度 Banner 封面（自定义图 / 自定义纯色 / 系统默认）
 * 2. 圆形头像叠放在封面左下方（Discord 样式）+ 昵称 + 唯一 ID @username
 * 3. 两个 Tab：【主页 About】默认激活；【随手笔记 / 博客 Posts】仅公开内容
 * 4. 关注按钮三态：关注 / 已关注；互关显示「互相关注」标记（底层好友逻辑不变）
 *
 * 隐私：性别 / 生日 / 简介等字段由后端按 profile_privacy 过滤，权限不足字段为 null，
 * 前端直接不渲染（无空白占位、无「保密」字样）。地区永久公开。
 */
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import UserCircle from "@/assets/icons/user/user-circle.svg";
import MapPin from "@/assets/icons/status/map-pin.svg";
import CalendarDays from "@/assets/icons/status/calendar-days.svg";
import FileText from "@/assets/icons/status/file-text.svg";
import Newspaper from "@/assets/icons/status/newspaper.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import GraduationCap from "@/assets/icons/status/graduation-cap.svg";
import Handshake from "@/assets/icons/status/handshake.svg";
import UserPlus from "@/assets/icons/user/user-plus.svg";
import CheckBadge from "@/assets/icons/status/badge-check.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { BadgeList } from "@/components/user/BadgeChip";
import { Button } from "@/components/ui/button";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import { fetchMe } from "@/lib/api/auth";
import {
  fetchPublicProfile,
  followUser,
  unfollowUser,
  listUserMemos,
  listUserBlog,
} from "@/lib/api/profile";
import type { UserProfile, MemoBriefOut, BlogPost } from "@/types/api";

type Tab = "about" | "posts";

/** 拼接后端资源绝对 URL（头像 / 封面） */
function assetUrl(p: string): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  if (p.startsWith("http")) return p;
  return p.startsWith("/") ? `${base}${p}` : `${base}/${p}`;
}

export default function UserProfilePage() {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();
  const params = useParams<{ username: string }>();
  const username = params.username;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  // V0.5.5 §9.4：默认 Tab 必须为 About，绝不默认加载帖子流
  const [tab, setTab] = useState<Tab>("about");
  const [memos, setMemos] = useState<MemoBriefOut[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 访问者身份：null=未登录/BG（无法关注）；用于区分「本人 → 编辑资料」
  const [viewer, setViewer] = useState<{ username: string } | null>(null);
  // 关注状态本地镜像（后端为权威，前端乐观更新）
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // 个人资料 + 当前登录者（未登录静默）
  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError(null);
    fetchPublicProfile(username)
      .then((p) => {
        setProfile(p);
        setFollowing(p.is_following === true);
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
    fetchMe()
      .then((me) => setViewer({ username: me.username }))
      .catch(() => setViewer(null));
  }, [username, t]);

  // 帖子内容懒加载：仅首次切到 Posts 拉取（About 默认不加载）
  useEffect(() => {
    if (tab !== "posts" || !profile || postsLoaded) return;
    setPostsLoaded(true);
    listUserMemos(username)
      .then((res) => setMemos(res.items ?? []))
      .catch(() => setMemos([]));
    listUserBlog(username)
      .then((res) => setBlogPosts(res.items ?? []))
      .catch(() => setBlogPosts([]));
  }, [tab, profile, postsLoaded, username]);

  async function toggleFollow() {
    if (!profile || followBusy) return;
    setFollowBusy(true);
    const prev = following;
    // 乐观更新
    setFollowing(!prev);
    try {
      if (prev) {
        await unfollowUser(profile.username);
      } else {
        await followUser(profile.username);
      }
    } catch {
      // 回滚 + 提示（未登录理论上按钮已跳登录，403/网络错误走回滚）
      setFollowing(prev);
      setError(t("profile.followFailed"));
    } finally {
      setFollowBusy(false);
    }
  }

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

  const avatarUrl = profile.avatar_url ? assetUrl(profile.avatar_url) : null;
  const bannerUrl = profile.profile_banner ? assetUrl(profile.profile_banner) : null;
  const isSelf = viewer?.username === profile.username;
  const isFriend = profile.is_friend === true && following;

  // 地区展示文本（永久公开）
  const regionText = [
    profile.locality_text,
    profile.locality,
    profile.region,
    profile.country,
  ]
    .filter(Boolean)
    .join(" · ");

  const birthdayText = profile.birthday
    ? new Date(profile.birthday).toLocaleDateString(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-muted/10">
      {/* 1. 顶部全屏宽度 Banner 封面（图 / 自定义纯色 / 系统默认） */}
      <div className="w-full h-40 sm:h-56 overflow-hidden">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            style={
              profile.profile_banner_color
                ? { backgroundColor: profile.profile_banner_color }
                : undefined
            }
            className={
              profile.profile_banner_color
                ? "h-full w-full"
                : "h-full w-full bg-gradient-to-br from-primary/25 via-muted to-secondary"
            }
          />
        )}
      </div>

      {/* 2. 头像叠放 + 昵称 + 唯一 ID + 社交动作 */}
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-end justify-between gap-3">
          <div className="-mt-10 sm:-mt-12 shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={profile.display_name}
                className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover bg-secondary ring-4 ring-background"
              />
            ) : (
              <UserCircle className="h-20 w-20 sm:h-24 sm:w-24 text-muted-foreground ring-4 ring-background rounded-full bg-muted" />
            )}
          </div>
          {/* 社交动作区：本人=编辑资料；访客=关注/已关注；未登录=关注（点击去登录） */}
          <div className="pb-1.5">
            {isSelf ? (
              <Button asChild variant="outline" size="sm">
                <Link href={lp("/setting/profile")}>
                  {t("profile.editProfile")}
                </Link>
              </Button>
            ) : viewer ? (
              <Button
                variant={following ? "outline" : "default"}
                size="sm"
                onClick={toggleFollow}
                disabled={followBusy}
              >
                {following ? (
                  <>
                    <CheckBadge className="h-4 w-4 mr-1" />
                    {t("profile.following")}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-1" />
                    {t("profile.follow")}
                  </>
                )}
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href={lp("/login")}>
                  <UserPlus className="h-4 w-4 mr-1" />
                  {t("profile.follow")}
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2 pb-4 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              {profile.display_name}
            </h1>
            <BadgeList badges={profile.badges} />
          </div>
          {/* 用户唯一 ID */}
          <p className="text-sm text-muted-foreground">@{profile.username}</p>

          {/* 身份标签（本地 SVG 图标，禁止 emoji 充当功能图标） */}
          {(profile.identity_school_verified || profile.is_club_member) && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {profile.identity_school_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {t("profile.tagSchool")}
                </span>
              )}
              {profile.is_club_member && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  <Handshake className="h-3.5 w-3.5" />
                  {t("profile.tagClub")}
                </span>
              )}
              {/* 双向互关标记（底层好友特权由后端生效） */}
              {isFriend && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <Handshake className="h-3.5 w-3.5" />
                  {t("profile.mutual")}
                </span>
              )}
            </div>
          )}

          {/* 关注计数（粉丝 / 关注） */}
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">
                {profile.follower_count}
              </span>{" "}
              {t("profile.followers")}
            </span>
            <span>
              <span className="font-semibold text-foreground">
                {profile.following_count}
              </span>{" "}
              {t("profile.followingLabel")}
            </span>
          </div>

          {/* 地区永久公开 + 加入时间 */}
          <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            {regionText && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {regionText}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {t("profile.joinedAt", {
                date: new Date(profile.created_at).toLocaleDateString(locale),
              })}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Tab 切换栏：About 默认 / Posts */}
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex gap-1">
          <TabButton
            active={tab === "about"}
            onClick={() => setTab("about")}
            icon={UserCircle}
            label={t("profile.tabs.about")}
          />
          <TabButton
            active={tab === "posts"}
            onClick={() => setTab("posts")}
            icon={FileText}
            label={t("profile.tabs.posts")}
          />
        </div>

        {/* Tab1 About：个人简介 + 隐私过滤后的公开资料（null 字段不渲染） */}
        {tab === "about" && (
          <div className="py-4 space-y-4">
            {/* 个人简介：null（隐私不可见 / 未填写）时整块不渲染 */}
            {profile.bio && (
              <section className="rounded-xl border border-border bg-background p-4">
                <h2 className="text-sm font-semibold mb-2">
                  {t("profile.aboutBioTitle")}
                </h2>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                  {profile.bio}
                </p>
              </section>
            )}

            {/* 性别 / 生日：后端隐私过滤，null 直接不渲染，无「保密」占位 */}
            {(profile.gender || birthdayText) && (
              <section className="rounded-xl border border-border bg-background p-4">
                <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 text-sm">
                  {profile.gender && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0">
                        {t("profile.genderLabel")}
                      </dt>
                      <dd>
                        {profile.gender === "male"
                          ? t("profile.genderMale")
                          : profile.gender === "female"
                            ? t("profile.genderFemale")
                            : null}
                      </dd>
                    </div>
                  )}
                  {birthdayText && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0">
                        {t("profile.birthdayLabel")}
                      </dt>
                      <dd>{birthdayText}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            {/* 学校资料块（后端控制输出：本人恒可见；访客需主人隐私开关开启；
                未验证用户恒为 null → 整块不渲染） */}
            {profile.school_info && (
              <section className="rounded-xl border border-border bg-background p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold mb-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  {t("profile.schoolInfoTitle")}
                </h2>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  {profile.school_info.student_id && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0">
                        {t("profile.schoolStudentId")}
                      </dt>
                      <dd className="truncate">
                        {profile.school_info.student_id}
                      </dd>
                    </div>
                  )}
                  {profile.school_info.college_name && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0">
                        {t("profile.schoolCollege")}
                      </dt>
                      <dd className="truncate">
                        {profile.school_info.college_name}
                      </dd>
                    </div>
                  )}
                  {profile.school_info.major_name && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0">
                        {t("profile.schoolMajor")}
                      </dt>
                      <dd className="truncate">
                        {profile.school_info.major_name}
                      </dd>
                    </div>
                  )}
                  {profile.school_info.grade_year != null && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0">
                        {t("profile.schoolGrade")}
                      </dt>
                      <dd className="truncate">
                        {profile.school_info.grade_year}
                      </dd>
                    </div>
                  )}
                  {profile.school_info.class_display_name && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0">
                        {t("profile.schoolClass")}
                      </dt>
                      <dd className="truncate">
                        {profile.school_info.class_display_name}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
          </div>
        )}

        {/* Tab2 Posts：仅公开笔记 + 已发布博客（懒加载，切到时才请求） */}
        {tab === "posts" && (
          <div className="py-4 space-y-6">
            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <FileText className="h-4 w-4" />
                {t("profile.postsNotesTitle")}
              </h2>
              {memos.length === 0 ? (
                <EmptyState icon={FileText} text={t("profile.emptyMemos")} />
              ) : (
                memos.map((m) => (
                  <Link
                    key={m.id}
                    href={lp(`/memo/${m.id}`)}
                    className="block"
                  >
                    <div className="rounded-xl border border-border bg-background p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                      <p className="text-sm text-foreground line-clamp-2 whitespace-pre-wrap">
                        {m.excerpt}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString(locale)}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Newspaper className="h-4 w-4" />
                {t("profile.postsBlogTitle")}
              </h2>
              {blogPosts.length === 0 ? (
                <EmptyState icon={Newspaper} text={t("profile.emptyBlog")} />
              ) : (
                blogPosts.map((p) => (
                  <Link
                    key={p.id}
                    href={lp(`/blog/${p.slug}`)}
                    className="block"
                  >
                    <div className="rounded-xl border border-border bg-background p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                      <h3 className="text-base font-semibold">{p.title}</h3>
                      {p.excerpt && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {p.excerpt}
                        </p>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </section>
          </div>
        )}
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
    <div className="text-center py-10">
      <Icon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
