import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import { useId } from "react";
import { ChevronLeft } from "lucide-react";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isPlainPrimaryClick(event: MouseEvent<HTMLElement>) {
  return event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey;
}

export interface ApplicationImmersiveBarProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "title"
> {
  /** Native destination of the back control; keeps new-tab and copy-link behavior. */
  backHref?: string;
  /** Visible label of the back control. */
  backLabel?: ReactNode;
  /** Called for an unmodified primary click on the back control. */
  onBack?: () => void;
  /** The embedded site's name; one truncated line that names the bar. */
  title: ReactNode;
  /** Host-owned compact control, typically `ApplicationNavigationTrigger`. */
  trailing?: ReactNode;
}

/**
 * The one-row chrome a host shows above an embedded site on a small screen: a way back, the
 * site's name, and an optional host control. The host decides which routes are immersive; the
 * SDK owns the bar's touch sizing, safe-area insets, theme chrome, and native link behavior.
 */
export function ApplicationImmersiveBar({
  backHref,
  backLabel = "Back",
  className,
  onBack,
  title,
  trailing,
  ...props
}: ApplicationImmersiveBarProps) {
  const titleId = useId();
  const backContent = (
    <>
      <ChevronLeft aria-hidden="true" />
      <span className="cc-application-immersive-bar__back-label">{backLabel}</span>
    </>
  );

  return (
    <header
      {...props}
      aria-labelledby={titleId}
      className={joinClassNames("cc-application-immersive-bar", className)}
      data-cc-immersive-bar=""
      data-theme-chrome="topbar"
    >
      {backHref ? (
        <a
          className="cc-application-immersive-bar__back"
          data-cc-immersive-back=""
          href={backHref}
          onClick={(event) => {
            if (!onBack || !isPlainPrimaryClick(event)) return;
            event.preventDefault();
            onBack();
          }}
        >
          {backContent}
        </a>
      ) : (
        <button
          className="cc-application-immersive-bar__back"
          data-cc-immersive-back=""
          onClick={onBack}
          type="button"
        >
          {backContent}
        </button>
      )}
      <span className="cc-application-immersive-bar__title" id={titleId}>
        {title}
      </span>
      {trailing !== undefined && trailing !== null ? (
        <div className="cc-application-immersive-bar__trailing">{trailing}</div>
      ) : null}
    </header>
  );
}
