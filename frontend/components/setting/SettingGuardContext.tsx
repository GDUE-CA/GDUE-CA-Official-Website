"use client";

/**
 * SettingGuardContext —— 未保存修改离开守卫
 *
 * - 各 Tab 表单通过 registerDirty(key, dirty) 注册脏状态
 * - guardNavigate(fn)：存在脏状态时拦截导航，弹确认框；确认「丢弃修改」后执行回调
 * - 任一 Tab 处于脏状态时，补充 window beforeunload 浏览器原生提示
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DirtyGuardValue {
  registerDirty: (key: string, dirty: boolean) => void;
  guardNavigate: (fn: () => void) => void;
}

const DirtyGuardContext = createContext<DirtyGuardValue | null>(null);

export function useDirtyGuard(): DirtyGuardValue {
  const ctx = useContext(DirtyGuardContext);
  if (!ctx) throw new Error("useDirtyGuard must be used within SettingGuardProvider");
  return ctx;
}

export function SettingGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const dirtyMap = useRef(new Map<string, boolean>());
  const pendingRef = useRef<(() => void) | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hasDirty, setHasDirty] = useState(false);

  const registerDirty = useCallback((key: string, dirty: boolean) => {
    dirtyMap.current.set(key, dirty);
    setHasDirty([...dirtyMap.current.values()].some(Boolean));
  }, []);

  const guardNavigate = useCallback((fn: () => void) => {
    const anyDirty = [...dirtyMap.current.values()].some(Boolean);
    if (anyDirty) {
      pendingRef.current = fn;
      setConfirmOpen(true);
    } else {
      fn();
    }
  }, []);

  // 有未保存修改时：关闭/刷新页面前给出浏览器原生确认
  useEffect(() => {
    if (!hasDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasDirty]);

  function closeDialog() {
    setConfirmOpen(false);
    pendingRef.current = null;
  }

  /** 确认丢弃：清空脏标记并执行被拦截的导航 */
  function discardAndContinue() {
    dirtyMap.current.clear();
    setHasDirty(false);
    setConfirmOpen(false);
    const fn = pendingRef.current;
    pendingRef.current = null;
    fn?.();
  }

  const value = useMemo(
    () => ({ registerDirty, guardNavigate }),
    [registerDirty, guardNavigate]
  );

  return (
    <DirtyGuardContext.Provider value={value}>
      {children}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("setting.unsavedConfirm")}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDialog}>
              {t("setting.cancel")}
            </Button>
            <Button variant="destructive" onClick={discardAndContinue}>
              {t("setting.unsavedConfirmDiscard")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DirtyGuardContext.Provider>
  );
}
