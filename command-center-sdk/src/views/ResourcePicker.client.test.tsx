// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourcePicker } from "./ResourcePicker.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

describe("ResourcePicker", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
  });

  it("renders a left-aligned single picker with supporting option text", async () => {
    const onValueChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourcePicker
          mode="single"
          ariaLabel="Namespace"
          options={[
            { value: "all", label: "All namespaces", subtitle: "Across every source" },
            { value: "markets", label: "mainsequence.markets", subtitle: "61 tables" },
          ]}
          value="all"
          onValueChange={onValueChange}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="listbox"]',
    );
    expect(trigger?.textContent).toContain("All namespaces");

    await act(async () => trigger!.click());
    const listbox = document.body.querySelector('[role="listbox"]');
    expect(listbox?.parentElement?.parentElement).toBe(document.body);
    expect(listbox?.parentElement?.getAttribute("data-resource-picker-popup")).toBe("single");
    expect(listbox?.getAttribute("aria-label")).toBe("Namespace");
    const options = document.body.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(document.body.textContent).toContain("61 tables");

    await act(async () => options[1]!.click());
    expect(onValueChange).toHaveBeenCalledWith("markets");
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();

    container.remove();
  });

  it("keeps a multi picker open while values are toggled", async () => {
    const onValueChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourcePicker
          mode="multiple"
          ariaLabel="Visible columns"
          options={[
            { value: "name", label: "Name" },
            { value: "namespace", label: "Namespace" },
          ]}
          value={["name"]}
          onValueChange={onValueChange}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="listbox"]',
    );
    await act(async () => trigger!.click());
    const popup = document.body.querySelector('[role="listbox"]');
    expect(popup?.getAttribute("aria-multiselectable")).toBe("true");
    expect(popup?.parentElement?.getAttribute("data-resource-picker-popup")).toBe("multiple");

    const namespace = Array.from(
      popup!.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ).find((option) => option.textContent?.includes("Namespace"));
    await act(async () => namespace!.click());

    expect(onValueChange).toHaveBeenCalledWith(["name", "namespace"]);
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();

    container.remove();
  });

  it("opens and moves focus with the keyboard", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourcePicker
          mode="single"
          ariaLabel="Kind"
          options={[
            { value: "all", label: "All kinds" },
            { value: "time-indexed", label: "Time indexed" },
          ]}
          value="all"
          onValueChange={() => undefined}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="listbox"]',
    );
    await act(async () => {
      trigger!.focus();
      trigger!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    });

    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toContain("All kinds");

    container.remove();
  });
});
