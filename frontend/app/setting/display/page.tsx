"use client";

/**
 * /setting/display —— 界面与显示（2026-10 合并页）
 *
 * 合并原 appearance / localization / region / regional-format 四个子页：
 * 深色模式 · 风格主题 · 字体大小 · 横屏（DisplayStyleForm）
 * UI 语言 / 时区 / 区域 / 货币（LocalizationForm）
 * 所在地区与时区（RegionForm）
 * 日期 / 星期起始 / 时间格式（RegionalFormatForm）
 */
import { DisplayStyleForm } from "@/components/setting/DisplayStyleForm";
import { LocalizationForm } from "@/components/setting/LocalizationForm";
import { RegionForm } from "@/components/setting/RegionForm";
import { RegionalFormatForm } from "@/components/setting/RegionalFormatForm";

export default function SettingDisplayPage() {
  return (
    <div className="space-y-6">
      <DisplayStyleForm />
      <LocalizationForm />
      <RegionForm />
      <RegionalFormatForm />
    </div>
  );
}
