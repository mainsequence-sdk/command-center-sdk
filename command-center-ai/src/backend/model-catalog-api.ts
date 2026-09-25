import { resolvePlatformApiUrl, type ChatBackendConnection } from "./connection.js";
import { requestPlatform } from "./platform-request.js";
import { buildRuntimeHttpErrorMessage } from "./http-error.js";
import { requireCreatedByUserUid } from "./user-scope.js";

export type ModelCatalogAuthKind = "api_key" | "oauth";
export type ModelCatalogReasoningEffort =
  | "off"
  | "on"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface ModelCatalogItem {
  source: string;
  provider: string;
  label: string;
  model: string;
  known: boolean;
  enabled: boolean;
  selectable: boolean;
  auth:
    | {
        required: true;
        authKind: ModelCatalogAuthKind;
        signInAvailable: boolean;
        authenticated: boolean;
        authSource: "platform_store" | null;
      }
    | {
        required: false;
        authenticated: true;
      };
  defaults: {
    runConfig: {
      reasoning_effort: ModelCatalogReasoningEffort;
    };
  };
  capabilities: {
    features: string[];
    runConfig: {
      reasoning_effort: {
        supported: boolean;
        mode: "unsupported" | "levels";
        values: ModelCatalogReasoningEffort[];
        default: ModelCatalogReasoningEffort;
      };
    };
  };
  metadata: {
    api: string | null;
    contextWindow: number | null;
    maxTokens: number | null;
  };
}

export interface ModelProviderCatalogProvider {
  provider: string;
  displayName: string;
  authMethods: string[];
  signInAvailable: boolean;
  known: boolean;
  enabled: boolean;
  authenticated: boolean;
  credentialStatus: "active" | "revoked" | "missing";
  defaultModel: string;
  models: ModelCatalogItem[];
}

export interface ModelProviderCatalog {
  schemaVersion: number;
  catalogDigest: string;
  providers: ModelProviderCatalogProvider[];
}

export interface AvailableChatModelOption {
  auth: {
    authKind: string | null;
    authenticated: boolean;
    configuredFromEnv: boolean;
    required: boolean;
    signInAvailable: boolean;
  };
  id: string;
  label: string;
  defaultReasoningEffort: string | null;
  value: string;
  provider: string;
  reasoningEfforts: AvailableChatReasoningEffortOption[];
  source: "platform";
  known: boolean;
  enabled: boolean;
  selectable: boolean;
}

export interface AvailableChatReasoningEffortOption {
  label: string;
  value: string;
}

export interface AvailableChatProviderOption {
  label: string;
  value: string;
}

export interface AvailableChatRunConfigOptions {
  providers: AvailableChatProviderOption[];
  models: AvailableChatModelOption[];
  reasoningEfforts: AvailableChatReasoningEffortOption[];
}

const modelProviderCatalogPath = "/api/v1/model-providers/";

export function buildModelProviderCatalogQueryKey({
  projection,
  userUid,
}: {
  projection: "flat" | "providers" | "run-config";
  userUid?: string | null;
}) {
  return [
    "main-sequence-ai",
    "model-provider-catalog",
    projection,
    userUid ?? "anonymous",
  ] as const;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatReasoningLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function invalidCatalog(message: string): never {
  throw new Error(`The platform's model catalog response was invalid: ${message}`);
}

function requireBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    invalidCatalog(`${field} must be a boolean.`);
  }

  return value;
}

function requireString(value: unknown, field: string) {
  const normalized = normalizeString(value);

  if (!normalized) {
    invalidCatalog(`${field} must be a non-empty string.`);
  }

  return normalized;
}

function requireStringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    invalidCatalog(`${field} must be an array.`);
  }

  const normalized = normalizeStringArray(value);

  if (normalized.length !== value.length) {
    invalidCatalog(`${field} must contain only non-empty strings.`);
  }

  return normalized;
}

function requireNullableNumber(value: unknown, field: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalidCatalog(`${field} must be a finite number or null.`);
  }

  return value;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeReasoningEffort(value: unknown): ModelCatalogReasoningEffort | null {
  switch (value) {
    case "off":
    case "on":
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return value;
    default:
      return null;
  }
}

function normalizeModel(
  value: unknown,
  providerState: Omit<ModelProviderCatalogProvider, "models">,
): ModelCatalogItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidCatalog(`${providerState.provider}.models must contain objects.`);
  }

  const candidate = value as Record<string, unknown>;
  const model = requireString(candidate.model, `${providerState.provider}.models[].model`);
  const label = requireString(
    candidate.display_name,
    `${providerState.provider}.${model}.display_name`,
  );
  const thinkingLevels = requireStringArray(
    candidate.thinking_levels,
    `${providerState.provider}.${model}.thinking_levels`,
  );
  const reasoningValues = thinkingLevels.map((entry) => {
    const normalized = normalizeReasoningEffort(entry);

    if (!normalized) {
      invalidCatalog(
        `${providerState.provider}.${model}.thinking_levels contains an unsupported value.`,
      );
    }

    return normalized;
  });
  const reasoning = requireBoolean(
    candidate.reasoning,
    `${providerState.provider}.${model}.reasoning`,
  );

  if (!reasoning && reasoningValues.length > 0) {
    invalidCatalog(
      `${providerState.provider}.${model} publishes thinking levels without reasoning.`,
    );
  }

  const defaultReasoning = reasoningValues.includes("medium")
    ? "medium"
    : reasoningValues[0] ?? "off";
  const authRequired = providerState.authMethods.length > 0;
  const selectable = providerState.enabled;

  return {
    source: providerState.provider,
    provider: providerState.provider,
    label,
    model,
    known: providerState.known,
    enabled: providerState.enabled,
    selectable,
    auth: authRequired
      ? {
          required: true,
          authKind: providerState.authMethods.includes("oauth") ? "oauth" : "api_key",
          signInAvailable: providerState.signInAvailable,
          authenticated: providerState.authenticated,
          authSource: providerState.authenticated ? "platform_store" : null,
        }
      : {
          required: false,
          authenticated: true,
        },
    defaults: {
      runConfig: {
        reasoning_effort: defaultReasoning,
      },
    },
    capabilities: {
      features: requireStringArray(candidate.input, `${providerState.provider}.${model}.input`),
      runConfig: {
        reasoning_effort: {
          supported: reasoningValues.length > 0,
          mode: reasoningValues.length > 0 ? "levels" : "unsupported",
          values: reasoningValues,
          default: defaultReasoning,
        },
      },
    },
    metadata: {
      api: requireString(candidate.api, `${providerState.provider}.${model}.api`),
      contextWindow: requireNullableNumber(
        candidate.context_window,
        `${providerState.provider}.${model}.context_window`,
      ),
      maxTokens: requireNullableNumber(
        candidate.max_tokens,
        `${providerState.provider}.${model}.max_tokens`,
      ),
    },
  };
}

function normalizeModelProviderCatalog(payload: unknown): ModelProviderCatalog {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The platform's model catalog response was invalid.");
  }

  const candidate = payload as Record<string, unknown>;

  if (!Array.isArray(candidate.providers)) {
    throw new Error("The platform's model catalog response did not contain providers.");
  }

  if (candidate.schema_version !== 1) {
    invalidCatalog("schema_version must be 1.");
  }

  const catalogDigest = requireString(candidate.catalog_digest, "catalog_digest");

  if (!/^sha256:[0-9a-f]{64}$/.test(catalogDigest)) {
    invalidCatalog("catalog_digest must be a SHA-256 digest.");
  }

  const providers = candidate.providers.map(
    (value, providerIndex): ModelProviderCatalogProvider => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalidCatalog(`providers[${providerIndex}] must be an object.`);
      }

      const providerCandidate = value as Record<string, unknown>;
      const provider = requireString(
        providerCandidate.provider,
        `providers[${providerIndex}].provider`,
      );
      const displayName = requireString(
        providerCandidate.display_name,
        `${provider}.display_name`,
      );
      const credentialStatus = requireString(
        providerCandidate.credential_status,
        `${provider}.credential_status`,
      );

      if (
        !["active", "revoked", "missing"].includes(credentialStatus ?? "") ||
        !Array.isArray(providerCandidate.models)
      ) {
        invalidCatalog(`${provider} has an invalid credential status or models collection.`);
      }

      const providerState: Omit<ModelProviderCatalogProvider, "models"> = {
        provider,
        displayName,
        authMethods: requireStringArray(providerCandidate.auth_methods, `${provider}.auth_methods`),
        signInAvailable: requireBoolean(
          providerCandidate.sign_in_available,
          `${provider}.sign_in_available`,
        ),
        known: requireBoolean(providerCandidate.known, `${provider}.known`),
        enabled: requireBoolean(providerCandidate.enabled, `${provider}.enabled`),
        authenticated: requireBoolean(
          providerCandidate.authenticated,
          `${provider}.authenticated`,
        ),
        credentialStatus: credentialStatus as ModelProviderCatalogProvider["credentialStatus"],
        defaultModel: requireString(providerCandidate.default_model, `${provider}.default_model`),
      };

      return {
        ...providerState,
        models: providerCandidate.models.map((entry) => normalizeModel(entry, providerState)),
      };
    },
  );

  return {
    schemaVersion: 1,
    catalogDigest,
    providers,
  };
}

export function projectModelProviderCatalogToRunConfigOptions(
  catalog: ModelProviderCatalog,
): AvailableChatRunConfigOptions {
  const providers = catalog.providers
    .filter((provider) => provider.enabled)
    .map((provider) => ({
      label: provider.displayName,
      value: provider.provider,
    }));
  const models = catalog.providers.flatMap((provider) =>
    provider.models
      .filter((model) => model.enabled)
      .map((model): AvailableChatModelOption => ({
        auth: {
          authKind: model.auth.required ? model.auth.authKind : null,
          authenticated: model.auth.authenticated,
          configuredFromEnv: false,
          required: model.auth.required,
          signInAvailable: model.auth.required ? model.auth.signInAvailable : false,
        },
        id: [model.provider, model.model].join("::"),
        label: model.label,
        defaultReasoningEffort:
          model.capabilities.runConfig.reasoning_effort.supported
            ? model.capabilities.runConfig.reasoning_effort.default
            : null,
        value: model.model,
        provider: model.provider,
        reasoningEfforts: model.capabilities.runConfig.reasoning_effort.values.map((value) => ({
          label: formatReasoningLabel(value),
          value,
        })),
        source: "platform",
        known: model.known,
        enabled: model.enabled,
        selectable: model.selectable,
      })),
  );

  return {
    providers,
    models,
    reasoningEfforts: [],
  };
}

export async function fetchModelProviderCatalog({
  connection,
  createdByUserUid,
  signal,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  createdByUserUid?: string | null;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}) {
  requireCreatedByUserUid(createdByUserUid, "Model catalog");
  const headers = new Headers({ Accept: "application/json" });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  const url = resolvePlatformApiUrl(connection, modelProviderCatalogPath);
  const response = await requestPlatform(connection, url, {
    method: "GET",
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      await buildRuntimeHttpErrorMessage({
        fallbackMessage: `Model catalog failed with status ${response.status}.`,
        method: "GET",
        operation: "Model provider catalog request failed",
        response,
        url,
      }),
    );
  }

  return normalizeModelProviderCatalog((await response.json()) as unknown);
}

export async function fetchModelCatalog(
  options: Parameters<typeof fetchModelProviderCatalog>[0],
) {
  const catalog = await fetchModelProviderCatalog(options);
  return catalog.providers.flatMap((provider) => provider.models);
}

export async function fetchAvailableRunConfigOptions(
  options: Parameters<typeof fetchModelProviderCatalog>[0],
) {
  return projectModelProviderCatalogToRunConfigOptions(
    await fetchModelProviderCatalog(options),
  );
}
