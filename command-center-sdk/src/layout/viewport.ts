import { useSyncExternalStore } from "react";

import {
  resolveCommandCenterBreakpoint,
  type CommandCenterBreakpoint,
} from "../theme/breakpoints.js";

/**
 * The device facts SDK surfaces use to choose a presentation. Hosts and extenders read this
 * through `useCommandCenterViewport()` instead of writing their own `matchMedia` logic.
 */
export interface CommandCenterViewportState {
  breakpoint: CommandCenterBreakpoint;
  /** The primary pointer is imprecise (touch). */
  coarsePointer: boolean;
  /** The primary pointer can hover; false on most touch devices. */
  hoverCapable: boolean;
  /** The user asked for reduced motion. */
  reducedMotion: boolean;
}

/** The state assumed when no window exists, such as during server rendering. */
export const defaultCommandCenterViewportState: CommandCenterViewportState = Object.freeze({
  breakpoint: "lg",
  coarsePointer: false,
  hoverCapable: true,
  reducedMotion: false,
});

const mediaQueries = {
  coarsePointer: "(pointer: coarse)",
  hoverCapable: "(hover: hover)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
} as const;

function resolveWindow(target?: Window): Window | undefined {
  if (target) return target;
  return typeof window === "undefined" ? undefined : window;
}

function queryList(target: Window, query: string): MediaQueryList | null {
  return typeof target.matchMedia === "function" ? target.matchMedia(query) : null;
}

function viewportWidth(target: Window) {
  return target.innerWidth || target.document?.documentElement?.clientWidth || 0;
}

/** Read the current viewport state from a window without subscribing to it. */
export function resolveCommandCenterViewport(target?: Window): CommandCenterViewportState {
  const resolvedWindow = resolveWindow(target);
  if (!resolvedWindow) return defaultCommandCenterViewportState;

  const coarse = queryList(resolvedWindow, mediaQueries.coarsePointer);
  const hover = queryList(resolvedWindow, mediaQueries.hoverCapable);
  const reduced = queryList(resolvedWindow, mediaQueries.reducedMotion);

  return {
    breakpoint: resolveCommandCenterBreakpoint(viewportWidth(resolvedWindow)),
    coarsePointer: coarse?.matches ?? defaultCommandCenterViewportState.coarsePointer,
    hoverCapable: hover?.matches ?? defaultCommandCenterViewportState.hoverCapable,
    reducedMotion: reduced?.matches ?? defaultCommandCenterViewportState.reducedMotion,
  };
}

/**
 * Subscribe to every change that can alter the viewport state. Returns the unsubscribe function.
 */
export function subscribeCommandCenterViewport(
  listener: () => void,
  target?: Window,
): () => void {
  const resolvedWindow = resolveWindow(target);
  if (!resolvedWindow) return () => undefined;

  const lists = Object.values(mediaQueries)
    .map((query) => queryList(resolvedWindow, query))
    .filter((list): list is MediaQueryList => list !== null);

  resolvedWindow.addEventListener("resize", listener);
  lists.forEach((list) => list.addEventListener("change", listener));

  return () => {
    resolvedWindow.removeEventListener("resize", listener);
    lists.forEach((list) => list.removeEventListener("change", listener));
  };
}

function sameState(left: CommandCenterViewportState, right: CommandCenterViewportState) {
  return (
    left.breakpoint === right.breakpoint &&
    left.coarsePointer === right.coarsePointer &&
    left.hoverCapable === right.hoverCapable &&
    left.reducedMotion === right.reducedMotion
  );
}

let cachedSnapshot: CommandCenterViewportState = defaultCommandCenterViewportState;

function getSnapshot() {
  const next = resolveCommandCenterViewport();
  if (!sameState(cachedSnapshot, next)) cachedSnapshot = next;
  return cachedSnapshot;
}

function getServerSnapshot() {
  return defaultCommandCenterViewportState;
}

function subscribe(listener: () => void) {
  return subscribeCommandCenterViewport(listener);
}

/**
 * React seam for the published breakpoint scale and pointer capabilities. Server rendering and
 * environments without `matchMedia` resolve to the desktop, fine-pointer, hover-capable default.
 */
export function useCommandCenterViewport(): CommandCenterViewportState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
