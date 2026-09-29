import { describe, expect, it } from "vitest";

import { resolveResourceDetailTabs } from "./detail-tabs.js";
import type { ResourceDetailTabDefinition } from "./types.js";

interface Service {
  editable: boolean;
  logsUrl: string | null;
}

const tabs: ResourceDetailTabDefinition<Service>[] = [
  { id: "overview", label: "Overview" },
  { id: "logs", label: "Logs", isVisible: (service) => Boolean(service.logsUrl) },
  { id: "settings", label: "Settings", disabled: (service) => !service.editable },
  {
    id: "releases",
    label: "Releases",
    subTabs: [
      { id: "current", label: "Current" },
      { id: "history", label: "History" },
      { id: "archive", label: "Archive", disabled: true },
    ],
  },
];

const withoutLogs: Service = { editable: false, logsUrl: null };
const withLogs: Service = { editable: true, logsUrl: "https://example.test/logs" };

describe("resolveResourceDetailTabs", () => {
  it("keeps a deep-linked tab while the resource is still loading", () => {
    for (const resource of [undefined, null]) {
      const resolved = resolveResourceDetailTabs(tabs, { activeTabId: "logs", resource });

      expect(resolved.tabs.map((tab) => tab.id)).toEqual(["overview", "logs", "settings", "releases"]);
      expect(resolved.activeTab?.id).toBe("logs");
      expect(resolved.fallback).toBe(false);
    }
  });

  it("hides tabs the loaded resource rejects and falls back to the first enabled tab", () => {
    const resolved = resolveResourceDetailTabs(tabs, { activeTabId: "logs", resource: withoutLogs });

    expect(resolved.tabs.map((tab) => tab.id)).toEqual(["overview", "settings", "releases"]);
    expect(resolved.activeTab?.id).toBe("overview");
    expect(resolved.fallback).toBe(true);
  });

  it("keeps a disabled tab visible but never activates it", () => {
    const resolved = resolveResourceDetailTabs(tabs, { activeTabId: "settings", resource: withoutLogs });

    expect(resolved.tabs.find((tab) => tab.id === "settings")?.disabled).toBe(true);
    expect(resolved.activeTab?.id).toBe("overview");
    expect(resolved.fallback).toBe(true);
  });

  it("runs a function-valued disabled only with a loaded resource", () => {
    expect(resolveResourceDetailTabs(tabs, { activeTabId: "settings" }).activeTab?.id).toBe("settings");
    expect(resolveResourceDetailTabs(tabs, { activeTabId: "settings", resource: withLogs }).activeTab?.id)
      .toBe("settings");
    expect(resolveResourceDetailTabs(tabs).tabs.every((tab) => typeof tab.disabled === "boolean")).toBe(true);
  });

  it("selects the requested sub-tab or the first enabled one", () => {
    const first = resolveResourceDetailTabs(tabs, { activeTabId: "releases" });
    expect(first.subTabs.map((subTab) => subTab.id)).toEqual(["current", "history", "archive"]);
    expect(first.activeSubTab?.id).toBe("current");
    expect(first.fallback).toBe(false);

    expect(resolveResourceDetailTabs(tabs, { activeSubTabId: "history", activeTabId: "releases" }).activeSubTab?.id)
      .toBe("history");

    for (const activeSubTabId of ["missing", "archive"]) {
      const resolved = resolveResourceDetailTabs(tabs, { activeSubTabId, activeTabId: "releases" });
      expect(resolved.activeSubTab?.id).toBe("current");
      expect(resolved.fallback).toBe(true);
    }
  });

  it("ignores a sub-tab request when the active tab has no sub-tabs", () => {
    const resolved = resolveResourceDetailTabs(tabs, { activeSubTabId: "history", activeTabId: "overview" });

    expect(resolved.subTabs).toEqual([]);
    expect(resolved.activeSubTab).toBeUndefined();
    expect(resolved.fallback).toBe(false);
  });

  it("does not report a fallback when nothing was requested", () => {
    for (const activeTabId of [undefined, null, ""]) {
      const resolved = resolveResourceDetailTabs(tabs, { activeTabId });
      expect(resolved.activeTab?.id).toBe("overview");
      expect(resolved.fallback).toBe(false);
    }
  });

  it("gives the same selection when its own result is resolved again", () => {
    const once = resolveResourceDetailTabs(tabs, {
      activeSubTabId: "history",
      activeTabId: "releases",
      resource: withoutLogs,
    });
    const twice = resolveResourceDetailTabs(once.tabs, {
      activeSubTabId: once.activeSubTab?.id,
      activeTabId: once.activeTab?.id,
    });

    expect(twice.tabs).toEqual(once.tabs);
    expect(twice.activeTab?.id).toBe(once.activeTab?.id);
    expect(twice.activeSubTab?.id).toBe(once.activeSubTab?.id);
    expect(twice.fallback).toBe(false);
  });

  it("activates nothing when every tab is disabled or there are no tabs", () => {
    const allDisabled = resolveResourceDetailTabs([{ disabled: true, id: "only", label: "Only" }], {
      activeTabId: "only",
    });
    expect(allDisabled.tabs).toHaveLength(1);
    expect(allDisabled.activeTab).toBeUndefined();
    expect(allDisabled.fallback).toBe(true);

    const empty = resolveResourceDetailTabs(undefined, { activeTabId: "anything" });
    expect(empty.tabs).toEqual([]);
    expect(empty.activeTab).toBeUndefined();
  });

  it("does not mutate the definitions it resolves", () => {
    const definitions: ResourceDetailTabDefinition<Service>[] = [
      { id: "settings", label: "Settings", disabled: (service) => !service.editable },
    ];
    resolveResourceDetailTabs(definitions, { resource: withoutLogs });

    expect(typeof definitions[0]!.disabled).toBe("function");
  });
});
