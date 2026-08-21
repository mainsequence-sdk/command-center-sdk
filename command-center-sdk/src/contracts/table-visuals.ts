import type { TabularFrameFieldSchema, TabularFrameSourceV1 } from "./tabular-frame-source.js";

export const tableVisualsMetaKey = "tableVisuals" as const;

export type TableFrameScalarValue = number | string | boolean | null;
export type TableFrameInlineSeriesEncoding = "csv-number" | "json-number-array" | "number-array";
export type TableFrameSeriesOrder = "oldest-to-newest" | "newest-to-oldest";

export type TableFrameExpression =
  | {
      field: string;
    }
  | {
      value: number | string | boolean | null;
    }
  | {
      op: "difference" | "subtract";
      left: TableFrameExpression;
      right: TableFrameExpression;
    }
  | {
      op: "percentChange";
      current: TableFrameExpression;
      reference: TableFrameExpression;
    }
  | {
      op: "ratio" | "divide";
      numerator: TableFrameExpression;
      denominator: TableFrameExpression;
    }
  | {
      op: "add" | "multiply";
      args: TableFrameExpression[];
    };

export interface TableFrameComputedColumn {
  id: string;
  label?: string;
  type?: "number" | "string" | "boolean" | "json";
  expression: TableFrameExpression;
}

export interface TableFrameColorScaleMetadata {
  negative?: "warning" | "danger" | string;
  neutral?: "muted" | string;
  positive?: "success" | string;
}

export interface TableFrameRangeMetadata {
  min?: number;
  max?: number;
  midpoint?: number;
  clamp?: boolean;
}

export type TableFrameVisualTone = "neutral" | "primary" | "success" | "warning" | "danger";
export type TableFrameVisualOperator = "gt" | "gte" | "lt" | "lte" | "eq";
export type TableFrameVisualBarMode = "none" | "fill";
export type TableFrameVisualGradientMode = "none" | "fill";
export type TableFrameVisualHeatmapPalette =
  | "auto"
  | "viridis"
  | "plasma"
  | "inferno"
  | "magma"
  | "turbo"
  | "jet"
  | "blue-white-red"
  | "red-yellow-green";
export type TableFrameVisualGaugeMode = "none" | "ring";
export type TableFrameVisualRangeMode = "auto" | "fixed";
export type TableFrameVisualFormulaResultFormat =
  | "text"
  | "datetime"
  | "number"
  | "currency"
  | "percent"
  | "bps";

export interface TableFrameThresholdRuleMetadata {
  backgroundColor?: string;
  id?: string;
  operator: TableFrameVisualOperator;
  textColor?: string;
  tone?: TableFrameVisualTone;
  value: number;
}

export interface TableFrameVisualColumnMetadata {
  label?: string;
  format?: "number" | "price" | "percent" | "volume" | "currency" | "datetime" | "formula";
  formulaExpression?: string;
  formulaResultFormat?: TableFrameVisualFormulaResultFormat;
  dateTimeInputFormat?: string;
  dateTimeOutputFormat?: string;
  decimals?: number;
  visible?: boolean;
  colorScale?: TableFrameColorScaleMetadata;
  range?: TableFrameRangeMetadata;
  thresholds?: TableFrameThresholdRuleMetadata[];
  heatmap?: boolean;
  barMode?: TableFrameVisualBarMode;
  gradientMode?: TableFrameVisualGradientMode;
  heatmapPalette?: TableFrameVisualHeatmapPalette;
  gaugeMode?: TableFrameVisualGaugeMode;
  visualRangeMode?: TableFrameVisualRangeMode;
  visualMin?: number;
  visualMax?: number;
  kind?: "sparkline" | "bar" | "heatmap";
  encoding?: TableFrameInlineSeriesEncoding;
  order?: TableFrameSeriesOrder;
  width?: number;
}

export interface TableFrameVisualsMetadata {
  columns?: Record<string, TableFrameVisualColumnMetadata>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function normalizeValue(value: unknown): TableFrameScalarValue | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function normalizeFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeFieldName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeInlineSeriesEncoding(value: unknown): TableFrameInlineSeriesEncoding | undefined {
  return value === "csv-number" || value === "json-number-array" || value === "number-array"
    ? value
    : undefined;
}

function normalizeSeriesOrder(value: unknown): TableFrameSeriesOrder | undefined {
  return value === "oldest-to-newest" || value === "newest-to-oldest" ? value : undefined;
}

function normalizeColorScale(value: unknown): TableFrameColorScaleMetadata | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const colorScale = {
    negative: normalizeString(value.negative),
    neutral: normalizeString(value.neutral),
    positive: normalizeString(value.positive),
  } satisfies TableFrameColorScaleMetadata;

  return colorScale.negative || colorScale.neutral || colorScale.positive ? colorScale : undefined;
}

function normalizeRangeMetadata(value: unknown): TableFrameRangeMetadata | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const range = {
    min: normalizeFiniteNumber(value.min),
    max: normalizeFiniteNumber(value.max),
    midpoint: normalizeFiniteNumber(value.midpoint),
    clamp: value.clamp === true ? true : undefined,
  } satisfies TableFrameRangeMetadata;

  return range.min !== undefined ||
    range.max !== undefined ||
    range.midpoint !== undefined ||
    range.clamp
    ? range
    : undefined;
}

function normalizeVisualTone(value: unknown): TableFrameVisualTone | undefined {
  return value === "neutral" ||
    value === "primary" ||
    value === "success" ||
    value === "warning" ||
    value === "danger"
    ? value
    : undefined;
}

function normalizeVisualOperator(value: unknown): TableFrameVisualOperator | undefined {
  return value === "gt" || value === "gte" || value === "lt" || value === "lte" || value === "eq"
    ? value
    : undefined;
}

function normalizeVisualBarMode(value: unknown): TableFrameVisualBarMode | undefined {
  return value === "none" || value === "fill" ? value : undefined;
}

function normalizeVisualGradientMode(value: unknown): TableFrameVisualGradientMode | undefined {
  return value === "none" || value === "fill" ? value : undefined;
}

function normalizeVisualHeatmapPalette(value: unknown): TableFrameVisualHeatmapPalette | undefined {
  return value === "auto" ||
    value === "viridis" ||
    value === "plasma" ||
    value === "inferno" ||
    value === "magma" ||
    value === "turbo" ||
    value === "jet" ||
    value === "blue-white-red" ||
    value === "red-yellow-green"
    ? value
    : undefined;
}

function normalizeVisualGaugeMode(value: unknown): TableFrameVisualGaugeMode | undefined {
  return value === "none" || value === "ring" ? value : undefined;
}

function normalizeVisualRangeMode(value: unknown): TableFrameVisualRangeMode | undefined {
  return value === "auto" || value === "fixed" ? value : undefined;
}

function normalizeThresholdRuleMetadata(value: unknown): TableFrameThresholdRuleMetadata | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const operator = normalizeVisualOperator(value.operator);
  const numericValue = normalizeFiniteNumber(value.value);

  if (!operator || numericValue === undefined) {
    return undefined;
  }

  return {
    backgroundColor: normalizeString(value.backgroundColor),
    id: normalizeString(value.id),
    operator,
    textColor: normalizeString(value.textColor),
    tone: normalizeVisualTone(value.tone),
    value: numericValue,
  };
}

function normalizeVisualFormat(value: unknown): TableFrameVisualColumnMetadata["format"] | undefined {
  return value === "number" ||
    value === "price" ||
    value === "percent" ||
    value === "volume" ||
    value === "currency" ||
    value === "datetime" ||
    value === "formula"
    ? value
    : undefined;
}

function normalizeVisualFormulaResultFormat(
  value: unknown,
): TableFrameVisualFormulaResultFormat | undefined {
  return value === "text" ||
    value === "datetime" ||
    value === "number" ||
    value === "currency" ||
    value === "percent" ||
    value === "bps"
    ? value
    : undefined;
}

function normalizeVisualKind(value: unknown): TableFrameVisualColumnMetadata["kind"] | undefined {
  return value === "sparkline" || value === "bar" || value === "heatmap" ? value : undefined;
}

function normalizeVisualColumnMetadata(value: unknown): TableFrameVisualColumnMetadata | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const thresholds = Array.isArray(value.thresholds)
    ? value.thresholds
        .map((entry) => normalizeThresholdRuleMetadata(entry))
        .filter((entry): entry is TableFrameThresholdRuleMetadata => Boolean(entry))
    : undefined;
  const metadata = {
    label: normalizeString(value.label),
    format: normalizeVisualFormat(value.format),
    formulaExpression: normalizeString(value.formulaExpression),
    formulaResultFormat: normalizeVisualFormulaResultFormat(value.formulaResultFormat),
    dateTimeInputFormat: normalizeString(value.dateTimeInputFormat),
    dateTimeOutputFormat: normalizeString(value.dateTimeOutputFormat),
    decimals:
      typeof value.decimals === "number" && Number.isFinite(value.decimals)
        ? Math.max(0, Math.min(Math.trunc(value.decimals), 6))
        : undefined,
    visible: typeof value.visible === "boolean" ? value.visible : undefined,
    colorScale: normalizeColorScale(value.colorScale),
    range: normalizeRangeMetadata(value.range),
    thresholds: thresholds && thresholds.length > 0 ? thresholds : undefined,
    heatmap: typeof value.heatmap === "boolean" ? value.heatmap : undefined,
    barMode: normalizeVisualBarMode(value.barMode),
    gradientMode: normalizeVisualGradientMode(value.gradientMode),
    heatmapPalette: normalizeVisualHeatmapPalette(value.heatmapPalette),
    gaugeMode: normalizeVisualGaugeMode(value.gaugeMode),
    visualRangeMode: normalizeVisualRangeMode(value.visualRangeMode),
    visualMin: normalizeFiniteNumber(value.visualMin),
    visualMax: normalizeFiniteNumber(value.visualMax),
    kind: normalizeVisualKind(value.kind),
    encoding: normalizeInlineSeriesEncoding(value.encoding),
    order: normalizeSeriesOrder(value.order),
    width: normalizeFiniteNumber(value.width),
  } satisfies TableFrameVisualColumnMetadata;

  return Object.values(metadata).some((entry) => entry !== undefined) ? metadata : null;
}

export function buildTableFrameMeta(metadata: {
  tableVisuals?: TableFrameVisualsMetadata;
}): {
  [tableVisualsMetaKey]?: TableFrameVisualsMetadata;
} {
  return {
    ...(metadata.tableVisuals ? { [tableVisualsMetaKey]: metadata.tableVisuals } : {}),
  };
}

export function resolveTableVisualsMetadata(
  frame: Pick<TabularFrameSourceV1, "meta"> | null | undefined,
): TableFrameVisualsMetadata | null {
  if (!frame?.meta || !isPlainRecord(frame.meta)) {
    return null;
  }

  const value = frame.meta[tableVisualsMetaKey];

  if (!isPlainRecord(value) || !isPlainRecord(value.columns)) {
    return null;
  }

  const columns = Object.fromEntries(
    Object.entries(value.columns).flatMap(([key, entryValue]) => {
      const normalizedKey = normalizeString(key);
      const metadata = normalizeVisualColumnMetadata(entryValue);

      return normalizedKey && metadata ? [[normalizedKey, metadata] as const] : [];
    }),
  );

  return Object.keys(columns).length > 0 ? { columns } : null;
}

function expressionNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function evaluateTableExpression(
  expression: TableFrameExpression,
  row: Record<string, unknown>,
): TableFrameScalarValue {
  if ("field" in expression) {
    return normalizeValue(row[expression.field]) ?? null;
  }

  if ("value" in expression) {
    return expression.value;
  }

  if (expression.op === "difference" || expression.op === "subtract") {
    const left = expressionNumber(evaluateTableExpression(expression.left, row));
    const right = expressionNumber(evaluateTableExpression(expression.right, row));

    return left === null || right === null ? null : left - right;
  }

  if (expression.op === "percentChange") {
    const current = expressionNumber(evaluateTableExpression(expression.current, row));
    const reference = expressionNumber(evaluateTableExpression(expression.reference, row));

    return current === null || reference === null || reference === 0
      ? null
      : ((current - reference) / Math.abs(reference)) * 100;
  }

  if (expression.op === "ratio" || expression.op === "divide") {
    const numerator = expressionNumber(evaluateTableExpression(expression.numerator, row));
    const denominator = expressionNumber(evaluateTableExpression(expression.denominator, row));

    return numerator === null || denominator === null || denominator === 0
      ? null
      : numerator / denominator;
  }

  if (expression.op !== "add" && expression.op !== "multiply") {
    return null;
  }

  const values = expression.args.map((entry: TableFrameExpression) =>
    expressionNumber(evaluateTableExpression(entry, row)),
  );

  if (values.some((value: number | null) => value === null)) {
    return null;
  }

  return expression.op === "add"
    ? values.reduce((sum: number, value: number | null) => sum + (value ?? 0), 0)
    : values.reduce((product: number, value: number | null) => product * (value ?? 1), 1);
}

function expressionFieldNames(expression: TableFrameExpression): string[] {
  if ("field" in expression) {
    return [expression.field];
  }

  if ("value" in expression) {
    return [];
  }

  if (expression.op === "difference" || expression.op === "subtract") {
    return [
      ...expressionFieldNames(expression.left),
      ...expressionFieldNames(expression.right),
    ];
  }

  if (expression.op === "percentChange") {
    return [
      ...expressionFieldNames(expression.current),
      ...expressionFieldNames(expression.reference),
    ];
  }

  if (expression.op === "ratio" || expression.op === "divide") {
    return [
      ...expressionFieldNames(expression.numerator),
      ...expressionFieldNames(expression.denominator),
    ];
  }

  if (expression.op === "add" || expression.op === "multiply") {
    return expression.args.flatMap((entry) => expressionFieldNames(entry));
  }

  return [];
}

function coerceComputedValue(
  value: TableFrameScalarValue,
  type: TableFrameComputedColumn["type"],
) {
  if (value === null) {
    return null;
  }

  if (type === "number") {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  if (type === "string") {
    return typeof value === "string" ? value : String(value);
  }

  if (type === "boolean") {
    return typeof value === "boolean" ? value : null;
  }

  return value;
}

export function applyResolvedTableComputedColumns(
  frame: TabularFrameSourceV1,
  computedColumns: readonly TableFrameComputedColumn[],
): TabularFrameSourceV1 {
  if (computedColumns.length === 0) {
    return frame;
  }

  const rows = frame.rows.map((row) => {
    const nextRow = { ...row };

    computedColumns.forEach((column) => {
      nextRow[column.id] = coerceComputedValue(
        evaluateTableExpression(column.expression, nextRow),
        column.type,
      );
    });

    return nextRow;
  });
  const columns = Array.from(new Set([
    ...frame.columns,
    ...computedColumns.map((column) => column.id),
  ]));
  const existingFieldKeys = new Set((frame.fields ?? []).map((field) => field.key));
  const fields = [
    ...(frame.fields ?? []),
    ...computedColumns.flatMap((column) => {
      if (existingFieldKeys.has(column.id)) {
        return [];
      }

      return [{
        key: column.id,
        label: column.label ?? column.id,
        type: column.type === "number" ? "number" : column.type ?? "unknown",
        nullable: true,
        nativeType: column.type ?? null,
        provenance: "derived",
        reason: "Computed by widget-owned formula runtime.",
        derivedFrom: Array.from(new Set(expressionFieldNames(column.expression))),
      } satisfies TabularFrameFieldSchema];
    }),
  ];

  return {
    ...frame,
    columns,
    rows,
    fields: fields.length > 0 ? fields : undefined,
  };
}
