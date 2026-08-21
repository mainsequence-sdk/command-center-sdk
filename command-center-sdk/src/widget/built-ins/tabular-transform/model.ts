import {
  applyResolvedTableComputedColumns,
  normalizeTabularFrameSource,
  type RuntimeDataRef,
  type RuntimeDataStore,
  type RuntimeTabularFrameRef,
  type TabularAggregateMode,
  type TabularFilterCombineMode,
  type TabularFilterOperator,
  type TabularFilterRule,
  type TableFrameComputedColumn,
  type TabularFrameFieldType,
  type TabularFrameSourceV1,
  type TabularTransformAuthoringPropsV1,
  type TabularTransformComputedColumnConfig,
  type TabularTransformMergeKeyMapping,
  type TabularTransformMode,
  type TabularTransformRowMergeMode,
} from "../../../contracts/index.js";
import type { ResolvedWidgetInput, ResolvedWidgetInputs } from "../../index.js";
import { compileTableFormulaExpression } from "../table/shared/formula.js";

export const TABULAR_TRANSFORM_SEED_INPUT_ID = "seedData";
export const TABULAR_TRANSFORM_LIVE_INPUT_ID = "liveUpdates";
export const TABULAR_TRANSFORM_DATASET_OUTPUT_ID = "dataset";
export const TABULAR_TRANSFORM_UPDATES_OUTPUT_ID = "updates";
export const TABULAR_TRANSFORM_LEGACY_INPUT_ID = "sourceData";

export type {
  TabularAggregateMode,
  TabularFilterCombineMode,
  TabularFilterOperator,
  TabularFilterRule,
  TabularTransformComputedColumnConfig,
  TabularTransformMergeKeyMapping,
  TabularTransformMode,
  TabularTransformRowMergeMode,
} from "../../../contracts/index.js";

export type TabularTransformWidgetProps = TabularTransformAuthoringPropsV1;

export type TabularTransformSourceRole = "conflict" | "legacy" | "live" | "none" | "seed";
export type TabularTransformOutputChannel = "dataset" | "updates";

export const TABULAR_TRANSFORM_SINGLE_SOURCE_ERROR =
  "Tabular Transform accepts either seedData or liveUpdates, not both. Remove one binding so the transform publishes on a single downstream path.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(value: unknown): string[] {
  const entries = typeof value === "string"
    ? value.split(/[\n,]+/)
    : Array.isArray(value)
      ? value
      : [];
  return Array.from(new Set(entries.flatMap((entry) => {
    const normalized = typeof entry === "string" ? entry.trim() : "";
    return normalized ? [normalized] : [];
  })));
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeMode(value: unknown): TabularTransformMode {
  return value === "filter" || value === "aggregate" || value === "pivot" || value === "unpivot"
    ? value
    : "none";
}

function normalizeAggregateMode(value: unknown): TabularAggregateMode {
  return value === "first" || value === "sum" || value === "mean" || value === "min" || value === "max"
    ? value
    : "last";
}

function normalizeOperator(value: unknown): TabularFilterOperator {
  return value === "not-equals" || value === "in" || value === "not-in" || value === "gt" ||
    value === "gte" || value === "lt" || value === "lte" || value === "is-empty" ||
    value === "is-not-empty"
    ? value
    : "equals";
}

export function normalizeTabularTransformProps(
  value: TabularTransformWidgetProps | null | undefined,
): TabularTransformWidgetProps {
  const source = isRecord(value) ? value : {};
  return {
    ...source,
    transformMode: normalizeMode(source.transformMode),
    aggregateMode: normalizeAggregateMode(source.aggregateMode),
    computedColumns: Array.isArray(source.computedColumns)
      ? source.computedColumns.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          const key = optionalString(entry.key);
          const formulaExpression = optionalString(entry.formulaExpression);
          if (!key || !formulaExpression) return [];
          const type = entry.type === "string" || entry.type === "boolean" || entry.type === "json"
            ? entry.type
            : "number";
          return [{ key, label: optionalString(entry.label), formulaExpression, type }];
        })
      : [],
    filterCombineMode: source.filterCombineMode === "any" ? "any" : "all",
    filterRules: Array.isArray(source.filterRules)
      ? source.filterRules.flatMap((entry) => {
          if (!isRecord(entry) || !optionalString(entry.field)) return [];
          return [{
            field: optionalString(entry.field),
            operator: normalizeOperator(entry.operator),
            value: entry.value,
          }];
        })
      : [],
    keyFields: uniqueStrings(source.keyFields),
    pivotField: optionalString(source.pivotField),
    pivotValueField: optionalString(source.pivotValueField),
    projectFields: uniqueStrings(source.projectFields),
    rowMergeKeyFields: uniqueStrings(source.rowMergeKeyFields),
    rowMergeKeyMappings: Array.isArray(source.rowMergeKeyMappings)
      ? source.rowMergeKeyMappings.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          const seedField = optionalString(entry.seedField);
          const liveField = optionalString(entry.liveField);
          return seedField && liveField ? [{ seedField, liveField }] : [];
        })
      : [],
    rowMergeMode: source.rowMergeMode === "latest" ? "latest" : "passthrough",
    unpivotFieldName: optionalString(source.unpivotFieldName) ?? "field",
    unpivotValueFieldName: optionalString(source.unpivotValueFieldName) ?? "value",
    unpivotValueFields: uniqueStrings(source.unpivotValueFields),
  };
}

function firstInput(value: ResolvedWidgetInput | ResolvedWidgetInput[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hasBinding(input: ResolvedWidgetInput | undefined) {
  return Boolean(input && input.status !== "unbound");
}

export function resolveTabularTransformSourceRole(
  resolvedInputs: ResolvedWidgetInputs | undefined,
): TabularTransformSourceRole {
  const seed = firstInput(resolvedInputs?.[TABULAR_TRANSFORM_SEED_INPUT_ID]);
  const live = firstInput(resolvedInputs?.[TABULAR_TRANSFORM_LIVE_INPUT_ID]);
  if (hasBinding(seed) && hasBinding(live)) return "conflict";
  if (hasBinding(seed)) return "seed";
  if (hasBinding(live)) return "live";
  if (hasBinding(firstInput(resolvedInputs?.[TABULAR_TRANSFORM_LEGACY_INPUT_ID]))) return "legacy";
  return "none";
}

function isRuntimeRef(value: RuntimeDataRef | undefined): value is RuntimeTabularFrameRef {
  return Boolean(value && value.contractId === "core.tabular_frame@v1" && "columns" in value);
}

function readInputFrame(
  input: ResolvedWidgetInput | undefined,
  runtimeDataStore?: RuntimeDataStore | null,
) {
  if (!input || input.status !== "valid") return null;
  const direct = normalizeTabularFrameSource(input.upstreamBase ?? input.value);
  if (direct) return direct;
  const ref = input.upstreamBaseRef ?? input.valueRef;
  return runtimeDataStore && isRuntimeRef(ref) ? runtimeDataStore.readFrame(ref) : null;
}

function resolveInput(
  resolvedInputs: ResolvedWidgetInputs | undefined,
  role: TabularTransformSourceRole,
) {
  const id = role === "seed"
    ? TABULAR_TRANSFORM_SEED_INPUT_ID
    : role === "live"
      ? TABULAR_TRANSFORM_LIVE_INPUT_ID
      : TABULAR_TRANSFORM_LEGACY_INPUT_ID;
  return firstInput(resolvedInputs?.[id]);
}

function compare(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  const leftTime = typeof left === "string" ? Date.parse(left) : NaN;
  const rightTime = typeof right === "string" ? Date.parse(right) : NaN;
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function matchesRule(row: Record<string, unknown>, rule: TabularFilterRule) {
  const actual = rule.field ? row[rule.field] : undefined;
  const expected = rule.value;
  const values = Array.isArray(expected) ? expected : [expected];
  switch (rule.operator) {
    case "not-equals": return actual !== expected;
    case "in": return values.includes(actual);
    case "not-in": return !values.includes(actual);
    case "gt": return compare(actual, expected) > 0;
    case "gte": return compare(actual, expected) >= 0;
    case "lt": return compare(actual, expected) < 0;
    case "lte": return compare(actual, expected) <= 0;
    case "is-empty": return actual == null || actual === "";
    case "is-not-empty": return actual != null && actual !== "";
    default: return actual === expected;
  }
}

function filterRows(frame: TabularFrameSourceV1, props: TabularTransformWidgetProps) {
  const rules = props.filterRules ?? [];
  if (!rules.length) return frame;
  const predicate = props.filterCombineMode === "any"
    ? (row: Record<string, unknown>) => rules.some((rule) => matchesRule(row, rule))
    : (row: Record<string, unknown>) => rules.every((rule) => matchesRule(row, rule));
  return { ...frame, rows: frame.rows.filter(predicate) };
}

function aggregateValues(values: unknown[], mode: TabularAggregateMode) {
  if (mode === "first") return values[0];
  if (mode === "last") return values[values.length - 1];
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) return null;
  if (mode === "sum") return numeric.reduce((sum, value) => sum + value, 0);
  if (mode === "mean") return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
  if (mode === "min") return Math.min(...numeric);
  return Math.max(...numeric);
}

function aggregateFrame(frame: TabularFrameSourceV1, props: TabularTransformWidgetProps) {
  const keys = props.keyFields ?? [];
  const valueColumns = frame.columns.filter((column) => !keys.includes(column));
  const groups = new Map<string, Record<string, unknown>[]>();
  frame.rows.forEach((row) => {
    const signature = JSON.stringify(keys.map((key) => row[key]));
    groups.set(signature, [...(groups.get(signature) ?? []), row]);
  });
  const rows = Array.from(groups.values()).map((group) => ({
    ...Object.fromEntries(keys.map((key) => [key, group[0]?.[key]])),
    ...Object.fromEntries(valueColumns.map((column) => [
      column,
      aggregateValues(group.map((row) => row[column]), props.aggregateMode ?? "last"),
    ])),
  }));
  return { ...frame, columns: [...keys, ...valueColumns], rows };
}

function pivotFrame(frame: TabularFrameSourceV1, props: TabularTransformWidgetProps) {
  const pivotField = props.pivotField;
  const valueField = props.pivotValueField;
  if (!pivotField || !valueField) return frame;
  const keys = (props.keyFields ?? []).filter((key) => key !== pivotField && key !== valueField);
  const pivotValues = Array.from(new Set(frame.rows.map((row) => String(row[pivotField] ?? ""))));
  const groups = new Map<string, Record<string, unknown>>();
  frame.rows.forEach((row) => {
    const signature = JSON.stringify(keys.map((key) => row[key]));
    const current = groups.get(signature) ?? Object.fromEntries(keys.map((key) => [key, row[key]]));
    current[String(row[pivotField] ?? "")] = row[valueField];
    groups.set(signature, current);
  });
  return { ...frame, columns: [...keys, ...pivotValues], rows: Array.from(groups.values()) };
}

function unpivotFrame(frame: TabularFrameSourceV1, props: TabularTransformWidgetProps) {
  const values = props.unpivotValueFields?.length
    ? props.unpivotValueFields
    : frame.columns.filter((column) => !(props.keyFields ?? []).includes(column));
  const keys = (props.keyFields ?? []).filter((key) => !values.includes(key));
  const fieldName = props.unpivotFieldName ?? "field";
  const valueName = props.unpivotValueFieldName ?? "value";
  return {
    ...frame,
    columns: [...keys, fieldName, valueName],
    rows: frame.rows.flatMap((row) => values.map((field) => ({
      ...Object.fromEntries(keys.map((key) => [key, row[key]])),
      [fieldName]: field,
      [valueName]: row[field],
    }))),
  };
}

function applyComputedColumns(frame: TabularFrameSourceV1, props: TabularTransformWidgetProps) {
  const columns = (props.computedColumns ?? []).flatMap((column) => {
    if (!column.key || !column.formulaExpression) return [];
    const compiled = compileTableFormulaExpression(column.formulaExpression);
    if (!compiled.expression) return [];
    return [{
      id: column.key,
      label: column.label ?? column.key,
      type: column.type ?? "number",
      expression: compiled.expression,
    } satisfies TableFrameComputedColumn];
  });
  return applyResolvedTableComputedColumns(frame, columns);
}

function projectFrame(frame: TabularFrameSourceV1, projectFields: string[] | undefined) {
  if (!projectFields?.length) return frame;
  const selected = projectFields.filter((field) => frame.columns.includes(field));
  return {
    ...frame,
    columns: selected,
    rows: frame.rows.map((row) => Object.fromEntries(selected.map((field) => [field, row[field]]))),
    fields: frame.fields?.filter((field) => selected.includes(field.key)),
  };
}

function mergeLatest(frame: TabularFrameSourceV1, props: TabularTransformWidgetProps) {
  if (props.rowMergeMode !== "latest") return frame;
  const keys = props.rowMergeKeyMappings?.length
    ? props.rowMergeKeyMappings.map((mapping) => mapping.liveField)
    : props.rowMergeKeyFields ?? [];
  if (!keys.length) return frame;
  const rows = new Map<string, Record<string, unknown>>();
  frame.rows.forEach((row) => {
    const signature = JSON.stringify(keys.map((key) => row[key]));
    rows.set(signature, { ...(rows.get(signature) ?? {}), ...row });
  });
  return { ...frame, rows: Array.from(rows.values()) };
}

function inferFields(frame: TabularFrameSourceV1) {
  const existing = new Map((frame.fields ?? []).map((field) => [field.key, field]));
  const fields = frame.columns.map((key) => existing.get(key) ?? {
    key,
    type: inferFieldType(frame.rows.map((row) => row[key])),
    provenance: "derived" as const,
  });
  return { ...frame, fields };
}

function inferFieldType(values: unknown[]): TabularFrameFieldType {
  const value = values.find((candidate) => candidate != null);
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  if (value && typeof value === "object") return "json";
  return "unknown";
}

export function applyTabularTransform(
  input: TabularFrameSourceV1,
  rawProps: TabularTransformWidgetProps,
): TabularFrameSourceV1 {
  const props = normalizeTabularTransformProps(rawProps);
  if (input.status !== "ready") return input;
  let frame = { ...input, rows: input.rows.map((row) => ({ ...row })) };
  if (props.transformMode === "filter") frame = filterRows(frame, props);
  if (props.transformMode === "aggregate") frame = aggregateFrame(frame, props);
  if (props.transformMode === "pivot") frame = pivotFrame(frame, props);
  if (props.transformMode === "unpivot") frame = unpivotFrame(frame, props);
  frame = applyComputedColumns(frame, props);
  frame = projectFrame(frame, props.projectFields);
  frame = mergeLatest(frame, props);
  return inferFields({
    ...frame,
    source: {
      kind: "tabular-transform",
      label: "Tabular Transform",
      updatedAtMs: input.source?.updatedAtMs,
      context: { upstream: input.source },
    },
  });
}

export function resolveTabularTransformOutput(input: {
  props: TabularTransformWidgetProps;
  resolvedInputs?: ResolvedWidgetInputs;
  runtimeState?: Record<string, unknown>;
  runtimeDataStore?: RuntimeDataStore | null;
}): TabularFrameSourceV1 {
  const role = resolveTabularTransformSourceRole(input.resolvedInputs);
  if (role === "conflict") {
    return { status: "error", error: TABULAR_TRANSFORM_SINGLE_SOURCE_ERROR, columns: [], rows: [] };
  }
  if (role === "none") {
    return normalizeTabularFrameSource(input.runtimeState) ?? { status: "idle", columns: [], rows: [] };
  }
  const sourceInput = resolveInput(input.resolvedInputs, role);
  if (sourceInput?.status && sourceInput.status !== "valid") {
    return {
      status: sourceInput.status === "unbound" ? "idle" : "error",
      error: sourceInput.status === "unbound" ? undefined : "The bound tabular source is unavailable or incompatible.",
      columns: [],
      rows: [],
    };
  }
  const frame = readInputFrame(sourceInput, input.runtimeDataStore);
  return frame ? applyTabularTransform(frame, input.props) : { status: "loading", columns: [], rows: [] };
}

export function resolveTabularTransformChannelOutput(input: {
  outputChannel: TabularTransformOutputChannel;
  props: TabularTransformWidgetProps;
  resolvedInputs?: ResolvedWidgetInputs;
  runtimeState?: Record<string, unknown>;
  runtimeDataStore?: RuntimeDataStore | null;
}) {
  const role = resolveTabularTransformSourceRole(input.resolvedInputs);
  const activeChannel = role === "live" ? "updates" : "dataset";
  if (role !== "conflict" && role !== "none" && input.outputChannel !== activeChannel) {
    return { status: "idle", columns: [], rows: [] } satisfies TabularFrameSourceV1;
  }
  return resolveTabularTransformOutput(input);
}

export function formatTabularTransformSummary(props: TabularTransformWidgetProps) {
  const normalized = normalizeTabularTransformProps(props);
  return normalized.transformMode === "none"
    ? "Pass through tabular data"
    : "Tabular " + normalized.transformMode;
}

export function parseFieldListText(value: string) {
  return uniqueStrings(value);
}

export function formatFieldListText(value: readonly string[] | undefined) {
  return value?.join(", ") ?? "";
}
