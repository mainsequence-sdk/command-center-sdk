// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useResourceBulkSelection } from "./use-resource-bulk-selection.js";
import { useResourceSelection } from "./use-resource-selection.js";

type Row = { uid: string };

describe("resource selection hooks", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
  });

  it("drops explicit UIDs that are not on the loaded page", () => {
    let selection: ReturnType<typeof useResourceSelection<Row, string>> | null = null;
    function Harness({ items }: { items: Row[] }) {
      selection = useResourceSelection(items, (row) => row.uid);
      return null;
    }

    const root = createRoot(document.createElement("div"));
    roots.push(root);
    act(() => root.render(<Harness items={[{ uid: "one" }, { uid: "two" }]} />));
    act(() => selection!.setSelection(["one", "two"]));
    expect(selection!.selectedIds).toEqual(["one", "two"]);

    act(() => root.render(<Harness items={[{ uid: "three" }]} />));
    expect(selection!.selectedIds).toEqual([]);
  });

  it("represents all matching rows as query state instead of materialized UIDs", () => {
    let selection: ReturnType<typeof useResourceBulkSelection<string>> | null = null;
    function Harness() {
      selection = useResourceBulkSelection<string>();
      return null;
    }

    const root = createRoot(document.createElement("div"));
    roots.push(root);
    act(() => root.render(<Harness />));
    act(() => selection!.selectAllMatching({
      search: "active",
      filters: { namespace: "market-data" },
    }));

    expect(selection!.selection).toEqual({
      mode: "all_matching",
      query: {
        search: "active",
        filters: { namespace: "market-data" },
      },
    });
    expect(selection!.explicitIds).toEqual([]);
  });
});
