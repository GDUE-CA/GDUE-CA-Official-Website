"use client";

/**
 * SSO 受信应用管理（/admin/sso）
 * 自建 SSO 授权服务器的受信应用 CRUD：client_id 自动生成、client_secret
 * 明文仅创建/重置时一次性展示。对应后端 /api/admin/sso/clients*。
 */
import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminCreateSsoClient,
  adminDeleteSsoClient,
  adminListSsoClients,
  adminResetSsoClientSecret,
  adminUpdateSsoClient,
} from "@/lib/api/sso";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { SsoClient } from "@/types/api";

export function SsoClientsManager() {
  const { t } = useI18n();
  const [clients, setClients] = useState<SsoClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新建表单
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUris, setNewUris] = useState("");

  // 一次性 secret 展示弹窗
  const [secretShown, setSecretShown] = useState<{ name: string; secret: string } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setClients(await adminListSsoClients());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    const uris = newUris.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!newName.trim() || uris.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const created = await adminCreateSsoClient({ name: newName.trim(), redirect_uris: uris });
      setCreateOpen(false);
      setNewName("");
      setNewUris("");
      if (created.secret) {
        setSecretShown({ name: created.name, secret: created.secret });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(c: SsoClient) {
    setBusy(true);
    setError(null);
    try {
      const updated = await adminResetSsoClientSecret(c.id);
      if (updated.secret) setSecretShown({ name: updated.name, secret: updated.secret });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(c: SsoClient) {
    setBusy(true);
    setError(null);
    try {
      await adminUpdateSsoClient(c.id, { is_active: !c.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(c: SsoClient) {
    if (!window.confirm(t("admin.sso.deleteConfirm", { name: c.name }))) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteSsoClient(c.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.sso.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.sso.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            {t("common.refresh")}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("admin.sso.create")}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("admin.sso.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {c.name}
                      <Badge variant={c.is_active ? "default" : "secondary"}>
                        {c.is_active ? t("common.enabled") : t("common.disabled")}
                      </Badge>
                    </CardTitle>
                    <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                      {t("admin.sso.clientId")}：{c.client_id}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => handleToggle(c)}>
                      {c.is_active ? t("admin.sso.disable") : t("admin.sso.enable")}
                    </Button>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => handleReset(c)}>
                      {t("admin.sso.resetSecret")}
                    </Button>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => handleDelete(c)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                <p>
                  {t("admin.sso.redirectUris")}：
                  {c.redirect_uris.map((u) => (
                    <span key={u} className="mr-2 inline-block font-mono">{u}</span>
                  ))}
                </p>
                <p>
                  {t("admin.sso.createdAt")}：
                  <FormattedUserActionTime utcIso={c.created_at} />
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 新建弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.sso.create")}</DialogTitle>
            <DialogDescription>{t("admin.sso.createHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sso-name">{t("admin.sso.appName")}</Label>
              <Input
                id="sso-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={128}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sso-uris">{t("admin.sso.redirectUrisInput")}</Label>
              <Textarea
                id="sso-uris"
                rows={4}
                value={newUris}
                onChange={(e) => setNewUris(e.target.value)}
                placeholder={"https://app.example.com/auth/callback\nhttps://app2.example.com/cb"}
                className="font-mono text-xs"
              />
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={busy || !newName.trim() || !newUris.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 一次性 secret 展示 */}
      <Dialog open={!!secretShown} onOpenChange={(o) => !o && setSecretShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.sso.secretTitle")}</DialogTitle>
            <DialogDescription>{t("admin.sso.secretOnceHint", { name: secretShown?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <pre className="rounded-md bg-muted px-3 py-2.5 text-xs font-mono break-all whitespace-pre-wrap select-all">
              {secretShown?.secret}
            </pre>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                if (secretShown) navigator.clipboard.writeText(secretShown.secret).catch(() => {});
              }}
            >
              {t("common.copy")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
