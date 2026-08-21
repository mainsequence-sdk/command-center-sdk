import { describe, expect, it } from "vitest";

import {
  defineWidgetModule,
  toLegacyWidgetDefinition,
  withWidgetRuntimeOverrides,
} from "./index.js";

describe("widget module", () => {
  it("separates a JSON-safe manifest from executable runtime behavior", () => {
    const component = () => null;
    const module = defineWidgetModule({
      manifest: {
        id: "example__hello",
        widgetVersion: "1.0.0",
        title: "Hello",
        description: "Example widget.",
        category: "Example",
        kind: "custom",
        source: "example",
        workspaceRuntimeMode: "local-ui",
        registryContract: {
          usageGuidance: {
            buildPurpose: "Render a greeting.",
            whenToUse: ["Use in examples."],
            whenNotToUse: [],
            authoringSteps: ["Add the widget."],
          },
        },
      },
      runtime: {
        definition: {
          component,
          mockProps: { greeting: "Hello" },
        },
      },
    });

    expect(module.manifest).not.toHaveProperty("component");
    expect(module.runtime.definition.component).toBe(component);
    expect(toLegacyWidgetDefinition(module).id).toBe("example__hello");
  });

  it("rejects executable values in the manifest", () => {
    expect(() =>
      defineWidgetModule({
        manifest: {
          id: "example__unsafe",
          widgetVersion: "1.0.0",
          title: "Unsafe",
          description: "Unsafe example.",
          category: "Example",
          kind: "custom",
          source: "example",
          registryContract: {
            usageGuidance: {
              buildPurpose: "Test validation.",
              whenToUse: [],
              whenNotToUse: [],
              authoringSteps: [],
            },
            capabilities: { unsafe: () => null },
          },
        },
        runtime: { definition: { component: () => null, mockProps: {} } },
      }),
    ).toThrow(/JSON-safe/);
  });

  it("lets a trusted host enhance runtime behavior without changing the manifest", () => {
    const module = defineWidgetModule({
      manifest: {
        id: "acme__portable",
        widgetVersion: "1.0.0",
        title: "Portable",
        description: "Portable widget",
        category: "Test",
        kind: "custom",
        source: "test",
        registryContract: {
          usageGuidance: {
            buildPurpose: "Test runtime composition.",
            whenToUse: ["Use in tests."],
            whenNotToUse: [],
            authoringSteps: [],
          },
        },
      },
      runtime: { definition: { component: () => null } },
    });
    const enhanced = withWidgetRuntimeOverrides(module, {
      component: () => "enhanced",
      mockProps: { mode: "host" },
    });

    expect(enhanced.manifest).toBe(module.manifest);
    expect(enhanced.runtime.definition.id).toBe("acme__portable");
    expect(enhanced.runtime.definition.mockProps).toEqual({ mode: "host" });
  });
});
