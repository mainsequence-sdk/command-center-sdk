import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { useEffect, useId, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { createPortal } from "react-dom";

import type { NavigationApplicationDefinition } from "./types.js";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function focusSiblingNavigationItem(
  event: KeyboardEvent<HTMLElement>,
  selector: string,
) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }

  const container = event.currentTarget.closest("[data-cc-navigation-rail]");
  const buttons = container
    ? Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
        (item) => item.getAttribute("aria-disabled") !== "true" &&
          !(item instanceof HTMLButtonElement && item.disabled),
      )
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

function isPlainPrimaryClick(event: MouseEvent<HTMLElement>) {
  return event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey;
}

function resolveApplicationHref(application: NavigationApplicationDefinition) {
  if (application.href) {
    return application.href;
  }

  if (!application.defaultDestinationId) {
    return undefined;
  }

  for (const subApplication of application.subApplications) {
    const destination = subApplication.destinations.find(
      (candidate) => candidate.id === application.defaultDestinationId,
    );
    if (destination?.href && !destination.disabled) {
      return destination.href;
    }
  }

  return undefined;
}

export interface ApplicationRailItemProps {
  active?: boolean;
  application: NavigationApplicationDefinition;
  collapsed: boolean;
  open?: boolean;
  onOpenChange: (applicationId: string | null) => void;
  renderTrailing?: (
    application: NavigationApplicationDefinition,
  ) => ReactNode;
}

export function ApplicationRailItem({
  active = false,
  application,
  collapsed,
  open = false,
  onOpenChange,
  renderTrailing,
}: ApplicationRailItemProps) {
  const Icon = application.icon;
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const unavailableLabel = application.unavailableReason?.trim() ||
    `${application.label} is unavailable.`;
  const label = application.disabled ? unavailableLabel : application.label;

  useEffect(() => {
    if (!tooltipPosition) {
      return undefined;
    }

    const closeTooltip = () => setTooltipPosition(null);
    window.addEventListener("resize", closeTooltip);
    window.addEventListener("scroll", closeTooltip, true);

    return () => {
      window.removeEventListener("resize", closeTooltip);
      window.removeEventListener("scroll", closeTooltip, true);
    };
  }, [tooltipPosition]);

  const showTooltip = () => {
    if (!collapsed) {
      return;
    }

    const bounds = (anchorRef.current ?? buttonRef.current)?.getBoundingClientRect();
    if (bounds) {
      setTooltipPosition({
        left: bounds.right + 8,
        top: bounds.top + (bounds.height / 2),
      });
    }
  };

  const href = resolveApplicationHref(application);
  const itemClassName = joinClassNames(
    "cc-application-rail__item",
    collapsed && "cc-application-rail__item--collapsed",
    (active || open) && "cc-application-rail__item--active",
  );
  const itemContent = (
    <>
      <span aria-hidden="true" className="cc-application-rail__icon">
        {Icon ? (
          <Icon className="cc-application-rail__icon-svg" />
        ) : (
          <span className="cc-application-rail__icon-fallback">
            {application.label.trim().slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      {!collapsed ? (
        <span className="cc-application-rail__label">{application.label}</span>
      ) : null}
      {!collapsed && renderTrailing ? (
        <span className="cc-application-rail__trailing">
          {renderTrailing(application)}
        </span>
      ) : null}
    </>
  );
  const sharedItemProps = {
    "aria-current": active ? "page" as const : undefined,
    "aria-describedby": collapsed && tooltipPosition ? tooltipId : undefined,
    "aria-expanded": open,
    "aria-label": collapsed ? label : undefined,
    className: itemClassName,
    "data-cc-navigation-application": true,
    onBlur: () => setTooltipPosition(null),
    onFocus: showTooltip,
    onMouseEnter: showTooltip,
    onMouseLeave: () => setTooltipPosition(null),
    title: application.disabled ? label : undefined,
  };

  return (
    <>
      {href && !application.disabled ? (
        <a
          {...sharedItemProps}
          href={href}
          onClick={(event) => {
            if (!isPlainPrimaryClick(event)) {
              return;
            }
            event.preventDefault();
            onOpenChange(open ? null : application.id);
          }}
          onKeyDown={(event) =>
            focusSiblingNavigationItem(
              event,
              "[data-cc-navigation-application]",
            )
          }
          ref={anchorRef}
        >
          {itemContent}
        </a>
      ) : (
        <button
          {...sharedItemProps}
          disabled={application.disabled}
          onClick={() => onOpenChange(open ? null : application.id)}
          onKeyDown={(event) =>
            focusSiblingNavigationItem(
              event,
              "[data-cc-navigation-application]",
            )
          }
          ref={buttonRef}
          type="button"
        >
          {itemContent}
        </button>
      )}
      {collapsed && tooltipPosition && typeof document !== "undefined"
        ? createPortal(
            <span
              className="cc-application-rail__tooltip"
              id={tooltipId}
              role="tooltip"
              style={{
                left: tooltipPosition.left,
                top: tooltipPosition.top,
              }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

export interface ApplicationRailHeaderRenderProps {
  collapsed: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export interface ApplicationRailProps {
  activeApplicationId?: string | null;
  applications: readonly NavigationApplicationDefinition[];
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
  collapsed: boolean;
  collapsedWidth?: string;
  expandedWidth?: string;
  footer?: ReactNode;
  footerApplications?: readonly NavigationApplicationDefinition[];
  label?: string;
  onCollapsedChange?: (collapsed: boolean) => void;
  onOpenApplicationChange: (applicationId: string | null) => void;
  openApplicationId?: string | null;
  renderApplicationTrailing?: (
    application: NavigationApplicationDefinition,
  ) => ReactNode;
  renderHeader?: (props: ApplicationRailHeaderRenderProps) => ReactNode;
}

export function ApplicationRail({
  activeApplicationId,
  applications,
  ariaLabel = "Applications",
  children,
  className,
  collapsed,
  collapsedWidth = "52px",
  expandedWidth = "248px",
  footer,
  footerApplications = [],
  label = "Applications",
  onCollapsedChange,
  onOpenApplicationChange,
  openApplicationId,
  renderApplicationTrailing,
  renderHeader,
}: ApplicationRailProps) {
  const header = renderHeader?.({ collapsed, onCollapsedChange }) ?? (
    <div className="cc-application-rail__default-header">
      {!collapsed ? (
        <span className="cc-application-rail__title">{label}</span>
      ) : null}
      {onCollapsedChange ? (
        <button
          aria-label={collapsed
            ? "Expand application navigation"
            : "Collapse application navigation"}
          className="cc-application-rail__collapse"
          onClick={() => onCollapsedChange(!collapsed)}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          type="button"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" />
          ) : (
            <PanelLeftClose aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );

  const railWidth = collapsed ? collapsedWidth : expandedWidth;
  const railStyle = {
    flexBasis: railWidth,
    width: railWidth,
  } as CSSProperties;

  return (
    <aside
      aria-label={ariaLabel}
      className={joinClassNames(
        "cc-application-rail",
        collapsed && "cc-application-rail--collapsed",
        className,
      )}
      data-cc-navigation-rail
      data-theme-chrome="sidebar"
      style={railStyle}
    >
      <div className="cc-application-rail__header">{header}</div>
      <nav aria-label={ariaLabel} className="cc-application-rail__navigation">
        {applications.length > 0 ? (
          <div className="cc-application-rail__section">
            {!collapsed ? (
              <div className="cc-application-rail__section-label">{label}</div>
            ) : null}
            <div className="cc-application-rail__items">
              {applications.map((application) => (
                <ApplicationRailItem
                  active={activeApplicationId === application.id}
                  application={application}
                  collapsed={collapsed}
                  key={application.id}
                  onOpenChange={onOpenApplicationChange}
                  open={openApplicationId === application.id}
                  renderTrailing={renderApplicationTrailing}
                />
              ))}
            </div>
          </div>
        ) : null}
        {children}
      </nav>
      <div className="cc-application-rail__footer">
        {footerApplications.length > 0 ? (
          <div className="cc-application-rail__footer-applications">
            {footerApplications.map((application) => (
              <ApplicationRailItem
                active={activeApplicationId === application.id}
                application={application}
                collapsed={collapsed}
                key={application.id}
                onOpenChange={onOpenApplicationChange}
                open={openApplicationId === application.id}
                renderTrailing={renderApplicationTrailing}
              />
            ))}
          </div>
        ) : null}
        {footer}
      </div>
    </aside>
  );
}
