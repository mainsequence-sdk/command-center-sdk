import { parseBulkActionDiscovery, parseCollectionControls } from "./bulk-actions.js";
import type {
  ResourceColumnDefinition,
  ResourceDiscoveryColumn,
  ResourceDiscoveryColumnDataType,
  ResourceDiscoveryIdentity,
  ResourceDiscoveryResponse,
} from "./types.js";
import { RESOURCE_DISCOVERY_CONTRACT } from "./types.js";

const identifierPattern = /^[a-z][a-z0-9-]*$/;
const safePathPattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const forbiddenPathSegments = new Set(["__proto__", "prototype", "constructor"]);
const columnDataTypes = new Set<ResourceDiscoveryColumnDataType>([
  "text",
  "number",
  "boolean",
  "date",
  "datetime",
  "badge",
  "list",
  "json",
]);
const columnImportance = new Set(["primary", "secondary", "tertiary"]);
const columnAlignments = new Set(["start", "center", "end"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new Error(`${path} returned unsupported field(s): ${unknown.join(", ")}.`);
  }
}

export function assertSafeResourcePath(path: string): string {
  const normalized = path.trim();
  const segments = normalized.split(".");
  if (
    !safePathPattern.test(normalized) ||
    segments.some((segment) => forbiddenPathSegments.has(segment))
  ) {
    throw new Error(`Unsafe resource field path: ${path}`);
  }
  return normalized;
}

export function readResourcePath(resource: unknown, path: string): unknown {
  const safePath = assertSafeResourcePath(path);
  let value = resource;
  for (const segment of safePath.split(".")) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, segment)) {
      return undefined;
    }
    value = value[segment];
  }
  return value;
}

function validateDiscoveredColumnValue(
  value: unknown,
  column: ResourceDiscoveryColumn,
): unknown {
  if (value === null || value === undefined) return value;
  const valid = (() => {
    switch (column.data_type) {
      case "text":
      case "badge":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "boolean":
        return typeof value === "boolean";
      case "date":
      case "datetime":
        return typeof value === "string" && !Number.isNaN(Date.parse(value));
      case "list":
        return Array.isArray(value);
      case "json": {
        try {
          return JSON.stringify(value) !== undefined;
        } catch {
          return false;
        }
      }
      default:
        return false;
    }
  })();
  if (!valid) {
    throw new Error(
      `Discovery column "${column.id}" returned a value incompatible with ${column.data_type}.`,
    );
  }
  return value;
}

export function serializeResourceIdentity(
  resource: unknown,
  identity: ResourceDiscoveryIdentity,
): string {
  const values = identity.fields.map((field) => {
    const value = readResourcePath(resource, field);
    if (
      value === undefined ||
      (value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean")
    ) {
      throw new Error(`Resource identity field "${field}" must resolve to a JSON scalar.`);
    }
    return value;
  });
  return JSON.stringify(values);
}

function parseIdentity(value: unknown): ResourceDiscoveryIdentity {
  if (!isRecord(value)) {
    throw new Error("Resource discovery returned an invalid identity definition.");
  }
  assertAllowedKeys(value, ["fields"], "Resource identity");
  if (
    !Array.isArray(value.fields) ||
    value.fields.length === 0 ||
    !value.fields.every((field) => typeof field === "string")
  ) {
    throw new Error("Resource discovery identity requires at least one field.");
  }
  const fields = value.fields.map(assertSafeResourcePath);
  if (new Set(fields).size !== fields.length) {
    throw new Error("Resource discovery returned duplicate identity fields.");
  }
  return { fields };
}

function parseColumn(value: unknown): ResourceDiscoveryColumn {
  if (!isRecord(value)) {
    throw new Error("Resource discovery returned a non-object column.");
  }
  assertAllowedKeys(
    value,
    [
      "id",
      "header",
      "value_path",
      "data_type",
      "default_visible",
      "hideable",
      "sortable_key",
      "filter_key",
      "importance",
      "align",
      "extensions",
    ],
    "Resource discovery column",
  );
  if (
    typeof value.id !== "string" ||
    !identifierPattern.test(value.id) ||
    typeof value.header !== "string" ||
    !value.header.trim() ||
    typeof value.default_visible !== "boolean" ||
    typeof value.hideable !== "boolean"
  ) {
    throw new Error("Resource discovery returned an invalid column definition.");
  }
  const hasValuePath = value.value_path !== undefined;
  const hasDataType = value.data_type !== undefined;
  if (hasValuePath !== hasDataType) {
    throw new Error("Generic discovery columns require both value_path and data_type.");
  }
  if (hasDataType && !columnDataTypes.has(value.data_type as ResourceDiscoveryColumnDataType)) {
    throw new Error("Resource discovery returned an invalid column data type.");
  }
  if (
    (value.sortable_key !== undefined && typeof value.sortable_key !== "string") ||
    (value.filter_key !== undefined && typeof value.filter_key !== "string") ||
    (value.importance !== undefined && !columnImportance.has(String(value.importance))) ||
    (value.align !== undefined && !columnAlignments.has(String(value.align))) ||
    (value.extensions !== undefined && !isRecord(value.extensions))
  ) {
    throw new Error("Resource discovery returned invalid optional column metadata.");
  }
  return {
    id: value.id,
    header: value.header,
    ...(hasValuePath ? { value_path: assertSafeResourcePath(value.value_path as string) } : {}),
    ...(hasDataType ? { data_type: value.data_type as ResourceDiscoveryColumnDataType } : {}),
    default_visible: value.default_visible,
    hideable: value.hideable,
    ...(typeof value.sortable_key === "string" ? { sortable_key: value.sortable_key } : {}),
    ...(typeof value.filter_key === "string" ? { filter_key: value.filter_key } : {}),
    ...(value.importance !== undefined
      ? { importance: value.importance as ResourceDiscoveryColumn["importance"] }
      : {}),
    ...(value.align !== undefined
      ? { align: value.align as ResourceDiscoveryColumn["align"] }
      : {}),
    ...(isRecord(value.extensions) ? { extensions: value.extensions } : {}),
  };
}

export function parseResourceDiscovery(payload: unknown): ResourceDiscoveryResponse {
  if (!isRecord(payload)) {
    throw new Error("Resource discovery must return an object.");
  }
  assertAllowedKeys(
    payload,
    ["contract", "resource", "list", "bulk_actions", "extensions"],
    "Resource discovery",
  );
  if (payload.contract !== RESOURCE_DISCOVERY_CONTRACT) {
    throw new Error(`Resource discovery must use ${RESOURCE_DISCOVERY_CONTRACT}.`);
  }
  if (!isRecord(payload.resource)) {
    throw new Error("Resource discovery returned an invalid resource descriptor.");
  }
  assertAllowedKeys(
    payload.resource,
    ["id", "label", "item_label", "identity", "extensions"],
    "Resource descriptor",
  );
  if (
    typeof payload.resource.id !== "string" ||
    !identifierPattern.test(payload.resource.id) ||
    typeof payload.resource.label !== "string" ||
    !payload.resource.label.trim() ||
    typeof payload.resource.item_label !== "string" ||
    !payload.resource.item_label.trim() ||
    (payload.resource.extensions !== undefined && !isRecord(payload.resource.extensions))
  ) {
    throw new Error("Resource discovery returned an invalid resource descriptor.");
  }
  if (!isRecord(payload.list)) {
    throw new Error("Resource discovery returned an invalid list descriptor.");
  }
  assertAllowedKeys(payload.list, ["controls", "columns"], "Resource list descriptor");
  if (!Array.isArray(payload.list.columns)) {
    throw new Error("Resource discovery list requires a columns array.");
  }
  const controls = parseCollectionControls(payload.list.controls);
  const columns = payload.list.columns.map(parseColumn);
  if (columns.length === 0 || new Set(columns.map((column) => column.id)).size !== columns.length) {
    throw new Error("Resource discovery columns must be non-empty and use unique IDs.");
  }
  const ordering = new Set(controls.ordering);
  const filterKeys = new Set(controls.filters.map((filter) => filter.key));
  columns.forEach((column) => {
    if (column.sortable_key && !ordering.has(column.sortable_key)) {
      throw new Error(`Column "${column.id}" advertises an undeclared sortable key.`);
    }
    if (column.filter_key && !filterKeys.has(column.filter_key)) {
      throw new Error(`Column "${column.id}" advertises an undeclared filter key.`);
    }
  });
  if (!Array.isArray(payload.bulk_actions)) {
    throw new Error("Resource discovery requires a bulk_actions array.");
  }
  if (payload.extensions !== undefined && !isRecord(payload.extensions)) {
    throw new Error("Resource discovery extensions must be an object.");
  }
  return {
    contract: RESOURCE_DISCOVERY_CONTRACT,
    resource: {
      id: payload.resource.id,
      label: payload.resource.label,
      item_label: payload.resource.item_label,
      identity: parseIdentity(payload.resource.identity),
      ...(isRecord(payload.resource.extensions)
        ? { extensions: payload.resource.extensions }
        : {}),
    },
    list: { controls, columns },
    bulk_actions: parseBulkActionDiscovery({ actions: payload.bulk_actions }).actions,
    ...(isRecord(payload.extensions) ? { extensions: payload.extensions } : {}),
  };
}

export function resolveResourceDiscoveryColumns<T, Cell = unknown>(
  discovery: ResourceDiscoveryResponse,
  localColumns: readonly ResourceColumnDefinition<T, Cell>[],
): readonly ResourceColumnDefinition<T, Cell>[] {
  const localById = new Map(localColumns.map((column) => [column.id, column]));
  return discovery.list.columns
    .filter((column) => column.default_visible)
    .map((column) => {
      const local = localById.get(column.id);
      if (local) {
        return {
          ...local,
          header: column.header,
          sortableKey: column.sortable_key,
        };
      }
      if (!column.value_path || !column.data_type) {
        throw new Error(
          `Discovery column "${column.id}" requires a matching local renderer or generic value metadata.`,
        );
      }
      return {
        id: column.id,
        header: column.header,
        getValue: (resource: T) => validateDiscoveredColumnValue(
          readResourcePath(resource, column.value_path!),
          column,
        ),
        sortableKey: column.sortable_key,
      };
    });
}
