// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceActionTone } from "../resource/types.js";
import { ResourceActionConfirmationDialog } from "./ResourceActionConfirmationDialog.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

describe("ResourceActionConfirmationDialog", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
  });

  it.each<ResourceActionTone>(["primary", "warning", "danger"])(
    "applies the %s tone to the complete modal",
    async (tone) => {
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      roots.push(root);

      await act(async () => {
        root.render(
          <ResourceActionConfirmationDialog
            actionLabel="Apply changes"
            confirmationValue=""
            confirmButtonLabel="Apply changes"
            title="Apply changes"
            tone={tone}
            warning="Review the impact before continuing."
            onClose={() => undefined}
            onConfirm={() => undefined}
            onConfirmationValueChange={() => undefined}
          />,
        );
      });

      const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
      expect(dialog?.dataset.tone).toBe(tone);
      expect(dialog?.classList.contains(`cc-resource-dialog--${tone}`)).toBe(true);
      expect(dialog?.querySelector(".cc-resource-dialog__header")).toBeTruthy();
      expect(dialog?.querySelector(".cc-resource-dialog__notice")?.textContent).toContain(
        "Review the impact",
      );

      container.remove();
    },
  );

  it("requires the exact confirmation word and submits from the shared dialog", async () => {
    const onConfirm = vi.fn();
    const onConfirmationValueChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    const renderDialog = (confirmationValue: string) => (
      <ResourceActionConfirmationDialog
        actionLabel="Delete data sources"
        confirmationValue={confirmationValue}
        confirmationWord="DELETE DATA SOURCES"
        confirmButtonLabel="Delete data sources"
        selectionLabel="2 selected data sources"
        title="Delete data sources"
        tone="danger"
        warning="This permanently deletes the selected data sources."
        onClose={() => undefined}
        onConfirm={onConfirm}
        onConfirmationValueChange={onConfirmationValueChange}
      />
    );

    await act(async () => root.render(renderDialog("")));
    const confirmButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete data sources",
    );
    expect(confirmButton?.disabled).toBe(true);

    const input = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Confirmation word"]',
    );
    await act(async () => {
      const setInputValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setInputValue?.call(input, "DELETE DATA SOURCES");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onConfirmationValueChange).toHaveBeenCalledWith("DELETE DATA SOURCES");

    await act(async () => root.render(renderDialog("DELETE DATA SOURCES")));
    const enabledConfirmButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete data sources",
    );
    expect(enabledConfirmButton?.disabled).toBe(false);
    await act(async () => enabledConfirmButton!.click());
    expect(onConfirm).toHaveBeenCalledOnce();

    container.remove();
  });

  it("removes the confirmation affordance and cannot submit when preflight is blocked", async () => {
    const onConfirm = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceActionConfirmationDialog
          actionLabel="Delete data sources"
          confirmationValue="DELETE DATA SOURCES"
          confirmationWord="DELETE DATA SOURCES"
          confirmButtonLabel="Delete data sources"
          confirmDisabled
          preflight={{
            status: "blocked",
            result: {
              allowed: false,
              detail: "A protected dependency blocks deletion.",
              impacts: [],
              items: [],
              matchedCount: 1,
              raw: {},
            },
          }}
          title="Delete data sources"
          tone="danger"
          onClose={() => undefined}
          onConfirm={onConfirm}
          onConfirmationValueChange={() => undefined}
        />,
      );
    });

    expect(document.body.querySelector('input[aria-label="Confirmation word"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Confirm by typing");
    expect(document.body.textContent).toContain(
      "Resolve the blocking dependencies or remove the blocked items from the selection.",
    );
    const blockedButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Action blocked",
    );
    expect(blockedButton?.disabled).toBe(true);
    await act(async () => blockedButton!.click());
    expect(onConfirm).not.toHaveBeenCalled();

    container.remove();
  });
});
