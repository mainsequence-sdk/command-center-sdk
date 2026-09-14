// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultCommandCenterViewportState,
  resolveCommandCenterViewport,
  subscribeCommandCenterViewport,
  useCommandCenterViewport,
  type CommandCenterViewportState,
} from "./viewport.js";

type Listener = () => void;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function installMatchMedia(matching: Set<string>) {
  const listeners = new Map<string, Set<Listener>>();
  const matchMedia = vi.fn((query: string) => {
    const list = {
      get matches() {
        return matching.has(query);
      },
      media: query,
      addEventListener: (_type: string, listener: Listener) => {
        listeners.set(query, (listeners.get(query) ?? new Set()).add(listener));
      },
      removeEventListener: (_type: string, listener: Listener) => {
        listeners.get(query)?.delete(listener);
      },
    };
    return list as unknown as MediaQueryList;
  });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
  return {
    emit(query: string) {
      listeners.get(query)?.forEach((listener) => listener());
    },
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0;
    },
  };
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

describe("command center viewport seam", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  beforeEach(() => {
    setWidth(1280);
  });

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("resolves the desktop default without a window or matchMedia", () => {
    expect(resolveCommandCenterViewport(undefined as unknown as Window)).toEqual(
      expect.objectContaining({ breakpoint: "lg", coarsePointer: false, hoverCapable: true }),
    );
    expect(defaultCommandCenterViewportState).toEqual({
      breakpoint: "lg",
      coarsePointer: false,
      hoverCapable: true,
      reducedMotion: false,
    });
    setWidth(375);
    expect(resolveCommandCenterViewport(window)).toEqual({
      breakpoint: "xs",
      coarsePointer: false,
      hoverCapable: true,
      reducedMotion: false,
    });
  });

  it("reads pointer and motion facts from matchMedia", () => {
    installMatchMedia(new Set(["(pointer: coarse)", "(prefers-reduced-motion: reduce)"]));
    setWidth(700);
    expect(resolveCommandCenterViewport(window)).toEqual({
      breakpoint: "sm",
      coarsePointer: true,
      hoverCapable: false,
      reducedMotion: true,
    });
  });

  it("subscribes to resize and media changes and unsubscribes cleanly", () => {
    const media = installMatchMedia(new Set());
    const listener = vi.fn();
    const unsubscribe = subscribeCommandCenterViewport(listener, window);
    window.dispatchEvent(new Event("resize"));
    media.emit("(pointer: coarse)");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(media.listenerCount("(hover: hover)")).toBe(1);
    unsubscribe();
    window.dispatchEvent(new Event("resize"));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(media.listenerCount("(hover: hover)")).toBe(0);
  });

  it("re-renders the hook when the viewport crosses a breakpoint", async () => {
    installMatchMedia(new Set());
    const states: CommandCenterViewportState[] = [];
    function Probe() {
      const state = useCommandCenterViewport();
      states.push(state);
      return <span data-breakpoint={state.breakpoint}>{state.breakpoint}</span>;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<Probe />);
    });
    expect(container.textContent).toBe("lg");

    await act(async () => {
      setWidth(375);
      window.dispatchEvent(new Event("resize"));
    });
    expect(container.textContent).toBe("xs");

    const renderCount = states.length;
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(states.length).toBe(renderCount);
    expect(states.at(-1)?.breakpoint).toBe("xs");
  });
});
