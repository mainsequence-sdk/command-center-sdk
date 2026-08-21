import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { X } from "lucide-react";

import type {
  NavigationApplicationDefinition,
  NavigationDestinationDefinition,
  NavigationIntent,
  NavigationSubApplicationDefinition,
} from "./types.js";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function moveDestinationFocus(event: KeyboardEvent<HTMLButtonElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }

  const panel = event.currentTarget.closest("[data-app-navigation-panel]");
  const buttons = panel
    ? Array.from(
        panel.querySelectorAll<HTMLButtonElement>(
          "[data-cc-navigation-destination]",
        ),
      ).filter((button) => !button.disabled)
    : [];
  const currentIndex = buttons.indexOf(event.currentTarget);

  if (currentIndex < 0 || buttons.length === 0) {
    return;
  }

  event.preventDefault();
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? buttons.length - 1
      : event.key === "ArrowDown"
        ? (currentIndex + 1) % buttons.length
        : (currentIndex - 1 + buttons.length) % buttons.length;
  buttons[nextIndex]?.focus();
}

export interface DestinationTrailingRenderProps {
  application: NavigationApplicationDefinition;
  destination: NavigationDestinationDefinition;
  subApplication: NavigationSubApplicationDefinition;
}

export interface ApplicationNavigationPanelProps {
  activeDestinationId?: string | null;
  application: NavigationApplicationDefinition;
  ariaLabel?: string;
  className?: string;
  onClose?: () => void;
  onNavigate: (intent: NavigationIntent) => void;
  panelWidth?: string;
  renderDestinationTrailing?: (
    props: DestinationTrailingRenderProps,
  ) => ReactNode;
  showDestinationDescriptions?: boolean;
}

export function ApplicationNavigationPanel({
  activeDestinationId,
  application,
  ariaLabel = `${application.label} navigation`,
  className,
  onClose,
  onNavigate,
  panelWidth = "208px",
  renderDestinationTrailing,
  showDestinationDescriptions = false,
}: ApplicationNavigationPanelProps) {
  const ApplicationIcon = application.icon;
  const panelStyle = {
    flexBasis: panelWidth,
    width: panelWidth,
  } as CSSProperties;

  return (
    <aside
      aria-label={ariaLabel}
      className={joinClassNames("cc-application-navigation-panel", className)}
      data-app-navigation-panel
      data-theme-chrome="sidebar"
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose) {
          event.preventDefault();
          onClose();
        }
      }}
      style={panelStyle}
    >
      <div className="cc-application-navigation-panel__header">
        <div className="cc-application-navigation-panel__heading">
          {ApplicationIcon ? (
            <ApplicationIcon className="cc-application-navigation-panel__application-icon" />
          ) : null}
          <span>{application.label}</span>
        </div>
        {onClose ? (
          <button
            aria-label={`Close ${application.label} navigation`}
            className="cc-application-navigation-panel__close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <nav aria-label={ariaLabel} className="cc-application-navigation-panel__navigation">
        {application.subApplications.map((subApplication) => {
          const SubApplicationIcon = subApplication.icon;

          return (
            <section
              aria-labelledby={`${application.id}-${subApplication.id}-navigation-label`}
              className="cc-application-navigation-panel__section"
              key={subApplication.id}
            >
              <div
                className="cc-application-navigation-panel__section-label"
                id={`${application.id}-${subApplication.id}-navigation-label`}
              >
                {SubApplicationIcon ? (
                  <SubApplicationIcon className="cc-application-navigation-panel__section-icon" />
                ) : null}
                <span>{subApplication.label}</span>
              </div>
              <div className="cc-application-navigation-panel__destinations">
                {subApplication.destinations.map((destination) => {
                  const Icon = destination.icon;
                  const active = activeDestinationId === destination.id;
                  const unavailableLabel = destination.unavailableReason?.trim() ||
                    `${destination.label} is unavailable.`;
                  const destinationDescription = destination.disabled
                    ? unavailableLabel
                    : showDestinationDescriptions ? destination.description : undefined;

                  return (
                    <div
                      className={joinClassNames(
                        "cc-application-navigation-panel__destination-row",
                        active && "cc-application-navigation-panel__destination-row--active",
                      )}
                      key={destination.id}
                    >
                      <button
                        aria-current={active ? "page" : undefined}
                        className="cc-application-navigation-panel__destination"
                        data-cc-navigation-destination
                        disabled={destination.disabled}
                        onClick={() => {
                          onNavigate({
                            applicationId: application.id,
                            destinationId: destination.id,
                            subApplicationId: subApplication.id,
                          });
                        }}
                        onKeyDown={moveDestinationFocus}
                        title={destination.disabled ? unavailableLabel : undefined}
                        type="button"
                      >
                        {Icon ? (
                          <Icon className="cc-application-navigation-panel__destination-icon" />
                        ) : null}
                        <span className="cc-application-navigation-panel__destination-copy">
                          <span className="cc-application-navigation-panel__destination-label">
                            {destination.label}
                          </span>
                          {destinationDescription ? (
                            <span className="cc-application-navigation-panel__destination-description">
                              {destinationDescription}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      {renderDestinationTrailing ? (
                        <div className="cc-application-navigation-panel__destination-trailing">
                          {renderDestinationTrailing({
                            application,
                            destination,
                            subApplication,
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </aside>
  );
}
