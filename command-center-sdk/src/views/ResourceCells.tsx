import type { ReactNode } from "react";

export interface ResourceIconLabelCellProps {
  icon?: ReactNode;
  iconVariant?: "plain" | "framed";
  label: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}

/**
 * Standard list-cell composition for a resource icon, its primary label, and optional metadata.
 * The resource application owns the icon and values; the SDK owns their layout and styling.
 */
export function ResourceIconLabelCell({
  icon,
  iconVariant = "plain",
  label,
  meta,
  trailing,
}: ResourceIconLabelCellProps) {
  return (
    <div className="cc-resource-icon-label-cell">
      {icon ? (
        <span
          aria-hidden="true"
          className={`cc-resource-icon-label-cell__icon cc-resource-icon-label-cell__icon--${iconVariant}`}
        >
          {icon}
        </span>
      ) : null}
      <span className="cc-resource-icon-label-cell__body">
        <span className="cc-resource-icon-label-cell__label">
          <span className="cc-resource-icon-label-cell__label-text">{label}</span>
          {trailing ? (
            <span aria-hidden="true" className="cc-resource-icon-label-cell__trailing">
              {trailing}
            </span>
          ) : null}
        </span>
        {meta ? <span className="cc-resource-icon-label-cell__meta">{meta}</span> : null}
      </span>
    </div>
  );
}

export type ResourceStatusTone =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface ResourceStatusCellProps {
  label: ReactNode;
  tone?: ResourceStatusTone;
}

/** Standard compact status treatment for SDK list and grid cells. */
export function ResourceStatusCell({ label, tone = "neutral" }: ResourceStatusCellProps) {
  return (
    <span className={`cc-resource-status-cell cc-resource-status-cell--${tone}`}>
      {label}
    </span>
  );
}
