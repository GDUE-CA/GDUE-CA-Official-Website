"use client";

/**
 * 路由级错误页：兜住根 layout 之下所有页面 / 子 layout 抛出的渲染错误。
 * 展示原因 + request id（详见 components/shared/ErrorView.tsx）。
 */
import { ErrorView } from "@/components/shared/ErrorView";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={error} reset={reset} />;
}
