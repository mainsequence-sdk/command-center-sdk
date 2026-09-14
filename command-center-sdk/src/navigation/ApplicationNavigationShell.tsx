import type { CSSProperties, ReactNode } from "react";
import { useId, useRef } from "react";

import { useOverlayBehavior } from "../layout/overlay.js";
import { useCommandCenterViewport } from "../layout/viewport.js";
import {
  ApplicationNavigationPanel,
  type ApplicationNavigationPanelProps,
} from "./ApplicationNavigationPanel.js";
import {
  ApplicationRail,
  type ApplicationRailProps,
} from "./ApplicationRail.js";
import type { NavigationIntent } from "./types.js";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type ApplicationNavigationPresentation = "auto" | "docked" | "overlay";
export type ResolvedApplicationNavigationPresentation = Exclude<
  ApplicationNavigationPresentation,
  "auto"
>;

export interface ApplicationNavigationShellProps extends Omit<
  ApplicationRailProps,
  "children" | "className" | "onOpenApplicationChange" | "openApplicationId"
> {
  activeDestinationId?: string | null;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Id of the overlay drawer; pass the same value to `ApplicationNavigationTrigger`. */
  menuId?: string;
  /** Accessible name of the overlay drawer. */
  menuLabel?: string;
  /** Whether the overlay drawer is open. Ignored in the docked presentation. */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  onNavigate: (intent: NavigationIntent) => void;
  onOpenApplicationChange: (applicationId: string | null) => void;
  openApplicationId?: string | null;
  panelClassName?: string;
  panelWidth?: string;
  /**
   * `docked` keeps the rail and panel in the layout row. `overlay` renders them as an off-canvas
   * drawer the host opens through `menuOpen`. `auto` resolves to `overlay` below the `md`
   * breakpoint.
   */
  presentation?: ApplicationNavigationPresentation;
  railClassName?: string;
  railChildren?: ReactNode;
  renderDestinationTrailing?: ApplicationNavigationPanelProps["renderDestinationTrailing"];
  showDestinationDescriptions?: ApplicationNavigationPanelProps["showDestinationDescriptions"];
}

export function ApplicationNavigationShell({
  activeDestinationId,
  applications,
  children,
  className,
  collapsed,
  collapsedWidth = "52px",
  contentClassName,
  expandedWidth = "248px",
  footerApplications = [],
  menuId,
  menuLabel = "Navigation menu",
  menuOpen = false,
  onMenuOpenChange,
  onNavigate,
  onOpenApplicationChange,
  openApplicationId,
  panelClassName,
  panelWidth,
  presentation = "docked",
  railClassName,
  railChildren,
  renderDestinationTrailing,
  showDestinationDescriptions,
  ...railProps
}: ApplicationNavigationShellProps) {
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
  const allApplications = [...applications, ...footerApplications];
  const openApplication = allApplications.find(
    (application) => application.id === openApplicationId,
  );
  const railCollapsed = overlay ? false : collapsed;
  const railWidth = railCollapsed ? collapsedWidth : expandedWidth;

  useOverlayBehavior({
    containerRef: drawerRef,
    onDismiss: () => onMenuOpenChange?.(false),
    open: drawerOpen,
  });

  const navigate = (intent: NavigationIntent) => {
    onNavigate(intent);
    if (overlay) onMenuOpenChange?.(false);
  };

  const rail = (
    <ApplicationRail
      {...railProps}
      applications={applications}
      className={railClassName}
      collapsed={railCollapsed}
      collapsedWidth={collapsedWidth}
      expandedWidth={expandedWidth}
      footerApplications={footerApplications}
      onOpenApplicationChange={onOpenApplicationChange}
      openApplicationId={openApplicationId}
    >
      {railChildren}
    </ApplicationRail>
  );
  const panel = openApplication ? (
    <ApplicationNavigationPanel
      activeDestinationId={activeDestinationId}
      application={openApplication}
      className={panelClassName}
      onClose={() => onOpenApplicationChange(null)}
      onNavigate={navigate}
      panelWidth={panelWidth}
      renderDestinationTrailing={renderDestinationTrailing}
      showDestinationDescriptions={showDestinationDescriptions}
    />
  ) : null;
  const shellStyle = {
    "--application-navigation-rail-width": railWidth,
  } as CSSProperties;

  return (
    <div
      className={joinClassNames(
        "cc-application-navigation-shell",
        overlay && "cc-application-navigation-shell--overlay",
        className,
      )}
      data-cc-presentation={resolvedPresentation}
      style={shellStyle}
    >
      {overlay ? (
        drawerOpen ? (
          <>
            <div
              aria-hidden="true"
              className="cc-application-navigation-shell__scrim"
              data-cc-navigation-scrim=""
              onClick={() => onMenuOpenChange?.(false)}
            />
            <div
              aria-label={menuLabel}
              aria-modal="true"
              className="cc-application-navigation-shell__drawer"
              data-cc-navigation-drawer=""
              id={resolvedMenuId}
              ref={drawerRef}
              role="dialog"
            >
              {rail}
              {panel}
            </div>
          </>
        ) : null
      ) : (
        <>
          {rail}
          {panel}
        </>
      )}
      <div
        className={joinClassNames(
          "cc-application-navigation-shell__content",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
