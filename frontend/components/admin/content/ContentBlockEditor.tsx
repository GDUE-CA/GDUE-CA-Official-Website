"use client";

/**
 * 内容块编辑器（Markdown 正文）
 *
 * - 挂载时按 key 拉取内容块预填；body_md 为空时提示先保存一次
 * - 保存走 upsert（首次写入即创建）；展示最近更新时间
 */
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { getContentBlock, upsertContentBlock } from "@/lib/api/content";

export function ContentBlockEditor({ ck }: { ck: string }) {
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const block = await getContentBlock(ck);
        if (cancelled) return;
        setTitle(block.title ?? "");
        setBody(block.body_md ?? "");
        setUpdatedAt(block.updated_at);
        setIsEmpty(!block.body_md);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ck]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const block = await upsertContentBlock(ck, {
        title: title.trim(),
        body_md: body,
      });
      setUpdatedAt(block.updated_at);
      setIsEmpty(!block.body_md);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Save className="h-4 w-4" />
            {t("admin.content.bodyLabel")}
          </CardTitle>
          {updatedAt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {t("admin.content.updatedAt")}:
              <FormattedUserActionTime utcIso={updatedAt} />
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <>
            {isEmpty && (
              <p className="text-sm text-amber-600 bg-amber-500/10 px-3 py-2 rounded-md">
                {t("admin.content.empty")}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="cb-title">{t("admin.content.titleLabel")}</Label>
              <Input
                id="cb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cb-body">{t("admin.content.bodyLabel")}</Label>
              <Textarea
                id="cb-body"
                rows={16}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            {saved && (
              <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">
                {t("admin.content.saved")}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t("admin.content.saveBtn")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
