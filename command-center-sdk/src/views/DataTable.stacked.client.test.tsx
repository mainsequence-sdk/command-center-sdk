// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataTable, resolveDataTablePresentation } from "./DataTable.js";
import { ResourcePagination } from "./ResourcePagination.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

type Row = { name: string; owner: string; region: string; uid: string };

const rows: Row[] = [
  { name: "Alpha", owner: "Ada", region: "eu-west", uid: "a-1" },
  { name: "Beta", owner: "Bob", region: "us-east", uid: "b-2" },
];

const columns = [
  { id: "name", header: "Name", getValue: (row: Row) => row.name, importance: "primary" as const, sortableKey: "name" },
  { id: "owner", header: "Owner", getValue: (row: Row) => row.owner },
  { id: "uid", header: "UID", getValue: (row: Row) => row.uid, importance: "tertiary" as const },
  { id: "region", header: "Region", getValue: (row: Row) => row.region, importance: "tertiary" as const },
];

describe("DataTable presentations", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
  });

  it("resolves auto to stacked only below the sm breakpoint", () => {
    const base = { coarsePointer: false, hoverCapable: true, reducedMotion: false };
    expect(resolveDataTablePresentation("auto", { ...base, breakpoint: "xs" })).toBe("stacked");
    expect(resolveDataTablePresentation("auto", { ...base, breakpoint: "sm" })).toBe("table");
    expect(resolveDataTablePresentation("table", { ...base, breakpoint: "xs" })).toBe("table");
    expect(resolveDataTablePresentation("stacked", { ...base, breakpoint: "lg" })).toBe("stacked");
  });

  it("renders the table form by default with importance on every cell", () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} getId={(row) => row.uid} items={rows} />,
    );
    expect(html).toContain('data-cc-presentation="table"');
    expect(html).toContain('<th aria-sort="none" data-cc-column-importance="primary" scope="col">');
    expect(html).toContain('data-cc-column-importance="secondary"');
    expect(html).toContain('data-cc-column-importance="tertiary"');
    expect(html).not.toContain("cc-data-table--stacked");
  });

  it("renders stacked rows from the same columns with title, pairs, and a disclosure", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        getId={(row) => row.uid}
        items={rows}
        presentation="stacked"
        rowActions={[{ id: "open", label: "Open", onSelect: () => undefined }]}
      />,
    );
    expect(html).toContain('data-cc-presentation="stacked"');
    expect(html).toContain('class="cc-data-table__stacked-title" data-cc-column-importance="primary">Alpha<');
    expect(html).toContain("<dt>Owner</dt><dd>Ada</dd>");
    expect(html).toContain("<summary>More details</summary>");
    expect(html).toContain("<dt>Region</dt><dd>eu-west</dd>");
    expect(html).toContain('aria-label="Actions"');
    expect(html).not.toContain("<table");
  });

  it("keeps selection and activation working in the stacked form", async () => {
    const onActivateRow = vi.fn();
    const onToggleSelection = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <DataTable
          allSelected={false}
          columns={columns}
          getId={(row) => row.uid}
          isSelected={() => false}
          items={rows}
          presentation="stacked"
          onActivateRow={onActivateRow}
          onToggleAll={() => undefined}
          onToggleSelection={onToggleSelection}
        />,
      );
    });

    const firstRow = container.querySelector<HTMLElement>("[data-cc-data-table-row]")!;
    const checkbox = firstRow.querySelector<HTMLInputElement>("input[type='checkbox']")!;
    await act(async () => checkbox.click());
    expect(onToggleSelection).toHaveBeenCalledWith("a-1");
    expect(onActivateRow).not.toHaveBeenCalled();

    await act(async () => firstRow.click());
    expect(onActivateRow).toHaveBeenCalledWith(rows[0]);

    firstRow.focus();
    await act(async () => {
      firstRow.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    expect(onActivateRow).toHaveBeenCalledTimes(2);
  });

  it("collapses table-form row actions into a menu when there are more than two", () => {
    const actions = ["a", "b", "c"].map((id) => ({ id, label: id.toUpperCase(), onSelect: () => undefined }));
    const inline = renderToStaticMarkup(
      <DataTable columns={columns} getId={(row) => row.uid} items={rows} rowActions={actions.slice(0, 2)} />,
    );
    const menu = renderToStaticMarkup(
      <DataTable columns={columns} getId={(row) => row.uid} items={rows} rowActions={actions} />,
    );
    expect(inline).not.toContain('aria-haspopup="menu"');
    expect(menu).toContain('aria-haspopup="menu"');
  });

  it("renders compact pagination as previous, page summary, and next", () => {
    const html = renderToStaticMarkup(
      <ResourcePagination
        count={120}
        itemLabel="services"
        pageIndex={2}
        pageSize={10}
        presentation="compact"
        onPageChange={() => undefined}
      />,
    );
    expect(html).toContain('data-cc-presentation="compact"');
    expect(html).toContain("Page 3 of 12");
    expect(html).toContain("21-30 of 120 services");
    expect(html).not.toContain(">4<");
  });
});
