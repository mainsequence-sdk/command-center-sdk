/**
 * Which model the "choose a model" state offers first: the one the person
 * last ran with, when it is still usable, otherwise the first usable model of
 * the first provider.
 */

import {
  type AvailableChatModelOption,
  type AvailableChatProviderOption,
} from "../backend/model-catalog-api.js";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isUsableSessionModel(model: AvailableChatModelOption): boolean {
  return model.enabled && model.selectable && (!model.auth.required || model.auth.authenticated);
}

export function pickDefaultSessionModel({
  lastUsed,
  models,
  providers,
}: {
  lastUsed: ReadonlyArray<{ provider: string | null; model: string | null }>;
  models: readonly AvailableChatModelOption[];
  providers: readonly AvailableChatProviderOption[];
}): AvailableChatModelOption | null {
  const usable = models.filter(isUsableSessionModel);
  for (const entry of lastUsed) {
    const provider = normalize(entry.provider);
    const model = normalize(entry.model);
    if (!provider || !model) {
      continue;
    }
    const match = usable.find(
      (candidate) =>
        normalize(candidate.provider) === provider &&
        (normalize(candidate.value) === model || normalize(candidate.label) === model),
    );
    if (match) {
      return match;
    }
  }
  for (const provider of providers) {
    const match = usable.find((candidate) => candidate.provider === provider.value);
    if (match) {
      return match;
    }
  }
  return usable[0] ?? null;
}
