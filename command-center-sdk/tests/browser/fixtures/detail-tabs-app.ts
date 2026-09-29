// A live detail page for resource-detail-tabs.pw.ts. The spec bundles it with Vite against the
// built package, so React runs in the browser and the tab strip measures real layout.
import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";

import { ResourceDetailShell, type ResourceDetailTabsOverflow } from "../../../dist/views/index.js";

const tabs = [
  { id: "overview", label: "Overview" },
  { count: 12, id: "logs", label: "Logs" },
  { id: "usage", label: "Usage" },
  { disabled: true, id: "card", label: "Agent card" },
  { id: "sessions", label: "Sessions" },
  { id: "tasks", label: "Tasks" },
  {
    id: "releases",
    label: "Releases",
    subTabs: [
      { id: "current", label: "Current" },
      { id: "history", label: "History" },
    ],
  },
];

function DetailTabsApp({ initialTab, overflow }: { initialTab: string; overflow: ResourceDetailTabsOverflow }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [activeSubTab, setActiveSubTab] = useState<string | null>(null);
  return h(
    ResourceDetailShell,
    {
      activeSubTabId: activeSubTab,
      activeTabId: activeTab,
      breadcrumbs: [{ id: "agents", label: "Agents" }, { id: "agent", label: "Pricing agent" }],
      onSubTabChange: setActiveSubTab,
      onTabChange: setActiveTab,
      renderBreadcrumbLead: ({ current }) =>
        current ? h("svg", { "data-crumb-lead": "", viewBox: "0 0 16 16" }, h("rect", { fill: "currentColor", height: 10, width: 10, x: 3, y: 3 })) : null,
      renderTabLead: ({ tab }) =>
        h("svg", { "data-lead": tab.id, viewBox: "0 0 16 16" }, h("circle", { cx: 8, cy: 8, fill: "currentColor", r: 5 })),
      tabs,
      tabsAccessory: h("span", { "data-accessory": "" }, "Live"),
      tabsLabel: "Agent sections",
      tabsOverflow: overflow,
    },
    h("p", { "data-body": activeTab }, `Body of ${activeTab}`),
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(
  h(DetailTabsApp, {
    initialTab: root.dataset.active ?? "overview",
    overflow: (root.dataset.overflow ?? "auto") as ResourceDetailTabsOverflow,
  }),
);
