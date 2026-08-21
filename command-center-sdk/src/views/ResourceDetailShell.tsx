import type { ReactNode } from "react";

import type { ResourceBreadcrumbDefinition, ResourceDetailTabDefinition } from "../resource/types.js";
import { ResourceTransitionShell } from "./ResourceTransitionShell.js";

export interface ResourceDetailShellProps<T = unknown> {
  activeSubTabId?: string | null;
  activeTabId?: string | null;
  breadcrumbs?: readonly ResourceBreadcrumbDefinition[];
  children?: ReactNode;
  contentVariant?: "card" | "plain";
  embedded?: boolean;
  error?: ReactNode;
  headerActions?: ReactNode;
  loading?: boolean;
  loadingDescription?: ReactNode;
  loadingTitle?: ReactNode;
  onSubTabChange?: (id: string) => void;
  onTabChange?: (id: string) => void;
  summary?: ReactNode;
  tabs?: readonly ResourceDetailTabDefinition<T>[];
  tabsAccessory?: ReactNode;
}

function TabButton({ active, count, label, onClick, variant }: { active: boolean; count?: number; label: string; onClick: () => void; variant: "primary" | "secondary" }) {
  return <button aria-selected={active} className={`cc-resource-detail-tabs__tab cc-resource-detail-tabs__tab--${variant}${active ? " cc-resource-detail-tabs__tab--active" : ""}`} onClick={onClick} role="tab" type="button"><span>{label}</span>{count !== undefined ? <span className="cc-resource-detail-tabs__count">{count}</span> : null}</button>;
}

export function ResourceDetailShell<T = unknown>({
  activeSubTabId,
  activeTabId,
  breadcrumbs = [],
  children,
  contentVariant = "card",
  embedded = false,
  error,
  headerActions,
  loading = false,
  loadingDescription = "Loading the selected resource.",
  loadingTitle = "Loading details…",
  onSubTabChange,
  onTabChange,
  summary,
  tabs = [],
  tabsAccessory,
}: ResourceDetailShellProps<T>) {
  if (loading) return <ResourceTransitionShell description={loadingDescription} embedded={embedded} title={loadingTitle} />;

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const subTabs = activeTab?.subTabs ?? [];
  const hasResolvedContent =
    (summary !== null && summary !== undefined) ||
    (children !== null && children !== undefined);
  const content = <div className={`cc-resource-detail-shell__content cc-resource-detail-shell__content--${contentVariant}`}>{children}</div>;

  return (
    <section className={`cc-resource-detail-shell${embedded ? " cc-resource-detail-shell--embedded" : ""}`}>
      {breadcrumbs.length || headerActions ? <header className="cc-resource-detail-shell__header">
        <nav aria-label="Breadcrumb" className="cc-resource-breadcrumbs"><ol>{breadcrumbs.map((crumb, index) => <li key={crumb.id}>{index ? <span aria-hidden="true" className="cc-resource-breadcrumbs__separator">/</span> : null}{crumb.onSelect ? <button onClick={crumb.onSelect} type="button">{crumb.label}</button> : <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>}</li>)}</ol></nav>
        {headerActions ? <div className="cc-resource-detail-shell__header-actions">{headerActions}</div> : null}
      </header> : null}
      {error ? <div className="cc-resource-detail-shell__error" role="alert">{error}</div> : null}
      {summary ? <div className="cc-resource-detail-shell__summary">{summary}</div> : null}
      {(!error || hasResolvedContent) && tabs.length ? <div className="cc-resource-detail-shell__card">
        <div className="cc-resource-detail-shell__tabs-header">
          <div className="cc-resource-detail-shell__tabs-row"><div aria-label="Detail sections" className="cc-resource-detail-tabs" role="tablist">{tabs.map((tab) => <TabButton active={tab.id === activeTab?.id} count={tab.count} key={tab.id} label={tab.label} onClick={() => onTabChange?.(tab.id)} variant="primary" />)}</div>{tabsAccessory ? <div className="cc-resource-detail-shell__tabs-accessory">{tabsAccessory}</div> : null}</div>
          {subTabs.length > 1 ? <div aria-label={`${activeTab?.label ?? "Detail"} sections`} className="cc-resource-detail-tabs cc-resource-detail-tabs--secondary" role="tablist">{subTabs.map((tab) => <TabButton active={tab.id === activeSubTabId} count={tab.count} key={tab.id} label={tab.label} onClick={() => onSubTabChange?.(tab.id)} variant="secondary" />)}</div> : null}
        </div>
        {content}
      </div> : !error || hasResolvedContent ? content : null}
    </section>
  );
}
