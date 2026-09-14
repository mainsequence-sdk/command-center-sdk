// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceApplicationDefinition, ResourceListRequest } from "../resource/types.js";
import { ResourceListPage } from "./ResourceListPage.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

type Service = { name: string; owner: string; uid: string };

const items: Service[] = [
  { name: "Pricing", owner: "Ada", uid: "s-1" },
  { name: "Risk", owner: "Bob", uid: "s-2" },
];

function createDefinition(list: ReturnType<typeof vi.fn>) {
  return {
    id: "services",
    label: "Services",
    getId: (service: Service) => service.uid,
    adapter: { list },
    columns: [
      { id: "name", header: "Name", getValue: (service: Service) => service.name, importance: "primary", sortableKey: "name" },
      { id: "owner", header: "Owner", getValue: (service: Service) => service.owner, sortableKey: "owner" },
    ],
    actions: [],
  } satisfies ResourceApplicationDefinition<Service, string>;
}

describe("ResourceListPage stacked presentation", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
  });

  it("stacks rows, offers sort through a picker, and folds host filters into a disclosure only when narrow", async () => {
    const list = vi.fn(async (request: ResourceListRequest) => ({
      items: request.sort?.[0]?.direction === "descending" ? [...items].reverse() : items,
      pageInfo: { pageIndex: 0, pageSize: 25, totalItems: 2, hasNextPage: false, hasPreviousPage: false },
    }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage
          definition={createDefinition(list)}
          filterDefinitions={[
            { id: "owner", label: "Owner", value: "", options: [{ label: "Ada", value: "ada" }], onChange: () => undefined },
          ]}
          tablePresentation="stacked"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector("[data-cc-presentation='stacked']")).toBeTruthy();
    expect(container.querySelectorAll("[data-cc-data-table-row]")).toHaveLength(2);
    expect(container.querySelector(".cc-data-table__stacked-title")?.textContent).toBe("Pricing");
    // Desktop default viewport in jsdom: host filters stay inline, not behind a disclosure.
    expect(container.querySelector("[data-cc-resource-filters]")).toBeNull();

    const sortTrigger = container.querySelector<HTMLButtonElement>("button[aria-label='Sort']")!;
    expect(sortTrigger).toBeTruthy();
    await act(async () => sortTrigger.click());
    const descending = Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='option']"))
      .find((option) => option.textContent?.includes("Name ↓"))!;
    await act(async () => descending.click());
    await act(async () => {
      await Promise.resolve();
    });

    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: [{ key: "name", direction: "descending" }] }),
    );
    expect(container.querySelector(".cc-data-table__stacked-title")?.textContent).toBe("Risk");
  });
});
