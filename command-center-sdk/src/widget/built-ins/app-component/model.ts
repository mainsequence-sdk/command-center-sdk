import {
  CORE_VALUE_BOOLEAN_CONTRACT,
  CORE_VALUE_INTEGER_CONTRACT,
  CORE_VALUE_JSON_CONTRACT,
  CORE_VALUE_NUMBER_CONTRACT,
  CORE_VALUE_STRING_CONTRACT,
  type AppComponentApiTargetMode,
  type AppComponentAuthMode,
  type AppComponentAuthoringPropsV1,
  type AppComponentBindingInputPortSpec,
  type AppComponentBindingOutputPortSpec,
  type AppComponentBindingSpec,
  type AppComponentFieldLocation,
  type AppComponentGeneratedFieldKind,
  type AppComponentHttpMethod,
  type AppComponentMockJsonDefinition,
  type AppComponentOpenApiParameter,
  type AppComponentOpenApiReference,
  type AppComponentOpenApiSchema,
  type AppComponentRequestInputMap,
  type AppComponentServiceHeader,
  type WidgetContractId,
} from "../../../contracts/index.js";
import type {
  ResolvedWidgetInput,
  ResolvedWidgetInputs,
  WidgetIoDefinition,
} from "../../index.js";

export type {
  AppComponentApiTargetMode,
  AppComponentAuthMode,
  AppComponentBindingInputPortSpec,
  AppComponentBindingOutputPortSpec,
  AppComponentBindingSpec,
  AppComponentFieldLocation,
  AppComponentGeneratedFieldKind,
  AppComponentHttpMethod,
  AppComponentMockJsonDefinition,
  AppComponentRequestInputMap,
  AppComponentServiceHeader,
} from "../../../contracts/index.js";

export type OpenApiReference = AppComponentOpenApiReference;
export type OpenApiSchema = AppComponentOpenApiSchema;
export type OpenApiParameter = AppComponentOpenApiParameter;
export type AppComponentWidgetProps = AppComponentAuthoringPropsV1;

export interface AppComponentWidgetRuntimeState extends Record<string, unknown> {
  operationKey?: string;
  draftValues?: Record<string, string>;
  status?: "idle" | "submitting" | "success" | "error";
  lastExecutedAtMs?: number;
  lastRequestUrl?: string;
  lastResponseStatus?: number;
  lastResponseStatusText?: string;
  lastResponseBody?: unknown;
  lastResponseHeaders?: Record<string, string>;
  error?: string;
  publishedOutputs?: Record<string, unknown>;
}

const methods: AppComponentHttpMethod[] = ["get", "post", "put", "patch", "delete", "options", "head"];

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function method(value: unknown): AppComponentHttpMethod | undefined {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  return methods.includes(normalized as AppComponentHttpMethod)
    ? normalized as AppComponentHttpMethod
    : undefined;
}
function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

export function buildDefaultAppComponentMockJsonDefinition(): AppComponentMockJsonDefinition {
  return {
    version: 1,
    operation: { method: "post", path: "/mock", summary: "Mock operation" },
    request: {
      bodyContentType: "application/json",
      bodySchema: { type: "object", properties: { message: { type: "string", title: "Message" } } },
    },
    response: {
      status: 200,
      contentType: "application/json",
      body: { ok: true, message: "Mock response" },
    },
  };
}

export function normalizeAppComponentMockJsonDefinition(
  value: unknown,
): AppComponentMockJsonDefinition | undefined {
  if (!record(value) || value.version !== 1 || !record(value.operation) || !record(value.response)) {
    return undefined;
  }
  const responseStatus = Number(value.response.status);
  return {
    ...clone(value) as unknown as AppComponentMockJsonDefinition,
    version: 1,
    operation: {
      ...clone(value.operation),
      method: method(value.operation.method) ?? "post",
      path: text(value.operation.path) ?? "/mock",
      summary: text(value.operation.summary),
      description: text(value.operation.description),
    },
    request: record(value.request) ? clone(value.request) as AppComponentMockJsonDefinition["request"] : undefined,
    response: {
      ...clone(value.response),
      status: Number.isInteger(responseStatus) && responseStatus >= 100 && responseStatus <= 599
        ? responseStatus
        : 200,
      contentType: text(value.response.contentType) ?? "application/json",
    },
  };
}

export function normalizeAppComponentProps(
  props: AppComponentWidgetProps,
): AppComponentWidgetProps {
  const mode = text(props.apiTargetMode) ?? "manual";
  const mockJson = normalizeAppComponentMockJsonDefinition(props.mockJson);
  return {
    ...props,
    apiTargetMode: mode,
    mockJson,
    apiBaseUrl: text(props.apiBaseUrl),
    serviceHeaders: Array.isArray(props.serviceHeaders)
      ? props.serviceHeaders.flatMap((entry) => {
          const name = text(entry?.name);
          return name ? [{ name, value: String(entry.value ?? "") }] : [];
        })
      : undefined,
    authMode: props.authMode === "session-jwt" ? "session-jwt" : "none",
    method: method(props.method) ?? (mode === "mock-json" ? mockJson?.operation.method : undefined),
    path: text(props.path) ?? (mode === "mock-json" ? mockJson?.operation.path : undefined),
    requestBodyContentType: text(props.requestBodyContentType) ?? mockJson?.request?.bodyContentType,
    compactCardLayout:
      props.compactCardLayout === "two-columns" || props.compactCardLayout === "three-columns"
        ? props.compactCardLayout
        : "one-column",
    showHeader: props.showHeader !== false,
    showResponse: mode === "mock-json" || props.showResponse === true,
    hideRequestButton: props.hideRequestButton === true,
    requestButtonLabel: text(props.requestButtonLabel) ?? "Submit",
    refreshOnDashboardRefresh: props.refreshOnDashboardRefresh !== false,
  };
}

export function normalizeAppComponentRuntimeState(
  value?: Record<string, unknown>,
): AppComponentWidgetRuntimeState {
  const source = record(value) ? clone(value) : {};
  return {
    ...source,
    operationKey: text(source.operationKey),
    draftValues: record(source.draftValues)
      ? Object.fromEntries(Object.entries(source.draftValues).map(([key, entry]) => [key, String(entry ?? "")]))
      : {},
    status: source.status === "submitting" || source.status === "success" || source.status === "error"
      ? source.status
      : "idle",
    lastResponseStatus: typeof source.lastResponseStatus === "number" ? source.lastResponseStatus : undefined,
    lastResponseBody: source.lastResponseBody,
    publishedOutputs: record(source.publishedOutputs) ? source.publishedOutputs : undefined,
    error: text(source.error),
  };
}

export function buildAppComponentOperationKey(
  methodValue: AppComponentHttpMethod | undefined,
  pathValue: string | undefined,
) {
  return methodValue && pathValue ? `${methodValue.toUpperCase()} ${pathValue}` : undefined;
}

export function resolveAppComponentResponseValueAtPath(value: unknown, path: readonly string[]) {
  return path.reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    return record(current) ? current[segment] : undefined;
  }, value);
}

function validInput(value: ResolvedWidgetInput | ResolvedWidgetInput[] | undefined) {
  return Array.isArray(value) ? value.find((entry) => entry.status === "valid") : value?.status === "valid" ? value : undefined;
}

export function resolveAppComponentInputValues(
  bindingSpec: AppComponentBindingSpec | undefined,
  inputs: ResolvedWidgetInputs | undefined,
) {
  return Object.fromEntries((bindingSpec?.requestPorts ?? []).flatMap((port) => {
    const input = validInput(inputs?.[port.id]);
    return input ? [[port.fieldKey, input.value]] : [];
  }));
}

export function resolveAppComponentOutputContract(kind: AppComponentGeneratedFieldKind): WidgetContractId {
  if (kind === "boolean") return CORE_VALUE_BOOLEAN_CONTRACT;
  if (kind === "integer") return CORE_VALUE_INTEGER_CONTRACT;
  if (kind === "number") return CORE_VALUE_NUMBER_CONTRACT;
  if (kind === "json") return CORE_VALUE_JSON_CONTRACT;
  return CORE_VALUE_STRING_CONTRACT;
}

export function resolveAppComponentWidgetIo(
  props: AppComponentWidgetProps,
): WidgetIoDefinition<AppComponentWidgetProps> | undefined {
  const normalized = normalizeAppComponentProps(props);
  const bindingSpec = normalized.bindingSpec ??
    (normalized.apiTargetMode === "mock-json" && normalized.mockJson
      ? inferAppComponentMockBindingSpec(normalized.mockJson)
      : undefined);
  if (!bindingSpec) return undefined;
  return {
    inputs: bindingSpec.requestPorts.map((port) => ({
      id: port.id,
      label: port.label,
      description: port.description,
      required: port.required,
      accepts: port.accepts,
      effects: [{ kind: "drives-value", sourcePath: port.id, target: { kind: "generated-field", id: port.fieldKey } }],
    })),
    outputs: bindingSpec.responsePorts.map((port) => ({
      id: port.id,
      label: port.label,
      description: port.description,
      contract: port.contract,
      valueDescriptor: { kind: "unknown", contract: port.contract },
      resolveValue: ({ runtimeState }) => {
        const state = normalizeAppComponentRuntimeState(runtimeState);
        return state.publishedOutputs?.[port.id] ??
          resolveAppComponentResponseValueAtPath(state.lastResponseBody, port.responsePath);
      },
    })),
  };
}

export function inferAppComponentMockBindingSpec(
  definition: AppComponentMockJsonDefinition,
): AppComponentBindingSpec {
  const operationKey = buildAppComponentOperationKey(
    definition.operation.method,
    definition.operation.path,
  ) ?? "POST /mock";
  const parameters = definition.request?.parameters ?? [];
  const properties = definition.request?.bodySchema?.properties ?? {};
  const requiredBody = new Set(definition.request?.bodySchema?.required ?? []);
  const requestPorts: AppComponentBindingInputPortSpec[] = [
    ...parameters.map((parameter) => ({
      id: `request:${parameter.in}:${parameter.name}`,
      fieldKey: `${parameter.in}:${parameter.name}`,
      label: parameter.schema && !('$ref' in parameter.schema) && parameter.schema.title || parameter.name,
      description: parameter.description,
      required: parameter.required === true,
      location: parameter.in === "cookie" ? "header" as const : parameter.in,
      kind: resolveSchemaKind(parameter.schema),
      accepts: [resolveAppComponentOutputContract(resolveSchemaKind(parameter.schema))],
    })),
    ...Object.entries(properties).map(([key, schema]) => ({
      id: `request:body:${key}`,
      fieldKey: `body:${key}`,
      label: !('$ref' in schema) && schema.title || key,
      description: !('$ref' in schema) ? schema.description : undefined,
      required: requiredBody.has(key),
      location: "body" as const,
      kind: resolveSchemaKind(schema),
      accepts: [resolveAppComponentOutputContract(resolveSchemaKind(schema))],
    })),
  ];
  return {
    version: 1,
    operationKey,
    requestPorts,
    responsePorts: [{
      id: "response:body",
      label: "Response body",
      kind: "json",
      contract: CORE_VALUE_JSON_CONTRACT,
      responsePath: [],
      statusCode: String(definition.response.status ?? 200),
      contentType: definition.response.contentType ?? "application/json",
    }],
  };
}

function resolveSchemaKind(
  schema: OpenApiSchema | OpenApiReference | undefined,
): AppComponentGeneratedFieldKind {
  if (!schema || '$ref' in schema) return "json";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "integer") return "integer";
  if (schema.type === "number") return "number";
  if (schema.type === "string" && schema.enum?.length) return "enum";
  if (schema.type === "string" && schema.format === "date") return "date";
  if (schema.type === "string" && schema.format === "date-time") return "date-time";
  if (schema.type === "string" || !schema.type) return "string";
  return "json";
}

export function extractAppComponentPublishedOutputs(
  body: unknown,
  bindingSpec: AppComponentBindingSpec | undefined,
) {
  return Object.fromEntries((bindingSpec?.responsePorts ?? []).map((port) => [
    port.id,
    resolveAppComponentResponseValueAtPath(body, port.responsePath),
  ]));
}
