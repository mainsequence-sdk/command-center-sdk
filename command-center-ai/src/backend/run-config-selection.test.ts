import { describe, expect, it } from "vitest";

import {
  parseCurrentModelOptionId,
  resolveRunConfigSelection,
} from "./run-config-selection.js";

describe("run config selection", () => {
  it("parses current model option ids", () => {
    expect(parseCurrentModelOptionId("current::openai-codex::gpt-5.3-codex-spark")).toEqual({
      provider: "openai-codex",
      model: "gpt-5.3-codex-spark",
    });
    expect(parseCurrentModelOptionId("gpt-5.3-codex-spark")).toBeNull();
  });

  it("renders fallback current models by model label instead of internal current id", () => {
    const selection = resolveRunConfigSelection({
      availableModels: [],
      availableProviders: [],
      currentModel: "current::openai-codex::gpt-5.3-codex-spark",
      currentProvider: "openai-codex",
    });

    expect(selection.resolvedProvider).toBe("openai-codex");
    expect(selection.resolvedModel).toBe("gpt-5.3-codex-spark");
    expect(selection.effectiveModelId).toBe("current::openai-codex::gpt-5.3-codex-spark");
    expect(selection.modelOptions).toEqual([
      {
        disabled: false,
        label: "gpt-5.3-codex-spark",
        modelValue: "gpt-5.3-codex-spark",
        provider: "openai-codex",
        value: "current::openai-codex::gpt-5.3-codex-spark",
      },
    ]);
  });

  it("hydrates stale current model option ids to catalog model ids when options arrive", () => {
    const selection = resolveRunConfigSelection({
      availableModels: [
        {
          auth: {
            authKind: "oauth",
            authenticated: false,
            configuredFromEnv: false,
            required: true,
            signInAvailable: true,
          },
          defaultReasoningEffort: "high",
          enabled: true,
          id: "openai-codex::catalog::gpt-5.3-codex-spark",
          known: true,
          label: "GPT-5.3 Codex Spark",
          provider: "openai-codex",
          reasoningEfforts: [
            {
              label: "High",
              value: "high",
            },
          ],
          selectable: true,
          source: "platform",
          value: "gpt-5.3-codex-spark",
        },
      ],
      availableProviders: [
        {
          label: "OpenAI Codex",
          value: "openai-codex",
        },
      ],
      currentModel: "gpt-5.3-codex-spark",
      currentProvider: "openai-codex",
      selectedModelId: "current::openai-codex::gpt-5.3-codex-spark",
      selectedProvider: "openai-codex",
    });

    expect(selection.effectiveModelId).toBe("openai-codex::catalog::gpt-5.3-codex-spark");
    expect(selection.resolvedModel).toBe("gpt-5.3-codex-spark");
    expect(selection.modelOptions).toHaveLength(1);
    expect(selection.modelOptions[0]).toMatchObject({
      disabled: false,
      label: "GPT-5.3 Codex Spark (Sign in required to run)",
    });
    expect(selection.selectedCatalogModelIsSelectable).toBe(true);
    expect(selection.reasoningOptions).toEqual([
      {
        label: "High",
        value: "high",
      },
    ]);
  });

  it("does not mark a platform selection selectable when its thinking level is unsupported", () => {
    const selection = resolveRunConfigSelection({
      availableModels: [
        {
          auth: {
            authKind: null,
            authenticated: true,
            configuredFromEnv: false,
            required: false,
            signInAvailable: false,
          },
          defaultReasoningEffort: "high",
          enabled: true,
          id: "openai::gpt-5",
          known: true,
          label: "GPT-5",
          provider: "openai",
          reasoningEfforts: [{ label: "High", value: "high" }],
          selectable: true,
          source: "platform",
          value: "gpt-5",
        },
      ],
      availableProviders: [{ label: "OpenAI", value: "openai" }],
      currentModel: "gpt-5",
      currentProvider: "openai",
      selectedThinking: "xhigh",
    });

    expect(selection.selectedThinkingIsSelectable).toBe(false);
    expect(selection.selectedCatalogModelIsSelectable).toBe(false);
  });
});
