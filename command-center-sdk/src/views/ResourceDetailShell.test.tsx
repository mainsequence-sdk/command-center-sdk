import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EntitySummary as EntitySummaryModel } from "../resource/types.js";
import { EntitySummary } from "./EntitySummary.js";
import { ResourceDetailShell } from "./ResourceDetailShell.js";

const summary: EntitySummaryModel = {
  entity: { id: "resource-1", type: "example", title: "Example resource" },
  badges: [{ key: "state", label: "Ready", tone: "success" }],
  inline_fields: [{ key: "uid", label: "UID", value: "resource-1", kind: "code" }],
  highlight_fields: [{ key: "owner", label: "Owner", value: "Platform", kind: "text" }],
  stats: [{ key: "items", label: "Items", display: "12", value: 12 }],
  label_management: { labels: ["production"] },
  summary_warning: "Review before changing this resource.",
};

describe("ResourceDetailShell", () => {
  it("renders Project-style primary and nested tabs from controlled definitions", () => {
    const html = renderToStaticMarkup(
      <ResourceDetailShell
        activeSubTabId="history"
        activeTabId="ship"
        breadcrumbs={[
          { id: "resources", label: "Resources", onSelect: () => undefined },
          { id: "resource", label: "Example resource" },
        ]}
        summary={<EntitySummary summary={summary} />}
        tabs={[
          { id: "code", label: "Code" },
          {
            id: "ship",
            label: "Ship",
            subTabs: [
              { id: "releases", label: "Releases" },
              { id: "history", label: "Deploy History" },
            ],
          },
        ]}
      >
        <div>Selected tab content</div>
      </ResourceDetailShell>,
    );

    expect(html).toContain("Resources");
    expect(html).toContain("Code");
    expect(html).toContain("Ship");
    expect(html).toContain("Releases");
    expect(html).toContain("Deploy History");
    expect(html).toContain("Selected tab content");
    expect(html).toContain('aria-selected="true"');
  });

  it("uses the blocking transition shell for initial detail loading", () => {
    const html = renderToStaticMarkup(
      <ResourceDetailShell loading loadingTitle="Loading project…" />,
    );

    expect(html).toContain("cc-resource-transition-shell");
    expect(html).toContain("Loading project…");
    expect(html).not.toContain("cc-resource-detail-tabs");
  });
});

describe("EntitySummary", () => {
  it("renders the normalized summary contract without application dependencies", () => {
    const html = renderToStaticMarkup(<EntitySummary summary={summary} />);

    expect(html).toContain("Example resource");
    expect(html).toContain("Ready");
    expect(html).toContain("production");
    expect(html).toContain("Platform");
    expect(html).toContain("Review before changing this resource.");
    expect(html).toContain("12");
  });
});
