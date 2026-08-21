import type {
  WidgetExecutionContext,
  WidgetExecutionDefinition,
  WidgetExecutionResult,
} from "../../index.js";
import {
  buildAppComponentOperationKey,
  extractAppComponentPublishedOutputs,
  inferAppComponentMockBindingSpec,
  normalizeAppComponentProps,
  normalizeAppComponentRuntimeState,
  resolveAppComponentInputValues,
  type AppComponentBindingSpec,
  type AppComponentGeneratedFieldKind,
  type AppComponentWidgetProps,
} from "./model.js";

export interface AppComponentTransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}
export interface AppComponentTransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  body?: unknown;
}
export interface AppComponentTransport {
  execute(request: AppComponentTransportRequest): Promise<AppComponentTransportResponse>;
}

function parseDraftValue(value: unknown, kind: AppComponentGeneratedFieldKind) {
  if (typeof value !== "string") return value;
  if (kind === "boolean") return value === "true" ? true : value === "false" ? false : value;
  if (kind === "number" || kind === "integer") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (kind === "json") {
    try { return JSON.parse(value) as unknown; } catch { return value; }
  }
  return value;
}

function responseHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => { result[key] = value; });
  return result;
}

export const defaultAppComponentTransport: AppComponentTransport = {
  async execute(request) {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    let body: unknown;
    if (response.status !== 204) {
      body = contentType.includes("json") ? await response.json() : await response.text();
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders(response.headers),
      body,
    };
  },
};

function buildRequest(input: {
  bindingSpec: AppComponentBindingSpec;
  draftValues: Record<string, string>;
  inputValues: Record<string, unknown>;
  props: AppComponentWidgetProps;
}) {
  const url = new URL(input.props.path ?? "", input.props.apiBaseUrl);
  const headers = Object.fromEntries((input.props.serviceHeaders ?? []).map((entry) => [entry.name, entry.value]));
  const body: Record<string, unknown> = {};
  for (const port of input.bindingSpec.requestPorts) {
    const configured = input.inputValues[port.fieldKey] ??
      input.draftValues[port.fieldKey] ??
      input.props.requestInputMap?.fields[port.fieldKey]?.prefillValue;
    if (configured === undefined || configured === "") {
      if (port.required) throw new Error(`${port.label} is required.`);
      continue;
    }
    const value = parseDraftValue(configured, port.kind);
    if (port.location === "path") {
      url.pathname = url.pathname.replace(`{${port.fieldKey.replace(/^path:/, "")}}`, encodeURIComponent(String(value)));
    } else if (port.location === "query") {
      url.searchParams.set(port.fieldKey.replace(/^query:/, ""), String(value));
    } else if (port.location === "header") {
      headers[port.fieldKey.replace(/^header:/, "")] = String(value);
    } else {
      body[port.fieldKey.replace(/^body:/, "")] = value;
    }
  }
  const hasBody = Object.keys(body).length > 0;
  if (hasBody && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = input.props.requestBodyContentType ?? "application/json";
  }
  return {
    method: (input.props.method ?? "get").toUpperCase(),
    url: url.toString(),
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  };
}

function errorResult(
  runtimeState: Record<string, unknown> | undefined,
  error: string,
): WidgetExecutionResult {
  return {
    status: "error",
    error,
    runtimeStatePatch: {
      ...normalizeAppComponentRuntimeState(runtimeState),
      status: "error",
      error,
    },
  };
}

export async function executePortableAppComponent(
  context: WidgetExecutionContext<AppComponentWidgetProps>,
  transport: AppComponentTransport = defaultAppComponentTransport,
): Promise<WidgetExecutionResult> {
  const props = normalizeAppComponentProps(context.targetOverrides?.props ?? context.props);
  const runtimeState = normalizeAppComponentRuntimeState(
    context.targetOverrides?.runtimeState ?? context.runtimeState,
  );
  const draftValues = {
    ...(runtimeState.draftValues ?? {}),
    ...(context.targetOverrides?.draftValues ?? {}),
  };
  const bindingSpec = props.bindingSpec ??
    (props.apiTargetMode === "mock-json" && props.mockJson
      ? inferAppComponentMockBindingSpec(props.mockJson)
      : undefined);
  const operationKey = bindingSpec?.operationKey ?? buildAppComponentOperationKey(props.method, props.path);

  if (!bindingSpec || !props.method || !props.path) {
    return errorResult(runtimeState, "Configure an operation and binding specification before executing AppComponent.");
  }

  if (props.apiTargetMode === "mock-json") {
    if (!props.mockJson) return errorResult(runtimeState, "Mock JSON mode requires a valid mock definition.");
    let requestUrl = props.path;
    try {
      requestUrl = buildRequest({
        bindingSpec,
        draftValues,
        inputValues: resolveAppComponentInputValues(bindingSpec, context.resolvedInputs),
        props: { ...props, apiBaseUrl: "https://mock-json.invalid" },
      }).url;
    } catch (cause) {
      return errorResult(runtimeState, cause instanceof Error ? cause.message : "Mock request validation failed.");
    }
    const status = props.mockJson.response.status ?? 200;
    const responseBody = props.mockJson.response.body;
    return {
      status: status >= 200 && status < 400 ? "success" : "error",
      error: status >= 200 && status < 400 ? undefined : `Mock operation responded with ${status}.`,
      runtimeStatePatch: {
        ...runtimeState,
        operationKey,
        draftValues,
        status: status >= 200 && status < 400 ? "success" : "error",
        lastExecutedAtMs: Date.now(),
        lastRequestUrl: requestUrl,
        lastResponseStatus: status,
        lastResponseStatusText: props.mockJson.response.description ?? "Mock response",
        lastResponseHeaders: { "content-type": props.mockJson.response.contentType ?? "application/json" },
        lastResponseBody: responseBody,
        publishedOutputs: extractAppComponentPublishedOutputs(responseBody, bindingSpec),
        error: status >= 200 && status < 400 ? undefined : `Mock operation responded with ${status}.`,
      },
    };
  }

  if (props.apiTargetMode !== "manual") {
    return errorResult(runtimeState, `Target mode "${props.apiTargetMode}" requires a trusted host runtime adapter.`);
  }
  if (!props.apiBaseUrl) return errorResult(runtimeState, "Manual mode requires an API base URL.");
  if (props.authMode === "session-jwt") {
    return errorResult(runtimeState, "Session JWT authentication requires a trusted host runtime adapter.");
  }

  try {
    const request = buildRequest({
      bindingSpec,
      draftValues,
      inputValues: resolveAppComponentInputValues(bindingSpec, context.resolvedInputs),
      props,
    });
    const response = await transport.execute({ ...request, signal: context.signal });
    const error = response.ok ? undefined : `Request responded with ${response.status} ${response.statusText}.`;
    return {
      status: response.ok ? "success" : "error",
      error,
      runtimeStatePatch: {
        ...runtimeState,
        operationKey,
        draftValues,
        status: response.ok ? "success" : "error",
        lastExecutedAtMs: Date.now(),
        lastRequestUrl: request.url,
        lastResponseStatus: response.status,
        lastResponseStatusText: response.statusText,
        lastResponseHeaders: response.headers,
        lastResponseBody: response.body,
        publishedOutputs: extractAppComponentPublishedOutputs(response.body, bindingSpec),
        error,
      },
    };
  } catch (cause) {
    return errorResult(runtimeState, cause instanceof Error ? cause.message : "AppComponent execution failed.");
  }
}

export function createAppComponentExecutionDefinition(
  transport: AppComponentTransport = defaultAppComponentTransport,
): WidgetExecutionDefinition<AppComponentWidgetProps> {
  return {
    getExecutionReadiness: ({ props }) => {
      const normalized = normalizeAppComponentProps(props);
      if (!normalized.method || !normalized.path) return { status: "waiting", reason: "Configure an operation." };
      if (normalized.apiTargetMode === "mock-json" && normalized.mockJson) return { status: "ready" };
      if (normalized.apiTargetMode === "manual" && normalized.apiBaseUrl && normalized.authMode === "none") return { status: "ready" };
      if (normalized.apiTargetMode !== "manual") return { status: "waiting", reason: "This target mode requires a host adapter." };
      return { status: "waiting", reason: "Configure a base URL and portable no-auth transport." };
    },
    execute: (context) => executePortableAppComponent(context, transport),
    getRefreshPolicy: ({ props }) => props.refreshOnDashboardRefresh === false ? "manual-only" : "allow-refresh",
    getExecutionKey: (context) => `app-component:${context.instanceId}`,
  };
}

export const appComponentExecutionDefinition = createAppComponentExecutionDefinition();
