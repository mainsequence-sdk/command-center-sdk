import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type {
  WidgetComponentProps,
  WidgetSettingsComponentProps,
} from "../../index.js";

export type MarkdownNoteWidth = "compact" | "prose" | "full";
export type MarkdownNoteVerticalAlign = "top" | "center" | "bottom";
export interface MarkdownNoteWidgetProps extends Record<string, unknown> {
  content?: string;
  contentWidth?: MarkdownNoteWidth;
  contentVerticalAlign?: MarkdownNoteVerticalAlign;
  emptyState?: string;
  openLinksInNewTab?: boolean;
  showHeader?: boolean;
}

export function normalizeMarkdownNoteWidth(value: unknown): MarkdownNoteWidth {
  return value === "compact" || value === "full" ? value : "prose";
}
export function normalizeMarkdownNoteVerticalAlign(value: unknown): MarkdownNoteVerticalAlign {
  return value === "center" || value === "bottom" ? value : "top";
}

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), "table", "thead", "tbody", "tr", "th", "td", "img"])),
  attributes: {
    ...defaultSchema.attributes,
    th: [...(defaultSchema.attributes?.th ?? []), "align", "colspan", "rowspan"],
    td: [...(defaultSchema.attributes?.td ?? []), "align", "colspan", "rowspan"],
    img: [...(defaultSchema.attributes?.img ?? []), "src", "alt", "title", "height", "width"],
  },
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"], src: ["http", "https"] },
};

export function MarkdownNoteWidget({ props }: WidgetComponentProps<MarkdownNoteWidgetProps>) {
  const content = props.content?.trim() ?? "";
  if (!content) {
    return <div className="cc-core-widget cc-core-widget__empty">{props.emptyState?.trim() || "Add Markdown content in widget settings."}</div>;
  }
  const width = normalizeMarkdownNoteWidth(props.contentWidth);
  const align = normalizeMarkdownNoteVerticalAlign(props.contentVerticalAlign);
  return (
    <div className="cc-core-widget cc-core-markdown" style={{ display: "flex", flexDirection: "column", justifyContent: align === "center" ? "center" : align === "bottom" ? "flex-end" : "flex-start" }}>
      <div className={width === "full" ? undefined : `cc-core-markdown--${width}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
          components={{
            a: ({ href, ...anchorProps }: ComponentPropsWithoutRef<"a">) => <a href={href} target={props.openLinksInNewTab === false ? undefined : "_blank"} rel={props.openLinksInNewTab === false ? undefined : "noreferrer"} {...anchorProps} />,
          }}
        >{content}</ReactMarkdown>
      </div>
    </div>
  );
}

export function MarkdownNoteWidgetSettings({ draftProps, editable, onDraftPropsChange }: WidgetSettingsComponentProps<MarkdownNoteWidgetProps>) {
  return (
    <div className="cc-core-widget__settings">
      <label>Markdown content<textarea rows={12} value={draftProps.content ?? ""} disabled={!editable} onChange={(event) => onDraftPropsChange({ ...draftProps, content: event.target.value })} /></label>
      <label>Content width<select value={normalizeMarkdownNoteWidth(draftProps.contentWidth)} disabled={!editable} onChange={(event) => onDraftPropsChange({ ...draftProps, contentWidth: normalizeMarkdownNoteWidth(event.target.value) })}><option value="compact">Compact</option><option value="prose">Prose</option><option value="full">Full width</option></select></label>
      <label>Vertical alignment<select value={normalizeMarkdownNoteVerticalAlign(draftProps.contentVerticalAlign)} disabled={!editable} onChange={(event) => onDraftPropsChange({ ...draftProps, contentVerticalAlign: normalizeMarkdownNoteVerticalAlign(event.target.value) })}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
      <label><input type="checkbox" checked={draftProps.openLinksInNewTab !== false} disabled={!editable} onChange={(event) => onDraftPropsChange({ ...draftProps, openLinksInNewTab: event.target.checked })} /> Open links in a new tab</label>
    </div>
  );
}
