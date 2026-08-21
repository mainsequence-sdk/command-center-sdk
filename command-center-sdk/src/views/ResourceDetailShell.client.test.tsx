// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceDetailShell } from "./ResourceDetailShell.js";

describe("ResourceDetailShell controlled tabs", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
  });

  it("reports primary and nested secondary selections without owning route state", async () => {
    const onTabChange = vi.fn();
    const onSubTabChange = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceDetailShell
          activeSubTabId="releases"
          activeTabId="ship"
          onSubTabChange={onSubTabChange}
          onTabChange={onTabChange}
          tabs={[
            { id: "code", label: "Code" },
            {
              id: "ship",
              label: "Ship",
              subTabs: [
                { id: "releases", label: "Releases" },
                { id: "history", label: "Deploy History" },
              ],
            },
          ]}
        >
          Detail content
        </ResourceDetailShell>,
      );
    });

    const codeTab = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Code");
    const historyTab = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Deploy History");

    expect(codeTab).toBeTruthy();
    expect(historyTab).toBeTruthy();
    await act(async () => codeTab!.click());
    await act(async () => historyTab!.click());

    expect(onTabChange).toHaveBeenCalledWith("code");
    expect(onSubTabChange).toHaveBeenCalledWith("history");
  });
});
