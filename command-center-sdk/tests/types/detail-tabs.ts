import type { ReactNode } from "react";

import {
  resolveResourceDetailTabs,
  type ResolvedResourceDetailTabs,
  type ResourceDetailSubTabDefinition,
  type ResourceDetailTabDefinition,
} from "../../src/resource/index.js";
import type {
  ResourceDetailBreadcrumbLeadContext,
  ResourceDetailShellProps,
  ResourceDetailTabLeadContext,
  ResourceDetailTabsOverflow,
} from "../../src/views/index.js";

interface Service {
  editable: boolean;
  logsUrl: string | null;
}

// A sub-tab written before sub-tabs took a resource type still compiles.
const legacySubTab: ResourceDetailSubTabDefinition = { id: "history", label: "History" };

const tabs: ResourceDetailTabDefinition<Service>[] = [
  { id: "overview", label: "Overview" },
  { id: "logs", label: "Logs", isVisible: (service) => service.logsUrl !== null },
  {
    id: "settings",
    label: "Settings",
    disabled: (service) => !service.editable,
    subTabs: [legacySubTab, { id: "access", label: "Access", disabled: (service) => !service.editable }],
  },
];

const resolved: ResolvedResourceDetailTabs<Service> = resolveResourceDetailTabs(tabs, {
  activeSubTabId: null,
  activeTabId: "logs",
  resource: null,
});
const fallback: boolean = resolved.fallback;
const activeId: string | undefined = resolved.activeTab?.id;

const renderTabLead = (context: ResourceDetailTabLeadContext<Service>): ReactNode => {
  if (context.level === "secondary") return `${context.parent.label}/${context.tab.label}`;
  // @ts-expect-error a primary tab has no parent
  return context.parent;
};

const renderBreadcrumbLead = ({ crumb, current, index }: ResourceDetailBreadcrumbLeadContext): ReactNode =>
  current ? `${index}:${crumb.label}` : null;

const overflow: ResourceDetailTabsOverflow = "auto";
// @ts-expect-error overflow is auto, menu, or scroll
const invalidOverflow: ResourceDetailTabsOverflow = "wrap";

const props: ResourceDetailShellProps<Service> = {
  activeSubTabId: resolved.activeSubTab?.id,
  activeTabId: resolved.activeTab?.id,
  renderBreadcrumbLead,
  renderTabLead,
  tabs: resolved.tabs,
  tabsLabel: "Service sections",
  tabsOverflow: overflow,
};

void [activeId, fallback, invalidOverflow, props];
