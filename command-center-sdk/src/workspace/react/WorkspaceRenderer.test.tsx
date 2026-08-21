import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defineWidget } from "../../widget/index.js";

import { WorkspaceRenderer } from "./index.js";

describe("WorkspaceRenderer", () => {
  it("renders installed widgets and deterministic placeholders without app globals", () => {
    const installed = defineWidget<{ message?: string }>({
      id: "example__installed",
      widgetVersion: "1.0.0",
      title: "Installed",
      description: "Installed",
      category: "Test",
      kind: "custom",
      source: "test",
      mockProps: {},
      component: ({ props }) => <div>{String(props.message)}</div>,
    });
    const html = renderToStaticMarkup(
      <WorkspaceRenderer
        workspace={{
          id: "workspace-1",
          title: "Workspace",
          description: "",
          source: "test",
          widgets: [
            { id: "one", widgetId: installed.id, props: { message: "Hello" }, layout: { w: 4, h: 3 } },
            { id: "two", widgetId: "acme__missing", props: { preserved: true }, layout: { w: 4, h: 3 } },
          ],
        }}
        adapters={{ resolveWidget: (id) => id === installed.id ? installed : undefined }}
      />,
    );
    expect(html).toContain("Hello");
    expect(html).toContain("acme__missing");
    expect(html).toContain("Widget runtime is not installed");
  });
});
