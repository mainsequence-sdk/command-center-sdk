import { useEffect, useRef, type RefObject } from "react";

/**
 * Internal overlay behavior shared by the navigation drawer, picker sheet, and dialog sheet:
 * scroll lock that iOS Safari honors, a focus trap, Escape and outside-pointer dismissal, and
 * focus restoration. Not a public export; each surface exposes its own controlled props.
 */

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

interface ScrollLockState {
  count: number;
  scrollY: number;
  styles: Partial<Record<"left" | "overflow" | "position" | "right" | "top" | "width", string>>;
}

let scrollLock: ScrollLockState | null = null;

/** Lock document scrolling with the fixed-body technique. Returns the release function. */
export function lockDocumentScroll(target: Document = document) {
  const body = target.body;
  if (!scrollLock) {
    const view = target.defaultView;
    scrollLock = {
      count: 0,
      scrollY: view?.scrollY ?? 0,
      styles: {
        left: body.style.left,
        overflow: body.style.overflow,
        position: body.style.position,
        right: body.style.right,
        top: body.style.top,
        width: body.style.width,
      },
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollLock.scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
  }
  scrollLock.count += 1;
  let released = false;
  return () => {
    if (released || !scrollLock) return;
    released = true;
    scrollLock.count -= 1;
    if (scrollLock.count > 0) return;
    const { scrollY, styles } = scrollLock;
    scrollLock = null;
    body.style.position = styles.position ?? "";
    body.style.top = styles.top ?? "";
    body.style.left = styles.left ?? "";
    body.style.right = styles.right ?? "";
    body.style.width = styles.width ?? "";
    body.style.overflow = styles.overflow ?? "";
    target.defaultView?.scrollTo(0, scrollY);
  };
}

export function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.closest("[hidden], [aria-hidden='true']"),
  );
}

export interface OverlayBehaviorOptions {
  /** Whether the overlay is currently open. */
  open: boolean;
  /** The overlay container that owns focus while open. */
  containerRef: RefObject<HTMLElement | null>;
  /** Called on Escape or on a pointer press outside the container. */
  onDismiss?: () => void;
  /** Move focus into the container when it opens and restore it on close. Default true. */
  manageFocus?: boolean;
  /** Lock document scrolling while open. Default true. */
  lockScroll?: boolean;
  /** Dismiss on a pointer press outside the container. Default true. */
  dismissOnOutsidePointer?: boolean;
}

/** Apply shared overlay behavior to a controlled surface. */
export function useOverlayBehavior({
  containerRef,
  dismissOnOutsidePointer = true,
  lockScroll = true,
  manageFocus = true,
  onDismiss,
  open,
}: OverlayBehaviorOptions) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const release = lockScroll ? lockDocumentScroll(document) : null;

    if (manageFocus && container && !container.contains(document.activeElement)) {
      const [first] = focusableElements(container);
      const target = first ?? container;
      if (!container.hasAttribute("tabindex") && !first) container.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !manageFocus || !container) return;
      const elements = focusableElements(container);
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!dismissOnOutsidePointer || !container) return;
      const target = event.target as Node | null;
      if (target && !container.contains(target)) dismissRef.current?.();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      release?.();
      if (manageFocus && previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [containerRef, dismissOnOutsidePointer, lockScroll, manageFocus, open]);
}
