import type {
  ResourceBulkActionDefinition,
  ResourceBulkActionDiscoveryResponse,
  ResourceBulkActionExecutionInput,
  ResourceBulkActionExecutionPayload,
  ResourceBulkActionOption,
  ResourceBulkActionPreflightImpact,
  ResourceBulkActionPreflightResult,
  ResourceBulkActionQuery,
  ResourceBulkSelection,
  ResourceCollectionControls,
  ResourceCollectionFilterControl,
  ResourceCollectionFilterOption,
  ResourceId,
} from "./types.js";

const selectionModes = new Set<ResourceBulkSelection["mode"]>([
  "explicit",
  "all_matching",
]);
const actionTones = new Set(["default", "primary", "warning", "danger"]);
const nonSemanticQueryKeys = new Set([
  "light",
  "limit",
  "offset",
  "ordering",
  "page",
  "page_size",
  "search",
  "sort",
]);

export function assertSafeBulkActionPath(path: string): string {
  const normalized = path.trim();
  if (
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    normalized.includes("\\") ||
    normalized.includes("#")
  ) {
    throw new Error(`Unsafe bulk-action endpoint: ${path}`);
  }

  const parsed = new URL(normalized, "https://command-center.invalid");
  if (parsed.origin !== "https://command-center.invalid" || parsed.pathname !== normalized) {
    throw new Error(`Unsafe bulk-action endpoint: ${path}`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
) {
  const allowedFields = new Set(allowed);
  const unknown = Object.keys(value).filter((field) => !allowedFields.has(field));
  if (unknown.length > 0) {
    throw new Error(`${context} returned unsupported field(s): ${unknown.join(", ")}.`);
  }
}

function parsePreflightMessages(
  value: unknown,
  tone: ResourceBulkActionPreflightImpact["tone"],
  field: string,
): ResourceBulkActionPreflightImpact[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((message) => typeof message === "string")) {
    throw new Error(`Bulk-action preflight returned invalid ${field}.`);
  }
  return value.map((message) => ({ message, tone }));
}

export function parseBulkActionPreflight<Id extends ResourceId = ResourceId>(
  value: unknown,
): ResourceBulkActionPreflightResult<Id> {
  if (!isRecord(value) || typeof value.allowed !== "boolean") {
    throw new Error("Bulk-action preflight returned an invalid result.");
  }
  if (value.detail !== undefined && typeof value.detail !== "string") {
    throw new Error("Bulk-action preflight returned an invalid detail message.");
  }
  if (
    value.matched_count !== undefined &&
    (typeof value.matched_count !== "number" ||
      !Number.isInteger(value.matched_count) ||
      value.matched_count < 0)
  ) {
    throw new Error("Bulk-action preflight returned an invalid matched count.");
  }

  return {
    allowed: value.allowed,
    ...(typeof value.detail === "string" ? { detail: value.detail } : {}),
    impacts: [
      ...parsePreflightMessages(value.blockers, "danger", "blockers"),
      ...parsePreflightMessages(value.warnings, "warning", "warnings"),
    ],
    items: [],
    ...(typeof value.matched_count === "number"
      ? { matchedCount: value.matched_count }
      : {}),
    raw: value,
  };
}

function parseCollectionFilterControl(value: unknown): ResourceCollectionFilterControl {
  if (
    !isRecord(value) ||
    typeof value.key !== "string" ||
    !value.key.trim() ||
    typeof value.label !== "string" ||
    !value.label.trim() ||
    (value.type !== "text" && value.type !== "select" && value.type !== "boolean")
  ) {
    throw new Error("Collection controls returned an invalid filter definition.");
  }
  assertOnlyFields(
    value,
    value.type === "select" ? ["key", "label", "type", "options"] : ["key", "label", "type"],
    "Collection filter",
  );

  if (value.type !== "select") {
    if (value.options !== undefined) {
      throw new Error("Only select collection filters may declare options.");
    }
    return { key: value.key, label: value.label, type: value.type };
  }

  if (
    !Array.isArray(value.options) ||
    value.options.length === 0 ||
    !value.options.every(
      (option) =>
        isRecord(option) &&
        (typeof option.value === "string" ||
          typeof option.value === "number" ||
          typeof option.value === "boolean") &&
        typeof option.label === "string" &&
        option.label.trim(),
    )
  ) {
    throw new Error("Select collection filters require valid options.");
  }
  value.options.forEach((option) => {
    assertOnlyFields(
      option as Record<string, unknown>,
      ["value", "label"],
      "Collection filter option",
    );
  });
  return {
    key: value.key,
    label: value.label,
    type: value.type,
    options: value.options.map((option) => ({
      value: (option as Record<string, unknown>).value,
      label: (option as Record<string, unknown>).label,
    })) as ResourceCollectionFilterOption[],
  };
}

export function parseCollectionControls(payload: unknown): ResourceCollectionControls {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.filters) ||
    !Array.isArray(payload.ordering) ||
    !payload.ordering.every((field) => typeof field === "string" && field.trim())
  ) {
    throw new Error("Collection controls returned an invalid controls object.");
  }
  assertOnlyFields(payload, ["search", "filters", "ordering"], "Collection controls");

  let search: ResourceCollectionControls["search"];
  if (payload.search === null) {
    search = null;
  } else {
    if (
      !isRecord(payload.search) ||
      typeof payload.search.placeholder !== "string" ||
      !payload.search.placeholder.trim() ||
      !Array.isArray(payload.search.fields) ||
      payload.search.fields.length === 0 ||
      !payload.search.fields.every(
        (field) => typeof field === "string" && field.trim(),
      )
    ) {
      throw new Error("Collection controls returned an invalid search definition.");
    }
    assertOnlyFields(payload.search, ["placeholder", "fields"], "Collection search");
    if (new Set(payload.search.fields).size !== payload.search.fields.length) {
      throw new Error("Collection controls returned duplicate search fields.");
    }
    search = {
      placeholder: payload.search.placeholder,
      fields: payload.search.fields as string[],
    };
  }

  const filters = payload.filters.map(parseCollectionFilterControl);
  if (new Set(filters.map((filter) => filter.key)).size !== filters.length) {
    throw new Error("Collection controls returned duplicate filter keys.");
  }
  if (new Set(payload.ordering).size !== payload.ordering.length) {
    throw new Error("Collection controls returned duplicate ordering fields.");
  }
  return {
    search,
    filters,
    ordering: payload.ordering as string[],
  };
}

function parseOption(value: unknown): ResourceBulkActionOption {
  if (
    !isRecord(value) ||
    typeof value.key !== "string" ||
    value.type !== "boolean" ||
    typeof value.default !== "boolean" ||
    typeof value.label !== "string" ||
    typeof value.description !== "string"
  ) {
    throw new Error("Bulk-action discovery returned an invalid option definition.");
  }
  assertOnlyFields(
    value,
    ["key", "type", "default", "label", "description"],
    "Bulk-action option",
  );
  if (!value.key.trim()) {
    throw new Error("Bulk-action discovery returned an option with an empty key.");
  }
  return {
    key: value.key,
    type: value.type,
    default: value.default,
    label: value.label,
    description: value.description,
  };
}

function parseAction(value: unknown): ResourceBulkActionDefinition {
  if (!isRecord(value)) {
    throw new Error("Bulk-action discovery returned a non-object action.");
  }
  assertOnlyFields(
    value,
    [
      "id",
      "label",
      "endpoint",
      "method",
      "tone",
      "selection_modes",
      "confirmation",
      "options",
      "preflight_endpoint",
    ],
    "Bulk-action discovery",
  );
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.label !== "string" ||
    !value.label.trim() ||
    typeof value.endpoint !== "string" ||
    value.method !== "POST" ||
    (value.tone !== undefined &&
      (typeof value.tone !== "string" || !actionTones.has(value.tone))) ||
    !Array.isArray(value.selection_modes) ||
    value.selection_modes.length === 0 ||
    !value.selection_modes.every((mode) => selectionModes.has(mode as ResourceBulkSelection["mode"])) ||
    !Array.isArray(value.options)
  ) {
    throw new Error("Bulk-action discovery returned an invalid action definition.");
  }

  const endpoint = assertSafeBulkActionPath(value.endpoint);
  let preflightEndpoint: string | undefined;
  if (value.preflight_endpoint !== undefined) {
    if (typeof value.preflight_endpoint !== "string") {
      throw new Error("Bulk-action discovery returned an invalid preflight endpoint.");
    }
    preflightEndpoint = assertSafeBulkActionPath(value.preflight_endpoint);
  }
  if (
    value.confirmation !== undefined &&
    (!isRecord(value.confirmation) ||
      typeof value.confirmation.title !== "string" ||
      typeof value.confirmation.word !== "string" ||
      typeof value.confirmation.button_label !== "string" ||
      typeof value.confirmation.warning !== "string")
  ) {
    throw new Error("Bulk-action discovery returned an invalid confirmation definition.");
  }
  if (isRecord(value.confirmation)) {
    assertOnlyFields(
      value.confirmation,
      ["title", "word", "button_label", "warning"],
      "Bulk-action confirmation",
    );
  }
  const options = value.options.map(parseOption);
  if (new Set(options.map((option) => option.key)).size !== options.length) {
    throw new Error("Bulk-action discovery returned duplicate option keys.");
  }
  if (new Set(value.selection_modes).size !== value.selection_modes.length) {
    throw new Error("Bulk-action discovery returned duplicate selection modes.");
  }
  return {
    id: value.id,
    label: value.label,
    endpoint,
    method: value.method,
    ...(value.tone !== undefined
      ? { tone: value.tone as ResourceBulkActionDefinition["tone"] }
      : {}),
    selection_modes: value.selection_modes as ResourceBulkActionDefinition["selection_modes"],
    ...(value.confirmation !== undefined
      ? {
          confirmation:
            value.confirmation as unknown as ResourceBulkActionDefinition["confirmation"],
        }
      : {}),
    options,
    ...(preflightEndpoint !== undefined
      ? { preflight_endpoint: preflightEndpoint }
      : {}),
  };
}

export function parseBulkActionDiscovery(
  payload: unknown,
): ResourceBulkActionDiscoveryResponse {
  if (!isRecord(payload) || !Array.isArray(payload.actions)) {
    throw new Error("Bulk-action discovery must return an actions array.");
  }
  assertOnlyFields(payload, ["actions"], "Bulk-action discovery response");
  const actions = payload.actions.map(parseAction);
  if (new Set(actions.map((action) => action.id)).size !== actions.length) {
    throw new Error("Bulk-action discovery returned duplicate action IDs.");
  }
  return { actions };
}

export function buildBulkActionDiscoveryQuery(
  query: ResourceBulkActionQuery,
): Readonly<Record<string, unknown>> {
  const invalidKeys = Object.keys(query.filters).filter((key) =>
    nonSemanticQueryKeys.has(key),
  );
  if (invalidKeys.length > 0) {
    throw new Error(
      `Bulk-action filters cannot contain pagination or presentation key(s): ${invalidKeys.join(", ")}.`,
    );
  }
  return {
    ...query.filters,
    ...(query.search?.trim() ? { search: query.search.trim() } : {}),
  };
}

export function scopeBulkActionQuery(
  query: ResourceBulkActionQuery,
  scope: Readonly<Record<string, unknown>>,
): ResourceBulkActionQuery {
  const scopedQuery = {
    ...query,
    filters: {
      ...query.filters,
      ...scope,
    },
  };
  buildBulkActionDiscoveryQuery(scopedQuery);
  return scopedQuery;
}

export function scopeBulkActionSelection<Id extends ResourceId>(
  selection: ResourceBulkSelection<Id>,
  scope: Readonly<Record<string, unknown>>,
): ResourceBulkSelection<Id> {
  return selection.mode === "all_matching"
    ? {
        ...selection,
        query: scopeBulkActionQuery(selection.query, scope),
      }
    : selection;
}

export function buildExplicitBulkSelection<Id extends ResourceId>(
  uids: readonly Id[],
): ResourceBulkSelection<Id> {
  const normalized = Array.from(
    new Set(
      uids.map((uid) => (typeof uid === "string" ? (uid.trim() as Id) : uid)),
    ),
  ).filter((uid) => typeof uid !== "string" || uid.length > 0);
  if (normalized.length === 0) {
    throw new Error("Explicit bulk selection requires at least one UID.");
  }
  return { mode: "explicit", uids: normalized };
}

export function buildAllMatchingBulkSelection<Id extends ResourceId = ResourceId>(
  query: ResourceBulkActionQuery,
): ResourceBulkSelection<Id> {
  buildBulkActionDiscoveryQuery(query);
  return {
    mode: "all_matching",
    query: {
      search: query.search?.trim() ?? "",
      filters: { ...query.filters },
    },
  };
}

export function supportsBulkActionSelectionMode(
  action: ResourceBulkActionDefinition,
  selection: ResourceBulkSelection,
) {
  return action.selection_modes.includes(selection.mode);
}

export function getBulkActionConfirmationTone(
  tone: ResourceBulkActionDefinition["tone"],
): "primary" | "warning" | "danger" {
  return tone === "primary" || tone === "warning" || tone === "danger" ? tone : "danger";
}

export function getDefaultBulkActionOptions(
  action: ResourceBulkActionDefinition | undefined,
) {
  return Object.fromEntries(
    (action?.options ?? []).map((option) => [option.key, option.default]),
  ) as Record<string, boolean>;
}

export function assertBulkActionSelectionMode(
  action: ResourceBulkActionDefinition,
  selection: ResourceBulkSelection,
) {
  if (!supportsBulkActionSelectionMode(action, selection)) {
    throw new Error(
      `Bulk action "${action.id}" does not support ${selection.mode} selection.`,
    );
  }
}

export function serializeBulkActionExecution<Id extends ResourceId>(
  input: ResourceBulkActionExecutionInput<Id>,
): ResourceBulkActionExecutionPayload<Id> {
  return {
    selection: input.selection,
    options: { ...input.options },
  };
}

export function resolveBulkActionOptions(
  action: ResourceBulkActionDefinition,
  supplied: Readonly<Record<string, unknown>>,
) {
  const definitions = new Map(action.options.map((option) => [option.key, option]));
  const unknownKeys = Object.keys(supplied).filter((key) => !definitions.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `Bulk action "${action.id}" does not advertise option(s): ${unknownKeys.join(", ")}.`,
    );
  }

  return Object.fromEntries(
    action.options.map((option) => {
      const value = Object.prototype.hasOwnProperty.call(supplied, option.key)
        ? supplied[option.key]
        : option.default;
      if (option.type === "boolean" && typeof value !== "boolean") {
        throw new Error(`Bulk action option "${option.key}" must be boolean.`);
      }
      return [option.key, value];
    }),
  );
}
