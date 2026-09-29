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
  it("renders resource-style primary and nested tabs from controlled definitions", () => {
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
      <ResourceDetailShell loading loadingTitle="Loading service…" />,
    );

    expect(html).toContain("cc-resource-transition-shell");
    expect(html).toContain("Loading service…");
    expect(html).not.toContain("cc-resource-detail-tabs");
  });

  it("renders one tab stop, links every tab to the panel, and names the panel by the active label", () => {
    const html = renderToStaticMarkup(
      <ResourceDetailShell
        activeTabId="logs"
        renderTabLead={({ tab }) => <svg data-lead={tab.id} />}
        tabs={[
          { count: 3, id: "overview", label: "Overview" },
          { id: "logs", label: "Logs" },
          { disabled: true, id: "settings", label: "Settings" },
        ]}
        tabsLabel="Service sections"
      >
        <div>Logs body</div>
      </ResourceDetailShell>,
    );

    const tablist = openingTags(html, 'role="tablist"');
    expect(tablist).toHaveLength(1);
    expect(attribute(tablist[0]!, "aria-label")).toBe("Service sections");

    const tabs = openingTags(html, 'role="tab"');
    expect(tabs.map((tag) => attribute(tag, "data-cc-tab-id"))).toEqual(["overview", "logs", "settings"]);
    expect(tabs.map((tag) => attribute(tag, "tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(tabs.map((tag) => attribute(tag, "aria-selected"))).toEqual(["false", "true", "false"]);
    expect(tabs.map((tag) => attribute(tag, "aria-disabled"))).toEqual([null, null, "true"]);

    const [panel] = openingTags(html, 'role="tabpanel"');
    const panelId = attribute(panel!, "id");
    expect(panelId).toBeTruthy();
    expect(attribute(panel!, "tabindex")).toBe("0");
    expect(tabs.every((tag) => attribute(tag, "aria-controls") === panelId)).toBe(true);
    expect(html).toContain(`id="${attribute(panel!, "aria-labelledby")}">Logs</span>`);

    expect(html).toContain('<span aria-hidden="true" class="cc-resource-detail-tabs__lead"><svg data-lead="overview"></svg></span>');
    expect(html).toContain('<span class="cc-resource-detail-tabs__count">3</span>');
    expect(duplicateIds(html)).toEqual([]);
  });

  it("serves the scroll styling until the browser has measured the strip", () => {
    const html = renderToStaticMarkup(
      <ResourceDetailShell activeTabId="a" tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} />,
    );

    expect(html).toContain('data-overflow="scroll"');
    expect(html).not.toContain('data-overflow="menu"');
    expect(html).not.toContain('aria-haspopup="menu"');
    // The hidden measurement copies are neither tabs nor focusable.
    const [measure] = openingTags(html, 'class="cc-resource-detail-tabs__measure"');
    expect(attribute(measure!, "aria-hidden")).toBe("true");
    expect(openingTags(html, "data-cc-measure-tab").every((tag) => attribute(tag, "tabindex") === "-1")).toBe(true);
    expect(openingTags(html, 'role="tab"')).toHaveLength(2);
  });

  it("renders no measurement copies when the strip only scrolls", () => {
    const html = renderToStaticMarkup(
      <ResourceDetailShell activeTabId="a" tabs={[{ id: "a", label: "A" }]} tabsOverflow="scroll" />,
    );

    expect(html).not.toContain("cc-resource-detail-tabs__measure");
  });

  it("falls back to the first enabled tab and sub-tab, and labels the panel by both", () => {
    const html = renderToStaticMarkup(
      <ResourceDetailShell
        activeTabId="missing"
        tabs={[
          { disabled: true, id: "code", label: "Code" },
          {
            id: "ship",
            label: "Ship",
            subTabs: [
              { id: "releases", label: "Releases" },
              { id: "history", label: "Deploy History" },
            ],
          },
        ]}
      />,
    );

    const selected = openingTags(html, 'aria-selected="true"').map((tag) => attribute(tag, "data-cc-tab-id"));
    expect(selected).toEqual(["ship", "releases"]);
    const tablists = openingTags(html, 'role="tablist"').map((tag) => attribute(tag, "aria-label"));
    expect(tablists).toEqual(["Detail sections", "Ship sections"]);
    const [panel] = openingTags(html, 'role="tabpanel"');
    const labelIds = attribute(panel!, "aria-labelledby")!.split(" ");
    expect(labelIds).toHaveLength(2);
    expect(html).toContain(`id="${labelIds[0]}">Ship</span>`);
    expect(html).toContain(`id="${labelIds[1]}">Releases</span>`);
  });

  it("renders an aria-hidden lead before a breadcrumb label and says which crumb is current", () => {
    const seen: Array<[string, boolean, number]> = [];
    const html = renderToStaticMarkup(
      <ResourceDetailShell
        breadcrumbs={[
          { id: "agents", label: "Agents", onSelect: () => undefined },
          { id: "agent", label: "Pricing agent" },
        ]}
        renderBreadcrumbLead={({ crumb, current, index }) => {
          seen.push([crumb.id, current, index]);
          return current ? <svg data-lead={crumb.id} /> : null;
        }}
      />,
    );

    expect(seen).toEqual([["agents", false, 0], ["agent", true, 1]]);
    expect(html).toContain('<button class="cc-resource-breadcrumbs__crumb" type="button">Agents</button>');
    expect(html).toContain(
      '<span aria-current="page" class="cc-resource-breadcrumbs__crumb"><span aria-hidden="true" class="cc-resource-breadcrumbs__lead"><svg data-lead="agent"></svg></span>Pricing agent</span>',
    );
  });

  it("renders no tab list or panel without tabs", () => {
    const html = renderToStaticMarkup(<ResourceDetailShell><div>Body</div></ResourceDetailShell>);

    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tabpanel"');
    expect(html).toContain("Body");
  });
});

function openingTags(html: string, marker: string) {
  return (html.match(/<[a-z][^>]*>/gu) ?? []).filter((tag) => tag.includes(marker));
}

function attribute(tag: string, name: string) {
  const match = new RegExp(`\\s${name}="([^"]*)"`, "u").exec(tag);
  return match ? match[1]! : null;
}

function duplicateIds(html: string) {
  const ids = [...html.matchAll(/\sid="([^"]*)"/gu)].map((match) => match[1]);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

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
