"use client";

/**
 * MarkdownRenderer - Markdown 渲染组件
 * 使用 react-markdown + remark-gfm + rehype-highlight 渲染 Markdown 内容
 * 应用于博客文章和项目详情
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm md:prose-base max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // 确保链接在新标签打开
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          // 代码块样式
          pre: ({ children }) => <pre className="prose-pre">{children}</pre>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
