import type { HTMLAttributes, ReactNode } from "react";
import { useRef } from "react";

import { useOverlayBehavior } from "../layout/overlay.js";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface ApplicationNavigationDrawerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-label" | "aria-modal" | "children" | "id" | "role"
> {
  /** The host's own navigation. It fills the drawer; the SDK does not render anything inside. */
  children: ReactNode;
  /** Id of the drawer; pass the same value to `ApplicationNavigationTrigger` as `controlsId`. */
  id: string;
  /** Accessible name of the drawer. */
  label?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * A controlled off-canvas drawer for a real host that already owns its navigation and chrome
 * (SDK ADR 010). The host renders its own sidebar inside; the SDK owns the scrim, the modal
 * dialog semantics, the focus trap and restoration, the scroll lock, and Escape, scrim, and
 * outside-pointer dismissal. An embedded application uses a navigation shell's overlay
 * presentation instead.
 */
export function ApplicationNavigationDrawer({
  children,
  className,
  id,
  label = "Navigation menu",
  onOpenChange,
  open,
  ...props
}: ApplicationNavigationDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useOverlayBehavior({
    containerRef: drawerRef,
    onDismiss: () => onOpenChange(false),
    open,
  });

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="cc-application-navigation-drawer__scrim"
        data-cc-navigation-scrim=""
        onClick={() => onOpenChange(false)}
      />
      <div
        {...props}
        aria-label={label}
        aria-modal="true"
        className={joinClassNames("cc-application-navigation-drawer", className)}
        data-cc-navigation-drawer=""
        data-theme-chrome="sidebar"
        id={id}
        ref={drawerRef}
        role="dialog"
      >
        {children}
      </div>
    </>
  );
}
