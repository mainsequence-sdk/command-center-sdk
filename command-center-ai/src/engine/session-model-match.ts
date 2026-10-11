/**
 * Where the picker starts for an open session: the session's stored provider
 * and model, matched against the model provider catalog.
 *
 * A stored provider the catalog does not publish can still name a model the
 * catalog offers under another provider. When exactly one other provider
 * offers it, the picker starts there; otherwise nothing is preselected and the
 * person chooses, so the picker never shows a model the session did not ask
 * for.
 */

import {
  type AvailableChatModelOption,
  type AvailableChatProviderOption,
} from "../backend/model-catalog-api.js";

export type SessionPickerModelResolution =
  | { kind: "stored"; providerValue: string | null; modelId: string }
  | {
      kind: "other-provider";
      providerValue: string;
      modelId: string;
      label: string;
    }
  | {
      kind: "unavailable";
      /** The session's provider when the catalog publishes it, so the picker lists its models. */
      providerValue: string | null;
      /** Labels of the providers that offer the model, when more than one does. */
      offeredBy: string[];
    };

function normalizeCatalogKey(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function findModelByKey(models: readonly AvailableChatModelOption[], model: string) {
  return (
    models.find((entry) => normalizeCatalogKey(entry.value) === model) ??
    models.find((entry) => normalizeCatalogKey(entry.label) === model) ??
    null
  );
}

export function resolveSessionPickerModel({
  model,
  models,
  provider,
  providers,
}: {
  model: string | null | undefined;
  models: readonly AvailableChatModelOption[];
  provider: string | null | undefined;
  providers: readonly AvailableChatProviderOption[];
}): SessionPickerModelResolution {
  const normalizedProvider = normalizeCatalogKey(provider);
  const normalizedModel = normalizeCatalogKey(model);
  const publishedProvider = normalizedProvider
    ? (providers.find((entry) => normalizeCatalogKey(entry.value) === normalizedProvider) ?? null)
    : null;

  if (!normalizedModel) {
    return { kind: "unavailable", providerValue: publishedProvider?.value ?? null, offeredBy: [] };
  }

  const scopeKey = normalizeCatalogKey(publishedProvider?.value ?? provider);
  const scopedModels = scopeKey
    ? models.filter((entry) => normalizeCatalogKey(entry.provider) === scopeKey)
    : models;
  const stored = findModelByKey(scopedModels, normalizedModel);

  if (stored) {
    return {
      kind: "stored",
      providerValue: publishedProvider?.value ?? stored.provider ?? null,
      modelId: stored.id,
    };
  }

  // Only a published provider is a candidate, and only a model the person could select there.
  const candidates = providers
    .filter((entry) => normalizeCatalogKey(entry.value) !== scopeKey)
    .flatMap((entry) => {
      const match = findModelByKey(
        models.filter(
          (candidate) =>
            candidate.provider === entry.value && candidate.enabled && candidate.selectable,
        ),
        normalizedModel,
      );
      return match ? [{ provider: entry, model: match }] : [];
    });

  if (candidates.length === 1) {
    const [{ provider: candidateProvider, model: candidateModel }] = candidates;
    return {
      kind: "other-provider",
      providerValue: candidateProvider.value,
      modelId: candidateModel.id,
      label: `${candidateModel.label} via ${candidateProvider.label}`,
    };
  }

  return {
    kind: "unavailable",
    providerValue: publishedProvider?.value ?? null,
    offeredBy: candidates.map((candidate) => candidate.provider.label),
  };
}
