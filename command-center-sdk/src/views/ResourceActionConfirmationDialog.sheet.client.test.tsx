// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceActionConfirmationDialog } from "./ResourceActionConfirmationDialog.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

describe("ResourceActionConfirmationDialog sheet presentation", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
  });

  async function mount(presentation: "dialog" | "sheet", onClose = vi.fn()) {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <ResourceActionConfirmationDialog
          actionLabel="Archive"
          confirmButtonLabel="Archive"
          confirmationValue=""
          confirmationWord="ARCHIVE"
          presentation={presentation}
          title="Archive records"
          tone="danger"
          onClose={onClose}
          onConfirm={() => undefined}
          onConfirmationValueChange={() => undefined}
        />,
      );
    });
    return { onClose };
  }

  it("renders the sheet form, keeps the autofocused input, traps Tab, and locks scroll", async () => {
    const { onClose } = await mount("sheet");
    const dialog = document.body.querySelector<HTMLElement>("[role='dialog']")!;
    expect(dialog.getAttribute("data-cc-presentation")).toBe("sheet");
    expect(dialog.classList.contains("cc-resource-dialog--sheet")).toBe(true);
    expect(document.body.querySelector(".cc-resource-dialog-backdrop--sheet")).toBeTruthy();
    expect(document.body.style.position).toBe("fixed");
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("Confirmation word");

    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
    const last = buttons[buttons.length - 1]!;
    last.focus();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }));
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the centered dialog form by default and restores scrolling on unmount", async () => {
    await mount("dialog");
    const dialog = document.body.querySelector<HTMLElement>("[role='dialog']")!;
    expect(dialog.getAttribute("data-cc-presentation")).toBe("dialog");
    expect(document.body.querySelector(".cc-resource-dialog-backdrop--sheet")).toBeNull();
    expect(document.body.style.position).toBe("fixed");
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    expect(document.body.style.position).toBe("");
  });
});
