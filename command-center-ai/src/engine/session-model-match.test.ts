import { describe, expect, it } from "vitest";

import { type AvailableChatModelOption } from "../backend/model-catalog-api.js";
import { resolveSessionPickerModel } from "./session-model-match.js";

function model(provider: string, value: string, overrides: Partial<AvailableChatModelOption> = {}): AvailableChatModelOption {
  return {
    auth: { authKind: null, authenticated: true, configuredFromEnv: false, required: false, signInAvailable: false },
    id: `${provider}::${value}`,
    label: value,
    defaultReasoningEffort: null,
    value,
    provider,
    reasoningEfforts: [],
    source: "platform",
    known: true,
    enabled: true,
    selectable: true,
    ...overrides,
  };
}

const providers = [
  { label: "Anthropic", value: "anthropic" },
  { label: "OpenAI Codex subscription", value: "openai-codex" },
];
const models = [
  model("anthropic", "claude-fable-5-1"),
  model("openai-codex", "gpt-6-astra", { label: "GPT-6 Astra" }),
  model("openai-codex", "gpt-5.6-luna", { label: "GPT-5.6 Luna" }),
];

describe("resolveSessionPickerModel", () => {
  it("keeps the stored provider and model when the catalog offers them", () => {
    expect(resolveSessionPickerModel({ provider: "OpenAI-Codex", model: "GPT-5.6-luna", models, providers })).toEqual({
      kind: "stored",
      providerValue: "openai-codex",
      modelId: "openai-codex::gpt-5.6-luna",
    });
    expect(resolveSessionPickerModel({ provider: null, model: "claude-fable-5-1", models, providers })).toEqual({
      kind: "stored",
      providerValue: "anthropic",
      modelId: "anthropic::claude-fable-5-1",
    });
  });

  it("selects the same model under the one other provider that offers it", () => {
    expect(resolveSessionPickerModel({ provider: "openai", model: "gpt-5.6-luna", models, providers })).toEqual({
      kind: "other-provider",
      providerValue: "openai-codex",
      modelId: "openai-codex::gpt-5.6-luna",
      label: "GPT-5.6 Luna via OpenAI Codex subscription",
    });
  });

  it("preselects nothing when no other provider offers the model", () => {
    expect(resolveSessionPickerModel({ provider: "openai", model: "gpt-4o", models, providers })).toEqual({
      kind: "unavailable",
      providerValue: null,
      offeredBy: [],
    });
    // A published provider stays selected so its models are listed, but none is chosen.
    expect(resolveSessionPickerModel({ provider: "anthropic", model: "gpt-4o", models, providers })).toEqual({
      kind: "unavailable",
      providerValue: "anthropic",
      offeredBy: [],
    });
    const disabled = [model("openai-codex", "gpt-5.6-luna", { selectable: false })];
    expect(resolveSessionPickerModel({ provider: "openai", model: "gpt-5.6-luna", models: disabled, providers }).kind).toBe(
      "unavailable",
    );
  });

  it("lets the person choose when several other providers offer the model", () => {
    const shared = [model("anthropic", "gpt-5.6-luna"), model("openai-codex", "gpt-5.6-luna")];
    expect(resolveSessionPickerModel({ provider: "openai", model: "gpt-5.6-luna", models: shared, providers })).toEqual({
      kind: "unavailable",
      providerValue: null,
      offeredBy: ["Anthropic", "OpenAI Codex subscription"],
    });
  });
});
