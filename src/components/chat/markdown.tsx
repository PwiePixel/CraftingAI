"use client";

import {
  isValidElement,
  memo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { PluggableList } from "unified";
import { normalizeMath } from "@/lib/shared/math";
import "katex/dist/katex.min.css";

const remarkPlugins: PluggableList = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]];
const rehypePlugins: PluggableList = [
  [rehypeKatex, { throwOnError: false, strict: false }],
  [rehypeHighlight, { detect: false }],
];

function CodeBlock({ children, node: _node, ...rest }: ComponentPropsWithoutRef<"pre"> & ExtraProps) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  let language = "";
  if (isValidElement<{ className?: string }>(children)) {
    language = /language-([\w+#.-]+)/.exec(children.props.className ?? "")?.[1] ?? "";
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(ref.current?.innerText ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; nothing sensible to do.
    }
  }

  return (
    <div className="code-block">
      <div className="flex items-center justify-between border-b border-border py-1 pr-1.5 pl-3.5 text-xs text-fg-muted">
        <span className="font-mono">{language || "code"}</span>
        <button
          type="button"
          onClick={copy}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-surface-3 hover:text-fg"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre ref={ref} {...rest}>
        {children}
      </pre>
    </div>
  );
}

const components: Components = {
  pre: CodeBlock,
  a({ node: _node, href, children, ...rest }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" {...rest}>
        {children}
      </a>
    );
  },
  // Remote images are never loaded: they could be used to track readers.
  img({ node: _node, src, alt }) {
    const label = alt || "image";
    return typeof src === "string" && src ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {label}
      </a>
    ) : (
      <span>{label}</span>
    );
  },
  table({ node: _node, children, ...rest }) {
    return (
      <div className="table-wrap">
        <table {...rest}>{children}</table>
      </div>
    );
  },
};

/** Renders model output. Raw HTML in the source is never interpreted. */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  );
});
