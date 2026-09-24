import { describe, expect, it } from "vitest";

import { type AvailableChatModelOption } from "../backend/model-catalog-api.js";
import { isUsableSessionModel, pickDefaultSessionModel } from "./session-model-default.js";

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
  { label: "OpenAI Codex", value: "openai-codex" },
];
const models = [model("anthropic", "claude-fable-5-1"), model("openai-codex", "gpt-5.5"), model("openai-codex", "gpt-5.5-mini")];

describe("pickDefaultSessionModel", () => {
  it("prefers the last model the person ran with when it is still usable", () => {
    expect(pickDefaultSessionModel({ lastUsed: [{ provider: "openai-codex", model: "gpt-5.5" }], models, providers })?.id).toBe(
      "openai-codex::gpt-5.5",
    );
    expect(
      pickDefaultSessionModel({ lastUsed: [{ provider: null, model: null }, { provider: "OpenAI-Codex", model: "GPT-5.5-mini" }], models, providers })?.id,
    ).toBe("openai-codex::gpt-5.5-mini");
  });

  it("falls back to the first usable model of the first provider, skipping models that cannot run", () => {
    expect(pickDefaultSessionModel({ lastUsed: [{ provider: "gone", model: "gone" }], models, providers })?.id).toBe(
      "anthropic::claude-fable-5-1",
    );
    const needsSignIn = model("anthropic", "claude-fable-5-1", {
      auth: { authKind: "oauth", authenticated: false, configuredFromEnv: false, required: true, signInAvailable: true },
    });
    expect(isUsableSessionModel(needsSignIn)).toBe(false);
    expect(pickDefaultSessionModel({ lastUsed: [], models: [needsSignIn, model("openai-codex", "gpt-5.5")], providers })?.id).toBe(
      "openai-codex::gpt-5.5",
    );
    expect(pickDefaultSessionModel({ lastUsed: [], models: [model("anthropic", "x", { selectable: false })], providers })).toBeNull();
    expect(pickDefaultSessionModel({ lastUsed: [], models: [], providers })).toBeNull();
  });
});
