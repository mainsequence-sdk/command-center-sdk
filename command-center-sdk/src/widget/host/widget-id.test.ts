import { describe, expect, it } from "vitest";

import * as widgetIds from "./widget-id.js";

describe("canonical widget IDs", () => {
  it("hard-cuts the CodeRepository infrastructure graph identity without an alias", () => {
    expect(widgetIds.MAIN_SEQUENCE_FOUNDRY_CODE_REPOSITORY_INFRA_GRAPH_WIDGET_ID).toBe(
      "main-sequence-foundry__code-repository-infra-graph",
    );
    expect("MAIN_SEQUENCE_FOUNDRY_PROJECT_INFRA_GRAPH_WIDGET_ID" in widgetIds).toBe(false);
    expect(Object.values(widgetIds)).not.toContain(
      "main-sequence-foundry__project-infra-graph",
    );
  });
});
