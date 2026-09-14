import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isResourceColumnVisibleAt,
  resolveResourceColumnImportance,
  selectResourceColumnsAt,
} from "./column-presentation.js";
import { parseResourceDiscovery, resolveResourceDiscoveryColumns } from "./discovery.js";
import type { ResourceColumnDefinition } from "./types.js";

type Row = { name: string; owner: string; region: string; uid: string };

const columns: ResourceColumnDefinition<Row>[] = [
  { id: "uid", header: "UID", getValue: (row) => row.uid, importance: "tertiary" },
  { id: "name", header: "Name", getValue: (row) => row.name, importance: "primary" },
  { id: "owner", header: "Owner", getValue: (row) => row.owner },
  { id: "region", header: "Region", getValue: (row) => row.region, hideBelow: "lg" },
];

describe("resource column importance", () => {
  it("keeps the declared primary and defaults undeclared columns to secondary", () => {
    expect(resolveResourceColumnImportance(columns).map((column) => column.importance)).toEqual([
      "tertiary",
      "primary",
      "secondary",
      "secondary",
    ]);
  });

  it("promotes the first column when nothing declares primary", () => {
    const resolved = resolveResourceColumnImportance(columns.map(({ importance, ...rest }) => rest));
    expect(resolved.map((column) => column.importance)).toEqual([
      "primary",
      "secondary",
      "secondary",
      "secondary",
    ]);
  });

  it("demotes every primary after the first declared one", () => {
    const resolved = resolveResourceColumnImportance([
      { id: "a", header: "A", importance: "primary" },
      { id: "b", header: "B", importance: "primary" },
    ]);
    expect(resolved.map((column) => column.importance)).toEqual(["primary", "secondary"]);
  });

  it("shows columns by importance band and honors the host override", () => {
    expect(isResourceColumnVisibleAt({ importance: "primary" }, "xs")).toBe(true);
    expect(isResourceColumnVisibleAt({ importance: "secondary" }, "xs")).toBe(false);
    expect(isResourceColumnVisibleAt({ importance: "secondary" }, "sm")).toBe(true);
    expect(isResourceColumnVisibleAt({ importance: "tertiary" }, "sm")).toBe(false);
    expect(isResourceColumnVisibleAt({ importance: "tertiary" }, "md")).toBe(true);
    expect(isResourceColumnVisibleAt({ hideBelow: "lg", importance: "primary" }, "md")).toBe(false);
    expect(selectResourceColumnsAt(columns, "xs").map((column) => column.id)).toEqual(["name"]);
    expect(selectResourceColumnsAt(columns, "sm").map((column) => column.id)).toEqual(["name", "owner"]);
    expect(selectResourceColumnsAt(columns, "md").map((column) => column.id)).toEqual(["uid", "name", "owner"]);
    expect(selectResourceColumnsAt(columns, "lg").map((column) => column.id)).toEqual(["uid", "name", "owner", "region"]);
  });

  it("carries discovery importance through column resolution and lets it win over local values", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("../../contracts/fixtures/valid/resource-discovery-v1.records.json", import.meta.url), "utf8"),
    );
    const discovery = parseResourceDiscovery(fixture);
    const resolved = resolveResourceDiscoveryColumns<Row>(
      { ...discovery, list: { ...discovery.list, columns: discovery.list.columns.map((column) => ({ ...column, default_visible: true })) } },
      [{ id: "name", header: "Local", getValue: (row) => row.name, importance: "secondary" }],
    );
    expect(resolved.map((column) => [column.id, column.importance])).toEqual([
      ["name", "primary"],
      ["uid", "tertiary"],
    ]);
  });
});
