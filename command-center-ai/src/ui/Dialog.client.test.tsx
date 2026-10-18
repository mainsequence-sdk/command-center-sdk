// @vitest-environment jsdom

import { act, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog.js";

describe("Dialog Escape ownership", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function escape(target: EventTarget) {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => { target.dispatchEvent(event); });
    return event;
  }

  it.each(["input", "body"])("closes when Escape belongs to its %s", (target) => {
    const onClose = vi.fn();
    act(() => root.render(<Dialog open title="Provider details" onClose={onClose}><input /></Dialog>));
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    if (target === "input") input.focus();
    else input.blur();

    escape(target === "input" ? input : document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps provider details open when Escape closes a host dialog in a separate portal", () => {
    const onClose = vi.fn();
    function HostAccessPanel() {
      const [open, setOpen] = useState(true);
      return <>
        <input aria-label="Access panel" />
        {open ? createPortal(<div role="dialog" onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}><input aria-label="Grant access" /></div>, document.body) : null}
      </>;
    }
    act(() => root.render(<Dialog open title="Provider details" onClose={onClose}><HostAccessPanel /></Dialog>));
    const hostInput = document.querySelector<HTMLInputElement>('input[aria-label="Grant access"]')!;
    hostInput.focus();

    escape(hostInput);

    expect(document.querySelector('input[aria-label="Grant access"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Provider details");

    // The host's inline access controls still belong to the package dialog.
    const accessInput = document.querySelector<HTMLInputElement>('input[aria-label="Access panel"]')!;
    accessInput.focus();
    escape(accessInput);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("respects Escape already handled by content inside the dialog", () => {
    const onClose = vi.fn();
    act(() => root.render(<Dialog open title="Provider details" onClose={onClose}>
      <input onKeyDown={(event) => event.preventDefault()} />
    </Dialog>));
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    input.focus();

    expect(escape(input).defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });
});
