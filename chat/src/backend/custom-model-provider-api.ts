import { resolvePlatformApiUrl, type ChatBackendConnection } from "./connection.js";
import { buildRuntimeHttpErrorMessage } from "./http-error.js";
import { requireCreatedByUserUid } from "./user-scope.js";

export type CustomModelProviderApi = "openai-completions" | "openai-responses";
export type CustomModelInput = "text" | "image";
export type CustomModelThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface CustomModelProviderHeaderInput {
  name: string;
  value: string;
}

export interface CustomModelProviderModelInput {
  model: string;
  displayName: string;
  api: CustomModelProviderApi;
  input: CustomModelInput[];
  reasoning: boolean;
  thinkingLevels: CustomModelThinkingLevel[];
  contextWindow: number | null;
  maxTokens: number | null;
  isDefault: boolean;
  position: number;
  metadata: Record<string, unknown>;
}

export interface CustomModelProviderModel extends CustomModelProviderModelInput {
  uid: string;
  createdByUserUid: string;
  creationDate: string;
  updatedAt: string;
}

export interface CustomModelProvider {
  uid: string;
  identifier: string;
  displayName: string;
  baseUrl: string;
  auth: {
    hasApiKey: boolean;
    headerNames: string[];
  };
  defaultModel: string;
  models: CustomModelProviderModel[];
  createdByUserUid: string;
  creationDate: string;
  updatedAt: string;
}

export interface CreateCustomModelProviderInput {
  identifier: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string | null;
  headers?: CustomModelProviderHeaderInput[];
  models: CustomModelProviderModelInput[];
}

export interface UpdateCustomModelProviderInput {
  identifier?: string;
  displayName?: string;
  baseUrl?: string;
  apiKey?: string | null;
  headers?: CustomModelProviderHeaderInput[];
}

export interface CustomModelProviderRequestOptions {
  connection: ChatBackendConnection;
  createdByUserUid?: string | null;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}

const collectionPath = "/api/v1/custom-model-providers/";

function buildHeaders(token: string | null | undefined, tokenType = "Bearer") {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  return headers;
}

function stringValue(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`Custom model provider response field ${field} must be a string.`);
  }

  return value;
}

function booleanValue(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new Error(`Custom model provider response field ${field} must be a boolean.`);
  }

  return value;
}

function nullableNumberValue(value: unknown, field: string) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Custom model provider response field ${field} must be a number or null.`);
  }
  return value;
}

function stringArrayValue(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Custom model provider response field ${field} must be a string array.`);
  }
  return value as string[];
}

function objectValue(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Custom model provider response field ${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function normalizeModel(value: unknown): CustomModelProviderModel {
  const candidate = objectValue(value, "models[]");
  const api = stringValue(candidate.api, "models[].api");
  if (api !== "openai-completions" && api !== "openai-responses") {
    throw new Error("Custom model provider response contains an unsupported model API.");
  }

  const input = stringArrayValue(candidate.input, "models[].input");
  if (input.some((entry) => entry !== "text" && entry !== "image")) {
    throw new Error("Custom model provider response contains an unsupported model input.");
  }

  const thinkingLevels = stringArrayValue(candidate.thinking_levels, "models[].thinking_levels");
  if (
    thinkingLevels.some(
      (entry) => !["off", "minimal", "low", "medium", "high", "xhigh"].includes(entry),
    )
  ) {
    throw new Error("Custom model provider response contains an unsupported thinking level.");
  }

  return {
    uid: stringValue(candidate.uid, "models[].uid"),
    model: stringValue(candidate.model, "models[].model"),
    displayName: stringValue(candidate.display_name, "models[].display_name"),
    api,
    input: input as CustomModelInput[],
    reasoning: booleanValue(candidate.reasoning, "models[].reasoning"),
    thinkingLevels: thinkingLevels as CustomModelThinkingLevel[],
    contextWindow: nullableNumberValue(candidate.context_window, "models[].context_window"),
    maxTokens: nullableNumberValue(candidate.max_tokens, "models[].max_tokens"),
    isDefault: booleanValue(candidate.is_default, "models[].is_default"),
    position: nullableNumberValue(candidate.position, "models[].position") ?? 0,
    metadata: objectValue(candidate.metadata, "models[].metadata"),
    createdByUserUid: stringValue(candidate.created_by_user_uid, "models[].created_by_user_uid"),
    creationDate: stringValue(candidate.creation_date, "models[].creation_date"),
    updatedAt: stringValue(candidate.updated_at, "models[].updated_at"),
  };
}

function normalizeProvider(value: unknown): CustomModelProvider {
  const candidate = objectValue(value, "provider");
  const auth = objectValue(candidate.auth, "auth");
  if (!Array.isArray(candidate.models)) {
    throw new Error("Custom model provider response field models must be an array.");
  }

  return {
    uid: stringValue(candidate.uid, "uid"),
    identifier: stringValue(candidate.identifier, "identifier"),
    displayName: stringValue(candidate.display_name, "display_name"),
    baseUrl: stringValue(candidate.base_url, "base_url"),
    auth: {
      hasApiKey: booleanValue(auth.has_api_key, "auth.has_api_key"),
      headerNames: stringArrayValue(auth.header_names, "auth.header_names"),
    },
    defaultModel: stringValue(candidate.default_model, "default_model"),
    models: candidate.models.map(normalizeModel),
    createdByUserUid: stringValue(candidate.created_by_user_uid, "created_by_user_uid"),
    creationDate: stringValue(candidate.creation_date, "creation_date"),
    updatedAt: stringValue(candidate.updated_at, "updated_at"),
  };
}

function serializeModel(input: CustomModelProviderModelInput | Partial<CustomModelProviderModelInput>) {
  const payload: Record<string, unknown> = {};
  if (input.model !== undefined) payload.model = input.model;
  if (input.displayName !== undefined) payload.display_name = input.displayName;
  if (input.api !== undefined) payload.api = input.api;
  if (input.input !== undefined) payload.input = input.input;
  if (input.reasoning !== undefined) payload.reasoning = input.reasoning;
  if (input.thinkingLevels !== undefined) payload.thinking_levels = input.thinkingLevels;
  if (input.contextWindow !== undefined) payload.context_window = input.contextWindow;
  if (input.maxTokens !== undefined) payload.max_tokens = input.maxTokens;
  if (input.isDefault !== undefined) payload.is_default = input.isDefault;
  if (input.position !== undefined) payload.position = input.position;
  if (input.metadata !== undefined) payload.metadata = input.metadata;
  return payload;
}

function serializeProvider(input: CreateCustomModelProviderInput | UpdateCustomModelProviderInput) {
  const payload: Record<string, unknown> = {};
  if (input.identifier !== undefined) payload.identifier = input.identifier;
  if (input.displayName !== undefined) payload.display_name = input.displayName;
  if (input.baseUrl !== undefined) payload.base_url = input.baseUrl;
  if (input.apiKey !== undefined) payload.api_key = input.apiKey;
  if (input.headers !== undefined) payload.headers = input.headers;
  if ("models" in input) payload.models = input.models.map(serializeModel);
  return payload;
}

async function requestJson({
  method,
  options,
  path,
  payload,
}: {
  method: "GET" | "POST" | "PATCH";
  options: CustomModelProviderRequestOptions;
  path: string;
  payload?: Record<string, unknown>;
}) {
  requireCreatedByUserUid(options.createdByUserUid, "Custom model providers");
  const url = resolvePlatformApiUrl(options.connection, path);
  const response = await fetch(url, {
    method,
    headers: buildHeaders(options.token, options.tokenType),
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Custom model provider request failed with status ${response.status}.`,
        method,
        operation: "Custom model provider request failed",
        response,
        url,
      }),
    );
  }

  return (await response.json()) as unknown;
}

async function requestDelete(path: string, options: CustomModelProviderRequestOptions) {
  requireCreatedByUserUid(options.createdByUserUid, "Custom model providers");
  const url = resolvePlatformApiUrl(options.connection, path);
  const response = await fetch(url, {
    method: "DELETE",
    headers: buildHeaders(options.token, options.tokenType),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Custom model provider deletion failed with status ${response.status}.`,
        method: "DELETE",
        operation: "Custom model provider deletion failed",
        response,
        url,
      }),
    );
  }
}

export async function fetchCustomModelProviders(options: CustomModelProviderRequestOptions) {
  const payload = await requestJson({ method: "GET", options, path: collectionPath });
  if (!Array.isArray(payload)) {
    throw new Error("Custom model provider list response must be an array.");
  }
  return payload.map(normalizeProvider);
}

export async function createCustomModelProvider(
  input: CreateCustomModelProviderInput,
  options: CustomModelProviderRequestOptions,
) {
  return normalizeProvider(
    await requestJson({
      method: "POST",
      options,
      path: collectionPath,
      payload: serializeProvider(input),
    }),
  );
}

export async function updateCustomModelProvider(
  providerUid: string,
  input: UpdateCustomModelProviderInput,
  options: CustomModelProviderRequestOptions,
) {
  return normalizeProvider(
    await requestJson({
      method: "PATCH",
      options,
      path: `${collectionPath}${encodeURIComponent(providerUid)}/`,
      payload: serializeProvider(input),
    }),
  );
}

export async function deleteCustomModelProvider(
  providerUid: string,
  options: CustomModelProviderRequestOptions,
) {
  await requestDelete(`${collectionPath}${encodeURIComponent(providerUid)}/`, options);
}

export async function createCustomModelProviderModel(
  providerUid: string,
  input: CustomModelProviderModelInput,
  options: CustomModelProviderRequestOptions,
) {
  return normalizeModel(
    await requestJson({
      method: "POST",
      options,
      path: `${collectionPath}${encodeURIComponent(providerUid)}/models/`,
      payload: serializeModel(input),
    }),
  );
}

export async function updateCustomModelProviderModel(
  providerUid: string,
  modelUid: string,
  input: Partial<CustomModelProviderModelInput>,
  options: CustomModelProviderRequestOptions,
) {
  return normalizeModel(
    await requestJson({
      method: "PATCH",
      options,
      path: `${collectionPath}${encodeURIComponent(providerUid)}/models/${encodeURIComponent(modelUid)}/`,
      payload: serializeModel(input),
    }),
  );
}

export async function deleteCustomModelProviderModel(
  providerUid: string,
  modelUid: string,
  options: CustomModelProviderRequestOptions,
) {
  await requestDelete(
    `${collectionPath}${encodeURIComponent(providerUid)}/models/${encodeURIComponent(modelUid)}/`,
    options,
  );
}
