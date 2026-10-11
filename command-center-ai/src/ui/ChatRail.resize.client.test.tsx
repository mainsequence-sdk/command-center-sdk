// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatRail } from "./ChatRail.js";

describe("resizing the chat rail", () => {
  let container: HTMLDivElement;
  let root: Root;
  let observe: () => void;
  let captured: number | null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("innerWidth", 1280);
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { observe = callback; }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const width = Number.parseFloat(this.style.width) || 540;
      const right = window.innerWidth - (Number.parseFloat(this.style.right) || 0);
      return { width, right, left: right - width, top: 0, bottom: 800, height: 800, x: right - width, y: 0, toJSON: () => ({}) };
    });
    captured = null;
    vi.stubGlobal("PointerEvent", MouseEvent);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function render(node: React.ReactNode) {
    act(() => root.render(node));
  }

  function handle() {
    const element = container.querySelector<HTMLDivElement>('[role="separator"]')!;
    element.setPointerCapture = (id) => { captured = id; };
    element.hasPointerCapture = (id) => captured === id;
    element.releasePointerCapture = () => { captured = null; };
    return element;
  }

  function pointer(type: string, clientX: number, pointerId = 1, button = 0) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button });
    Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } });
    act(() => handle().dispatchEvent(event));
    act(() => observe());
  }

  function key(value: string, shiftKey = false) {
    act(() => handle().dispatchEvent(new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true })));
    act(() => observe());
  }

  function currentWidth() {
    return container.querySelector<HTMLElement>(".ms-chat-rail")!.style.width;
  }

  it.each(["docked", "overlay"] as const)("drags the left edge in %s mode and clamps both limits", (mode) => {
    const onWidthChange = vi.fn();
    render(<ChatRail title="Assistant" mode={mode} onClose={() => {}} onWidthChange={onWidthChange}>Thread</ChatRail>);
    expect(currentWidth()).toBe("540px");
    pointer("pointerdown", 740);
    expect(captured).toBe(1);
    expect(document.documentElement.style.userSelect).toBe("none");
    pointer("pointermove", 600);
    expect(currentWidth()).toBe("680px");
    expect(handle().getAttribute("aria-valuenow")).toBe("680");
    pointer("pointermove", 0);
    expect(currentWidth()).toBe("900px");
    pointer("pointermove", 1250);
    expect(currentWidth()).toBe("360px");
    pointer("pointerup", 1250);
    expect(captured).toBeNull();
    expect(document.documentElement.style.userSelect).toBe("");
    pointer("pointermove", 500);
    expect(currentWidth()).toBe("360px");
    expect(onWidthChange.mock.calls.map(([value]) => value)).toEqual([680, 900, 360]);
  });

  it("supports keyboard resizing, bounds, reset, and the host's controlled docked column", () => {
    function Docked() {
      const [width, setWidth] = useState(540);
      return <div style={{ gridTemplateColumns: `minmax(0, 1fr) ${width}px` }}>
        <ChatRail title="Assistant" width={width} onWidthChange={setWidth} minWidth={400} maxWidth={800} onClose={() => {}}>Thread</ChatRail>
      </div>;
    }
    render(<Docked />);
    key("ArrowLeft");
    expect(currentWidth()).toBe("560px");
    key("ArrowRight", true);
    expect(currentWidth()).toBe("460px");
    expect(container.firstElementChild?.getAttribute("style")).toContain("460px");
    key("Home");
    expect(currentWidth()).toBe("400px");
    key("End");
    expect(currentWidth()).toBe("800px");
    act(() => handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(currentWidth()).toBe("540px");
  });

  it("fits a narrow viewport and an offset, then restores the preferred width on a larger screen", () => {
    render(<ChatRail title="Assistant" mode="overlay" rightOffset={48} defaultWidth={700} onClose={() => {}}>Thread</ChatRail>);
    expect(currentWidth()).toBe("700px");
    vi.stubGlobal("innerWidth", 375);
    act(() => window.dispatchEvent(new Event("resize")));
    act(() => observe());
    expect(currentWidth()).toBe("317px");
    expect(handle().getAttribute("aria-valuemin")).toBe("317");
    expect(handle().getAttribute("aria-valuemax")).toBe("317");
    vi.stubGlobal("innerWidth", 1280);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(currentWidth()).toBe("700px");
  });

  it.each(["pointercancel", "lostpointercapture"])("cleans up on %s and ignores other pointers and secondary buttons", (ending) => {
    render(<ChatRail title="Assistant" onClose={() => {}}>Thread</ChatRail>);
    pointer("pointerdown", 740, 1, 2);
    expect(captured).toBeNull();
    pointer("pointerdown", 740);
    pointer("pointermove", 600, 2);
    expect(currentWidth()).toBe("540px");
    pointer(ending, 600);
    expect(document.documentElement.style.cursor).toBe("");
    pointer("pointermove", 600);
    expect(currentWidth()).toBe("540px");
  });

  it("cleans up an active drag when unmounted and offers the original non-resizable layout", () => {
    document.documentElement.style.cursor = "crosshair";
    render(<ChatRail title="Assistant" onClose={() => {}}>Thread</ChatRail>);
    pointer("pointerdown", 740);
    render(null);
    expect(document.documentElement.style.cursor).toBe("crosshair");
    document.documentElement.style.cursor = "";
    render(<ChatRail title="Assistant" resizable={false} onClose={() => {}}>Thread</ChatRail>);
    expect(container.querySelector('[role="separator"]')).toBeNull();
    expect(currentWidth()).toBe("");
  });
});
