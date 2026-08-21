import {
  AlertTriangle,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  ShieldX,
} from "lucide-react";

import type {
  ResourceBulkActionPreflightImpact,
  ResourceBulkActionPreflightState,
  ResourceId,
} from "../resource/types.js";

export interface ResourceBulkActionPreflightPanelProps<Id extends ResourceId = ResourceId> {
  state: ResourceBulkActionPreflightState<Id>;
  onRetry?: () => void;
}

function ImpactList({ impacts }: { impacts: readonly ResourceBulkActionPreflightImpact[] }) {
  if (impacts.length === 0) return null;

  return (
    <ul className="cc-resource-preflight__impacts">
      {impacts.map((impact, index) => (
        <li
          key={`${impact.id ?? impact.message}-${index}`}
          className={`cc-resource-preflight__impact cc-resource-preflight__impact--${impact.tone}`}
        >
          <AlertTriangle aria-hidden="true" />
          <span>{impact.message}</span>
          {impact.count !== undefined ? <strong>{impact.count}</strong> : null}
        </li>
      ))}
    </ul>
  );
}

export function ResourceBulkActionPreflightPanel<Id extends ResourceId = ResourceId>({
  onRetry,
  state,
}: ResourceBulkActionPreflightPanelProps<Id>) {
  if (state.status === "not_required") return null;

  if (state.status === "loading") {
    return (
      <section className="cc-resource-preflight cc-resource-preflight--loading" role="status">
        <LoaderCircle aria-hidden="true" className="cc-resource-preflight__spinner" />
        <div>
          <strong>Checking dependencies and impact</strong>
          <p>The action will remain disabled until preflight finishes.</p>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="cc-resource-preflight cc-resource-preflight--error" role="alert">
        <ShieldX aria-hidden="true" />
        <div>
          <strong>Preflight could not be completed</strong>
          <p>{state.error}</p>
        </div>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Retry
          </button>
        ) : null}
      </section>
    );
  }

  const { result } = state;
  const hasWarnings = result.impacts.some((impact) => impact.tone === "warning") ||
    result.items.some((item) => item.impacts.some((impact) => impact.tone === "warning"));
  const visualStatus = state.status === "blocked"
    ? "blocked"
    : hasWarnings
      ? "warning"
      : "allowed";
  const StatusIcon = state.status === "blocked"
    ? ShieldX
    : hasWarnings
      ? AlertTriangle
      : CircleCheck;

  return (
    <section
      className={`cc-resource-preflight cc-resource-preflight--${visualStatus}`}
      data-status={state.status}
      role={state.status === "blocked" ? "alert" : "status"}
    >
      <StatusIcon aria-hidden="true" />
      <div className="cc-resource-preflight__content">
        <div className="cc-resource-preflight__heading">
          <strong>{state.status === "blocked" ? "Action blocked" : "Preflight passed"}</strong>
          {result.matchedCount !== undefined ? (
            <span>{result.matchedCount} matched</span>
          ) : null}
        </div>
        {result.detail ? <p>{result.detail}</p> : null}
        {state.status === "blocked" ? (
          <p className="cc-resource-preflight__blocked-guidance">
            Resolve the blocking dependencies or remove the blocked items from the selection.
          </p>
        ) : null}
        <ImpactList impacts={result.impacts} />
        {result.items.length > 0 ? (
          <div className="cc-resource-preflight__items">
            {result.items.map((item) => (
              <section key={item.id} className="cc-resource-preflight__item">
                <strong>{item.label}</strong>
                <ImpactList impacts={item.impacts} />
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
