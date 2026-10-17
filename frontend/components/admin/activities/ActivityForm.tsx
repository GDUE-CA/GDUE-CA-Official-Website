"use client";

/**
 * 活动创建/编辑表单（供 /admin/activities 的 Dialog 使用）
 *
 * 规范校验：名称/描述/分类/报名起止必填，人数上限为 ≥0 整数，截止须晚于开始。
 */
import { useState } from "react";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import { useI18n } from "@/i18n/provider";
import { utcToLocalInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createActivity,
  updateActivity,
} from "@/lib/api/activities";
import type { Activity, ActivityStatus } from "@/types/api";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

/** 后端 ActivityIn 字段名（前端预校验与后端 1001 错误共用，data-field 对位） */
type ActivityField =
  | "title" | "slug" | "description" | "content" | "category"
  | "register_start" | "register_end" | "start_at" | "end_at"
  | "max_participants" | "participants" | "status" | "cover_url";

const STATUSES: ActivityStatus[] = [
  "draft",
  "published",
  "registration_open",
  "ended",
  "archived",
];

export function ActivityForm({
  initial,
  onSaved,
}: {
  initial: Activity | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [registerStart, setRegisterStart] = useState(
    initial?.register_start ? utcToLocalInput(initial.register_start) : ""
  );
  const [registerEnd, setRegisterEnd] = useState(
    initial?.register_end ? utcToLocalInput(initial.register_end) : ""
  );
  // Phase 3：活动开始/结束时间（发布活动时双必填）
  // 回填必须 UTC → 本地时间转换：直接截断 ISO 字符串会把 UTC 当本地时间，再次保存产生二次偏移
  const [startAt, setStartAt] = useState(
    initial?.start_at ? utcToLocalInput(initial.start_at) : ""
  );
  const [endAt, setEndAt] = useState(
    initial?.end_at ? utcToLocalInput(initial.end_at) : ""
  );
  const [maxParticipants, setMaxParticipants] = useState<string>(
    initial ? String(initial.max_participants) : "0"
  );
  // 实际参与人数：留空 = 未统计（历史活动统计值）
  const [participants, setParticipants] = useState<string>(
    initial?.participants != null ? String(initial.participants) : ""
  );
  const [status, setStatus] = useState<ActivityStatus>(
    initial?.status ?? "draft"
  );
  const [coverUrl, setCoverUrl] = useState(initial?.cover_url ?? "");
  const fieldErrors = useServerFieldErrors<ActivityField>();
  const fe = fieldErrors.errors;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): boolean {
    const next: Partial<Record<ActivityField, string>> = {};
    if (!title.trim()) next.title = t("admin.activities.fieldRequired");
    if (!content.trim()) next.content = t("admin.activities.fieldRequired");
    if (!category.trim()) next.category = t("admin.activities.fieldRequired");
    if (!registerStart) next.register_start = t("admin.activities.fieldRequired");
    if (!registerEnd) next.register_end = t("admin.activities.fieldRequired");
    // Phase 3：活动开始/结束时间双必填
    if (!startAt) next.start_at = t("admin.activities.fieldRequired");
    if (!endAt) next.end_at = t("admin.activities.fieldRequired");
    const cap = Number(maxParticipants);
    if (
      maxParticipants === "" ||
      !Number.isInteger(cap) ||
      cap < 0
    ) {
      next.max_participants = t("admin.activities.capacityInvalid");
    }
    if (participants !== "" && (!Number.isInteger(Number(participants)) || Number(participants) < 0)) {
      next.participants = t("admin.activities.capacityInvalid");
    }
    if (registerStart && registerEnd) {
      const s = new Date(registerStart).getTime();
      const e = new Date(registerEnd).getTime();
      if (e <= s) next.register_end = t("admin.activities.dateOrder");
    }
    // Phase 3：活动时间顺序校验
    if (startAt && endAt) {
      const s = new Date(startAt).getTime();
      const e = new Date(endAt).getTime();
      if (e <= s) next.end_at = t("admin.activities.dateOrder");
    }
    return !fieldErrors.set(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        description: description.trim(),
        content: content.trim(),
        category: category.trim(),
        register_start: new Date(registerStart).toISOString(),
        register_end: new Date(registerEnd).toISOString(),
        // Phase 3：活动开始/结束时间
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        max_participants: Number(maxParticipants) || 0,
        participants: participants === "" ? null : Number(participants),
        status,
        cover_url: coverUrl.trim() || undefined,
      };
      if (initial) {
        await updateActivity(initial.id, payload);
      } else {
        await createActivity(payload);
      }
      onSaved();
    } catch (err) {
      setError(fieldErrors.capture(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" {...fieldErrors.rootProps}>
      <div className="space-y-2" data-field="title">
        <Label htmlFor="title">{t("admin.activities.name")}</Label>
        <Input id="title" aria-invalid={!!fe.title} value={title} onChange={(e) => setTitle(e.target.value)} />
        <FieldError>{fe.title}</FieldError>
      </div>
      <div className="space-y-2" data-field="content">
        <Label htmlFor="content">{t("admin.activities.description")}</Label>
        <Textarea id="content" aria-invalid={!!fe.content} rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
        <FieldError>{fe.content}</FieldError>
      </div>
      <div className="space-y-2" data-field="description">
        <Label htmlFor="shortDescription">{t("admin.activities.shortDescription")}</Label>
        <Textarea
          id="shortDescription"
          aria-invalid={!!fe.description}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("admin.activities.shortDescriptionPlaceholder")}
        />
        <FieldError>{fe.description}</FieldError>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2" data-field="category">
          <Label htmlFor="category">{t("admin.activities.category")}</Label>
          <Input
            id="category"
            aria-invalid={!!fe.category}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t("admin.activities.categoryPlaceholder")}
          />
          <FieldError>{fe.category}</FieldError>
        </div>
        <div className="space-y-2" data-field="max_participants">
          <Label htmlFor="maxParticipants">{t("admin.activities.capacity")}</Label>
          <Input
            id="maxParticipants"
            aria-invalid={!!fe.max_participants}
            type="number"
            min={0}
            step={1}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value)}
          />
          <FieldError>{fe.max_participants}</FieldError>
        </div>
      </div>
      {/* 前台展示标识 + 实际参与人数（历史活动统计） */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2" data-field="slug">
          <Label htmlFor="slug">{t("admin.activities.slug")}</Label>
          <Input
            id="slug"
            aria-invalid={!!fe.slug}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={t("admin.activities.slugPlaceholder")}
          />
          <FieldError>{fe.slug}</FieldError>
        </div>
        <div className="space-y-2" data-field="participants">
          <Label htmlFor="participants">{t("admin.activities.participants")}</Label>
          <Input
            id="participants"
            aria-invalid={!!fe.participants}
            type="number"
            min={0}
            step={1}
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            placeholder={t("admin.activities.participantsPlaceholder")}
          />
          <FieldError>{fe.participants}</FieldError>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2" data-field="register_start">
          <Label htmlFor="registerStart">{t("admin.activities.registerStart")}</Label>
          <Input
            id="registerStart"
            aria-invalid={!!fe.register_start}
            type="datetime-local"
            value={registerStart}
            onChange={(e) => setRegisterStart(e.target.value)}
          />
          <FieldError>{fe.register_start}</FieldError>
        </div>
        <div className="space-y-2" data-field="register_end">
          <Label htmlFor="registerEnd">{t("admin.activities.registerEnd")}</Label>
          <Input
            id="registerEnd"
            aria-invalid={!!fe.register_end}
            type="datetime-local"
            value={registerEnd}
            onChange={(e) => setRegisterEnd(e.target.value)}
          />
          <FieldError>{fe.register_end}</FieldError>
        </div>
      </div>
      {/* Phase 3：活动开始/结束时间（发布活动时双必填） */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2" data-field="start_at">
          <Label htmlFor="startAt">{t("admin.activities.startAt")}</Label>
          <Input
            id="startAt"
            aria-invalid={!!fe.start_at}
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
          <FieldError>{fe.start_at}</FieldError>
        </div>
        <div className="space-y-2" data-field="end_at">
          <Label htmlFor="endAt">{t("admin.activities.endAt")}</Label>
          <Input
            id="endAt"
            aria-invalid={!!fe.end_at}
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
          <FieldError>{fe.end_at}</FieldError>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2" data-field="status">
          <Label htmlFor="status">{t("admin.activities.status")}</Label>
          <select
            id="status"
            aria-invalid={!!fe.status}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as ActivityStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.activities.statuses.${s}`)}
              </option>
            ))}
          </select>
          <FieldError>{fe.status}</FieldError>
        </div>
        <div className="space-y-2" data-field="cover_url">
          <Label htmlFor="coverUrl">{t("admin.activities.coverUrl")}</Label>
          <Input
            id="coverUrl"
            aria-invalid={!!fe.cover_url}
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder={t("admin.activities.coverUrlPlaceholder")}
          />
          <FieldError>{fe.cover_url}</FieldError>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving} className="w-full">
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
        {t("admin.activities.save")}
      </Button>
    </form>
  );
}
