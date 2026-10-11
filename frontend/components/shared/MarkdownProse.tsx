"use client";

/**
 * MarkdownProse - 轻量 Markdown 正文渲染（CMS 内容块 / 招新信息正文）
 * 不依赖 @tailwindcss/typography，用基础工具类排版；内容为空时不渲染任何节点
 * 外链新窗口打开，站内链接保持当前窗口
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="text-lg font-semibold mt-4 mb-2 text-foreground">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold mt-4 mb-2 text-foreground">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold mt-3 mb-1.5 text-foreground">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold mt-3 mb-1.5 text-foreground">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="leading-relaxed text-muted-foreground my-2">{children}</p>
  ),
  ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed text-muted-foreground">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 my-2 text-muted-foreground">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    if (!href) return <span className="underline underline-offset-2">{children}</span>;
    const common = "text-primary underline underline-offset-2";
    if (href.startsWith("/")) {
      return (
        <a href={href} className={common}>
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={common}>
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
  code: ({ children }) => (
    <code className="font-mono text-[0.85em] bg-secondary px-1 py-0.5 rounded">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="bg-secondary rounded-md p-3 overflow-x-auto my-2 text-sm">{children}</pre>
  ),
  hr: () => <hr className="my-4 border-border" />,
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      className="max-w-full rounded-md my-2"
    />
  ),
};

export function MarkdownProse({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  if (!content || !content.trim()) return null;
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
