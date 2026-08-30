// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationStatusScreen } from "./index.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

describe("ApplicationStatusScreen client behavior", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];
  const containers: HTMLElement[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    containers.splice(0).forEach((container) => container.remove());
  });

  it("delivers the controlled recovery action without owning retry policy", async () => {
    const retry = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ApplicationStatusScreen
          action={{ label: "Retry startup", onSelect: retry }}
          message="Runtime unavailable."
          state="error"
          title="Could not start"
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toBe("Retry startup");
    await act(async () => button!.click());
    expect(retry).toHaveBeenCalledOnce();
  });
});
