import type { ButtonHTMLAttributes } from "react";
import { Menu, X } from "lucide-react";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface ApplicationNavigationTriggerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-controls" | "aria-expanded" | "children" | "onClick" | "type"
> {
  /** The `menuId` given to a navigation shell. */
  controlsId?: string;
  /** Accessible label when the menu is closed. */
  label?: string;
  /** Accessible label when the menu is open. */
  openLabel?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * A controlled menu button for an externally placed navigation trigger. Embedded applications
 * should prefer a shell's SDK-owned floating trigger instead of creating a top navigation bar.
 */
export function ApplicationNavigationTrigger({
  className,
  controlsId,
  label = "Open navigation menu",
  onOpenChange,
  open,
  openLabel = "Close navigation menu",
  ...props
}: ApplicationNavigationTriggerProps) {
  return (
    <button
      {...props}
      aria-controls={controlsId}
      aria-expanded={open}
      aria-label={open ? openLabel : label}
      className={joinClassNames("cc-application-navigation-trigger", className)}
      data-cc-navigation-trigger=""
      onClick={() => onOpenChange(!open)}
      type="button"
    >
      {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
    </button>
  );
}
