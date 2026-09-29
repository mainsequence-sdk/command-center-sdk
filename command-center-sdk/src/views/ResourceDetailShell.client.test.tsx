// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceDetailTabDefinition } from "../resource/types.js";
import { ResourceDetailShell, type ResourceDetailShellProps } from "./ResourceDetailShell.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const fiveTabs: ResourceDetailTabDefinition[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
  { disabled: true, id: "d", label: "Delta" },
  { id: "e", label: "Epsilon" },
];

function tabsIn(container: ParentNode, level: "primary" | "secondary" = "primary") {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(
    `.cc-resource-detail-tabs__viewport--${level} [role="tab"]`,
  ));
}

function tabById(container: ParentNode, id: string) {
  return container.querySelector<HTMLButtonElement>(`[role="tab"][data-cc-tab-id="${id}"]`);
}

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }));
}

function focusedTabId() {
  return (document.activeElement as HTMLElement | null)?.dataset.ccTabId;
}

describe("ResourceDetailShell controlled tabs", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];
  const restores: Array<() => void> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    restores.splice(0).reverse().forEach((restore) => restore());
    document.body.innerHTML = "";
  });

  async function mount(props: ResourceDetailShellProps, parent: HTMLElement = document.body) {
    const container = document.createElement("div");
    parent.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => root.render(<ResourceDetailShell {...props}>Detail content</ResourceDetailShell>));
    return {
      container,
      rerender: (next: ResourceDetailShellProps) =>
        act(async () => root.render(<ResourceDetailShell {...next}>Detail content</ResourceDetailShell>)),
    };
  }

  function stubStripGeometry({ available, moreWidth, tabWidth }: { available: number; moreWidth: number; tabWidth: number }) {
    const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const getRect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("cc-resource-detail-tabs__viewport") ? available : 0;
      },
    });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
      const width = this.dataset.ccMeasureTab !== undefined
        ? tabWidth
        : this.hasAttribute("data-cc-measure-more") ? moreWidth : 0;
      return { bottom: 0, height: 0, left: 0, right: width, top: 0, width, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    const observer = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
    restores.push(() => {
      if (clientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
      HTMLElement.prototype.getBoundingClientRect = getRect;
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = observer;
    });
  }

  function useCoarsePointer() {
    const matchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        addEventListener: () => undefined,
        matches: query === "(pointer: coarse)",
        media: query,
        removeEventListener: () => undefined,
      })),
    });
    restores.push(() => Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia }));
  }

  it("reports primary and nested secondary selections without owning route state", async () => {
    const onTabChange = vi.fn();
    const onSubTabChange = vi.fn();
    const { container } = await mount({
      activeSubTabId: "releases",
      activeTabId: "ship",
      onSubTabChange,
      onTabChange,
      tabs: [
        { id: "code", label: "Code" },
        {
          id: "ship",
          label: "Ship",
          subTabs: [
            { id: "releases", label: "Releases" },
            { id: "history", label: "Deploy History" },
          ],
        },
      ],
    });

    await act(async () => tabById(container, "code")!.click());
    await act(async () => tabById(container, "history")!.click());

    expect(onTabChange).toHaveBeenCalledWith("code");
    expect(onSubTabChange).toHaveBeenCalledWith("history");
  });

  it("moves focus with the arrow keys, Home, and End without selecting", async () => {
    const onTabChange = vi.fn();
    const { container } = await mount({ activeTabId: "b", onTabChange, tabs: fiveTabs });
    const tabs = tabsIn(container);

    expect(tabs.filter((tab) => tab.tabIndex === 0).map((tab) => tab.dataset.ccTabId)).toEqual(["b"]);

    await act(async () => tabById(container, "b")!.focus());
    await act(async () => press(document.activeElement!, "ArrowRight"));
    expect(focusedTabId()).toBe("c");
    // A disabled tab stays in the arrow order.
    await act(async () => press(document.activeElement!, "ArrowRight"));
    expect(focusedTabId()).toBe("d");
    await act(async () => press(document.activeElement!, "End"));
    expect(focusedTabId()).toBe("e");
    await act(async () => press(document.activeElement!, "ArrowRight"));
    expect(focusedTabId()).toBe("a");
    await act(async () => press(document.activeElement!, "ArrowLeft"));
    expect(focusedTabId()).toBe("e");
    await act(async () => press(document.activeElement!, "Home"));
    expect(focusedTabId()).toBe("a");

    expect(onTabChange).not.toHaveBeenCalled();
    // The tab stop stays on the selected tab while focus roves.
    expect(tabById(container, "b")!.tabIndex).toBe(0);
  });

  it("leaves modified arrows to the browser and prevents the default of handled keys", async () => {
    const { container } = await mount({ activeTabId: "a", tabs: fiveTabs });
    await act(async () => tabById(container, "a")!.focus());

    const withAlt = new KeyboardEvent("keydown", { altKey: true, bubbles: true, cancelable: true, key: "ArrowRight" });
    await act(async () => document.activeElement!.dispatchEvent(withAlt));
    expect(focusedTabId()).toBe("a");
    expect(withAlt.defaultPrevented).toBe(false);

    const plain = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" });
    await act(async () => document.activeElement!.dispatchEvent(plain));
    expect(focusedTabId()).toBe("b");
    expect(plain.defaultPrevented).toBe(true);
  });

  it("reverses the arrow keys in a right-to-left layout", async () => {
    const rtl = document.createElement("div");
    rtl.setAttribute("dir", "rtl");
    document.body.append(rtl);
    const { container } = await mount({ activeTabId: "b", tabs: fiveTabs }, rtl);

    await act(async () => tabById(container, "b")!.focus());
    await act(async () => press(document.activeElement!, "ArrowRight"));
    expect(focusedTabId()).toBe("a");
    await act(async () => press(document.activeElement!, "ArrowLeft"));
    expect(focusedTabId()).toBe("b");
  });

  it("keeps a disabled tab focusable but never selects it", async () => {
    const onTabChange = vi.fn();
    const { container } = await mount({ activeTabId: "a", onTabChange, tabs: fiveTabs });
    const disabled = tabById(container, "d")!;

    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    expect(disabled.disabled).toBe(false);
    await act(async () => disabled.click());
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("links the live tabs and panel", async () => {
    const { container } = await mount({ activeTabId: "c", tabs: fiveTabs, tabsLabel: "Service sections" });
    const panel = container.querySelector<HTMLElement>('[role="tabpanel"]')!;

    expect(container.querySelector('[role="tablist"]')!.getAttribute("aria-label")).toBe("Service sections");
    expect(tabsIn(container).every((tab) => tab.getAttribute("aria-controls") === panel.id)).toBe(true);
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)?.textContent).toBe("Gamma");
    expect(panel.textContent).toBe("Detail content");
  });

  it("roves the secondary strip on its own", async () => {
    const onSubTabChange = vi.fn();
    const { container } = await mount({
      activeSubTabId: "history",
      activeTabId: "ship",
      onSubTabChange,
      tabs: [
        { id: "code", label: "Code" },
        {
          id: "ship",
          label: "Ship",
          subTabs: [
            { id: "releases", label: "Releases" },
            { id: "history", label: "Deploy History" },
            { id: "images", label: "Images" },
          ],
        },
      ],
    });

    expect(tabsIn(container, "secondary").map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    await act(async () => tabById(container, "history")!.focus());
    await act(async () => press(document.activeElement!, "ArrowRight"));
    expect(focusedTabId()).toBe("images");
    await act(async () => press(document.activeElement!, "ArrowRight"));
    expect(focusedTabId()).toBe("releases");
    expect(tabById(container, "ship")!.tabIndex).toBe(0);
    expect(onSubTabChange).not.toHaveBeenCalled();
  });

  it("moves tabs that do not fit into a More menu and focuses the tab picked from it", async () => {
    stubStripGeometry({ available: 300, moreWidth: 60, tabWidth: 100 });
    const onTabChange = vi.fn();
    const { container, rerender } = await mount({ activeTabId: "a", onTabChange, tabs: fiveTabs });

    expect(container.querySelector('[role="tablist"]')!.getAttribute("data-overflow")).toBe("menu");
    expect(tabsIn(container).map((tab) => tab.dataset.ccTabId)).toEqual(["a", "b"]);
    const more = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    expect(more.textContent).toContain("More");
    expect(more.getAttribute("aria-label")).toBe("More detail sections, 3 hidden");
    expect(more.closest('[role="tablist"]')).toBeNull();

    await act(async () => more.click());
    const items = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items.map((item) => item.textContent)).toEqual(["Gamma", "Delta", "Epsilon"]);
    expect(items[1]!.disabled).toBe(true);

    await act(async () => items[2]!.click());
    expect(onTabChange).toHaveBeenCalledWith("e");
    expect(document.activeElement).toBe(more);

    await rerender({ activeTabId: "e", onTabChange, tabs: fiveTabs });
    expect(tabsIn(container).map((tab) => tab.dataset.ccTabId)).toEqual(["a", "e"]);
    expect(focusedTabId()).toBe("e");
    expect(tabById(container, "e")!.tabIndex).toBe(0);
    const panel = container.querySelector<HTMLElement>('[role="tabpanel"]')!;
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)?.textContent).toBe("Epsilon");
  });

  it("does not take focus back when the host selects a different tab", async () => {
    stubStripGeometry({ available: 300, moreWidth: 60, tabWidth: 100 });
    const { container, rerender } = await mount({ activeTabId: "a", tabs: fiveTabs });

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click());
    await act(async () => document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[2]!.click());
    await rerender({ activeTabId: "c", tabs: fiveTabs });
    await rerender({ activeTabId: "e", tabs: fiveTabs });

    expect(focusedTabId()).toBeUndefined();
  });

  it("scrolls instead of using a menu with a coarse pointer or when asked to", async () => {
    stubStripGeometry({ available: 300, moreWidth: 60, tabWidth: 100 });
    useCoarsePointer();
    const coarse = await mount({ activeTabId: "a", tabs: fiveTabs });

    expect(coarse.container.querySelector('[role="tablist"]')!.getAttribute("data-overflow")).toBe("scroll");
    expect(tabsIn(coarse.container)).toHaveLength(5);
    expect(coarse.container.querySelector('button[aria-haspopup="menu"]')).toBeNull();
    expect(coarse.container.querySelector(".cc-resource-detail-tabs__measure")).toBeNull();

    const forced = await mount({ activeTabId: "a", tabs: fiveTabs, tabsOverflow: "menu" });
    expect(forced.container.querySelector('[role="tablist"]')!.getAttribute("data-overflow")).toBe("menu");
  });

  it("survives switching between loading and loaded", async () => {
    const { container, rerender } = await mount({ activeTabId: "a", tabs: fiveTabs });

    await rerender({ activeTabId: "a", loading: true, tabs: fiveTabs });
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    await rerender({ activeTabId: "b", tabs: fiveTabs });
    expect(tabById(container, "b")!.getAttribute("aria-selected")).toBe("true");
  });
});
