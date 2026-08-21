import type { WidgetValueDescriptor } from "./widget-contracts.js";
import type { TableFrameVisualsMetadata } from "./table-visuals.js";

export const CORE_TABULAR_FRAME_SOURCE_CONTRACT = "core.tabular_frame@v1" as const;
export const LEGACY_TIME_SERIES_FRAME_SOURCE_CONTRACT = "core.time_series_frame@v1" as const;

export type TabularFrameSourceStatus = "idle" | "loading" | "ready" | "error";
export type TabularTimeSeriesShape = "long" | "wide";
export type TabularTimeSeriesGapPolicy = "preserve_nulls" | "drop_nulls";
export type TabularTimeSeriesDuplicatePolicy =
  | "error"
  | "first"
  | "latest"
  | "aggregate"
  | "preserve";

export type TabularFrameFieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "datetime"
  | "date"
  | "time"
  | "json"
  | "unknown";

export type TabularFrameFieldProvenance =
  | "backend"
  | "manual"
  | "inferred"
  | "derived";

export interface TabularFrameFieldSchema {
  key: string;
  label?: string;
  description?: string | null;
  type: TabularFrameFieldType;
  nullable?: boolean;
  nativeType?: string | null;
  provenance?: TabularFrameFieldProvenance;
  reason?: string | null;
  derivedFrom?: string[];
  warnings?: string[];
}

export interface TabularFrameSourceDescriptor {
  kind: string;
  id?: string | number;
  label?: string;
  updatedAtMs?: number;
  context?: Record<string, unknown>;
}

interface TabularTimeSeriesMetaBase {
  timeField: string;
  timeUnit: "ms";
  timezone: "UTC";
  sorted: boolean;
  seriesField?: string;
  seriesLabelFields?: string[];
  frequency?: string;
  calendar?: string;
  gapPolicy?: TabularTimeSeriesGapPolicy;
  duplicatePolicy?: TabularTimeSeriesDuplicatePolicy;
  unitByField?: Record<string, string>;
}

export type TabularTimeSeriesMeta =
  | (TabularTimeSeriesMetaBase & {
      shape: "long";
      valueField: string;
      valueFields?: never;
    })
  | (TabularTimeSeriesMetaBase & {
      shape: "wide";
      valueFields: string[];
      valueField?: never;
    });

export interface TabularFrameMeta {
  tableVisuals?: TableFrameVisualsMetadata;
  timeSeries?: TabularTimeSeriesMeta;
  [key: string]: unknown;
}

export interface TabularFrameSourceV1 {
  status: TabularFrameSourceStatus;
  error?: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  fields?: TabularFrameFieldSchema[];
  meta?: TabularFrameMeta;
  source?: TabularFrameSourceDescriptor;
}

interface LegacyTimeSeriesFrameField {
  name: string;
  type: "time" | "number" | "string" | "boolean" | "json";
  values: unknown[];
  labels?: Record<string, string>;
  config?: {
    unit?: string;
    displayName?: string;
    decimals?: number;
  };
}

export const TABULAR_FRAME_SOURCE_VALUE_DESCRIPTOR = {
  kind: "object",
  contract: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
  description:
    "Canonical tabular frame with status, columns, rows, field schema, time-series hints, and source metadata.",
  fields: [
    {
      key: "status",
      label: "Status",
      value: {
        kind: "primitive",
        contract: "core.value.string@v1",
        primitive: "string",
      },
    },
    {
      key: "columns",
      label: "Columns",
      value: {
        kind: "array",
        contract: "core.value.json@v1",
        items: {
          kind: "primitive",
          contract: "core.value.string@v1",
          primitive: "string",
        },
      },
    },
    {
      key: "rows",
      label: "Rows",
      value: {
        kind: "array",
        contract: "core.value.json@v1",
        items: {
          kind: "object",
          contract: "core.value.json@v1",
          fields: [],
        },
      },
    },
    {
      key: "fields",
      label: "Fields",
      value: {
        kind: "array",
        contract: "core.value.json@v1",
        items: {
          kind: "object",
          contract: "core.value.json@v1",
          fields: [
            {
              key: "key",
              label: "Key",
              value: {
                kind: "primitive",
                contract: "core.value.string@v1",
                primitive: "string",
              },
            },
            {
              key: "type",
              label: "Type",
              value: {
                kind: "primitive",
                contract: "core.value.string@v1",
                primitive: "string",
              },
            },
          ],
        },
      },
    },
    {
      key: "meta",
      label: "Metadata",
      value: {
        kind: "object",
        contract: "core.value.json@v1",
        fields: [],
      },
    },
    {
      key: "source",
      label: "Source",
      value: {
        kind: "object",
        contract: "core.value.json@v1",
        fields: [
          {
            key: "kind",
            label: "Kind",
            value: {
              kind: "primitive",
              contract: "core.value.string@v1",
              primitive: "string",
            },
          },
        ],
      },
    },
  ],
} satisfies WidgetValueDescriptor;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTimestampMs(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.trunc(parsed);
}

function normalizeColumns(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value.flatMap((entry) => {
    if (typeof entry !== "string" || !entry.trim()) {
      return [];
    }

    const normalized = entry.trim();

    if (seen.has(normalized)) {
      return [];
    }

    seen.add(normalized);
    return [normalized];
  });
}

function normalizeRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => isPlainRecord(entry));
}

function hasTabularFieldSchemaShape(value: unknown) {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some(
    (entry) =>
      isPlainRecord(entry) &&
      typeof entry.key === "string" &&
      entry.key.trim().length > 0,
  );
}

function hasExplicitTabularFrameShape(value: Record<string, unknown>) {
  return (
    Array.isArray(value.columns) ||
    Array.isArray(value.rows) ||
    hasTabularFieldSchemaShape(value.fields)
  );
}

function normalizeFieldType(value: unknown): TabularFrameFieldType {
  return value === "string" ||
    value === "number" ||
    value === "integer" ||
    value === "boolean" ||
    value === "datetime" ||
    value === "date" ||
    value === "time" ||
    value === "json"
    ? value
    : "unknown";
}

function normalizeFieldProvenance(value: unknown): TabularFrameFieldProvenance | undefined {
  return value === "backend" ||
    value === "manual" ||
    value === "inferred" ||
    value === "derived"
    ? value
    : undefined;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized = value.flatMap((entry) => {
    if (typeof entry !== "string" || !entry.trim()) {
      return [];
    }

    const nextValue = entry.trim();

    if (seen.has(nextValue)) {
      return [];
    }

    seen.add(nextValue);
    return [nextValue];
  });

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStringRecord(value: unknown) {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).flatMap(([key, entryValue]) => {
    const normalizedKey = key.trim();
    const normalizedValue = normalizeString(entryValue);

    return normalizedKey && normalizedValue ? [[normalizedKey, normalizedValue] as const] : [];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeShape(value: unknown): TabularTimeSeriesShape | undefined {
  return value === "long" || value === "wide" ? value : undefined;
}

function normalizeGapPolicy(value: unknown): TabularTimeSeriesGapPolicy | undefined {
  return value === "preserve_nulls" || value === "drop_nulls" ? value : undefined;
}

function normalizeDuplicatePolicy(value: unknown): TabularTimeSeriesDuplicatePolicy | undefined {
  return value === "error" ||
    value === "first" ||
    value === "latest" ||
    value === "aggregate" ||
    value === "preserve"
    ? value
    : undefined;
}

function normalizeFields(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized = value.flatMap((entry) => {
    if (!isPlainRecord(entry)) {
      return [];
    }

    const key = typeof entry.key === "string" ? entry.key.trim() : "";

    if (!key || seen.has(key)) {
      return [];
    }

    seen.add(key);

    return [{
      key,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : undefined,
      description:
        typeof entry.description === "string" && entry.description.trim()
          ? entry.description.trim()
          : null,
      type: normalizeFieldType(entry.type),
      nullable: entry.nullable === true ? true : undefined,
      nativeType:
        typeof entry.nativeType === "string" && entry.nativeType.trim()
          ? entry.nativeType.trim()
          : null,
      provenance: normalizeFieldProvenance(entry.provenance),
      reason:
        typeof entry.reason === "string" && entry.reason.trim()
          ? entry.reason.trim()
          : null,
      derivedFrom: normalizeStringArray(entry.derivedFrom),
      warnings: normalizeStringArray(entry.warnings),
    } satisfies TabularFrameFieldSchema];
  });

  return normalized.length > 0 ? normalized : undefined;
}

function collectFieldKeys(input: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  fields?: TabularFrameFieldSchema[];
}) {
  const keys = new Set<string>(input.columns);

  input.fields?.forEach((field) => {
    if (field.key.trim()) {
      keys.add(field.key.trim());
    }
  });

  input.rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key.trim()) {
        keys.add(key.trim());
      }
    });
  });

  return keys;
}

function fieldExists(fieldKeys: Set<string>, fieldName: string | undefined) {
  return Boolean(fieldName && fieldKeys.has(fieldName));
}

function normalizeTabularTimeSeriesMeta(
  value: unknown,
  fieldKeys: Set<string>,
): TabularTimeSeriesMeta | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const shape = normalizeShape(value.shape);
  const timeField = normalizeString(value.timeField);

  if (!shape || !fieldExists(fieldKeys, timeField)) {
    return undefined;
  }

  const valueField = normalizeString(value.valueField);
  const seriesField = normalizeString(value.seriesField);
  const valueFields = normalizeStringArray(value.valueFields)?.filter((fieldName) =>
    fieldExists(fieldKeys, fieldName),
  );

  if (shape === "long" && !fieldExists(fieldKeys, valueField)) {
    return undefined;
  }

  if (shape === "wide" && (!valueFields || valueFields.length === 0)) {
    return undefined;
  }

  const base: TabularTimeSeriesMetaBase = {
    timeField: timeField!,
    timeUnit: "ms",
    timezone: "UTC",
    sorted: value.sorted === true,
    seriesField: fieldExists(fieldKeys, seriesField) ? seriesField : undefined,
    seriesLabelFields: normalizeStringArray(value.seriesLabelFields)?.filter((fieldName) =>
      fieldExists(fieldKeys, fieldName),
    ),
    frequency: normalizeString(value.frequency),
    calendar: normalizeString(value.calendar),
    gapPolicy: normalizeGapPolicy(value.gapPolicy),
    duplicatePolicy: normalizeDuplicatePolicy(value.duplicatePolicy),
    unitByField: normalizeStringRecord(value.unitByField),
  };

  return shape === "long"
    ? { ...base, shape, valueField: valueField! }
    : { ...base, shape, valueFields: valueFields! };
}

function normalizeTabularMeta(
  value: unknown,
  input: {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    fields?: TabularFrameFieldSchema[];
  },
) {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const fieldKeys = collectFieldKeys(input);
  const normalizedTimeSeries = normalizeTabularTimeSeriesMeta(value.timeSeries, fieldKeys);
  const normalizedMeta: Record<string, unknown> = { ...value };

  if (normalizedTimeSeries) {
    normalizedMeta.timeSeries = normalizedTimeSeries;
  } else {
    delete normalizedMeta.timeSeries;
  }

  return Object.keys(normalizedMeta).length > 0
    ? (normalizedMeta as TabularFrameMeta)
    : undefined;
}

function normalizeSourceDescriptor(value: unknown) {
  if (!isPlainRecord(value) || typeof value.kind !== "string" || !value.kind.trim()) {
    return undefined;
  }

  const rawId = value.id;
  const id =
    typeof rawId === "string" && rawId.trim()
      ? rawId.trim()
      : typeof rawId === "number" && Number.isFinite(rawId)
        ? rawId
        : undefined;

  return {
    kind: value.kind.trim(),
    id,
    label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : undefined,
    updatedAtMs: normalizeTimestampMs(value.updatedAtMs),
    context: isPlainRecord(value.context) ? value.context : undefined,
  } satisfies TabularFrameSourceDescriptor;
}

function normalizeLegacyTimeSeriesFieldType(value: unknown): LegacyTimeSeriesFrameField["type"] {
  return value === "time" ||
    value === "number" ||
    value === "string" ||
    value === "boolean" ||
    value === "json"
    ? value
    : "json";
}

function normalizeLegacyTimeSeriesFrameFields(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value.flatMap((entry) => {
    if (!isPlainRecord(entry)) {
      return [];
    }

    const name = normalizeString(entry.name);

    if (!name || seen.has(name) || !Array.isArray(entry.values)) {
      return [];
    }

    seen.add(name);

    return [{
      name,
      type: normalizeLegacyTimeSeriesFieldType(entry.type),
      values: entry.values,
      labels: isPlainRecord(entry.labels)
        ? Object.fromEntries(
            Object.entries(entry.labels).flatMap(([key, label]) => {
              const normalizedLabel = normalizeString(label);
              return key.trim() && normalizedLabel ? [[key.trim(), normalizedLabel] as const] : [];
            }),
          )
        : undefined,
      config: isPlainRecord(entry.config)
        ? {
            unit: normalizeString(entry.config.unit),
            displayName: normalizeString(entry.config.displayName),
            decimals: Number.isFinite(Number(entry.config.decimals))
              ? Math.trunc(Number(entry.config.decimals))
              : undefined,
          }
        : undefined,
    } satisfies LegacyTimeSeriesFrameField];
  });
}

function normalizeLegacyFieldTypeForTabular(
  value: LegacyTimeSeriesFrameField["type"],
): TabularFrameFieldType {
  return value === "time" ? "datetime" : value;
}

function fieldToTabularField(field: LegacyTimeSeriesFrameField): TabularFrameFieldSchema {
  return {
    key: field.name,
    label: field.config?.displayName ?? field.name,
    type: normalizeLegacyFieldTypeForTabular(field.type),
    nullable: true,
    nativeType: field.type,
    provenance: "backend",
    reason: "Returned by the selected time-series connection query frame.",
  };
}

function buildRowsFromLegacyFields(fields: LegacyTimeSeriesFrameField[]) {
  const rowCount = Math.max(0, ...fields.map((field) => field.values.length));

  return Array.from({ length: rowCount }, (_entry, index) =>
    Object.fromEntries(fields.map((field) => [field.name, field.values[index] ?? null])),
  );
}

export function inferTabularTimeSeriesMetaFromFields(
  fields: Array<{ name: string; type?: string }>,
): TabularTimeSeriesMeta | null {
  const normalizedFields = fields
    .map((field) => ({
      name: normalizeString(field.name) ?? "",
      type: field.type,
    }))
    .filter((field) => field.name);

  if (normalizedFields.length === 0) {
    return null;
  }

  const timeField =
    normalizedFields.find((field) => field.type === "time") ??
    normalizedFields.find((field) => /time|date|timestamp|asof/i.test(field.name)) ??
    normalizedFields[0];

  if (!timeField) {
    return null;
  }

  const valueFields = normalizedFields
    .filter((field) => field.name !== timeField.name && field.type === "number")
    .map((field) => field.name);
  const seriesField = normalizedFields.find(
    (field) =>
      field.name !== timeField.name &&
      !valueFields.includes(field.name) &&
      /unique_identifier|identifier|series|symbol|ticker|asset/i.test(field.name),
  )?.name;

  if (valueFields.length > 1) {
    return {
      shape: "wide",
      timeField: timeField.name,
      timeUnit: "ms",
      timezone: "UTC",
      sorted: false,
      valueFields,
      duplicatePolicy: "preserve",
      gapPolicy: "preserve_nulls",
    };
  }

  const valueField =
    valueFields[0] ??
    normalizedFields.find(
      (field) => field.name !== timeField.name && field.name !== seriesField,
    )?.name;

  if (!valueField) {
    return null;
  }

  return {
    shape: "long",
    timeField: timeField.name,
    timeUnit: "ms",
    timezone: "UTC",
    sorted: false,
    valueField,
    seriesField,
    duplicatePolicy: "preserve",
    gapPolicy: "preserve_nulls",
  };
}

export function buildGraphDefaultsFromTimeSeriesMeta(
  meta: TabularTimeSeriesMeta | null | undefined,
) {
  if (!meta) {
    return {};
  }

  if (meta.shape === "wide") {
    return {
      xField: meta.timeField,
      yField: "value",
      groupField: "series",
    };
  }

  return {
    xField: meta.timeField,
    yField: meta.valueField,
    groupField: meta.seriesField,
  };
}

function buildWideTimeSeriesRows(frame: {
  fields: LegacyTimeSeriesFrameField[];
  meta: TabularTimeSeriesMeta;
}) {
  const timeField = frame.fields.find((field) => field.name === frame.meta.timeField);
  const valueFields = (frame.meta.valueFields ?? []).flatMap((fieldName) => {
    const field = frame.fields.find((entry) => entry.name === fieldName);
    return field ? [field] : [];
  });
  const rows = valueFields.flatMap((valueField) =>
    (timeField?.values ?? []).map((timeValue, index) => ({
      [frame.meta.timeField]: timeValue ?? null,
      series: valueField.config?.displayName ?? valueField.name,
      value: valueField.values[index] ?? null,
      sourceField: valueField.name,
    })),
  );
  const canonicalMeta: TabularTimeSeriesMeta = {
    shape: "long",
    timeField: frame.meta.timeField,
    timeUnit: "ms",
    timezone: "UTC",
    sorted: frame.meta.sorted,
    valueField: "value",
    seriesField: "series",
    duplicatePolicy: frame.meta.duplicatePolicy,
    gapPolicy: frame.meta.gapPolicy,
  };

  return {
    columns: [frame.meta.timeField, "series", "value", "sourceField"],
    rows,
    fields: [
      fieldToTabularField(timeField ?? {
        name: frame.meta.timeField,
        type: "time",
        values: [],
      }),
      {
        key: "series",
        label: "Series",
        type: "string",
        nullable: false,
        nativeType: "string",
        provenance: "derived",
        reason: "Derived from the wide time-series value field names.",
      },
      {
        key: "value",
        label: "Value",
        type: "number",
        nullable: true,
        nativeType: "number",
        provenance: "derived",
        reason: "Derived from the wide time-series value fields.",
        derivedFrom: valueFields.map((field) => field.name),
      },
      {
        key: "sourceField",
        label: "Source field",
        type: "string",
        nullable: false,
        nativeType: "string",
        provenance: "derived",
        reason: "Identifies the original wide value field.",
      },
    ] satisfies TabularFrameFieldSchema[],
    canonicalMeta,
  };
}

export function resolveTabularTimeSeriesMeta(
  frame: TabularFrameSourceV1 | null | undefined,
) {
  return frame?.meta?.timeSeries;
}

export function hasTabularTimeSeriesSemantics(
  frame: TabularFrameSourceV1 | null | undefined,
) {
  return Boolean(resolveTabularTimeSeriesMeta(frame));
}

export function legacyTimeSeriesFrameToTabularFrameSource(
  value: unknown,
): TabularFrameSourceV1 | null {
  if (
    !isPlainRecord(value) ||
    value.contract !== LEGACY_TIME_SERIES_FRAME_SOURCE_CONTRACT
  ) {
    return null;
  }

  const fields = normalizeLegacyTimeSeriesFrameFields(value.fields);

  if (fields.length === 0) {
    return null;
  }

  const rawMeta = isPlainRecord(value.meta) ? value.meta : {};
  const inferredMeta = inferTabularTimeSeriesMetaFromFields(
    fields.map((field) => ({ name: field.name, type: field.type })),
  );
  const fieldKeys = new Set(fields.map((field) => field.name));
  const normalizedTimeSeries =
    normalizeTabularTimeSeriesMeta(rawMeta.timeSeries, fieldKeys) ??
    inferredMeta ??
    undefined;
  const baseStatus =
    value.status === "loading" || value.status === "ready" || value.status === "error"
      ? value.status
      : "ready";
  const error = normalizeString(value.error);
  const warnings = normalizeStringArray(value.warnings);
  const traceId = normalizeString(value.traceId);
  const source = normalizeSourceDescriptor(value.source);
  const sourceContext = isPlainRecord(source?.context) ? source.context : {};

  if (!normalizedTimeSeries) {
    const columns = fields.map((field) => field.name);
    const rows = buildRowsFromLegacyFields(fields);

    return {
      status: error ? "error" : baseStatus,
      error,
      columns,
      rows,
      fields: fields.map(fieldToTabularField),
      source: {
        kind: source?.kind ?? "time-series-frame",
        id: source?.id,
        label: source?.label ?? normalizeString(value.name),
        updatedAtMs: source?.updatedAtMs,
        context: {
          ...sourceContext,
          sourceContract: LEGACY_TIME_SERIES_FRAME_SOURCE_CONTRACT,
          warnings,
          traceId,
        },
      },
    };
  }

  const normalized =
    normalizedTimeSeries.shape === "wide"
      ? buildWideTimeSeriesRows({
          fields,
          meta: normalizedTimeSeries,
        })
      : {
          columns: fields.map((field) => field.name),
          rows: buildRowsFromLegacyFields(fields),
          fields: fields.map(fieldToTabularField),
          canonicalMeta: normalizedTimeSeries,
        };

  return {
    status: error ? "error" : baseStatus,
    error,
    columns: normalized.columns,
    rows: normalized.rows,
    fields: normalized.fields,
    meta: {
      ...rawMeta,
      timeSeries: normalized.canonicalMeta,
    },
    source: {
      kind: source?.kind ?? "time-series-frame",
      id: source?.id,
      label: source?.label ?? normalizeString(value.name),
      updatedAtMs: source?.updatedAtMs,
      context: {
        ...sourceContext,
        sourceContract: LEGACY_TIME_SERIES_FRAME_SOURCE_CONTRACT,
        graphDefaults: buildGraphDefaultsFromTimeSeriesMeta(normalized.canonicalMeta),
        warnings,
        traceId,
      },
    },
  };
}

function resolveExplicitStatus(value: unknown): TabularFrameSourceStatus | undefined {
  return value === "idle" || value === "loading" || value === "ready" || value === "error"
    ? value
    : undefined;
}

function normalizeStatus(
  value: unknown,
  {
    columns,
    rows,
    error,
  }: {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    error?: string;
  },
): TabularFrameSourceStatus {
  const explicitStatus = resolveExplicitStatus(value);

  if (explicitStatus) {
    return explicitStatus;
  }

  if (error) {
    return "error";
  }

  if (columns.length > 0 || rows.length > 0) {
    return "ready";
  }

  return "idle";
}

function getObjectFieldDescriptor(
  descriptor: WidgetValueDescriptor | undefined,
  key: string,
) {
  if (!descriptor || descriptor.kind !== "object") {
    return undefined;
  }

  return descriptor.fields.find((field) => field.key === key)?.value;
}

function isStringLikeDescriptor(descriptor: WidgetValueDescriptor | undefined) {
  return (
    descriptor?.kind === "unknown" ||
    (descriptor?.kind === "primitive" && descriptor.primitive === "string")
  );
}

function isArrayOfStringLikeDescriptor(descriptor: WidgetValueDescriptor | undefined) {
  if (!descriptor || descriptor.kind !== "array") {
    return false;
  }

  return !descriptor.items || isStringLikeDescriptor(descriptor.items);
}

function isRowObjectLikeDescriptor(descriptor: WidgetValueDescriptor | undefined) {
  return descriptor?.kind === "unknown" || descriptor?.kind === "object";
}

function isArrayOfRowObjectsDescriptor(descriptor: WidgetValueDescriptor | undefined) {
  if (!descriptor || descriptor.kind !== "array") {
    return false;
  }

  return !descriptor.items || isRowObjectLikeDescriptor(descriptor.items);
}

function isTabularFrameFieldSchemaDescriptor(descriptor: WidgetValueDescriptor | undefined) {
  if (!descriptor || descriptor.kind !== "object") {
    return false;
  }

  return Boolean(
    isStringLikeDescriptor(getObjectFieldDescriptor(descriptor, "key")) &&
      isStringLikeDescriptor(getObjectFieldDescriptor(descriptor, "type")),
  );
}

function isArrayOfFieldSchemaDescriptors(descriptor: WidgetValueDescriptor | undefined) {
  if (!descriptor || descriptor.kind !== "array") {
    return false;
  }

  return !descriptor.items || isTabularFrameFieldSchemaDescriptor(descriptor.items);
}

function isSourceDescriptorDescriptor(descriptor: WidgetValueDescriptor | undefined) {
  if (!descriptor || descriptor.kind !== "object") {
    return false;
  }

  return isStringLikeDescriptor(getObjectFieldDescriptor(descriptor, "kind"));
}

export function resolveTabularFrameDescriptorContract(
  descriptor: WidgetValueDescriptor | undefined,
) {
  if (!descriptor || descriptor.kind !== "object") {
    return undefined;
  }

  const columnsDescriptor = getObjectFieldDescriptor(descriptor, "columns");
  const rowsDescriptor = getObjectFieldDescriptor(descriptor, "rows");

  if (
    !isArrayOfStringLikeDescriptor(columnsDescriptor) ||
    !isArrayOfRowObjectsDescriptor(rowsDescriptor)
  ) {
    return undefined;
  }

  const statusDescriptor = getObjectFieldDescriptor(descriptor, "status");
  const errorDescriptor = getObjectFieldDescriptor(descriptor, "error");
  const fieldsDescriptor = getObjectFieldDescriptor(descriptor, "fields");
  const sourceDescriptor = getObjectFieldDescriptor(descriptor, "source");

  if (statusDescriptor && !isStringLikeDescriptor(statusDescriptor)) {
    return undefined;
  }

  if (errorDescriptor && !isStringLikeDescriptor(errorDescriptor)) {
    return undefined;
  }

  if (fieldsDescriptor && !isArrayOfFieldSchemaDescriptors(fieldsDescriptor)) {
    return undefined;
  }

  if (sourceDescriptor && !isSourceDescriptorDescriptor(sourceDescriptor)) {
    return undefined;
  }

  return CORE_TABULAR_FRAME_SOURCE_CONTRACT;
}

export function coerceTabularFrameValueDescriptorContract(
  descriptor: WidgetValueDescriptor | undefined,
): WidgetValueDescriptor | undefined {
  const resolvedContract = resolveTabularFrameDescriptorContract(descriptor);

  if (!descriptor || !resolvedContract || descriptor.contract === resolvedContract) {
    return descriptor;
  }

  if (descriptor.kind === "object") {
    return {
      ...descriptor,
      contract: resolvedContract,
    };
  }

  return descriptor;
}

export function normalizeTabularFrameSource(value: unknown): TabularFrameSourceV1 | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  if (!hasExplicitTabularFrameShape(value)) {
    return null;
  }

  const error =
    typeof value.error === "string" && value.error.trim() ? value.error.trim() : undefined;
  const columns = normalizeColumns(value.columns);
  const rows = normalizeRows(value.rows);
  const fields = normalizeFields(value.fields);

  return {
    status: normalizeStatus(value.status, {
      columns,
      rows,
      error,
    }),
    error,
    columns,
    rows,
    fields,
    meta: normalizeTabularMeta(value.meta, {
      columns,
      rows,
      fields,
    }),
    source: normalizeSourceDescriptor(value.source),
  };
}
