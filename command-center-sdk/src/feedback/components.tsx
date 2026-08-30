import { Check, Circle, CircleAlert, LoaderCircle } from "lucide-react";
import {
  useId,
  type HTMLAttributes,
  type OlHTMLAttributes,
  type ReactNode,
} from "react";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type ActivityIndicatorSize = "small" | "medium" | "large";

export interface ActivityIndicatorProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  label?: string;
  size?: ActivityIndicatorSize;
}

/** Theme-aware indeterminate activity indicator for standalone or composed feedback. */
export function ActivityIndicator({
  className,
  label,
  size = "medium",
  ...props
}: ActivityIndicatorProps) {
  return (
    <span
      {...props}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={joinClassNames(
        "cc-activity-indicator",
        `cc-activity-indicator--${size}`,
        className,
      )}
      data-cc-activity-indicator=""
      role={label ? "status" : undefined}
    >
      <LoaderCircle aria-hidden="true" />
    </span>
  );
}

export type ProgressStageStatus = "pending" | "active" | "complete" | "error";
export type ProgressStageDetailVisibility = "active-and-error" | "always" | "never";

export interface ProgressStageDetail {
  id: string;
  label: ReactNode;
}

export interface ProgressStageDefinition {
  description?: ReactNode;
  details?: readonly ProgressStageDetail[];
  elapsedSeconds?: number | null;
  id: string;
  label: ReactNode;
  status: ProgressStageStatus;
  statusLabel?: ReactNode;
}

export interface ProgressStageListProps extends Omit<
  OlHTMLAttributes<HTMLOListElement>,
  "aria-label" | "children"
> {
  ariaLabel?: string;
  detailVisibility?: ProgressStageDetailVisibility;
  emptyMessage?: ReactNode;
  stages: readonly ProgressStageDefinition[];
}

const defaultStageLabels: Record<ProgressStageStatus, string> = {
  pending: "Waiting",
  active: "In progress",
  complete: "Complete",
  error: "Failed",
};

function formatElapsedSeconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value < 59.95) return `${value.toFixed(1)}s`;
  const roundedSeconds = Math.round(value);
  return `${Math.floor(roundedSeconds / 60)}m ${roundedSeconds % 60}s`;
}

function shouldShowStageDetails(
  status: ProgressStageStatus,
  visibility: ProgressStageDetailVisibility,
) {
  if (visibility === "always") return true;
  if (visibility === "never") return false;
  return status === "active" || status === "error";
}

function ProgressStageIcon({ status }: { status: ProgressStageStatus }) {
  if (status === "active") return <ActivityIndicator size="small" />;
  if (status === "complete") return <Check aria-hidden="true" />;
  if (status === "error") return <CircleAlert aria-hidden="true" />;
  return <Circle aria-hidden="true" />;
}

/** Ordered, truth-based progress for application startup and other long-running operations. */
export function ProgressStageList({
  ariaLabel = "Progress",
  className,
  detailVisibility = "active-and-error",
  emptyMessage = "Preparing progress details…",
  stages,
  ...props
}: ProgressStageListProps) {
  if (!stages.length) {
    return (
      <p className={joinClassNames("cc-progress-stage-list__empty", className)}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol
      {...props}
      aria-label={ariaLabel}
      className={joinClassNames("cc-progress-stage-list", className)}
      data-cc-progress-stage-list=""
    >
      {stages.map((stage) => {
        const elapsed = formatElapsedSeconds(stage.elapsedSeconds);
        const details = stage.details ?? [];
        const showDetails = details.length > 0 && shouldShowStageDetails(
          stage.status,
          detailVisibility,
        );
        return (
          <li data-status={stage.status} key={stage.id}>
            <div className="cc-progress-stage-list__stage">
              <span className="cc-progress-stage-list__icon">
                <ProgressStageIcon status={stage.status} />
              </span>
              <div className="cc-progress-stage-list__copy">
                <strong>{stage.label}</strong>
                {stage.description !== undefined && stage.description !== null ? (
                  <span>{stage.description}</span>
                ) : null}
              </div>
              <span className="cc-progress-stage-list__state">
                {stage.statusLabel ?? defaultStageLabels[stage.status]}
                {elapsed ? ` · ${elapsed}` : ""}
              </span>
            </div>
            {showDetails ? (
              <ul
                aria-label={`${typeof stage.label === "string" ? stage.label : "Stage"} details`}
                className="cc-progress-stage-list__details"
              >
                {details.map((detail) => <li key={detail.id}>{detail.label}</li>)}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export type ApplicationStatusScreenElement = "div" | "main" | "section";
export type ApplicationStatusScreenState = "loading" | "retrying" | "error";
export type ApplicationStatusScreenTitleElement = "h1" | "h2" | "h3";
export type ApplicationStatusScreenVariant = "viewport" | "contained";

export interface ApplicationStatusAction {
  ariaLabel?: string;
  disabled?: boolean;
  label: ReactNode;
  onSelect: () => void;
}

export interface ApplicationStatusScreenProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "aria-busy" | "aria-labelledby" | "children" | "title"
> {
  action?: ApplicationStatusAction;
  as?: ApplicationStatusScreenElement;
  detailVisibility?: ProgressStageDetailVisibility;
  emptyStagesMessage?: ReactNode;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  liveMessage?: ReactNode;
  message?: ReactNode;
  notice?: ReactNode;
  stageAriaLabel?: string;
  stages?: readonly ProgressStageDefinition[];
  state?: ApplicationStatusScreenState;
  title: ReactNode;
  titleAs?: ApplicationStatusScreenTitleElement;
  variant?: ApplicationStatusScreenVariant;
}

/** Controlled application-level feedback surface. Transport and retry policy stay consumer-owned. */
export function ApplicationStatusScreen({
  action,
  as: Component = "main",
  className,
  detailVisibility,
  emptyStagesMessage,
  eyebrow,
  footer,
  liveMessage,
  message,
  notice,
  stageAriaLabel = "Application progress",
  stages,
  state = "loading",
  title,
  titleAs: Title = "h1",
  variant = "viewport",
  ...props
}: ApplicationStatusScreenProps) {
  const titleId = useId();
  const isError = state === "error";
  const announcement = liveMessage ?? (
    <>
      {title}
      {message !== undefined && message !== null ? <>. {message}</> : null}
      {notice !== undefined && notice !== null ? <>. {notice}</> : null}
    </>
  );

  return (
    <Component
      {...props}
      aria-busy={!isError}
      aria-labelledby={titleId}
      className={joinClassNames(
        "cc-application-status-screen",
        `cc-application-status-screen--${variant}`,
        className,
      )}
      data-cc-application-status-screen=""
      data-state={state}
      data-variant={variant}
    >
      <div
        aria-atomic="true"
        aria-live={isError ? "assertive" : "polite"}
        className="cc-feedback-visually-hidden"
        role={isError ? "alert" : "status"}
      >
        {announcement}
      </div>
      <section className="cc-application-status-screen__content">
        <header className="cc-application-status-screen__header">
          <span className="cc-application-status-screen__icon">
            {isError ? <CircleAlert aria-hidden="true" /> : <ActivityIndicator size="medium" />}
          </span>
          <div>
            {eyebrow !== undefined && eyebrow !== null ? (
              <span className="cc-application-status-screen__eyebrow">{eyebrow}</span>
            ) : null}
            <Title className="cc-application-status-screen__title" id={titleId}>{title}</Title>
          </div>
        </header>
        {message !== undefined && message !== null ? (
          <div className="cc-application-status-screen__message">{message}</div>
        ) : null}
        {notice !== undefined && notice !== null ? (
          <div className="cc-application-status-screen__notice">{notice}</div>
        ) : null}
        {stages ? (
          <ProgressStageList
            ariaLabel={stageAriaLabel}
            detailVisibility={detailVisibility}
            emptyMessage={emptyStagesMessage}
            stages={stages}
          />
        ) : null}
        {action ? (
          <div className="cc-application-status-screen__actions">
            <button
              aria-label={action.ariaLabel}
              className="cc-application-status-screen__action"
              disabled={action.disabled}
              onClick={action.onSelect}
              type="button"
            >
              {action.label}
            </button>
          </div>
        ) : null}
        {footer !== undefined && footer !== null ? (
          <footer className="cc-application-status-screen__footer">{footer}</footer>
        ) : null}
      </section>
    </Component>
  );
}
