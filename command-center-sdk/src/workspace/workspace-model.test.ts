import { describe, expect, it } from "vitest";

import {
  migrateWorkspaceWidgets,
  normalizeWorkspaceDocument,
  parseWorkspaceSnapshot,
  stringifyWorkspaceSnapshot,
} from "./index.js";

describe("workspace model", () => {
  it("preserves an unknown widget and forward metadata through snapshots", () => {
    const workspace = normalizeWorkspaceDocument({
      id: "workspace-1",
      title: "Workspace",
      description: "",
      source: "test",
      widgets: [{
        id: "unknown-1",
        widgetId: "acme__future",
        props: { query: "risk" },
        layout: { cols: 4, rows: 3 },
        pluginMetadata: { package: "@acme/future" },
      }],
    });
    const restored = parseWorkspaceSnapshot(stringifyWorkspaceSnapshot(workspace)).workspace;
    expect(restored.widgets[0]).toMatchObject({
      id: "unknown-1",
      widgetId: "acme__future",
      props: { query: "risk" },
      pluginMetadata: { package: "@acme/future" },
    });
  });

  it("defers missing runtimes and migrates available widget state independently", () => {
    const report = migrateWorkspaceWidgets({
      workspace: {
        id: "workspace-1",
        title: "Workspace",
        description: "",
        source: "test",
        widgets: [
          { id: "known", widgetId: "core__known", props: { count: 1 }, runtimeState: { open: false }, layout: { w: 2, h: 2 } },
          { id: "missing", widgetId: "acme__missing", props: { raw: true }, layout: { w: 2, h: 2 } },
        ],
      },
      resolveRuntime: (widgetId) => widgetId === "core__known" ? {
        widgetId,
        propsVersion: 2,
        userStateVersion: 2,
        widgetVersion: "2.0.0",
        propsMigrations: [{ from: 1, to: 2, migrate: (props) => ({ ...props, migrated: true }) }],
        userStateMigrations: [{ from: 1, to: 2, migrate: (state) => ({ ...state, migrated: true }) }],
      } : undefined,
    });

    expect(report.migratedWidgetIds).toEqual(["known"]);
    expect(report.deferredWidgetIds).toEqual(["missing"]);
    expect(report.failedWidgetIds).toEqual([]);
    expect(report.workspace.widgets[0]).toMatchObject({
      propsVersion: 2,
      userStateVersion: 2,
      authoredWithWidgetVersion: "2.0.0",
      props: { count: 1, migrated: true },
      runtimeState: { open: false, migrated: true },
    });
    expect(report.workspace.widgets[1]).toMatchObject({ props: { raw: true } });
  });

  it("migrates row children and preserves the original instance when a migration fails", () => {
    const failingChild = {
      id: "child",
      widgetId: "core__failing",
      props: { preserve: true },
      propsVersion: 1,
      runtimeState: { selected: "original" },
      userStateVersion: 1,
      layout: { w: 2, h: 2 },
    };
    const report = migrateWorkspaceWidgets({
      workspace: {
        id: "workspace-row",
        title: "Workspace",
        description: "",
        source: "test",
        widgets: [{
          id: "row",
          widgetId: "core__workspace-row",
          props: {},
          layout: { w: 4, h: 4 },
          row: { children: [failingChild] },
        }],
      },
      resolveRuntime: (widgetId) => widgetId === "core__failing" ? {
        widgetId,
        propsVersion: 2,
        userStateVersion: 2,
        propsMigrations: [{ from: 1, to: 2, migrate: () => { throw new Error("invalid props"); } }],
      } : undefined,
    });

    expect(report.failedWidgetIds).toEqual(["child"]);
    expect(report.deferredWidgetIds).toEqual(["row"]);
    expect(report.workspace.widgets[0]?.row?.children?.[0]).toEqual(failingChild);
  });
});
