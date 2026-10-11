"use client";

/**
 * 人员管理筛选栏：搜索 + 角色筛选 + 启用状态筛选 + 清除
 */
import { Search, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { AdminRole } from "@/types/api";

const ROLE_OPTIONS: AdminRole[] = ["super_admin", "admin", "editor", "member"];

export interface UserFilters {
  q: string;
  role: string; // "all" | AdminRole
  active: string; // "all" | "active" | "disabled"
}

export function UserFilterBar({
  filters,
  onChange,
}: {
  filters: UserFilters;
  onChange: (next: UserFilters) => void;
}) {
  const { t } = useI18n();
  const hasFilter = filters.q !== "" || filters.role !== "all" || filters.active !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder={t("admin.users.filterSearch")}
          className="pl-8 h-9"
        />
      </div>

      <Select
        value={filters.role}
        onValueChange={(v) => onChange({ ...filters, role: v })}
      >
        <SelectTrigger className="w-[150px] h-9" aria-label={t("admin.users.filterRole")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("admin.users.roleAll")}</SelectItem>
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r} value={r}>
              {t(`admin.users.roles.${r}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.active}
        onValueChange={(v) => onChange({ ...filters, active: v })}
      >
        <SelectTrigger className="w-[130px] h-9" aria-label={t("admin.users.filterStatus")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("admin.users.statusAll")}</SelectItem>
          <SelectItem value="active">{t("admin.users.statusActive")}</SelectItem>
          <SelectItem value="disabled">{t("admin.users.statusDisabled")}</SelectItem>
        </SelectContent>
      </Select>

      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ q: "", role: "all", active: "all" })}
          className="gap-1 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
          {t("admin.users.clearFilters")}
        </Button>
      )}
    </div>
  );
}
