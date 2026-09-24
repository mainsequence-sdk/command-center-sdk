import {
  asRecord,
  detail,
  json,
  noContent,
  readString,
  type StandInRequest,
  type StandInRoute,
} from "./http";
import type { StandInContext } from "./identity";

// The platform's model catalog, provider sign-in and sign-off, and the Organization's custom
// providers, as the package's clients read them (`src/backend/model-catalog-api.ts`,
// `model-provider-auth-api.ts`, `custom-model-provider-api.ts`).

type ModelApi = "openai-completions" | "openai-responses";
type ModelInput = "text" | "image";

interface CatalogModel {
  model: string;
  displayName: string;
  api: ModelApi;
  input: ModelInput[];
  reasoning: boolean;
  thinkingLevels: string[];
  contextWindow: number | null;
  maxTokens: number | null;
}

interface BuiltInProvider {
  provider: string;
  displayName: string;
  authMethods: string[];
  signInAvailable: boolean;
  defaultModel: string;
  models: CatalogModel[];
  authenticated: boolean;
  credentialStatus: "active" | "revoked" | "missing";
}

interface CustomModel extends CatalogModel {
  uid: string;
  isDefault: boolean;
  position: number;
  metadata: Record<string, unknown>;
  createdByUserUid: string;
  creationDate: string;
  updatedAt: string;
}

interface CustomProvider {
  uid: string;
  identifier: string;
  displayName: string;
  baseUrl: string;
  apiKey: string | null;
  headers: Array<{ name: string; value: string }>;
  models: CustomModel[];
  createdByUserUid: string;
  creationDate: string;
  updatedAt: string;
}

interface SignInAttempt {
  uid: string;
  provider: string;
  status: "pending" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  reads: number;
}

/** A provider and model as the Agent's runtime needs them to answer a turn. */
export interface StandInModelDescription {
  providerLabel: string;
  modelLabel: string;
  contextWindow: number | null;
  maxTokens: number | null;
  /** Why the model cannot run now, in the words the runtime would use; null when it can. */
  problem: string | null;
}

/** The provider, model, and thinking a new session gets. */
export const STAND_IN_DEFAULT_MODEL = { provider: "stand-in-cloud", model: "swift-1", thinking: "medium" };

const MODEL_APIS: readonly string[] = ["openai-completions", "openai-responses"];
const MODEL_INPUTS: readonly string[] = ["text", "image"];
const CUSTOM_THINKING_LEVELS: readonly string[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function createBuiltInProviders(): BuiltInProvider[] {
  return [
    {
      provider: "stand-in-cloud",
      displayName: "Stand-in Cloud",
      authMethods: ["oauth"],
      signInAvailable: true,
      defaultModel: "swift-1",
      authenticated: true,
      credentialStatus: "active",
      models: [
        {
          model: "swift-1",
          displayName: "Swift 1",
          api: "openai-responses",
          input: ["text", "image"],
          reasoning: true,
          thinkingLevels: ["low", "medium", "high"],
          contextWindow: 200_000,
          maxTokens: 32_000,
        },
        {
          model: "deep-1",
          displayName: "Deep 1",
          api: "openai-responses",
          input: ["text"],
          reasoning: true,
          thinkingLevels: ["medium", "high", "xhigh"],
          contextWindow: 400_000,
          maxTokens: 64_000,
        },
      ],
    },
    {
      provider: "stand-in-labs",
      displayName: "Stand-in Labs",
      authMethods: ["oauth"],
      signInAvailable: true,
      defaultModel: "labs-preview",
      authenticated: false,
      credentialStatus: "missing",
      models: [
        {
          model: "labs-preview",
          displayName: "Labs Preview",
          api: "openai-completions",
          input: ["text"],
          reasoning: false,
          thinkingLevels: [],
          contextWindow: 128_000,
          maxTokens: 8_000,
        },
      ],
    },
  ];
}

function catalogModel(model: CatalogModel) {
  return {
    model: model.model,
    display_name: model.displayName,
    api: model.api,
    input: model.input,
    reasoning: model.reasoning,
    // The catalog publishes thinking levels only for reasoning models.
    thinking_levels: model.reasoning ? model.thinkingLevels : [],
    context_window: model.contextWindow,
    max_tokens: model.maxTokens,
  };
}

function customModelView(model: CustomModel) {
  return {
    uid: model.uid,
    model: model.model,
    display_name: model.displayName,
    api: model.api,
    input: model.input,
    reasoning: model.reasoning,
    thinking_levels: model.thinkingLevels,
    context_window: model.contextWindow,
    max_tokens: model.maxTokens,
    is_default: model.isDefault,
    position: model.position,
    metadata: model.metadata,
    created_by_user_uid: model.createdByUserUid,
    creation_date: model.creationDate,
    updated_at: model.updatedAt,
  };
}

function defaultModelOf(provider: CustomProvider) {
  return provider.models.find((model) => model.isDefault)?.model ?? provider.models[0]?.model ?? "";
}

function customProviderView(provider: CustomProvider) {
  return {
    uid: provider.uid,
    identifier: provider.identifier,
    display_name: provider.displayName,
    base_url: provider.baseUrl,
    // Secrets are write-only: the platform returns whether they exist, never their values.
    auth: {
      has_api_key: Boolean(provider.apiKey),
      header_names: provider.headers.map((header) => header.name),
    },
    default_model: defaultModelOf(provider),
    models: [...provider.models].sort((left, right) => left.position - right.position).map(customModelView),
    created_by_user_uid: provider.createdByUserUid,
    creation_date: provider.creationDate,
    updated_at: provider.updatedAt,
  };
}

type FieldErrors = Record<string, string[]>;

function isPositiveIntegerOrNull(value: unknown) {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

/** Reads a model definition the way the platform validates it; `partial` for a PATCH. */
function readModelInput(
  payload: Record<string, unknown>,
  partial: boolean,
): { errors: FieldErrors } | { value: Partial<CustomModel> } {
  const errors: FieldErrors = {};
  const value: Partial<CustomModel> = {};
  const has = (field: string) => field in payload;
  const needs = (field: string) => !partial || has(field);

  if (needs("model")) {
    const model = readString(payload.model);
    if (model) value.model = model;
    else errors.model = ["This field is required."];
  }
  if (needs("display_name")) {
    const displayName = readString(payload.display_name);
    if (displayName) value.displayName = displayName;
    else errors.display_name = ["This field is required."];
  }
  if (needs("api")) {
    if (typeof payload.api === "string" && MODEL_APIS.includes(payload.api)) value.api = payload.api as ModelApi;
    else errors.api = [`Choose one of: ${MODEL_APIS.join(", ")}.`];
  }
  if (needs("input")) {
    const input = payload.input;
    if (Array.isArray(input) && input.length > 0 && input.every((entry) => MODEL_INPUTS.includes(String(entry)))) {
      value.input = input as ModelInput[];
    } else {
      errors.input = ["Choose at least one of: text, image."];
    }
  }
  if (needs("reasoning")) {
    if (typeof payload.reasoning === "boolean") value.reasoning = payload.reasoning;
    else errors.reasoning = ["Must be true or false."];
  }
  if (has("thinking_levels") || !partial) {
    const levels = payload.thinking_levels ?? [];
    if (Array.isArray(levels) && levels.every((entry) => CUSTOM_THINKING_LEVELS.includes(String(entry)))) {
      value.thinkingLevels = levels as string[];
    } else {
      errors.thinking_levels = [`Use only: ${CUSTOM_THINKING_LEVELS.join(", ")}.`];
    }
  }
  for (const [field, key] of [
    ["context_window", "contextWindow"],
    ["max_tokens", "maxTokens"],
  ] as const) {
    if (has(field) || !partial) {
      const number = payload[field] ?? null;
      if (isPositiveIntegerOrNull(number)) value[key] = number as number | null;
      else errors[field] = ["Must be a positive whole number or null."];
    }
  }
  if (has("is_default") || !partial) {
    if (typeof (payload.is_default ?? false) === "boolean") value.isDefault = payload.is_default === true;
    else errors.is_default = ["Must be true or false."];
  }
  if (has("position")) {
    if (typeof payload.position === "number" && Number.isFinite(payload.position)) value.position = payload.position;
    else errors.position = ["Must be a number."];
  }
  if (has("metadata") || !partial) {
    const metadata = payload.metadata ?? {};
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      value.metadata = metadata as Record<string, unknown>;
    } else {
      errors.metadata = ["Must be an object."];
    }
  }

  return Object.keys(errors).length > 0 ? { errors } : { value };
}

function readHeaders(value: unknown): Array<{ name: string; value: string }> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const headers = value.map((entry) => {
    const record = asRecord(entry);
    return { name: readString(record.name) ?? "", value: typeof record.value === "string" ? record.value : "" };
  });

  return headers.every((header) => header.name && header.value) ? headers : null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function createModelProviders(context: StandInContext) {
  const builtIn = createBuiltInProviders();
  const custom: CustomProvider[] = [];
  const attempts = new Map<string, SignInAttempt>();
  let catalogVersion = 1;

  function changed() {
    catalogVersion += 1;
  }

  function catalogDigest() {
    return `sha256:${catalogVersion.toString(16).padStart(64, "0")}`;
  }

  function addCustomModel(provider: CustomProvider, input: Partial<CustomModel>) {
    const createdAt = context.now();
    const model: CustomModel = {
      uid: context.nextUid("custom-model"),
      model: input.model ?? "",
      displayName: input.displayName ?? input.model ?? "",
      api: input.api ?? "openai-completions",
      input: input.input ?? ["text"],
      reasoning: input.reasoning ?? false,
      thinkingLevels: input.thinkingLevels ?? [],
      contextWindow: input.contextWindow ?? null,
      maxTokens: input.maxTokens ?? null,
      isDefault: input.isDefault ?? false,
      position: input.position ?? provider.models.length,
      metadata: input.metadata ?? {},
      createdByUserUid: context.personUid(),
      creationDate: createdAt,
      updatedAt: createdAt,
    };

    if (model.isDefault) {
      provider.models.forEach((entry) => {
        entry.isDefault = false;
      });
    }
    provider.models.push(model);
    return model;
  }

  // One Organization custom provider exists from the start, so the settings show both kinds.
  const seededProvider: CustomProvider = {
    uid: context.nextUid("custom-provider"),
    identifier: "stand-in-models",
    displayName: "Stand-in Models",
    baseUrl: "https://models.stand-in.test/v1",
    apiKey: "stand-in-key",
    headers: [],
    models: [],
    createdByUserUid: context.personUid(),
    creationDate: context.now(),
    updatedAt: context.now(),
  };
  addCustomModel(seededProvider, {
    model: "alpha",
    displayName: "Alpha",
    api: "openai-completions",
    input: ["text"],
    reasoning: true,
    thinkingLevels: ["off", "high"],
    contextWindow: 128_000,
    maxTokens: 16_000,
    isDefault: true,
  });
  custom.push(seededProvider);

  function catalog() {
    return {
      schema_version: 1,
      catalog_digest: catalogDigest(),
      providers: [
        ...builtIn.map((provider) => ({
          provider: provider.provider,
          display_name: provider.displayName,
          auth_methods: provider.authMethods,
          sign_in_available: provider.signInAvailable,
          known: true,
          enabled: true,
          authenticated: provider.authenticated,
          credential_status: provider.credentialStatus,
          default_model: provider.defaultModel,
          models: provider.models.map(catalogModel),
        })),
        // Organization custom providers join the same catalog: no sign-in, always usable.
        ...custom.map((provider) => ({
          provider: provider.identifier,
          display_name: provider.displayName,
          auth_methods: [],
          sign_in_available: false,
          known: false,
          enabled: true,
          authenticated: true,
          credential_status: "active",
          default_model: defaultModelOf(provider),
          models: [...provider.models].sort((left, right) => left.position - right.position).map(catalogModel),
        })),
      ],
    };
  }

  function describeModel(providerId: string, modelId: string): StandInModelDescription | null {
    const builtInProvider = builtIn.find((provider) => provider.provider === providerId);
    const customProvider = custom.find((provider) => provider.identifier === providerId);
    const provider = builtInProvider ?? customProvider;
    const model = provider?.models.find((entry) => entry.model === modelId);

    if (!provider || !model) {
      return null;
    }

    return {
      providerLabel: provider.displayName,
      modelLabel: model.displayName,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      problem:
        builtInProvider && !builtInProvider.authenticated
          ? `Sign in to ${provider.displayName} before you use ${model.displayName}.`
          : null,
    };
  }

  function attemptView(attempt: SignInAttempt) {
    return {
      uid: attempt.uid,
      provider: attempt.provider,
      status: attempt.status,
      // The stand-in signs in on its own; there is no page to open.
      next_action: { type: "none" },
      created_at: attempt.createdAt,
      updated_at: attempt.updatedAt,
      completed_at: attempt.completedAt,
      error_code: null,
    };
  }

  function findCustomProvider(uid: string) {
    return custom.find((provider) => provider.uid === uid) ?? null;
  }

  function readBody(request: StandInRequest) {
    return asRecord(request.body);
  }

  const routes: StandInRoute[] = [
    {
      method: "GET",
      path: "/api/v1/model-providers/",
      handle: () => json(200, catalog()),
    },
    {
      method: "POST",
      path: "/api/v1/model-provider-sign-in-attempts/",
      handle: (request) => {
        const providerId = readString(readBody(request).provider);
        const provider = builtIn.find((entry) => entry.provider === providerId);

        if (!provider || !provider.signInAvailable) {
          return detail(400, "Sign-in is not available for this provider.", { code: "provider_signin_unavailable" });
        }

        const running = [...attempts.values()].find(
          (attempt) => attempt.provider === provider.provider && attempt.status === "pending",
        );
        if (running) {
          return detail(409, "A sign-in for this provider is already in progress.", {
            code: "provider_signin_in_progress",
            attempt: attemptView(running),
          });
        }

        const createdAt = context.now();
        const attempt: SignInAttempt = {
          uid: context.nextUid("sign-in-attempt"),
          provider: provider.provider,
          status: "pending",
          createdAt,
          updatedAt: createdAt,
          completedAt: null,
          reads: 0,
        };
        attempts.set(attempt.uid, attempt);
        return json(201, attemptView(attempt));
      },
    },
    {
      method: "GET",
      path: "/api/v1/model-provider-sign-in-attempts/:attempt/",
      handle: (_request, params) => {
        const attempt = attempts.get(params.attempt ?? "");

        if (!attempt) {
          return detail(404, "Sign-in attempt not found.", { code: "signin_attempt_not_found" });
        }

        // The settings read an attempt at once, then every second and a half: the second read
        // completes the sign-in, so the dialog is on screen for a moment.
        attempt.reads += 1;
        if (attempt.status === "pending" && attempt.reads >= 2) {
          const provider = builtIn.find((entry) => entry.provider === attempt.provider);
          if (provider) {
            provider.authenticated = true;
            provider.credentialStatus = "active";
            changed();
          }
          attempt.status = "completed";
          attempt.updatedAt = context.now();
          attempt.completedAt = attempt.updatedAt;
        }

        return json(200, attemptView(attempt));
      },
    },
    {
      method: "POST",
      path: "/api/v1/model-provider-sign-in-attempts/:attempt/cancel/",
      handle: (_request, params) => {
        const attempt = attempts.get(params.attempt ?? "");

        if (!attempt) {
          return detail(404, "Sign-in attempt not found.", { code: "signin_attempt_not_found" });
        }
        if (attempt.status !== "pending") {
          return detail(409, "This sign-in attempt is no longer active.", { code: "signin_attempt_not_active" });
        }

        attempt.status = "cancelled";
        attempt.updatedAt = context.now();
        return json(200, attemptView(attempt));
      },
    },
    {
      method: "POST",
      path: "/api/v1/model-provider-credentials/revoke/",
      handle: (request) => {
        const providerId = readString(readBody(request).provider);
        const provider = builtIn.find((entry) => entry.provider === providerId);

        if (!provider) {
          return detail(404, "No credential for this provider.");
        }

        provider.authenticated = false;
        provider.credentialStatus = "revoked";
        changed();
        return json(200, { provider: provider.provider, credential_status: provider.credentialStatus });
      },
    },
    {
      method: "GET",
      path: "/api/v1/custom-model-providers/",
      handle: () => json(200, custom.map(customProviderView)),
    },
    {
      method: "POST",
      path: "/api/v1/custom-model-providers/",
      handle: (request) => {
        const payload = readBody(request);
        const errors: FieldErrors = {};
        const identifier = readString(payload.identifier);
        const displayName = readString(payload.display_name);
        const baseUrl = readString(payload.base_url);
        const headers = payload.headers === undefined ? [] : readHeaders(payload.headers);
        const models = Array.isArray(payload.models) ? payload.models.map(asRecord) : null;

        if (!identifier || !/^[a-z0-9][a-z0-9-]*$/.test(identifier)) {
          errors.identifier = ["Use lowercase letters, digits, and hyphens."];
        } else if (
          builtIn.some((provider) => provider.provider === identifier) ||
          custom.some((provider) => provider.identifier === identifier)
        ) {
          errors.identifier = ["A provider with this identifier already exists."];
        }
        if (!displayName) errors.display_name = ["This field is required."];
        if (!baseUrl || !isHttpUrl(baseUrl)) errors.base_url = ["Enter an http(s) URL."];
        if (!headers) errors.headers = ["Each header needs a name and a value."];

        const modelInputs = (models ?? []).map((model) => readModelInput(model, false));
        const modelErrors = modelInputs.map((result) => ("errors" in result ? result.errors : {}));
        if (!models || models.length === 0) {
          errors.models = ["Add at least one model."];
        } else if (modelErrors.some((entry) => Object.keys(entry).length > 0)) {
          errors.models = modelErrors.flatMap((entry, index) =>
            Object.entries(entry).map(([field, messages]) => `Model ${index + 1} ${field}: ${messages.join(" ")}`),
          );
        } else if (models.filter((model) => model.is_default === true).length !== 1) {
          errors.models = ["Mark exactly one model as the default."];
        }

        if (Object.keys(errors).length > 0) {
          return json(400, errors);
        }

        const createdAt = context.now();
        const provider: CustomProvider = {
          uid: context.nextUid("custom-provider"),
          identifier: identifier ?? "",
          displayName: displayName ?? "",
          baseUrl: baseUrl ?? "",
          apiKey: readString(payload.api_key),
          headers: headers ?? [],
          models: [],
          createdByUserUid: context.personUid(),
          creationDate: createdAt,
          updatedAt: createdAt,
        };
        modelInputs.forEach((result, index) => {
          if ("value" in result) {
            addCustomModel(provider, { position: index, ...result.value });
          }
        });
        custom.push(provider);
        changed();
        return json(201, customProviderView(provider));
      },
    },
    {
      method: "PATCH",
      path: "/api/v1/custom-model-providers/:provider/",
      handle: (request, params) => {
        const provider = findCustomProvider(params.provider ?? "");
        if (!provider) {
          return detail(404, "Not found.");
        }

        const payload = readBody(request);
        const errors: FieldErrors = {};
        const identifier = "identifier" in payload ? readString(payload.identifier) : provider.identifier;
        const displayName = "display_name" in payload ? readString(payload.display_name) : provider.displayName;
        const baseUrl = "base_url" in payload ? readString(payload.base_url) : provider.baseUrl;
        const headers = "headers" in payload ? readHeaders(payload.headers) : provider.headers;

        if (!identifier || !/^[a-z0-9][a-z0-9-]*$/.test(identifier)) {
          errors.identifier = ["Use lowercase letters, digits, and hyphens."];
        } else if (
          builtIn.some((entry) => entry.provider === identifier) ||
          custom.some((entry) => entry !== provider && entry.identifier === identifier)
        ) {
          errors.identifier = ["A provider with this identifier already exists."];
        }
        if (!displayName) errors.display_name = ["This field is required."];
        if (!baseUrl || !isHttpUrl(baseUrl)) errors.base_url = ["Enter an http(s) URL."];
        if (!headers) errors.headers = ["Each header needs a name and a value."];

        if (Object.keys(errors).length > 0) {
          return json(400, errors);
        }

        provider.identifier = identifier ?? provider.identifier;
        provider.displayName = displayName ?? provider.displayName;
        provider.baseUrl = baseUrl ?? provider.baseUrl;
        provider.headers = headers ?? provider.headers;
        // An omitted key is kept; null clears it.
        if ("api_key" in payload) {
          provider.apiKey = readString(payload.api_key);
        }
        provider.updatedAt = context.now();
        changed();
        return json(200, customProviderView(provider));
      },
    },
    {
      method: "DELETE",
      path: "/api/v1/custom-model-providers/:provider/",
      handle: (_request, params) => {
        const provider = findCustomProvider(params.provider ?? "");
        if (!provider) {
          return detail(404, "Not found.");
        }

        custom.splice(custom.indexOf(provider), 1);
        changed();
        return noContent();
      },
    },
    {
      method: "POST",
      path: "/api/v1/custom-model-providers/:provider/models/",
      handle: (request, params) => {
        const provider = findCustomProvider(params.provider ?? "");
        if (!provider) {
          return detail(404, "Not found.");
        }

        const result = readModelInput(readBody(request), false);
        if ("errors" in result) {
          return json(400, result.errors);
        }
        if (provider.models.some((model) => model.model === result.value.model)) {
          return json(400, { model: ["This provider already has a model with this ID."] });
        }

        const model = addCustomModel(provider, result.value);
        provider.updatedAt = context.now();
        changed();
        return json(201, customModelView(model));
      },
    },
    {
      method: "PATCH",
      path: "/api/v1/custom-model-providers/:provider/models/:model/",
      handle: (request, params) => {
        const provider = findCustomProvider(params.provider ?? "");
        const model = provider?.models.find((entry) => entry.uid === params.model);
        if (!provider || !model) {
          return detail(404, "Not found.");
        }

        const result = readModelInput(readBody(request), true);
        if ("errors" in result) {
          return json(400, result.errors);
        }
        if (result.value.isDefault === false && model.isDefault) {
          return json(400, { is_default: ["A provider needs one default model. Make another model the default."] });
        }
        if (
          result.value.model &&
          provider.models.some((entry) => entry !== model && entry.model === result.value.model)
        ) {
          return json(400, { model: ["This provider already has a model with this ID."] });
        }

        if (result.value.isDefault) {
          provider.models.forEach((entry) => {
            entry.isDefault = false;
          });
        }
        Object.assign(model, result.value, { updatedAt: context.now() });
        provider.updatedAt = model.updatedAt;
        changed();
        return json(200, customModelView(model));
      },
    },
    {
      method: "DELETE",
      path: "/api/v1/custom-model-providers/:provider/models/:model/",
      handle: (_request, params) => {
        const provider = findCustomProvider(params.provider ?? "");
        const model = provider?.models.find((entry) => entry.uid === params.model);
        if (!provider || !model) {
          return detail(404, "Not found.");
        }
        if (model.isDefault) {
          return detail(400, "Select another default model before deleting this one.");
        }

        provider.models.splice(provider.models.indexOf(model), 1);
        provider.updatedAt = context.now();
        changed();
        return noContent();
      },
    },
  ];

  return { catalogDigest, describeModel, routes };
}

export type StandInModelProviders = ReturnType<typeof createModelProviders>;
