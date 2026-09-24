import type {
  CustomModelInput,
  CustomModelProviderApi,
  CustomModelProviderModelInput,
  CustomModelThinkingLevel,
} from "./custom-model-provider-api.js";

const supportedApis: CustomModelProviderApi[] = [
  "openai-completions",
  "openai-responses",
];
const supportedInputs: CustomModelInput[] = ["text", "image"];
const supportedThinkingLevels: CustomModelThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

function modelError(index: number, message: string): never {
  throw new Error(`Model ${index + 1}: ${message}`);
}

function requiredString(value: unknown, field: string, index: number) {
  if (typeof value !== "string" || !value.trim()) {
    modelError(index, `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function nullablePositiveInteger(value: unknown, field: string, index: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    modelError(index, `${field} must be null or a positive whole number.`);
  }
  return value;
}

function positionValue(value: unknown, index: number) {
  if (value === undefined) return index * 10;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    modelError(index, "position must be zero or a positive whole number.");
  }
  return value;
}

function enumArray<T extends string>({
  allowed,
  field,
  index,
  value,
}: {
  allowed: readonly T[];
  field: string;
  index: number;
  value: unknown;
}) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    modelError(index, `${field} must be an array.`);
  }
  const values = value as string[];
  const invalid = values.find((entry) => !allowed.includes(entry as T));
  if (invalid) {
    modelError(index, `${field} contains unsupported value ${JSON.stringify(invalid)}.`);
  }
  if (new Set(values).size !== values.length) {
    modelError(index, `${field} cannot contain duplicates.`);
  }
  return values as T[];
}

function parseModel(value: unknown, index: number): CustomModelProviderModelInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    modelError(index, "each models entry must be an object.");
  }
  const candidate = value as Record<string, unknown>;
  const model = requiredString(candidate.model, "model", index);
  const displayName = requiredString(candidate.display_name, "display_name", index);
  const api = requiredString(candidate.api, "api", index) as CustomModelProviderApi;
  if (!supportedApis.includes(api)) {
    modelError(index, `api must be ${supportedApis.join(" or ")}.`);
  }
  const input = enumArray({
    allowed: supportedInputs,
    field: "input",
    index,
    value: candidate.input,
  });
  if (input.length === 0) {
    modelError(index, "input must contain at least one value.");
  }
  if (typeof candidate.reasoning !== "boolean") {
    modelError(index, "reasoning must be a boolean.");
  }
  const reasoning = candidate.reasoning;
  const parsedThinkingLevels = enumArray({
    allowed: supportedThinkingLevels,
    field: "thinking_levels",
    index,
    value: candidate.thinking_levels,
  });
  if (!reasoning && parsedThinkingLevels.length > 0) {
    modelError(index, "thinking_levels must be empty when reasoning is false.");
  }
  if (candidate.is_default !== undefined && typeof candidate.is_default !== "boolean") {
    modelError(index, "is_default must be a boolean when provided.");
  }
  const metadata = candidate.metadata ?? {};
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    modelError(index, "metadata must be a JSON object.");
  }

  return {
    model,
    displayName,
    api,
    input,
    reasoning,
    thinkingLevels: parsedThinkingLevels,
    contextWindow: nullablePositiveInteger(candidate.context_window, "context_window", index),
    maxTokens: nullablePositiveInteger(candidate.max_tokens, "max_tokens", index),
    isDefault: candidate.is_default === true,
    position: positionValue(candidate.position, index),
    metadata: metadata as Record<string, unknown>,
  };
}

export function parseCustomModelProviderModelsJson(source: string) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    throw new Error("Models JSON is not valid JSON.");
  }

  const wrapper =
    decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : null;
  const entries = Array.isArray(decoded) ? decoded : wrapper?.models;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Models JSON must be a non-empty array or an object containing a non-empty "models" array.');
  }

  const models = entries.map(parseModel);
  const identifiers = models.map((model) => model.model);
  if (new Set(identifiers).size !== identifiers.length) {
    throw new Error("Model identifiers must be unique within the provider.");
  }

  if (wrapper?.default_model !== undefined && typeof wrapper.default_model !== "string") {
    throw new Error("default_model must be a string when provided.");
  }
  const defaultModel =
    typeof wrapper?.default_model === "string" ? wrapper.default_model.trim() : "";
  if (defaultModel) {
    if (!identifiers.includes(defaultModel)) {
      throw new Error("default_model must match one model identifier in models.");
    }
    models.forEach((model) => {
      model.isDefault = model.model === defaultModel;
    });
  }

  if (models.filter((model) => model.isDefault).length !== 1) {
    throw new Error(
      "Exactly one model must be the default. Set is_default=true once or provide default_model.",
    );
  }
  return models;
}

export function formatCustomModelProviderModelsJson(models: CustomModelProviderModelInput[]) {
  return JSON.stringify(
    {
      default_model: models.find((model) => model.isDefault)?.model ?? "",
      models: models.map((model) => ({
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
      })),
    },
    null,
    2,
  );
}
