"use client";

/**
 * 文件资源统一管理（/admin/media）
 * 分类筛选 + 文件名搜索 + 分页 + 上传（≤20MB 白名单类型）+ 删除（含物理文件）。
 * 对应后端 /api/admin/media*。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { adminDeleteMedia, adminListMedia, adminUploadMedia } from "@/lib/api/media";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { MediaCategory, MediaFile } from "@/types/api";

const CATEGORIES: (MediaCategory | "all")[] = ["all", "avatar", "blog", "cover", "member", "misc"];
const PAGE_SIZE = 20;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function MediaManager() {
  const { t } = useI18n();
  const [items, setItems] = useState<MediaFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<MediaCategory | "all">("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListMedia({
        category: category === "all" ? undefined : category,
        q: query.trim() || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [category, query, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  // 搜索防抖（300ms）：与 MembersManager 一致，变更时回到第一页
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      await adminUploadMedia(file, category === "all" ? "misc" : category);
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(m: MediaFile) {
    if (!window.confirm(t("admin.media.deleteConfirm", { name: m.original_name || m.filename }))) return;
    setError(null);
    try {
      await adminDeleteMedia(m.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isImage = (mime: string) => mime.startsWith("image/") && mime !== "image/svg+xml";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.media.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.media.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            {t("common.refresh")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("admin.media.upload")}
          </Button>
        </div>
      </div>

      {/* 分类筛选 + 搜索 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-md border border-input overflow-hidden">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategory(c);
                setPage(1);
              }}
              className={`px-3 h-9 text-sm transition-colors ${
                category === c
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-muted-foreground"
              }`}
            >
              {t(`admin.media.cat.${c}`)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.media.searchPlaceholder")}
            className="pl-8"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("admin.media.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((m) => (
            <Card key={m.id} className="overflow-hidden">
              <CardContent className="p-0">
                {/* 缩略图：图片直接预览；其他类型显示 mime 徽章块 */}
                <div className="h-32 bg-muted flex items-center justify-center">
                  {isImage(m.mime) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.storage_path} alt={m.original_name || m.filename} className="h-full w-full object-cover" />
                  ) : (
                    <Badge variant="secondary">{m.mime}</Badge>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium truncate" title={m.original_name || m.filename}>
                    {m.original_name || m.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(m.size)} · {t(`admin.media.cat.${m.category}`)}
                    {m.uploader_name ? ` · @${m.uploader_name}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <FormattedUserActionTime utcIso={m.created_at} />
                  </p>
                  <div className="flex gap-1.5 pt-1">
                    <a
                      href={m.storage_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
                    >
                      {t("admin.media.open")}
                    </a>
                    <span className="flex-1" />
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(m)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("common.prevPage")}
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t("common.nextPage")}
          </Button>
        </div>
      )}
    </div>
  );
}
