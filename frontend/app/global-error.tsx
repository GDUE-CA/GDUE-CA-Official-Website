"use client";

/**
 * 全局错误页：根 layout 自身出错时替换整个文档，因此需自带 <html>/<body> 与全局样式。
 */
import "@/app/globals.css";
import { ErrorView } from "@/components/shared/ErrorView";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-cn" className="h-full antialiased">
      <body className="min-h-full">
        <ErrorView error={error} reset={reset} />
      </body>
    </html>
  );
}
