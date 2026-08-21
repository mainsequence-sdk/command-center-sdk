import type { ReactNode } from "react";

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

export interface ApplicationNavigationShellProps extends Omit<
  ApplicationRailProps,
  "children" | "className" | "onOpenApplicationChange" | "openApplicationId"
> {
  activeDestinationId?: string | null;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  onNavigate: (intent: NavigationIntent) => void;
  onOpenApplicationChange: (applicationId: string | null) => void;
  openApplicationId?: string | null;
  panelClassName?: string;
  panelWidth?: string;
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
  contentClassName,
  footerApplications = [],
  onNavigate,
  onOpenApplicationChange,
  openApplicationId,
  panelClassName,
  panelWidth,
  railClassName,
  railChildren,
  renderDestinationTrailing,
  showDestinationDescriptions,
  ...railProps
}: ApplicationNavigationShellProps) {
  const allApplications = [...applications, ...footerApplications];
  const openApplication = allApplications.find(
    (application) => application.id === openApplicationId,
  );

  return (
    <div className={joinClassNames("cc-application-navigation-shell", className)}>
      <ApplicationRail
        {...railProps}
        applications={applications}
        className={railClassName}
        footerApplications={footerApplications}
        onOpenApplicationChange={onOpenApplicationChange}
        openApplicationId={openApplicationId}
      >
        {railChildren}
      </ApplicationRail>
      {openApplication ? (
        <ApplicationNavigationPanel
          activeDestinationId={activeDestinationId}
          application={openApplication}
          className={panelClassName}
          onClose={() => onOpenApplicationChange(null)}
          onNavigate={onNavigate}
          panelWidth={panelWidth}
          renderDestinationTrailing={renderDestinationTrailing}
          showDestinationDescriptions={showDestinationDescriptions}
        />
      ) : null}
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
