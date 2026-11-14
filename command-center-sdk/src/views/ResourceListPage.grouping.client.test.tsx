// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourceListPage, type DataTablePresentation, type DataTableRowGrouping } from "./index.js";
import type { ResourceApplicationDefinition, ResourceBulkActionDefinition } from "../resource/types.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
type Row = { uid: string; name: string; organization: string };
const items: Row[] = [
  { uid: "a", name: "Alpha", organization: "Organization A" },
  { uid: "b", name: "Beta", organization: "Organization B" },
];
const grouping: DataTableRowGrouping<Row> = {
  getGroupId: (row) => row.organization,
  renderGroupLabel: (id, rows) => `${id} (${rows.length})`,
};
const action: ResourceBulkActionDefinition = {
  id: "review", label: "Review", endpoint: "/rows/review/", method: "POST",
  selection_modes: ["explicit", "all_matching"], options: [],
  preflight_endpoint: "/rows/review/preflight/",
  confirmation: { title: "Review rows", button_label: "Review" },
};
const page = { items, pageInfo: { pageIndex: 0, pageSize: 2, totalItems: 12, hasNextPage: true, hasPreviousPage: false } };
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = "";
});
function button(text: string) {
  const found = [...document.body.querySelectorAll('button')].find((node) => node.textContent === text);
  expect(found, text).toBeDefined();
  return found!;
}

describe.each<DataTablePresentation>(["table", "stacked"])("grouped %s resource list", (presentation) => {
  it.each([false, true])("preserves collapsed rows through select-all, preflight and execution (all matching: %s)", async (allMatching) => {
    const executeBulkAction = vi.fn().mockResolvedValue([]);
    const preflightBulkAction = vi.fn().mockResolvedValue({ allowed: true, impacts: [], items: [], matchedCount: allMatching ? 12 : 2, raw: {} });
    const definition: ResourceApplicationDefinition<Row, string> = {
      id: "rows", label: "Rows", itemLabel: "rows", getId: (row) => row.uid,
      columns: [{ id: "name", header: "Name", getValue: (row) => row.name }],
      adapter: { list: vi.fn().mockResolvedValue(page), listBulkActions: vi.fn().mockResolvedValue([action]), preflightBulkAction, executeBulkAction },
    };
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); roots.push(root);
    await act(async () => root.render(
      <ResourceListPage definition={definition} initialResult={page} pageSize={2}
        tablePresentation={presentation} rowGrouping={grouping}
        renderBulkActionConfirmation={(input) => <div>
          <span data-selected-items>{input.selectedItems.map((row) => row.uid).join(",")}</span>
          <button disabled={!input.canConfirm} onClick={() => void input.onConfirm()}>Confirm test operation</button>
        </div>}
      />,
    ));
    await act(async () => button("Organization A (1)").click());
    expect(button("Organization A (1)").getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll('[data-cc-data-table-row]')).toHaveLength(1);
    const selectAll = container.querySelector<HTMLInputElement>('input[aria-label="Select all rows on this page"]')!;
    await act(async () => selectAll.click());
    expect(container.textContent).toContain("2 selected on this page.");
    // Reopening proves the SDK selected a row whose checkbox was not mounted.
    await act(async () => button("Organization A (1)").click());
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every((input) => input.checked)).toBe(true);
    await act(async () => button("Organization A (1)").click());
    if (allMatching) await act(async () => button("Select all 12 matching rows").click());
    await act(async () => button("Actions").click());
    await act(async () => button("Review").click());
    const selection = allMatching ? { mode: "all_matching", query: { search: "", filters: {} } }
      : { mode: "explicit", uids: ["a", "b"] };
    expect(preflightBulkAction).toHaveBeenCalledWith(action, expect.objectContaining({ selection }));
    if (!allMatching) expect(container.querySelector('[data-selected-items]')?.textContent).toBe("a,b");
    await act(async () => button("Confirm test operation").click());
    expect(executeBulkAction).toHaveBeenCalledWith(action, expect.objectContaining({ selection }));
    expect(container.textContent).not.toContain("selected on this page");
  });
});
