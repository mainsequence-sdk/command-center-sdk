import { describe, expect, it } from "vitest";
import { defineWidget } from "../index.js";

import { createWidgetRegistry } from "./index.js";

function widget(id: string) {
  return defineWidget({
    id,
    widgetVersion: "1.0.0",
    title: id,
    description: id,
    category: "Test",
    kind: "custom",
    source: "test",
    mockProps: {},
    registryContract: {
      usageGuidance: { buildPurpose: id, whenToUse: [], whenNotToUse: [], authoringSteps: [] },
    },
    component: () => null,
  });
}

describe("widget registry", () => {
  it("resolves only the contributed widget id", () => {
    const registry = createWidgetRegistry({ contributions: [{
      extensionId: "core",
      packageName: "@example/core",
      packageVersion: "1.0.0",
      widgets: [widget("core__markdown-note")],
    }] });
    expect(registry.getWidget("core__markdown-note")?.id).toBe("core__markdown-note");
    expect(registry.getWidget("markdown-note")).toBeUndefined();
  });

  it("fails exact-id collisions with both package owners", () => {
    expect(() => createWidgetRegistry({ contributions: [
      { extensionId: "one", packageName: "@example/one", packageVersion: "1.0.0", widgets: [widget("core__markdown-note")] },
      { extensionId: "two", packageName: "@example/two", packageVersion: "2.0.0", widgets: [widget("core__markdown-note")] },
    ] })).toThrow(/@example\/one@1\.0\.0.*@example\/two@2\.0\.0/);
  });

  it("reports an empty contribution with package provenance", () => {
    expect(() => createWidgetRegistry({ contributions: [{
      extensionId: "broken",
      packageName: "@example/broken",
      packageVersion: "3.0.0",
      widgets: [undefined],
    }] as never })).toThrow(
      /Empty widget contribution at index 0 from @example\/broken@3\.0\.0 \(broken\)/,
    );
  });
});
