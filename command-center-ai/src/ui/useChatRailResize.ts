import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

interface RailResizeOptions {
  defaultWidth: number;
  maxWidth: number;
  minWidth: number;
  mode: "docked" | "overlay";
  onWidthChange?: (width: number) => void;
  resizable: boolean;
  rightOffset?: number | string;
  width?: number;
}

/** Local presentation state only. A host can control it alongside its layout, without storage. */
export function useChatRailResize(railRef: RefObject<HTMLElement | null>, options: RailResizeOptions) {
  const { defaultWidth, maxWidth, minWidth, mode, onWidthChange, resizable, rightOffset, width } = options;
  const [localWidth, setLocalWidth] = useState(defaultWidth);
  const [availableWidth, setAvailableWidth] = useState(Infinity);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number; lastWidth: number } | null>(null);
  const maximum = Math.max(0, Math.floor(Math.min(Math.max(minWidth, maxWidth), availableWidth)));
  const minimum = Math.min(Math.max(0, Math.ceil(minWidth)), maximum);
  const clamp = (value: number) => Math.round(Math.min(maximum, Math.max(minimum, value)));
  const railWidth = clamp(width ?? localWidth);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const measure = () => {
      const rect = rail.getBoundingClientRect();
      // The actual right edge also resolves CSS offsets (rem, %, calc) and adjacent columns.
      const right = rect.right > 0 ? rect.right : window.innerWidth - (mode === "overlay" && typeof rightOffset === "number" ? rightOffset : 0);
      setAvailableWidth(Math.max(0, Math.min(window.innerWidth, right) - 10));
      setMeasuredWidth(rect.width > 0 ? rect.width : null);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(rail);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mode, railRef, rightOffset]);

  useEffect(() => {
    drag.current = null;
    setResizing(false);
  }, [mode, resizable]);

  useEffect(() => {
    if (!resizing) return;
    const style = document.documentElement.style;
    const cursor = style.cursor;
    const userSelect = style.userSelect;
    style.cursor = "col-resize";
    style.userSelect = "none";
    return () => {
      style.cursor = cursor;
      style.userSelect = userSelect;
    };
  }, [resizing]);

  function changeWidth(next: number) {
    const value = clamp(next);
    if (value === (drag.current?.lastWidth ?? railWidth)) return;
    if (drag.current) drag.current.lastWidth = value;
    if (width === undefined) setLocalWidth(value);
    onWidthChange?.(value);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!resizable || event.button !== 0 || event.isPrimary === false || minimum === maximum) return;
    event.preventDefault();
    event.currentTarget.focus();
    const startWidth = railRef.current?.getBoundingClientRect().width || railWidth;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth, lastWidth: startWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    changeWidth(current.startWidth + current.startX - event.clientX);
  }

  function stopResizing(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentWidth = railRef.current?.getBoundingClientRect().width || railWidth;
    const step = event.shiftKey ? 100 : 20;
    const next = event.key === "ArrowLeft" ? currentWidth + step
      : event.key === "ArrowRight" ? currentWidth - step
      : event.key === "Home" ? minimum
      : event.key === "End" ? maximum
      : null;
    if (next === null) return;
    event.preventDefault();
    changeWidth(next);
  }

  return {
    maximum,
    minimum,
    measuredWidth: Math.round(measuredWidth ?? railWidth),
    railWidth,
    resizing,
    handleProps: {
      onDoubleClick: () => changeWidth(defaultWidth),
      onKeyDown,
      onLostPointerCapture: stopResizing,
      onPointerCancel: stopResizing,
      onPointerDown,
      onPointerMove,
      onPointerUp: stopResizing,
    },
  };
}
