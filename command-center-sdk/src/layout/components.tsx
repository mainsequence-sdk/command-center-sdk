import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type ApplicationPageElement = "div" | "main" | "section";
export type ApplicationPageMaxWidth = "content" | "wide" | "full";

export interface ApplicationPageProps extends HTMLAttributes<HTMLElement> {
  as?: ApplicationPageElement;
  maxWidth?: ApplicationPageMaxWidth;
}

export function ApplicationPage({
  as: Component = "main",
  children,
  className,
  maxWidth = "wide",
  ...props
}: ApplicationPageProps) {
  return (
    <Component
      {...props}
      className={joinClassNames(
        "cc-application-page",
        `cc-application-page--${maxWidth}`,
        className,
      )}
      data-cc-application-page=""
      data-cc-application-page-max-width={maxWidth}
    >
      {children}
    </Component>
  );
}

export type ApplicationPageHeaderTitleElement = "h1" | "h2" | "h3";

export interface ApplicationPageHeaderProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "title"
> {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  titleAs?: ApplicationPageHeaderTitleElement;
}

export function ApplicationPageHeader({
  actions,
  className,
  description,
  eyebrow,
  title,
  titleAs: Title = "h1",
  ...props
}: ApplicationPageHeaderProps) {
  const hasActions = actions !== undefined && actions !== null;

  return (
    <header
      {...props}
      className={joinClassNames("cc-application-page-header", className)}
      data-cc-application-page-header=""
    >
      <div className="cc-application-page-header__intro">
        {eyebrow !== undefined && eyebrow !== null ? (
          <div className="cc-application-page-header__eyebrow">{eyebrow}</div>
        ) : null}
        <Title className="cc-application-page-header__title">{title}</Title>
        {description !== undefined && description !== null ? (
          <div className="cc-application-page-header__description">{description}</div>
        ) : null}
      </div>
      {hasActions ? (
        <div className="cc-application-page-header__actions" data-cc-application-page-header-actions="">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export type ApplicationPageStackElement = "div" | "section";

export interface ApplicationPageStackProps extends HTMLAttributes<HTMLElement> {
  as?: ApplicationPageStackElement;
}

export function ApplicationPageStack({
  as: Component = "div",
  children,
  className,
  ...props
}: ApplicationPageStackProps) {
  return (
    <Component
      {...props}
      className={joinClassNames("cc-application-page-stack", className)}
      data-cc-application-page-stack=""
    >
      {children}
    </Component>
  );
}

export type ApplicationCardElement = "article" | "div" | "section";
export type ApplicationCardContentPadding = "none" | "standard";
export type ApplicationCardSurface = "default" | "nested";

export interface ApplicationCardProps extends HTMLAttributes<HTMLElement> {
  as?: ApplicationCardElement;
  contentPadding?: ApplicationCardContentPadding;
  footer?: ReactNode;
  header?: ReactNode;
  surface?: ApplicationCardSurface;
}

export function ApplicationCard({
  as: Component = "section",
  children,
  className,
  contentPadding = "standard",
  footer,
  header,
  surface = "default",
  ...props
}: ApplicationCardProps) {
  const hasHeader = header !== undefined && header !== null;
  const hasFooter = footer !== undefined && footer !== null;

  return (
    <Component
      {...props}
      className={joinClassNames(
        "cc-application-card",
        `cc-application-card--${surface}`,
        className,
      )}
      data-cc-application-card=""
      data-cc-application-card-surface={surface}
      data-cc-content-padding={contentPadding}
    >
      {hasHeader ? (
        <div className="cc-application-card__header" data-cc-application-card-header="">
          {header}
        </div>
      ) : null}
      <div
        className={joinClassNames(
          "cc-application-card__content",
          `cc-application-card__content--${contentPadding}`,
        )}
        data-cc-application-card-content=""
      >
        {children}
      </div>
      {hasFooter ? (
        <div className="cc-application-card__footer" data-cc-application-card-footer="">
          {footer}
        </div>
      ) : null}
    </Component>
  );
}

export type ApplicationCardGridElement = "div" | "section";

export interface ApplicationCardGridProps extends HTMLAttributes<HTMLElement> {
  as?: ApplicationCardGridElement;
  minimumCardWidth?: string;
}

export function ApplicationCardGrid({
  as: Component = "div",
  children,
  className,
  minimumCardWidth,
  style,
  ...props
}: ApplicationCardGridProps) {
  const resolvedStyle = minimumCardWidth
    ? ({
        ...style,
        "--application-card-min-width": minimumCardWidth,
      } as CSSProperties)
    : style;

  return (
    <Component
      {...props}
      className={joinClassNames("cc-application-card-grid", className)}
      data-cc-application-card-grid=""
      data-cc-application-card-min-width={minimumCardWidth}
      style={resolvedStyle}
    >
      {children}
    </Component>
  );
}
