import { useEffect, useRef, type ReactNode } from "react";

import { X } from "lucide-react";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import { createPortal } from "react-dom";

import { cx } from "./class-names.js";

interface DialogProps {
  children: ReactNode;
  className?: string;
  closeOnBackdropClick?: boolean;
  contentClassName?: string;
  description?: string;
  headerDecor?: ReactNode;
  headerClassName?: string;
  onClose: () => void;
  open: boolean;
  title: string;
}

/**
 * A modal dialog in a portal: a backdrop, a panel with a title, an optional description, a close
 * button, and a scrolling body. Escape closes it when focus is inside it or nowhere (the page
 * body), and not when another dialog or an already-handled Escape has it. The page does not
 * scroll while it is open.
 * `className` sizes the panel; `headerClassName` and `contentClassName` style the header and body.
 */
export function Dialog({
  children,
  className,
  closeOnBackdropClick = false,
  contentClassName,
  description,
  headerDecor,
  headerClassName,
  onClose,
  open,
  title,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      const target = event.target;
      if (target instanceof Node && target !== document.body && !panelRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="ms-chat-dialog">
      {closeOnBackdropClick ? (
        <button
          type="button"
          className="ms-chat-dialog__backdrop"
          aria-label="Close dialog"
          onClick={onClose}
        />
      ) : (
        <div className="ms-chat-dialog__backdrop" aria-hidden="true" />
      )}
      <div
        ref={panelRef}
        className={cx("ms-chat-dialog__panel", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
      >
        <div className="ms-chat-dialog__decor">
          <div className="ms-chat-dialog__glow-primary" />
          <div className="ms-chat-dialog__glow-accent" />
          <div className="ms-chat-dialog__sheen" />
        </div>
        <div
          className={cx("ms-chat-dialog__header", headerClassName)}
        >
          {headerDecor}
          <div className="ms-chat-dialog__heading">
            <h2 id="dialog-title" className="ms-chat-dialog__title">
              {title}
            </h2>
            {description ? (
              <p id="dialog-description" className="ms-chat-dialog__description">
                {description}
              </p>
            ) : null}
          </div>
          <Button aria-label="Close dialog" className="ms-chat-dialog__close" iconOnly onClick={onClose} size="small">
            <X className="ms-chat-icon-md" />
          </Button>
        </div>
        <div
          className={cx("ms-chat-dialog__body", contentClassName)}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
