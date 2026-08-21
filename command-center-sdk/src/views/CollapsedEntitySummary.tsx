import type { ReactNode } from "react";

import type { EntitySummary } from "../resource/types.js";

export interface CollapsedEntitySummaryProps {
  actions?: ReactNode;
  expanded: boolean;
  fallbackTitle: string;
  onExpandedChange: (expanded: boolean) => void;
  summary: EntitySummary | null;
}

export function CollapsedEntitySummary({ actions, expanded, fallbackTitle, onExpandedChange, summary }: CollapsedEntitySummaryProps) {
  const title = summary?.entity.title?.trim() || fallbackTitle;
  return (
    <section className="cc-collapsed-entity-summary">
      <button aria-expanded={expanded} aria-label={expanded ? `Collapse ${title} summary` : `Expand ${title} summary`} className="cc-collapsed-entity-summary__toggle" onClick={() => onExpandedChange(!expanded)} type="button">
        <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
      </button>
      <div className="cc-collapsed-entity-summary__title">{title}</div>
      <div className="cc-collapsed-entity-summary__badges">
        {(summary?.badges ?? []).slice(0, 3).map((badge) => <span className={`cc-entity-summary__badge${badge.tone ? ` cc-entity-summary--${badge.tone}` : ""}`} key={badge.key}>{badge.label}</span>)}
      </div>
      {actions ? <div className="cc-collapsed-entity-summary__actions">{actions}</div> : null}
    </section>
  );
}
