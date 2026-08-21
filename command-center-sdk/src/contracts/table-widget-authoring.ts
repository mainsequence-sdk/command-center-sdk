import type { TabularFrameFieldType } from "./tabular-frame-source.js";
import type { WidgetInstancePresentation } from "./widget-contracts.js";

export const TABLE_WIDGET_AUTHORING_CONTRACT =
  "command-center.table_widget_authoring@v1" as const;
export const TABLE_WIDGET_AUTHORING_SCHEMA_ID =
  "urn:mainsequence:command-center-sdk:schema:table-widget-authoring:v1" as const;
export const CORE_TABLE_WIDGET_ID = "core__table" as const;
export const CORE_PRO_TABLE_WIDGET_ID = "core__pro-table" as const;
export const TABLE_WIDGET_DATASET_OUTPUT_ID = "dataset" as const;
export const TABLE_WIDGET_SELECTED_ROWS_OUTPUT_ID = "selectedRows" as const;
export const TABLE_WIDGET_ACTIVE_ROW_OUTPUT_ID = "activeRow" as const;
export const TABLE_WIDGET_ACTIVE_CELL_OUTPUT_ID = "activeCell" as const;
export const TABLE_WIDGET_ACTIVE_CELL_VALUE_OUTPUT_ID = "activeCellValue" as const;
export const TABLE_WIDGET_SELECTED_CELL_VALUES_OUTPUT_ID = "selectedCellValues" as const;

export type TableWidgetId =
  | typeof CORE_TABLE_WIDGET_ID
  | typeof CORE_PRO_TABLE_WIDGET_ID;
export type TableWidgetEdition = "community" | "pro";
export type TableWidgetSourceMode = "bound" | "connection" | "connection-stream" | "manual";
export type TableWidgetLegacySourceMode = "direct" | "filter_widget" | "manual";
export type TableWidgetDateRangeMode = "dashboard" | "fixed";
export type TableWidgetColumnFormat =
  | "auto"
  | "text"
  | "datetime"
  | "number"
  | "currency"
  | "percent"
  | "bps"
  | "formula";
export type TableWidgetDensity = "compact" | "comfortable";
export type TableWidgetBarMode = "none" | "fill";
export type TableWidgetGradientMode = "none" | "fill";
export type TableWidgetHeatmapPalette =
  | "auto"
  | "viridis"
  | "plasma"
  | "inferno"
  | "magma"
  | "turbo"
  | "jet"
  | "blue-white-red"
  | "red-yellow-green";
export type TableWidgetGaugeMode = "none" | "ring";
export type TableWidgetRangeMode = "auto" | "fixed";
export type TableWidgetAlign = "auto" | "left" | "center" | "right";
export type TableWidgetPinned = "none" | "left" | "right";
export type TableWidgetOperator = "gt" | "gte" | "lt" | "lte" | "eq";
export type TableWidgetTone = "neutral" | "primary" | "success" | "warning" | "danger";
export type TableWidgetSelectionMode = "none" | "single-row" | "multi-row" | "cell";
export type TableWidgetCellValue = number | string | boolean | null;
export type TableWidgetRow = Record<string, TableWidgetCellValue>;
export type TableWidgetFrameRow = TableWidgetCellValue[];

export interface ManualTableColumnDefinition {
  key: string;
  type: TabularFrameFieldType;
}

export interface TableWidgetColumnSchema {
  key: string;
  label: string;
  description?: string;
  format: Exclude<TableWidgetColumnFormat, "auto">;
  formulaExpression?: string;
  formulaResultFormat?: Exclude<TableWidgetColumnFormat, "auto" | "formula">;
  minWidth?: number;
  flex?: number;
  pinned?: Exclude<TableWidgetPinned, "none">;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  dateTimeInputFormat?: string;
  dateTimeOutputFormat?: string;
  categorical?: boolean;
  heatmapEligible?: boolean;
  compact?: boolean;
}

export interface TableWidgetColumnOverride {
  visible?: boolean;
  label?: string;
  format?: TableWidgetColumnFormat;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  dateTimeInputFormat?: string;
  dateTimeOutputFormat?: string;
  heatmap?: boolean;
  compact?: boolean;
  barMode?: TableWidgetBarMode;
  gradientMode?: TableWidgetGradientMode;
  heatmapPalette?: TableWidgetHeatmapPalette;
  gaugeMode?: TableWidgetGaugeMode;
  visualRangeMode?: TableWidgetRangeMode;
  visualMin?: number;
  visualMax?: number;
  align?: TableWidgetAlign;
  pinned?: TableWidgetPinned;
}

export interface TableWidgetValueLabel {
  columnKey: string;
  value: string;
  label?: string;
  tone?: TableWidgetTone;
  textColor?: string;
  backgroundColor?: string;
}

export interface TableWidgetConditionalRule {
  id: string;
  columnKey: string;
  operator: TableWidgetOperator;
  value: number;
  tone?: TableWidgetTone;
  textColor?: string;
  backgroundColor?: string;
}

export interface TableWidgetMergeKeyMapping {
  seedField: string;
  liveField: string;
}

export interface TableWidgetActiveCellSelection {
  rowKey?: string;
  rowIndex: number;
  columnKey: string;
  value: unknown;
}

export interface TableWidgetSelectionState {
  mode: TableWidgetSelectionMode;
  selectedRowKeys: string[];
  selectedRowIndices: number[];
  activeRowKey?: string;
  activeRowIndex?: number;
  activeCell?: TableWidgetActiveCellSelection;
  selectedCells: TableWidgetActiveCellSelection[];
  implicitMode?: boolean;
  updatedAtMs: number;
}

export interface TableWidgetInteractionRuntimeState {
  interaction?: {
    selection?: TableWidgetSelectionState;
  };
}

/**
 * Stable, JSON-safe authoring base shared by Table and Pro Table.
 *
 * Hosts may preserve additional keys for host-owned source adapters. Portable consumers must not
 * require those keys to render bound or manual frames.
 */
export interface TableWidgetProps extends Record<string, unknown> {
  tableSourceMode?: TableWidgetSourceMode;
  sourceMode?: TableWidgetLegacySourceMode;
  sourceWidgetId?: string;
  embeddedConnectionPresentation?: WidgetInstancePresentation;
  embeddedConnectionQuery?: Record<string, unknown>;
  sourceId?: number;
  dateRangeMode?: TableWidgetDateRangeMode;
  fixedEndMs?: number;
  fixedStartMs?: number;
  uniqueIdentifierList?: string[];
  manualColumns?: ManualTableColumnDefinition[];
  manualRows?: Array<Record<string, unknown>>;
  limit?: number;
  columns?: string[];
  rows?: TableWidgetFrameRow[];
  schema?: TableWidgetColumnSchema[];
  density?: TableWidgetDensity;
  groupBy?: string;
  showToolbar?: boolean;
  showSearch?: boolean;
  showColumnFilters?: boolean;
  zebraRows?: boolean;
  pagination?: boolean;
  pageSize?: number;
  columnOverrides?: Record<string, TableWidgetColumnOverride>;
  valueLabels?: TableWidgetValueLabel[];
  conditionalRules?: TableWidgetConditionalRule[];
  formulasEnabled?: boolean;
  liveMergeKeyMappings?: TableWidgetMergeKeyMapping[];
  selectionMode?: TableWidgetSelectionMode;
  selectionKeyFields?: string[];
  publishSelectionOutputs?: boolean;
}

export type CommunityTableWidgetColumnSchema = Omit<
  TableWidgetColumnSchema,
  "format" | "formulaExpression" | "formulaResultFormat"
> & {
  format: Exclude<TableWidgetColumnSchema["format"], "formula">;
  formulaExpression?: never;
  formulaResultFormat?: never;
};

export type CommunityTableWidgetAuthoringProps = Omit<
  TableWidgetProps,
  "formulasEnabled" | "schema"
> & {
  formulasEnabled?: false;
  schema?: CommunityTableWidgetColumnSchema[];
};

/** Language-neutral envelope for tools or backends that author a Table or Pro Table instance. */
export type TableWidgetAuthoringContractV1 =
  | {
      contract: typeof TABLE_WIDGET_AUTHORING_CONTRACT;
      widgetId: typeof CORE_TABLE_WIDGET_ID;
      props: CommunityTableWidgetAuthoringProps;
    }
  | {
      contract: typeof TABLE_WIDGET_AUTHORING_CONTRACT;
      widgetId: typeof CORE_PRO_TABLE_WIDGET_ID;
      props: TableWidgetProps;
    };
