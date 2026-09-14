import type { ReactNode } from "react";
import { useId, useRef } from "react";

import { useOverlayBehavior } from "../layout/overlay.js";
import { useCommandCenterViewport } from "../layout/viewport.js";
import {
  ApplicationNavigationPanel,
  type ApplicationNavigationPanelProps,
} from "./ApplicationNavigationPanel.js";
import {
  type ApplicationNavigationPresentation,
  type ResolvedApplicationNavigationPresentation,
} from "./ApplicationNavigationShell.js";
import { ApplicationNavigationTrigger } from "./ApplicationNavigationTrigger.js";
import type { NavigationIntent } from "./types.js";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface ApplicationNavigationPanelShellProps extends Omit<
  ApplicationNavigationPanelProps,
  "className" | "onClose" | "onNavigate"
> {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  menuId?: string;
  menuLabel?: string;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onNavigate: (intent: NavigationIntent) => void;
  panelClassName?: string;
  /** `auto` uses an SDK-owned floating trigger and drawer below the `md` breakpoint. */
  presentation?: ApplicationNavigationPresentation;
}

/**
 * Canonical one-level navigation for an embedded application. The SDK owns docked/overlay
 * presentation and the floating phone trigger; the consumer owns routes and controlled menu state.
 */
export function ApplicationNavigationPanelShell({
  activeDestinationId,
  application,
  ariaLabel,
  children,
  className,
  contentClassName,
  menuId,
  menuLabel = `${application.label} navigation`,
  menuOpen,
  onMenuOpenChange,
  onNavigate,
  panelClassName,
  panelWidth,
  presentation = "auto",
  renderDestinationTrailing,
  showDestinationDescriptions,
  showSectionLabels = application.subApplications.length > 1,
}: ApplicationNavigationPanelShellProps) {
  const viewport = useCommandCenterViewport();
  const generatedMenuId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const resolvedPresentation: ResolvedApplicationNavigationPresentation =
    presentation === "auto"
      ? viewport.breakpoint === "xs" || viewport.breakpoint === "sm"
        ? "overlay"
        : "docked"
      : presentation;
  const overlay = resolvedPresentation === "overlay";
  const drawerOpen = overlay && menuOpen;
  const resolvedMenuId = menuId ?? `cc-application-navigation-menu-${generatedMenuId}`;
  const navigate = (intent: NavigationIntent) => {
    onNavigate(intent);
    if (overlay) onMenuOpenChange(false);
  };

  useOverlayBehavior({
    containerRef: drawerRef,
    onDismiss: () => onMenuOpenChange(false),
    open: drawerOpen,
  });

  const panel = (
    <ApplicationNavigationPanel
      activeDestinationId={activeDestinationId}
      application={application}
      ariaLabel={ariaLabel}
      className={panelClassName}
      onClose={overlay ? () => onMenuOpenChange(false) : undefined}
      onNavigate={navigate}
      panelWidth={panelWidth}
      renderDestinationTrailing={renderDestinationTrailing}
      showDestinationDescriptions={showDestinationDescriptions}
      showSectionLabels={showSectionLabels}
    />
  );

  return (
    <div
      className={joinClassNames(
        "cc-application-navigation-panel-shell",
        overlay && "cc-application-navigation-panel-shell--overlay",
        className,
      )}
      data-cc-navigation-depth="1"
      data-cc-presentation={resolvedPresentation}
    >
      {overlay ? (
        <>
          {!drawerOpen ? (
            <ApplicationNavigationTrigger
              className="cc-application-navigation-floating-trigger"
              controlsId={resolvedMenuId}
              label={`Open ${application.label} navigation`}
              onOpenChange={onMenuOpenChange}
              open={false}
            />
          ) : null}
          {drawerOpen ? (
            <>
              <div
                aria-hidden="true"
                className="cc-application-navigation-panel-shell__scrim"
                data-cc-navigation-scrim=""
                onClick={() => onMenuOpenChange(false)}
              />
              <div
                aria-label={menuLabel}
                aria-modal="true"
                className="cc-application-navigation-panel-shell__drawer"
                data-cc-navigation-drawer=""
                id={resolvedMenuId}
                ref={drawerRef}
                role="dialog"
              >
                {panel}
              </div>
            </>
          ) : null}
        </>
      ) : panel}
      <div
        className={joinClassNames(
          "cc-application-navigation-panel-shell__content",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
