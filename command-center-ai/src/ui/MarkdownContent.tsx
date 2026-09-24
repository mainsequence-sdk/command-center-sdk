import { memo, useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

import { Check, Copy } from "lucide-react";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cx } from "./class-names.js";

const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(
    new Set([
      ...(defaultSchema.tagNames ?? []),
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "img",
    ]),
  ),
  attributes: {
    ...defaultSchema.attributes,
    table: [...(defaultSchema.attributes?.table ?? [])],
    thead: [...(defaultSchema.attributes?.thead ?? [])],
    tbody: [...(defaultSchema.attributes?.tbody ?? [])],
    tr: [...(defaultSchema.attributes?.tr ?? [])],
    th: [...(defaultSchema.attributes?.th ?? []), "align", "colspan", "rowspan"],
    td: [...(defaultSchema.attributes?.td ?? []), "align", "colspan", "rowspan"],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "src",
      "alt",
      "title",
      "height",
      "width",
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
};

/**
 * A fenced code block with the copy control every chat reader expects. The
 * text is read back off the rendered `<pre>`, so it copies what the reader
 * sees including highlighting wrappers.
 */
function MarkdownCodeBlock({ className, ...props }: ComponentPropsWithoutRef<"pre">) {
  const preRef = useRef<HTMLPreElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 2000);

    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyCode = () => {
    const text = preRef.current?.textContent ?? "";

    if (!text.trim()) {
      return;
    }

    void Promise.resolve(navigator.clipboard?.writeText(text))
      .then(() => setCopied(true))
      .catch(() => {
        // A denied clipboard leaves the block as it was; nothing to report.
      });
  };

  return (
    <div className="ms-chat-markdown__code-frame">
      <pre ref={preRef} className={cx("ms-chat-markdown__pre", className)} {...props} />
      <Button
        aria-label={copied ? "Code copied" : "Copy code"}
        className="ms-chat-markdown__copy"
        data-code-copy
        iconOnly
        onClick={copyCode}
        size="small"
        title={copied ? "Code copied" : "Copy code"}
      >
        {copied ? (
          <Check className="ms-chat-icon-sm ms-chat-icon-success" aria-hidden="true" />
        ) : (
          <Copy className="ms-chat-icon-sm" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

export interface MarkdownContentProps {
  content: string;
  className?: string;
  transformHref?: (href: string) => string;
  openLinksInNewTab?: boolean;
}

/**
 * Markdown as the chat draws it: GitHub-flavoured, raw HTML sanitized, links
 * opened in a new tab by default, and a copy control on every code block.
 *
 * The elements take their look from the SDK's markdown stylesheet
 * (`command-center-markdown`, published as `theme/markdown.css`), which the
 * application loads with the SDK. The chat's stylesheet adds only what the SDK
 * does not draw: heading tracking, list spacing and markers, the table and
 * code-block frames, and the copy control.
 *
 * Memoized: the remark/rehype pipeline re-parses the full document on every
 * render, which is prohibitive when a transcript renders one instance per
 * message and re-renders per streaming delta. Rendering is pure in its props.
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
  transformHref,
  openLinksInNewTab = true,
}: MarkdownContentProps) {
  return (
    <div
      className={cx("command-center-markdown ms-chat-markdown", className)}
      style={{ fontSize: "var(--font-size-body-sm)" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, markdownSanitizeSchema],
        ]}
        components={{
          h1: ({ className: headingClassName, ...props }) => (
            <h1
              className={cx("ms-chat-markdown__heading", headingClassName)}
              style={{ fontSize: "var(--font-size-markdown-h1)" }}
              {...props}
            />
          ),
          h2: ({ className: headingClassName, ...props }) => (
            <h2
              className={cx("ms-chat-markdown__heading", headingClassName)}
              style={{ fontSize: "var(--font-size-markdown-h2)" }}
              {...props}
            />
          ),
          h3: ({ className: headingClassName, ...props }) => (
            <h3
              className={cx("ms-chat-markdown__heading", headingClassName)}
              style={{ fontSize: "var(--font-size-markdown-h3)" }}
              {...props}
            />
          ),
          h4: ({ className: headingClassName, ...props }) => (
            <h4
              className={cx("ms-chat-markdown__heading", headingClassName)}
              style={{ fontSize: "var(--font-size-markdown-h4)" }}
              {...props}
            />
          ),
          p: (props) => (
            <p
              style={{
                fontSize: "var(--font-size-body)",
                lineHeight: "var(--line-height-body)",
              }}
              {...props}
            />
          ),
          a: ({ className: linkClassName, href, ...props }) => {
            const resolvedHref = href ? transformHref?.(href) ?? href : href;

            return (
              <a
                className={cx("ms-chat-markdown__link", linkClassName)}
                href={resolvedHref}
                target={openLinksInNewTab ? "_blank" : undefined}
                rel={openLinksInNewTab ? "noreferrer" : undefined}
                {...props}
              />
            );
          },
          ul: ({ className: listClassName, ...props }) => (
            <ul className={cx("ms-chat-markdown__list", listClassName)} {...props} />
          ),
          ol: ({ className: listClassName, ...props }) => (
            <ol className={cx("ms-chat-markdown__list", listClassName)} {...props} />
          ),
          li: (props) => (
            <li
              style={{
                fontSize: "var(--font-size-body)",
                lineHeight: "var(--line-height-body)",
              }}
              {...props}
            />
          ),
          table: (props) => (
            <div className="ms-chat-markdown__table-frame">
              <table style={{ fontSize: "var(--table-font-size)" }} {...props} />
            </div>
          ),
          thead: ({ className: headClassName, ...props }) => (
            <thead className={cx("ms-chat-markdown__thead", headClassName)} {...props} />
          ),
          img: ({ className: imageClassName, alt, ...props }) => (
            <img
              className={cx("ms-chat-markdown__image", imageClassName)}
              alt={alt ?? ""}
              {...props}
            />
          ),
          pre: (props: ComponentPropsWithoutRef<"pre">) => <MarkdownCodeBlock {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
