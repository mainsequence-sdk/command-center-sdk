import {
  CORE_APP_COMPONENT_WIDGET_ID,
  CORE_MARKDOWN_NOTE_WIDGET_ID,
  CORE_PRO_TABLE_WIDGET_ID,
  CORE_STATISTIC_WIDGET_ID,
  CORE_TABLE_WIDGET_ID,
  CORE_TABULAR_TRANSFORM_WIDGET_ID,
} from "../built-ins/index.js";

export {
  CORE_APP_COMPONENT_WIDGET_ID,
  CORE_MARKDOWN_NOTE_WIDGET_ID,
  CORE_PRO_TABLE_WIDGET_ID,
  CORE_STATISTIC_WIDGET_ID,
  CORE_TABLE_WIDGET_ID,
  CORE_TABULAR_TRANSFORM_WIDGET_ID,
};

export const CORE_RICH_TEXT_NOTE_WIDGET_ID = "core__rich-text-note";
export const CORE_CONNECTION_QUERY_WIDGET_ID = "core__connection-query";
export const CORE_CONNECTION_STREAM_QUERY_WIDGET_ID = "core__connection-stream-query";
export const CORE_DEBUG_STREAM_WIDGET_ID = "core__debug-stream";
export const CORE_GRAPH_WIDGET_ID = "core__graph";
export const CORE_WORKSPACE_ROW_WIDGET_ID = "core__workspace-row";
export const CORE_WORKSPACE_SLIDE_WIDGET_ID = "core__workspace-slide";
export const ECHARTS_SPEC_WIDGET_ID = "echarts__spec";
export const LIGHTWEIGHT_CHARTS_SPEC_WIDGET_ID = "lightweight-charts__spec";
export const MAIN_SEQUENCE_AI_AGENT_TERMINAL_WIDGET_ID = "main-sequence-ai__agent-terminal";
export const MAIN_SEQUENCE_AI_WORKSPACE_WIDGET_ID = "main-sequence-ai__workspace";
export const MAIN_SEQUENCE_AI_UPSTREAM_INSPECTOR_WIDGET_ID = "main-sequence-ai__upstream-inspector";
export const MAIN_SEQUENCE_FOUNDRY_DEPENDENCY_GRAPH_WIDGET_ID = "main-sequence-foundry__dependency-graph";
export const MAIN_SEQUENCE_FOUNDRY_PROJECT_INFRA_GRAPH_WIDGET_ID = "main-sequence-foundry__project-infra-graph";

export function normalizeWidgetTypeId(widgetId: string): string {
  return widgetId.trim();
}

export function normalizeWidgetTypeIds(widgetIds: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(widgetIds, normalizeWidgetTypeId).filter(Boolean)));
}
