import type {
  AvailableChatModelOption,
  AvailableChatProviderOption,
  AvailableChatReasoningEffortOption,
} from "./model-catalog-api.js";

export interface RunConfigModelSelectOption {
  disabled: boolean;
  label: string;
  modelValue: string;
  provider: string;
  value: string;
}

export interface RunConfigSelectionInput {
  availableModels: AvailableChatModelOption[];
  availableProviders: AvailableChatProviderOption[];
  currentModel?: string | null;
  currentProvider?: string | null;
  currentThinking?: string | null;
  selectedModelId?: string | null;
  selectedProvider?: string | null;
  selectedThinking?: string | null;
}

export function normalizeRunConfigKey(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

export function normalizeRunConfigValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function buildCurrentModelOptionId(provider: string, model: string) {
  return ["current", provider.trim(), model.trim()].join("::");
}

export function parseCurrentModelOptionId(value: string | null | undefined) {
  const normalizedValue = normalizeRunConfigValue(value);

  if (!normalizedValue.startsWith("current::")) {
    return null;
  }

  const segments = normalizedValue.split("::");

  if (segments.length < 3 || segments[0] !== "current") {
    return null;
  }

  const provider = segments[1]?.trim() ?? "";
  const model = segments.slice(2).join("::").trim();

  if (!provider || !model) {
    return null;
  }

  return {
    provider,
    model,
  };
}

function findCatalogModel(
  availableModels: AvailableChatModelOption[],
  provider: string,
  model: string,
) {
  return (
    availableModels.find(
      (entry) =>
        normalizeRunConfigKey(entry.value) === normalizeRunConfigKey(model) &&
        normalizeRunConfigKey(entry.provider) === normalizeRunConfigKey(provider),
    ) ?? null
  );
}

export function resolveRunConfigSelection({
  availableModels,
  availableProviders,
  currentModel,
  currentProvider,
  currentThinking,
  selectedModelId,
  selectedProvider,
  selectedThinking,
}: RunConfigSelectionInput) {
  const currentModelFromOptionId = parseCurrentModelOptionId(currentModel);
  const normalizedCurrentProvider =
    normalizeRunConfigValue(currentProvider) || currentModelFromOptionId?.provider || "";
  const normalizedCurrentModel =
    currentModelFromOptionId?.model || normalizeRunConfigValue(currentModel);
  const normalizedCurrentThinking = normalizeRunConfigValue(currentThinking);
  const normalizedSelectedModelId = normalizeRunConfigValue(selectedModelId);
  const selectedModelFromOptionId = parseCurrentModelOptionId(normalizedSelectedModelId);
  const selectedFallbackCatalogModel = selectedModelFromOptionId
    ? findCatalogModel(
        availableModels,
        selectedModelFromOptionId.provider,
        selectedModelFromOptionId.model,
      )
    : null;
  const currentCatalogModel =
    normalizedCurrentProvider && normalizedCurrentModel
      ? findCatalogModel(availableModels, normalizedCurrentProvider, normalizedCurrentModel)
      : null;
  const currentModelOptionId =
    currentCatalogModel?.id ||
    (normalizedCurrentProvider && normalizedCurrentModel
      ? buildCurrentModelOptionId(normalizedCurrentProvider, normalizedCurrentModel)
      : "");
  const effectiveProvider =
    normalizeRunConfigValue(selectedProvider) ||
    selectedFallbackCatalogModel?.provider?.trim() ||
    selectedModelFromOptionId?.provider ||
    normalizedCurrentProvider;
  const effectiveModelId =
    selectedFallbackCatalogModel?.id || normalizedSelectedModelId || currentModelOptionId;
  const effectiveThinking =
    normalizeRunConfigValue(selectedThinking) || normalizedCurrentThinking;
  const providerOptions = availableProviders.map((entry) => ({
    label: entry.label,
    value: entry.value,
  }));
  const hasCurrentProvider =
    normalizedCurrentProvider &&
    providerOptions.some(
      (entry) =>
        normalizeRunConfigKey(entry.value) === normalizeRunConfigKey(normalizedCurrentProvider),
    );

  if (normalizedCurrentProvider && !hasCurrentProvider) {
    providerOptions.unshift({
      label: normalizedCurrentProvider,
      value: normalizedCurrentProvider,
    });
  }

  const scopedModels = effectiveProvider
    ? availableModels.filter(
        (entry) => normalizeRunConfigKey(entry.provider) === normalizeRunConfigKey(effectiveProvider),
      )
    : availableModels;
  const modelOptions: RunConfigModelSelectOption[] = scopedModels.map((entry) => {
    const unavailable = !entry.selectable;
    const authenticationRequired = entry.auth.required && !entry.auth.authenticated;

    return {
      disabled: unavailable,
      label: unavailable
        ? `${entry.label} (Unavailable)`
        : authenticationRequired
          ? `${entry.label} (Sign in required to run)`
          : entry.label,
      provider: entry.provider ?? "",
      value: entry.id,
      modelValue: entry.value,
    };
  });

  if (normalizedCurrentProvider && normalizedCurrentModel) {
    const selectedProviderMatchesCurrent =
      !effectiveProvider ||
      normalizeRunConfigKey(effectiveProvider) === normalizeRunConfigKey(normalizedCurrentProvider);
    const hasCurrentModel = scopedModels.some(
      (model) =>
        normalizeRunConfigKey(model.value) === normalizeRunConfigKey(normalizedCurrentModel) &&
        normalizeRunConfigKey(model.provider) === normalizeRunConfigKey(normalizedCurrentProvider),
    );

    if (selectedProviderMatchesCurrent && !hasCurrentModel) {
      modelOptions.unshift({
        disabled: false,
        label: normalizedCurrentModel,
        provider: normalizedCurrentProvider,
        value: buildCurrentModelOptionId(normalizedCurrentProvider, normalizedCurrentModel),
        modelValue: normalizedCurrentModel,
      });
    }
  }

  const selectedModelOption =
    modelOptions.find((entry) => entry.value === effectiveModelId) ?? null;
  const selectedCatalogModel =
    availableModels.find((entry) => entry.id === effectiveModelId) ??
    selectedFallbackCatalogModel ??
    null;
  const reasoningOptions: AvailableChatReasoningEffortOption[] =
    selectedCatalogModel?.reasoningEfforts.length
      ? [...selectedCatalogModel.reasoningEfforts]
      : [];
  const hasSelectedThinking =
    effectiveThinking &&
    reasoningOptions.some(
      (entry) => normalizeRunConfigKey(entry.value) === normalizeRunConfigKey(effectiveThinking),
    );

  if (effectiveThinking && !hasSelectedThinking) {
    reasoningOptions.unshift({
      label: effectiveThinking,
      value: effectiveThinking,
    });
  }

  const resolvedProvider =
    selectedCatalogModel?.provider?.trim() ||
    selectedModelOption?.provider?.trim() ||
    effectiveProvider ||
    normalizedCurrentProvider;
  const resolvedModel =
    selectedCatalogModel?.value.trim() ||
    selectedModelOption?.modelValue?.trim() ||
    normalizedCurrentModel;
  const resolvedThinking = effectiveThinking || normalizedCurrentThinking;
  const selectedThinkingIsSelectable = Boolean(
    !selectedCatalogModel ||
      !resolvedThinking ||
      selectedCatalogModel.reasoningEfforts.some(
        (entry) =>
          normalizeRunConfigKey(entry.value) === normalizeRunConfigKey(resolvedThinking),
      ),
  );
  const selectedCatalogModelIsSelectable =
    selectedCatalogModel?.selectable !== false && selectedThinkingIsSelectable;
  const currentModelMissingFromCatalog = Boolean(
    normalizedCurrentProvider &&
      normalizedCurrentModel &&
      availableModels.length > 0 &&
      !findCatalogModel(availableModels, normalizedCurrentProvider, normalizedCurrentModel),
  );

  return {
    currentCatalogModel,
    currentModelMissingFromCatalog,
    currentModelOptionId,
    effectiveModelId,
    effectiveProvider,
    effectiveThinking,
    modelOptions,
    providerOptions,
    reasoningOptions,
    resolvedModel,
    resolvedProvider,
    resolvedThinking,
    selectedCatalogModel,
    selectedCatalogModelIsSelectable,
    selectedThinkingIsSelectable,
    selectedModelOption,
  };
}
