// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceBulkActionPicker } from "./ResourceBulkActionPicker.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

describe("ResourceBulkActionPicker", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
  });

  it("keeps discovered actions inside the shared picker", async () => {
    const onDelete = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceBulkActionPicker
          actions={[{
            id: "delete",
            label: "Delete projects",
            tone: "danger",
            onSelect: onDelete,
          }]}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]',
    );
    expect(trigger?.textContent).toContain("Actions");
    expect(container.textContent).not.toContain("Delete projects");

    await act(async () => trigger!.click());
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu?.parentElement?.parentElement).toBe(document.body);
    expect(menu?.parentElement?.getAttribute("data-resource-picker-popup")).toBe("action");
    const action = menu?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    expect(action?.textContent).toBe("Delete projects");

    await act(async () => action!.click());
    expect(onDelete).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
