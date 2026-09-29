import type { ReactNode } from "react";

import { resolveResourceDetailTabs } from "../resource/detail-tabs.js";
import type { ResourceBreadcrumbDefinition, ResourceDetailTabDefinition } from "../resource/types.js";
import {
  ResourceDetailTabsCard,
  type ResourceDetailTabLeadContext,
  type ResourceDetailTabsOverflow,
} from "./ResourceDetailTabs.js";
import { ResourceTransitionShell } from "./ResourceTransitionShell.js";

export type { ResourceDetailTabLeadContext, ResourceDetailTabsOverflow } from "./ResourceDetailTabs.js";

/** What `ResourceDetailShell.renderBreadcrumbLead` receives for each breadcrumb. */
export interface ResourceDetailBreadcrumbLeadContext {
  crumb: ResourceBreadcrumbDefinition;
  index: number;
  /** True for the last breadcrumb, the object the detail shows. */
  current: boolean;
}

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
  /**
   * Leading visual for a breadcrumb, usually the icon of the object it names. It renders
   * `aria-hidden`, so the label stays the breadcrumb's accessible name.
   */
  renderBreadcrumbLead?: (context: ResourceDetailBreadcrumbLeadContext) => ReactNode;
  /**
   * Leading visual for each tab, usually an icon. It renders `aria-hidden`, so the label stays the
   * tab's accessible name. Keep it pure: it renders in the strip, a hidden measurement copy, and the
   * More menu.
   */
  renderTabLead?: (context: ResourceDetailTabLeadContext<T>) => ReactNode;
  summary?: ReactNode;
  /**
   * Tabs to render. Resolve them with `resolveResourceDetailTabs` when they use `isVisible` or a
   * function-valued `disabled`; the shell itself evaluates neither.
   */
  tabs?: readonly ResourceDetailTabDefinition<T>[];
  tabsAccessory?: ReactNode;
  /** Accessible name of the primary tab list. Defaults to "Detail sections". */
  tabsLabel?: string;
  /**
   * How tabs that do not fit are reached. `auto` (default) moves them into a More menu with a fine
   * pointer and scrolls the row sideways with a coarse pointer.
   */
  tabsOverflow?: ResourceDetailTabsOverflow;
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
  renderBreadcrumbLead,
  renderTabLead,
  summary,
  tabs = [],
  tabsAccessory,
  tabsLabel = "Detail sections",
  tabsOverflow = "auto",
}: ResourceDetailShellProps<T>) {
  if (loading) return <ResourceTransitionShell description={loadingDescription} embedded={embedded} title={loadingTitle} />;

  const resolved = resolveResourceDetailTabs(tabs, { activeSubTabId, activeTabId });
  const hasResolvedContent =
    (summary !== null && summary !== undefined) ||
    (children !== null && children !== undefined);
  const content = <div className={`cc-resource-detail-shell__content cc-resource-detail-shell__content--${contentVariant}`}>{children}</div>;

  return (
    <section className={`cc-resource-detail-shell${embedded ? " cc-resource-detail-shell--embedded" : ""}`}>
      {breadcrumbs.length || headerActions ? <header className="cc-resource-detail-shell__header">
        <nav aria-label="Breadcrumb" className="cc-resource-breadcrumbs"><ol>{breadcrumbs.map((crumb, index) => {
          const current = index === breadcrumbs.length - 1;
          const lead = renderBreadcrumbLead?.({ crumb, current, index });
          const content = <>{lead === null || lead === undefined || lead === false ? null : <span aria-hidden="true" className="cc-resource-breadcrumbs__lead">{lead}</span>}{crumb.label}</>;
          return <li key={crumb.id}>{index ? <span aria-hidden="true" className="cc-resource-breadcrumbs__separator">/</span> : null}{crumb.onSelect ? <button className="cc-resource-breadcrumbs__crumb" onClick={crumb.onSelect} type="button">{content}</button> : <span aria-current={current ? "page" : undefined} className="cc-resource-breadcrumbs__crumb">{content}</span>}</li>;
        })}</ol></nav>
        {headerActions ? <div className="cc-resource-detail-shell__header-actions">{headerActions}</div> : null}
      </header> : null}
      {error ? <div className="cc-resource-detail-shell__error" role="alert">{error}</div> : null}
      {summary ? <div className="cc-resource-detail-shell__summary">{summary}</div> : null}
      {(!error || hasResolvedContent) && resolved.tabs.length ? (
        <ResourceDetailTabsCard<T>
          accessory={tabsAccessory}
          activeSubTab={resolved.activeSubTab}
          activeTab={resolved.activeTab}
          contentVariant={contentVariant}
          onSubTabChange={onSubTabChange}
          onTabChange={onTabChange}
          overflow={tabsOverflow}
          renderTabLead={renderTabLead}
          subTabs={resolved.subTabs}
          tabs={resolved.tabs}
          tabsLabel={tabsLabel}
        >
          {children}
        </ResourceDetailTabsCard>
      ) : !error || hasResolvedContent ? content : null}
    </section>
  );
}
