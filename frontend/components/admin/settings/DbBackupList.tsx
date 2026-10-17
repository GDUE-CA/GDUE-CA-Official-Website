"use client";

/**
 * DbBackupList —— 备份与恢复文件列表（V0.5.7 后台列表清单 #11）
 *
 * 数据来自 GET /api/admin/db/exports（文件系统扫描，系统重置自动备份
 * 同样在此可见可下载）。桌面端表格 / 移动端卡片，统一走 AdminList，
 * 不使用横向滚动。下载为同域直链（cookie 鉴权，浏览器直接另存）。
 */
import { useCallback, useEffect, useState } from "react";
import Download from "@/assets/icons/action/download.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { AdminList } from "@/components/admin/shared/AdminList";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { listDbExports, dbExportDownloadUrl } from "@/lib/api/dbMaintenance";
import { formatBytes } from "@/lib/utils";
import type { DbExportFile } from "@/lib/api/dbMaintenance";

export function DbBackupList({ refreshTick = 0 }: { refreshTick?: number }) {
  const { t } = useI18n();
  const [items, setItems] = useState<DbExportFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDbExports();
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t("admin.settings.dbBackupListTitle")}
        </h3>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("admin.settings.dbBackupRefresh")}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!error && (
        <AdminList<DbExportFile>
          rows={items}
          rowKey={(f) => f.filename}
          tableClassName="w-full table-fixed text-sm"
          tableHeadClassName="border-b border-border bg-muted/30"
          headerCellBaseClassName="px-3 py-2"
          cellBaseClassName="px-3 py-2"
          mobileContainerClassName="space-y-3"
          mobileTitle={(f) => f.filename}
          empty={
            loading ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                {t("common.loading")}
              </p>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {t("admin.settings.dbBackupEmpty")}
              </p>
            )
          }
          columns={[
            {
              key: "filename",
              header: t("admin.settings.dbBackupColFilename"),
              headerClassName: "w-[46%]",
              cellClassName: "font-mono text-xs truncate",
              render: (f) => f.filename,
            },
            {
              key: "size",
              header: t("admin.settings.dbBackupColSize"),
              headerClassName: "w-[18%]",
              cellClassName: "text-xs text-muted-foreground whitespace-nowrap",
              mobileLabel: t("admin.settings.dbBackupColSize"),
              render: (f) => formatBytes(f.size_bytes),
            },
            {
              key: "created_at",
              header: t("admin.settings.dbBackupColCreatedAt"),
              headerClassName: "w-[24%]",
              cellClassName: "text-xs text-muted-foreground whitespace-nowrap",
              mobileLabel: t("admin.settings.dbBackupColCreatedAt"),
              render: (f) => <FormattedUserActionTime utcIso={f.created_at} />,
            },
          ]}
          actionsHeaderClassName="w-[12%]"
          actionsHeader={t("admin.settings.dbBackupColActions")}
          actions={(f) => (
            <Button asChild variant="outline" size="sm">
              <a
                href={dbExportDownloadUrl(f.filename)}
                download={f.filename}
                aria-label={t("admin.settings.dbBackupDownload")}
              >
                <Download className="h-4 w-4" />
                {t("admin.settings.dbBackupDownload")}
              </a>
            </Button>
          )}
        />
      )}
    </div>
  );
}
