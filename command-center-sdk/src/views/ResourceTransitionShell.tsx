import type { ReactNode } from "react";

import { ActivityIndicator } from "../feedback/components.js";

export interface ResourceTransitionShellProps {
  description?: ReactNode;
  embedded?: boolean;
  title?: ReactNode;
}

/** Blocking SDK transition state used while one resource surface resolves another. */
export function ResourceTransitionShell({
  description = "Preparing the selected resource.",
  embedded = false,
  title = "Opening…",
}: ResourceTransitionShellProps) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className={`cc-resource-transition-shell${embedded ? " cc-resource-transition-shell--embedded" : ""}`}
      role="status"
    >
      <div className="cc-resource-transition-shell__content">
        <ActivityIndicator className="cc-resource-transition-shell__spinner" size="large" />
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
    </section>
  );
}
