"use client";
/**
 * TagInput - 标签输入控件
 *
 * 用法：
 * - 下方 chip 列表展示已选 tag
 * - 文本输入回车 / 逗号 / Tab 确认
 * - 自动从 #TagName / 含 # 的输入剥离前缀
 * - 懒创建：传给后端的 tag_names 直接提交（后端会懒创建）
 */
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** 已知标签的"自动补全"建议（来自 /api/tags 公开接口） */
  suggestions?: string[];
  disabled?: boolean;
  className?: string;
}

function normalize(input: string): string {
  let s = input.trim();
  if (s.startsWith("#")) s = s.slice(1);
  return s.trim();
}

export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  disabled,
  className,
}: TagInputProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  const remaining = suggestions
    .filter((s) => !value.includes(s) && s.toLowerCase().includes(draft.toLowerCase().replace(/^#/, "")))
    .slice(0, 6);

  function commit(raw: string) {
    const tag = normalize(raw);
    if (!tag) return;
    if (value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function remove(tag: string) {
    onChange(value.filter((v) => v !== tag));
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-primary/10 text-primary text-xs"
          >
            <Hash className="h-3 w-3" />
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(tag)}
                className="ml-0.5 rounded hover:bg-primary/20 p-0.5"
                aria-label={`remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <div className="flex-1 min-w-[120px] flex items-center gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder ?? t("memo.editor.tagsHint")}
            disabled={disabled}
            className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 px-2"
          />
          {draft && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => commit(draft)}
              className="h-7 px-2 text-xs"
            >
              <Plus className="h-3 w-3" />
              {t("memo.editor.addTag")}
            </Button>
          )}
        </div>
      </div>
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          <span>建议：</span>
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              className="hover:text-foreground underline-offset-2 hover:underline"
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
