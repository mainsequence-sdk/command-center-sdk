// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourcePicker } from "./ResourcePicker.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const options = [
  { value: "eu", label: "Europe" },
  { value: "us", label: "United States" },
];

describe("ResourcePicker sheet presentation", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
  });

  it("opens a bottom sheet dialog with a scrim, locks scroll, and closes on Escape or scrim tap", async () => {
    const onValueChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourcePicker
          ariaLabel="Region"
          options={options}
          presentation="sheet"
          value={null}
          onValueChange={onValueChange}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>("button[aria-label='Region']")!;
    await act(async () => trigger.click());

    const popup = document.body.querySelector<HTMLElement>("[data-resource-picker-popup]")!;
    expect(popup.getAttribute("data-cc-presentation")).toBe("sheet");
    expect(popup.getAttribute("role")).toBe("dialog");
    expect(popup.getAttribute("aria-modal")).toBe("true");
    expect(popup.style.position).toBe("fixed");
    expect(popup.style.left).toBe("0px");
    expect(popup.style.right).toBe("0px");
    expect(document.body.querySelector("[data-cc-resource-picker-scrim]")).toBeTruthy();
    expect(document.body.style.position).toBe("fixed");
    expect(popup.contains(document.activeElement)).toBe(true);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(document.body.querySelector("[data-resource-picker-popup]")).toBeNull();
    expect(document.body.style.position).toBe("");
    expect(document.activeElement).toBe(trigger);

    await act(async () => trigger.click());
    await act(async () => {
      document.body.querySelector<HTMLElement>("[data-cc-resource-picker-scrim]")!.click();
    });
    expect(document.body.querySelector("[data-resource-picker-popup]")).toBeNull();

    await act(async () => trigger.click());
    const option = document.body.querySelector<HTMLButtonElement>("[role='option']")!;
    await act(async () => option.click());
    expect(onValueChange).toHaveBeenCalledWith("eu");
    expect(document.body.querySelector("[data-resource-picker-popup]")).toBeNull();
  });

  it("keeps the popover presentation by default", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourcePicker ariaLabel="Region" options={options} value={null} onValueChange={() => undefined} />,
      );
    });
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    const popup = document.body.querySelector<HTMLElement>("[data-resource-picker-popup]")!;
    expect(popup.getAttribute("data-cc-presentation")).toBe("popover");
    expect(popup.getAttribute("role")).toBeNull();
    expect(document.body.querySelector("[data-cc-resource-picker-scrim]")).toBeNull();
    expect(document.body.style.position).toBe("");
  });
});
