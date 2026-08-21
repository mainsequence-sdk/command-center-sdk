import { describe, expect, it } from "vitest";

import {
  COMMAND_CENTER_WIDGET_API_VERSION,
  assertJsonSerializable,
  runOrderedMigrations,
  type WidgetManifest,
} from "./index.js";

describe("public contracts", () => {
  it("keeps widget manifests JSON-safe", () => {
    const manifest: WidgetManifest = {
      apiVersion: COMMAND_CENTER_WIDGET_API_VERSION,
      id: "example__status",
      widgetVersion: "1.0.0",
      title: "Status",
      description: "Shows one status.",
      category: "Example",
      kind: "kpi",
      source: "example",
      defaultSize: { w: 4, h: 3 },
      propsVersion: 1,
      userStateVersion: 1,
      registryContract: {
        usageGuidance: {
          buildPurpose: "Show status.",
          whenToUse: ["Use for status."],
          whenNotToUse: [],
          authoringSteps: ["Add the widget."],
        },
      },
    };

    expect(() => assertJsonSerializable(manifest, "manifest")).not.toThrow();
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("rejects functions and cycles from serializable contracts", () => {
    expect(() => assertJsonSerializable({ render: () => null })).toThrow(/JSON-safe/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => assertJsonSerializable(cyclic)).toThrow(/JSON-safe/);
  });

  it("runs migrations in deterministic consecutive order", () => {
    const result = runOrderedMigrations({
      value: { labels: [] as string[] },
      currentVersion: 1,
      targetVersion: 3,
      steps: [
        { from: 1, to: 2, migrate: (value) => ({ labels: [...value.labels, "v2"] }) },
        { from: 2, to: 3, migrate: (value) => ({ labels: [...value.labels, "v3"] }) },
      ],
    });

    expect(result).toEqual({
      value: { labels: ["v2", "v3"] },
      fromVersion: 1,
      toVersion: 3,
      appliedVersions: [2, 3],
    });
  });
});
