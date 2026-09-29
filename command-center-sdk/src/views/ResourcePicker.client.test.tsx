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

  async function renderActionMenu(onAction: (value: string) => void = () => undefined) {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <ResourcePicker
          mode="action"
          ariaLabel="Row actions"
          options={[
            { value: "open", label: "Open" },
            { value: "archive", label: "Archive" },
          ]}
          triggerLabel="Actions"
          onAction={onAction}
        />,
      );
    });
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    return { container, trigger };
  }

  it("returns focus to the trigger once an action is chosen", async () => {
    const onAction = vi.fn();
    const { container, trigger } = await renderActionMenu(onAction);

    await act(async () => trigger.click());
    const archive = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent === "Archive")!;
    await act(async () => {
      archive.focus();
      archive.click();
    });

    expect(onAction).toHaveBeenCalledWith("archive");
    expect(document.body.querySelector("[data-resource-picker-popup]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    container.remove();
  });

  it("leaves focus where the chosen action moved it", async () => {
    const elsewhere = document.createElement("input");
    document.body.append(elsewhere);
    const { container, trigger } = await renderActionMenu(() => elsewhere.focus());

    await act(async () => trigger.click());
    await act(async () => document.body.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
    container.remove();
  });

  it("returns focus to the trigger once a value is chosen", async () => {
    const onValueChange = vi.fn();
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
          onValueChange={onValueChange}
        />,
      );
    });
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!;

    await act(async () => trigger.click());
    await act(async () => document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!.click());

    expect(onValueChange).toHaveBeenCalledWith("time-indexed");
    expect(document.activeElement).toBe(trigger);
    container.remove();
  });

  it("moves focus into the popup only once it is positioned and visible", async () => {
    const focus = HTMLElement.prototype.focus;
    const visibilityAtFocus: string[] = [];
    const spy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options) {
      const popup = this.closest<HTMLElement>("[data-resource-picker-popup]");
      if (popup) visibilityAtFocus.push(popup.style.visibility);
      focus.call(this, options);
    });
    const { container, trigger } = await renderActionMenu();

    await act(async () => trigger.click());

    expect(document.activeElement?.textContent).toBe("Open");
    expect(visibilityAtFocus).toEqual(["visible"]);
    spy.mockRestore();
    container.remove();
  });

  it("moves focus into an open popover on ArrowDown instead of hiding it", async () => {
    const { container, trigger } = await renderActionMenu();

    await act(async () => trigger.click());
    await act(async () => trigger.focus());
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" }));
    });

    const popup = document.body.querySelector<HTMLElement>("[data-resource-picker-popup]");
    expect(popup?.style.visibility).toBe("visible");
    expect(document.activeElement?.textContent).toBe("Archive");
    container.remove();
  });

  it("closes an open popover on Tab and returns focus to its trigger", async () => {
    const { container, trigger } = await renderActionMenu();

    await act(async () => trigger.click());
    const option = document.activeElement!;
    expect(option.getAttribute("role")).toBe("menuitem");
    const tab = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });
    await act(async () => option.dispatchEvent(tab));

    expect(tab.defaultPrevented).toBe(true);
    expect(document.body.querySelector("[data-resource-picker-popup]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    container.remove();
  });
});
