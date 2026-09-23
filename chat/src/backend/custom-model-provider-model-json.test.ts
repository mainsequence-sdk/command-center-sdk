import { describe, expect, it } from "vitest";

import {
  formatCustomModelProviderModelsJson,
  parseCustomModelProviderModelsJson,
} from "./custom-model-provider-model-json.js";

function registryModel(index: number) {
  return {
    model: `model-${index + 1}`,
    display_name: `Model ${index + 1}`,
    api: index % 2 === 0 ? "openai-completions" : "openai-responses",
    input: index % 2 === 0 ? ["text"] : ["text", "image"],
    reasoning: index % 3 === 0,
    thinking_levels: index % 3 === 0 ? ["low", "high"] : [],
    context_window: 128000,
    max_tokens: 16000,
    metadata: { family: "bulk-test" },
  };
}

describe("custom model provider model JSON", () => {
  it("accepts a 20-model catalog-style registry and derives the declared default", () => {
    const models = parseCustomModelProviderModelsJson(
      JSON.stringify({
        default_model: "model-12",
        models: Array.from({ length: 20 }, (_, index) => registryModel(index)),
      }),
    );

    expect(models).toHaveLength(20);
    expect(models.filter((model) => model.isDefault).map((model) => model.model)).toEqual([
      "model-12",
    ]);
    expect(models[19]).toMatchObject({
      model: "model-20",
      api: "openai-responses",
      input: ["text", "image"],
      position: 190,
    });
  });

  it("accepts a bare array with exactly one is_default row and formats canonical snake-case JSON", () => {
    const parsed = parseCustomModelProviderModelsJson(
      JSON.stringify([
        {
          ...registryModel(0),
          is_default: true,
          position: 5,
        },
      ]),
    );
    const formatted = JSON.parse(formatCustomModelProviderModelsJson(parsed));

    expect(formatted.default_model).toBe("model-1");
    expect(formatted.models[0]).toMatchObject({
      display_name: "Model 1",
      thinking_levels: ["low", "high"],
      context_window: 128000,
      max_tokens: 16000,
      is_default: true,
      position: 5,
    });
    expect(formatted.models[0]).not.toHaveProperty("displayName");
  });

  it("uses is_default when a draft wrapper has an empty default_model", () => {
    const models = parseCustomModelProviderModelsJson(
      JSON.stringify({
        default_model: "",
        models: [{ ...registryModel(0), is_default: true }],
      }),
    );

    expect(models[0]?.isDefault).toBe(true);
  });

  it("rejects invalid capability rows before any provider request", () => {
    expect(() =>
      parseCustomModelProviderModelsJson(
        JSON.stringify({
          default_model: "broken",
          models: [
            {
              ...registryModel(0),
              model: "broken",
              reasoning: false,
              thinking_levels: ["high"],
            },
          ],
        }),
      ),
    ).toThrow("thinking_levels must be empty when reasoning is false");
  });
});
