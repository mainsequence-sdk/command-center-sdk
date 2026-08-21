import {
  applyResolvedTableComputedColumns,
  CORE_TABULAR_FRAME_SOURCE_CONTRACT,
  normalizeTabularFrameSource,
  type TableFrameComputedColumn,
  type TableWidgetActiveCellSelection,
  type TableWidgetInteractionRuntimeState,
  type TableWidgetProps,
  type TableWidgetSelectionState,
  type TabularFrameFieldSchema,
  type TabularFrameSourceV1,
} from "../../../../contracts/index.js";
import type { ResolvedWidgetInput, ResolvedWidgetInputs } from "../../../index.js";

import { compileTableFormulaExpression } from "./formula.js";

export const TABLE_WIDGET_SEED_INPUT_ID = "seedData" as const;
export const TABLE_WIDGET_LIVE_UPDATES_INPUT_ID = "liveUpdates" as const;

export const tableWidgetDefaultProps: TableWidgetProps = {
  tableSourceMode: "bound",
  density: "comfortable",
  showToolbar: true,
  showSearch: true,
  showColumnFilters: true,
  zebraRows: true,
  pagination: true,
  pageSize: 25,
  selectionMode: "none",
  publishSelectionOutputs: false,
};

export const proTableWidgetDefaultProps: TableWidgetProps = {
  ...tableWidgetDefaultProps,
  formulasEnabled: true,
};

function resolvedInput(
  value: ResolvedWidgetInput | ResolvedWidgetInput[] | undefined,
): ResolvedWidgetInput | undefined {
  return Array.isArray(value)
    ? value.find((entry) => entry.status === "valid") ?? value[0]
    : value;
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function inferFieldType(values: unknown[]): TabularFrameFieldSchema["type"] {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (present.length === 0) return "unknown";
  if (present.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return present.every(Number.isInteger) ? "integer" : "number";
  }
  if (present.every((value) => typeof value === "boolean")) return "boolean";
  if (present.every((value) => typeof value === "string")) return "string";
  return "json";
}

export function buildManualTableFrame(props: TableWidgetProps): TabularFrameSourceV1 {
  const rows = Array.isArray(props.manualRows)
    ? props.manualRows.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
    : [];
  const columns = uniqueStrings([
    ...(props.manualColumns ?? []).map((column) => column.key),
    ...rows.flatMap((row) => Object.keys(row)),
  ]);
  const declaredTypes = new Map(
    (props.manualColumns ?? []).map((column) => [column.key, column.type] as const),
  );
  const fields = columns.map((key) => ({
    key,
    label: props.schema?.find((column) => column.key === key)?.label ?? key,
    type: declaredTypes.get(key) ?? inferFieldType(rows.map((row) => row[key])),
    nullable: rows.some((row) => row[key] === null || row[key] === undefined),
    provenance: "manual" as const,
  }));

  return {
    status: columns.length || rows.length ? "ready" : "idle",
    columns,
    rows: rows.map((row) => ({ ...row })),
    fields,
    source: {
      kind: "table-widget",
      label: "Manual table",
      context: { tableSourceMode: "manual" },
    },
  };
}

function tableFormulaColumns(props: TableWidgetProps): TableFrameComputedColumn[] {
  if (!props.formulasEnabled) return [];

  return (props.schema ?? []).flatMap((column) => {
    if (column.format !== "formula") return [];
    const compiled = compileTableFormulaExpression(column.formulaExpression);
    if (!compiled.expression) return [];
    return [{
      id: column.key,
      label: column.label,
      type: column.formulaResultFormat === "text" ? "string" : "number",
      expression: compiled.expression,
    } satisfies TableFrameComputedColumn];
  });
}

export function applyTableWidgetFormulas(
  props: TableWidgetProps,
  frame: TabularFrameSourceV1,
): TabularFrameSourceV1 {
  return applyResolvedTableComputedColumns(frame, tableFormulaColumns(props));
}

export function resolveTableWidgetFrame(
  props: TableWidgetProps,
  inputs?: ResolvedWidgetInputs,
): TabularFrameSourceV1 | null {
  if (props.tableSourceMode === "manual" || props.sourceMode === "manual") {
    return applyTableWidgetFormulas(props, buildManualTableFrame(props));
  }

  const input =
    resolvedInput(inputs?.[TABLE_WIDGET_LIVE_UPDATES_INPUT_ID]) ??
    resolvedInput(inputs?.[TABLE_WIDGET_SEED_INPUT_ID]) ??
    resolvedInput(inputs?.sourceData);
  const frame = normalizeTabularFrameSource(input?.upstreamBase ?? input?.value);
  return frame ? applyTableWidgetFormulas(props, frame) : null;
}

export function resolveTableWidgetDatasetOutput(
  props: TableWidgetProps,
  inputs?: ResolvedWidgetInputs,
): TabularFrameSourceV1 {
  return resolveTableWidgetFrame(props, inputs) ?? {
    status: "idle",
    columns: [],
    rows: [],
    source: { kind: "table-widget" },
  };
}

export function getTableWidgetSelectionState(
  runtimeState: unknown,
): TableWidgetSelectionState | null {
  if (!runtimeState || typeof runtimeState !== "object" || Array.isArray(runtimeState)) return null;
  const selection = (runtimeState as TableWidgetInteractionRuntimeState).interaction?.selection;
  return selection && Array.isArray(selection.selectedRowIndices) ? selection : null;
}

function rowKey(row: Record<string, unknown>, keys: readonly string[]) {
  if (keys.length === 0) return null;
  const values = keys.map((key) => row[key]);
  return values.every((value) => value !== null && value !== undefined)
    ? JSON.stringify(values)
    : null;
}

function selectedRowIndexes(
  props: TableWidgetProps,
  frame: TabularFrameSourceV1,
  state: TableWidgetSelectionState | null,
) {
  if (!state) return [];
  const explicit = new Set(state.selectedRowIndices.filter(Number.isInteger));
  const keyFields = props.selectionKeyFields ?? props.uniqueIdentifierList ?? [];
  if (state.selectedRowKeys.length && keyFields.length) {
    const selectedKeys = new Set(state.selectedRowKeys);
    frame.rows.forEach((row, index) => {
      const key = rowKey(row, keyFields);
      if (key && selectedKeys.has(key)) explicit.add(index);
    });
  }
  return [...explicit].filter((index) => index >= 0 && index < frame.rows.length).sort((a, b) => a - b);
}

export function resolveTableWidgetSelectedRowsOutput(
  props: TableWidgetProps,
  inputs: ResolvedWidgetInputs | undefined,
  runtimeState: unknown,
): TabularFrameSourceV1 {
  const frame = resolveTableWidgetDatasetOutput(props, inputs);
  const indexes = props.publishSelectionOutputs
    ? selectedRowIndexes(props, frame, getTableWidgetSelectionState(runtimeState))
    : [];
  return {
    ...frame,
    rows: indexes.map((index) => ({ ...frame.rows[index] })),
    status: frame.status === "error" || frame.status === "loading" ? frame.status : "ready",
    source: {
      kind: "table-widget-selection",
      context: { contractId: CORE_TABULAR_FRAME_SOURCE_CONTRACT },
    },
  };
}

function activeRowIndex(state: TableWidgetSelectionState | null) {
  return state?.activeRowIndex ?? state?.activeCell?.rowIndex;
}

export function resolveTableWidgetActiveRowOutput(
  props: TableWidgetProps,
  inputs: ResolvedWidgetInputs | undefined,
  runtimeState: unknown,
) {
  if (!props.publishSelectionOutputs) return null;
  const frame = resolveTableWidgetDatasetOutput(props, inputs);
  const index = activeRowIndex(getTableWidgetSelectionState(runtimeState));
  return index === undefined ? null : frame.rows[index] ?? null;
}

export function resolveTableWidgetActiveCellOutput(
  props: TableWidgetProps,
  runtimeState: unknown,
) {
  if (!props.publishSelectionOutputs) return null;
  return getTableWidgetSelectionState(runtimeState)?.activeCell ?? null;
}

export function resolveTableWidgetActiveCellValueOutput(
  props: TableWidgetProps,
  runtimeState: unknown,
) {
  return resolveTableWidgetActiveCellOutput(props, runtimeState)?.value ?? null;
}

export function resolveTableWidgetSelectedCellValuesOutput(
  props: TableWidgetProps,
  runtimeState: unknown,
) {
  if (!props.publishSelectionOutputs) return [];
  return (getTableWidgetSelectionState(runtimeState)?.selectedCells ?? []).map(
    (cell: TableWidgetActiveCellSelection) => cell.value,
  );
}

export function buildTableWidgetSelectionState(input: {
  columnKey: string;
  current?: TableWidgetSelectionState | null;
  mode: TableWidgetSelectionState["mode"];
  row: Record<string, unknown>;
  rowIndex: number;
  selectionKeyFields?: readonly string[];
  value: unknown;
}): TableWidgetSelectionState {
  const stableKey = rowKey(input.row, input.selectionKeyFields ?? []);
  const activeCell = {
    rowKey: stableKey ?? undefined,
    rowIndex: input.rowIndex,
    columnKey: input.columnKey,
    value: input.value,
  } satisfies TableWidgetActiveCellSelection;
  const currentIndices = new Set(input.current?.selectedRowIndices ?? []);
  const currentKeys = new Set(input.current?.selectedRowKeys ?? []);
  const alreadySelected = currentIndices.has(input.rowIndex) ||
    Boolean(stableKey && currentKeys.has(stableKey));

  if (input.mode === "multi-row") {
    if (alreadySelected) {
      currentIndices.delete(input.rowIndex);
      if (stableKey) currentKeys.delete(stableKey);
    } else {
      currentIndices.add(input.rowIndex);
      if (stableKey) currentKeys.add(stableKey);
    }
  }

  const selectedRowIndices = input.mode === "multi-row"
    ? [...currentIndices].sort((left, right) => left - right)
    : input.mode === "cell" || input.mode === "none"
      ? []
      : [input.rowIndex];
  const selectedRowKeys = input.mode === "multi-row"
    ? [...currentKeys]
    : stableKey && selectedRowIndices.length
      ? [stableKey]
      : [];

  return {
    mode: input.mode,
    selectedRowKeys,
    selectedRowIndices,
    activeRowKey: stableKey ?? undefined,
    activeRowIndex: input.rowIndex,
    activeCell,
    selectedCells: [activeCell],
    updatedAtMs: Date.now(),
  };
}
