"use client";

/**
 * 安全问题表单（可复用：注册 / 补设 / 修改 / 初始化向导共用）
 *
 * 受控组件：父级持有 SecurityQuestionItem[]，通过 onChange 回调同步。
 * V0.5.8 题库 DB 化：预设题提交显示文本快照（不关联题库ID），自定义题存原文。
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchPresetSecurityQuestions } from "@/lib/api/auth";
import type { PresetSecurityQuestion, SecurityQuestionItem } from "@/types/api";

interface Props {
  value: SecurityQuestionItem[];
  onChange: (items: SecurityQuestionItem[]) => void;
  /** 每个位置的错误信息（可选，index 0/1/2 对应 position 1/2/3） */
  errors?: string[];
}

const POSITIONS = [1, 2, 3] as const;

export function SecurityQuestionsForm({ value, onChange, errors }: Props) {
  const { t, locale } = useI18n();
  const [presets, setPresets] = useState<PresetSecurityQuestion[]>([]);

  useEffect(() => {
    fetchPresetSecurityQuestions()
      .then((res) => setPresets(res.presets))
      .catch(() => setPresets([]));
    // 切换语言时按新语言重取题库文本
  }, [locale]);

  function ensureItem(pos: number): SecurityQuestionItem {
    const found = value.find((v) => v.position === pos);
    if (found) return found;
    return { position: pos, question: "", answer: "", is_custom: false };
  }

  function updateItem(pos: number, patch: Partial<SecurityQuestionItem>) {
    const current = ensureItem(pos);
    const next = value.find((v) => v.position === pos)
      ? value.map((item) => (item.position === pos ? { ...item, ...patch } : item))
      : [...value, { ...current, ...patch }];
    // 按 position 排序，保证顺序稳定
    next.sort((a, b) => a.position - b.position);
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {/* 自定义问题固定提示文案（V0.5.8 §2.3：页面固定展示） */}
      <p className="text-xs text-muted-foreground bg-muted/60 px-3 py-2 rounded-md">
        {t("auth.securityQuestions.customHint")}
      </p>
      {POSITIONS.map((pos) => {
        const item = ensureItem(pos);
        const err = errors?.[pos - 1];
        return (
          <div key={pos} className="space-y-2 rounded-lg border border-border p-3">
            <Label className="text-sm font-medium">
              {t("auth.securityQuestions.question")} {pos}
            </Label>
            <div className="flex gap-4 text-xs">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`sq-type-${pos}`}
                  checked={!item.is_custom}
                  onChange={() => updateItem(pos, { is_custom: false, question: "" })}
                  className="accent-primary"
                />
                {t("auth.securityQuestions.preset")}
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`sq-type-${pos}`}
                  checked={item.is_custom}
                  onChange={() => updateItem(pos, { is_custom: true, question: "" })}
                  className="accent-primary"
                />
                {t("auth.securityQuestions.custom")}
              </label>
            </div>
            {item.is_custom ? (
              <Input
                placeholder={t("auth.securityQuestions.customPlaceholder")}
                value={item.question}
                onChange={(e) => updateItem(pos, { question: e.target.value })}
                maxLength={256}
                autoComplete="off"
              />
            ) : (
              <select
                value={item.question}
                onChange={(e) => updateItem(pos, { question: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">{t("auth.securityQuestions.selectPreset")}</option>
                {presets.map((p, idx) => (
                  <option key={p.key ?? `db-${idx}`} value={p.question}>
                    {p.question}
                  </option>
                ))}
              </select>
            )}
            <Input
              placeholder={t("auth.securityQuestions.answerPlaceholder")}
              value={item.answer}
              onChange={(e) => updateItem(pos, { answer: e.target.value })}
              maxLength={256}
              autoComplete="off"
              type="text"
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        );
      })}
    </div>
  );
}
