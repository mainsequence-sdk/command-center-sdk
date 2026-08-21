import { BookOpenText } from "lucide-react";
import {
  CORE_VALUE_STRING_CONTRACT,
} from "../../../contracts/index.js";
import {
  defineWidgetModule,
  defineExtension,
  resolveWidgetDescription,
  resolveWidgetUsageGuidance,
} from "../../index.js";

import { MarkdownNoteWidget, MarkdownNoteWidgetSettings, type MarkdownNoteWidgetProps } from "./MarkdownWidget.js";
import { markdownWidgetUsageGuidance } from "./usage-guidance.js";

export const CORE_MARKDOWN_NOTE_WIDGET_ID = "core__markdown-note";
const MARKDOWN_NOTE_CONTENT_OUTPUT_ID = "markdown-content";
const exampleContent = "# Daily Brief\n\n- Review overnight risk changes.\n- Confirm desk exceptions.";

export const markdownNoteWidgetModule = defineWidgetModule<MarkdownNoteWidgetProps>({
  manifest: {
    id: CORE_MARKDOWN_NOTE_WIDGET_ID,
    widgetVersion: "1.4.0",
    title: "Markdown",
    description: resolveWidgetDescription(markdownWidgetUsageGuidance),
    category: "Core",
    kind: "custom",
    source: "core",
    requiredPermissions: ["workspaces:view"],
    tags: ["markdown", "notes", "documentation", "content"],
    propsVersion: 1,
    userStateVersion: 1,
    workspaceRuntimeMode: "local-ui",
    registryContract: {
      configuration: {
        mode: "custom-settings",
        summary: "Stores authored Markdown content and presentation options.",
        fields: [
          { id: "content", label: "Markdown content", type: "markdown", required: true, source: "custom-settings" },
          { id: "contentWidth", label: "Content width", type: "enum", source: "custom-settings" },
          { id: "contentVerticalAlign", label: "Vertical alignment", type: "enum", source: "custom-settings" },
          { id: "openLinksInNewTab", label: "Open links in new tab", type: "boolean", source: "custom-settings" },
        ],
        requiredSetupSteps: ["Write or paste the Markdown content to render."],
      },
      io: { mode: "static", summary: "Publishes authored Markdown source as a string output." },
      capabilities: { publishedContracts: [CORE_VALUE_STRING_CONTRACT, "core.widget-agent-context@v1"] },
      usageGuidance: resolveWidgetUsageGuidance(markdownWidgetUsageGuidance),
      examples: [{ label: "Runbook panel", summary: "Displays operational instructions.", props: { contentWidth: "prose", openLinksInNewTab: true } }],
    },
  },
  runtime: {
    definition: {
      exampleProps: { content: exampleContent, contentWidth: "prose", contentVerticalAlign: "top", openLinksInNewTab: true },
      mockProps: { content: exampleContent, contentWidth: "prose", contentVerticalAlign: "top", openLinksInNewTab: true },
      settingsComponent: MarkdownNoteWidgetSettings,
      io: { outputs: [{ id: MARKDOWN_NOTE_CONTENT_OUTPUT_ID, label: "Markdown content", contract: CORE_VALUE_STRING_CONTRACT, description: "Raw Markdown source.", valueDescriptor: { kind: "primitive", contract: CORE_VALUE_STRING_CONTRACT, primitive: "string" }, resolveValue: ({ props }) => props.content ?? "" }] },
      workspaceIcon: BookOpenText,
      buildAgentSnapshot: ({ props, domTextContent }) => ({ displayKind: "note", state: props.content?.trim() ? "ready" : "empty", summary: props.content?.trim() ? "Markdown note content is available." : "Markdown note is empty.", data: { content: props.content ?? "", renderedText: domTextContent?.trim() || "" } }),
      component: MarkdownNoteWidget,
    },
  },
});

export const markdownNoteWidget = markdownNoteWidgetModule.runtime.definition;
export const markdownWidgetExtension = defineExtension({
  id: "core-markdown",
  title: "Core Markdown",
  packageName: "@dev-mainsequence/command-center-sdk",
  packageVersion: "0.1.0",
  widgets: [markdownNoteWidgetModule],
});
