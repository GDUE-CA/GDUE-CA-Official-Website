"use client";

/**
 * 全局封禁弹窗 Provider
 *
 * - 挂载于 [locale]/layout 与 admin 布局两处，覆盖前台与后台
 * - 应用挂载 + 路由变化时 fetch /api/security/ban-status
 * - 命中封禁：全屏遮罩弹窗，展示违规原因 + 解封倒计时（服务端权威时钟 useCountDown）或永久封禁文案 + 联系管理员
 * - 遮罩不可关闭，强制阻断所有页面交互
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import ShieldAlert from "@/assets/icons/status/shield-alert.svg";
import { motion, AnimatePresence } from "framer-motion";
import { fetchBanStatus } from "@/lib/api/security";
import type { BanStatus } from "@/types/api";
import { useI18n } from "@/i18n/provider";
import { useCountDown } from "@/lib/hooks/useSystemTimer";

/** 格式化剩余秒数为 天:时:分:秒 */
function fmtRemain(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function BanModal() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [ban, setBan] = useState<BanStatus | null>(null);

  const checkBan = useCallback(async () => {
    try {
      const s = await fetchBanStatus();
      if (s.banned) {
        setBan(s);
      } else {
        setBan(null);
      }
    } catch {
      // 网络错误 / 后端不可用时，不弹窗（避免与登录失败等冲突）
    }
  }, []);

  useEffect(() => {
    checkBan();
  }, [pathname, checkBan]);

  // 解封倒计时：基于服务端权威时钟（规范 §9：禁止本地时间参与业务判断）
  const remainMs = useCountDown(ban?.expires_at);
  const expiredHandledRef = useRef(false);
  useEffect(() => {
    if (remainMs > 0) {
      expiredHandledRef.current = false;
      return;
    }
    if (!ban?.banned || ban.permanent || !ban.expires_at) return;
    if (expiredHandledRef.current) return;
    expiredHandledRef.current = true;
    // 倒计时归零：重新检查封禁状态（解封则关闭弹窗）
    checkBan();
  }, [ban, remainMs, checkBan]);

  return (
    <AnimatePresence>
      {ban?.banned && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          aria-modal="true"
          role="dialog"
        >
          {/* 全屏遮罩，不可点击关闭 */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md rounded-xl border border-destructive/40 bg-background shadow-2xl p-6 md:p-8"
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="p-3 rounded-full bg-destructive/10 text-destructive">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold font-display">
                {t("ban.title")}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("ban.desc")}
              </p>

              {ban.reason && (
                <div className="w-full rounded-md bg-muted/60 px-4 py-3 text-sm text-left">
                  <div className="text-xs text-muted-foreground mb-1">
                    {t("ban.reasonLabel")}
                  </div>
                  <div className="text-foreground whitespace-pre-wrap break-words">
                    {ban.reason}
                  </div>
                </div>
              )}

              {ban.permanent ? (
                <div className="text-destructive font-semibold text-sm">
                  {t("ban.permanent")}
                </div>
              ) : ban.expires_at ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {t("ban.unbanIn")}
                  </span>
                  <span className="font-mono font-bold text-lg tabular-nums text-destructive">
                    {fmtRemain(Math.floor(remainMs / 1000))}
                  </span>
                </div>
              ) : null}

              <div className="text-xs text-muted-foreground border-t border-border w-full pt-3 mt-2">
                {t("ban.contactAdmin")}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
