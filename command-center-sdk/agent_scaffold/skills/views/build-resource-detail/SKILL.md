---
name: build-resource-detail
description: Build or migrate a single-object experience with ResourceDetailShell and EntitySummary from @dev-mainsequence/command-center-sdk/views. Use for any page about one object with a summary and sections, even when the object is not a listed resource, and for controlled breadcrumbs, summaries, header action placement, loading and error content, flat and nested tabs with their keyboard model, hidden and disabled tabs, tab icons, the More menu for tabs that do not fit, related-resource sections, and domain-specific content inside standard detail composition.
---

# Build A Resource Detail

## Use The Detail Shell

Use `ResourceDetailShell` when the screen represents one identified object and needs standard
breadcrumbs, summary placement, header actions, tabs, nested tabs, loading, or controlled error
presentation, even when the object is not a listed resource: the `summary` slot takes any node.
Keep the shell even when individual tab bodies are domain-specific. The shell's tabs are the SDK's
only tabs; there is no tab control in `/controls`.

Use `EntitySummary` or `CollapsedEntitySummary` directly only inside a composition that does not
need the full detail lifecycle.

## Read The Exact Contract

Inspect the installed `/resource` and `/views` declarations, `ResourceDetailShellProps`,
`resolveResourceDetailTabs`, entity summary models, and tests. Treat the installed version as
authoritative.

## Compose The Detail

1. Keep the selected resource id, active tab ids, routing, queries, and mutations controlled by the
   consumer.
2. Normalize entity identity, badges, fields, highlights, statistics, labels, and warnings into the
   SDK summary model.
3. Provide callbacks for navigation, editing, labels, links, and other behavior; do not put
   transport instructions in the summary view model.
4. Declare stable flat or primary/secondary tab ids, compose them as described in "Compose The
   Tabs", and render domain content inside the selected content region.
5. Render related object collections through embedded `$build-resource-list` compositions.
6. Render consumer-controlled action elements through `headerActions`. Use
   `$add-resource-actions` to distinguish this slot from the automated list bulk-action lifecycle.

## Compose The Tabs

1. Declare `ResourceDetailTabDefinition<T>` entries with stable ids and labels. Add `count` for a
   collection size, `subTabs` only for a real second-level subdivision, `isVisible` for a tab that
   exists only for some records, and `disabled` for a tab that exists but cannot open yet. Both may
   be functions of the record.
2. Resolve the tabs once per render with `resolveResourceDetailTabs(tabs, { activeTabId,
   activeSubTabId, resource })`. Pass `resource` as `null` or `undefined` until the record loads, so
   a deep link keeps its tab during the load.
3. Pass the result's `tabs`, `activeTab?.id`, and `activeSubTab?.id` to the shell, and switch the
   tab body on the same `activeTab` and `activeSubTab`, so the highlighted tab and the body agree.
4. Keep the requested ids in the host, in the URL when they must survive navigation or deep links;
   `onTabChange` and `onSubTabChange` write them. When the result reports `fallback`, show the
   resolved tab and leave the URL unchanged.
5. Return a tab's icon from `renderTabLead`. It renders `aria-hidden`, so the label stays the tab's
   name; keep it pure, because it also renders in a measurement copy and in the More menu. Show the
   object's own icon beside its name with `renderBreadcrumbLead`, returning it for the `current`
   crumb.
6. Name the primary strip with `tabsLabel`, for example "Service sections".
7. Leave `tabsOverflow` at `auto`: with a mouse, tabs that do not fit move into a More menu; on
   touch the strip scrolls sideways. Force `"menu"` or `"scroll"` only for a stated product reason.

```tsx
import {
  resolveResourceDetailTabs,
  type ResourceDetailTabDefinition,
} from "@dev-mainsequence/command-center-sdk/resource";
import { ResourceDetailShell } from "@dev-mainsequence/command-center-sdk/views";

const serviceTabs: ResourceDetailTabDefinition<Service>[] = [
  { id: "overview", label: "Overview" },
  { id: "logs", label: "Logs", isVisible: (service) => Boolean(service.logsUrl) },
  {
    id: "releases",
    label: "Releases",
    subTabs: [
      { id: "current", label: "Current" },
      { id: "history", label: "History" },
    ],
  },
  { id: "settings", label: "Settings", disabled: (service) => !service.canEdit },
];

export function ServiceDetail({ service, tabId, sectionId, onTabId, onSectionId }: ServiceDetailProps) {
  const { activeSubTab, activeTab, tabs } = resolveResourceDetailTabs(serviceTabs, {
    activeSubTabId: sectionId,
    activeTabId: tabId,
    resource: service,
  });

  return (
    <ResourceDetailShell<Service>
      activeSubTabId={activeSubTab?.id}
      activeTabId={activeTab?.id}
      breadcrumbs={[{ id: "services", label: "Services" }, { id: "service", label: service?.name ?? "Service" }]}
      onSubTabChange={onSectionId}
      onTabChange={onTabId}
      renderBreadcrumbLead={({ current }) => (current ? <ServiceIcon service={service} /> : null)}
      renderTabLead={({ tab }) => <ServiceTabIcon tabId={tab.id} />}
      summary={<ServiceSummary service={service} />}
      tabs={tabs}
      tabsLabel="Service sections"
    >
      {activeTab?.id === "overview" ? <ServiceOverview service={service} /> : null}
      {activeTab?.id === "logs" ? <ServiceLogs service={service} /> : null}
      {activeTab?.id === "releases" ? <ServiceReleases service={service} view={activeSubTab?.id} /> : null}
      {activeTab?.id === "settings" ? <ServiceSettings service={service} /> : null}
    </ResourceDetailShell>
  );
}
```

## Do Not Rebuild Owned Behavior

Do not create a separate breadcrumb header, summary card system, tab styling, blocking transition,
or detail error shell. Do not encode routes or backend endpoints in reusable SDK models.

Do not build a tab strip. The shell owns tab roles, the keyboard model, the tab panel, disabled
tabs, and overflow: add no role attribute, key handler, or `tabIndex` to tabs, never fake tabs with
a row of `Button`s that swap `variant`, never put a tab strip in an `ApplicationCard` header, and
replace any private tab component with the shell. Do not filter tabs or choose a fallback tab by
hand; `resolveResourceDetailTabs` does both.

`headerActions`, tab-content forms, and status markers use `Button`, `Field`, `Input`, `Textarea`,
and `Badge` from `/controls`, never raw elements or application CSS, so every Command Center site
renders them identically. Route their composition to `$compose-command-center-controls`.

## Check The Phone Presentation

Render the screen at 375×812 with a coarse pointer and confirm no horizontal overflow, no control
under 24px, no text input under 16px, and no hover-only affordance. With a coarse pointer the tab
strip scrolls sideways and keeps the selected tab in view; with a mouse at a narrow width, tabs that
do not fit move into More. Check both. Run the `/layout/testing` verifier at its default matrix
when the screen sits in an `ApplicationPage`. Use `useCommandCenterViewport` from `/layout` for any
width- or pointer-dependent host logic instead of `matchMedia`.

## Verify

Test loading, each consumer-provided error state, summary, header actions, flat tabs, nested tabs,
and controlled navigation. Confirm that arrow keys move focus between tabs without selecting and
Enter selects, that each strip is one Tab stop, that a disabled tab is focusable but never opens,
that a deep link to a hidden tab shows the first enabled tab without changing the URL, and that a
tab picked from More receives focus. Find tabs by their tab role or `data-cc-tab-id`. Confirm
unknown domain tab content does not take ownership of surrounding SDK chrome.
