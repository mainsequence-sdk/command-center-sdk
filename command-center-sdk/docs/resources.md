---
sidebar_position: 3
title: Resources
---

# Resource lists, details, pickers, actions, and backends

This guide matches the `build-resource-list`, `build-resource-detail`,
`build-resource-picker`, `add-resource-actions`, and `adapt-resource-backend` skills.

The resource framework has two halves:

- `/resource` defines typed, framework-neutral data and adapter contracts.
- `/views` renders those contracts with React.

Your application supplies the API client, routing, permissions, notifications, and domain-specific
content.

## Adapt a backend

Use `createHttpResourceAdapter` for a conventional HTTP API. Its client owns authentication and
transport policy; normalizers turn raw responses into SDK models.

```ts
import {
  createHttpResourceAdapter,
  defineResourceApplication,
  type ResourceHttpClient,
} from "@dev-mainsequence/command-center-sdk/resource";

interface Service {
  uid: string;
  name: string;
  status: "active" | "paused";
}

interface ServiceListResponse {
  count: number;
  results: Service[];
}

const client: ResourceHttpClient = {
  async request<Response>({ method, path, query, body, signal }) {
    const url = new URL(path, "https://api.example.com");
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    const response = await fetch(url, {
      method,
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await getAccessToken()}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    return (await response.json()) as Response;
  },
};

const adapter = createHttpResourceAdapter<
  Service,
  string,
  ServiceListResponse
>({
  client,
  endpoints: {
    list: "/services/",
    detail: (uid) => `/services/${encodeURIComponent(uid)}/`,
    discovery: "/services/discovery/",
  },
  serializeListQuery: ({ pageIndex, pageSize, search, filters, sort }) => ({
    offset: pageIndex * pageSize,
    limit: pageSize,
    search,
    ...filters,
    ordering: sort?.map(({ key, direction }) =>
      direction === "descending" ? `-${key}` : key,
    ),
  }),
  normalizeList: (response, request) => ({
    items: response.results,
    pageInfo: {
      pageIndex: request.pageIndex,
      pageSize: request.pageSize,
      totalItems: response.count,
      hasNextPage: (request.pageIndex + 1) * request.pageSize < response.count,
      hasPreviousPage: request.pageIndex > 0,
    },
  }),
});

export const serviceResource = defineResourceApplication({
  id: "services",
  label: "Services",
  itemLabel: "service",
  getId: (service: Service) => service.uid,
  adapter,
  columns: [
    { id: "name", header: "Name", getValue: (service) => service.name, sortableKey: "name" },
    { id: "status", header: "Status", getValue: (service) => service.status },
  ],
});
```

Every list result must include authoritative `pageInfo`. Never use the number of loaded rows as a
server total. Implement `ResourceAdapter` directly for GraphQL, RPC, local-first, or other
nonstandard transports.

The discovery request is separate and never includes `limit`, `offset`, `page`, `page_size`, sort,
or other presentation-only state. It receives the current search, visible filter values, and
explicitly declared hidden host scope. `ResourceListPage` uses the response for UI identity,
controls, column inclusion/order/headings, and authorized bulk actions. Local columns remain the
trusted renderer registry: discovery selects them by ID, while a backend-added generic column must
provide both a safe `value_path` and `data_type`.

When backend work is missing, specify canonical identity, request parameters, raw list/detail
shapes, pagination, error semantics, action discovery/preflight/execution, permissions,
cancellation, and refresh behavior. Do not hide an undefined backend contract inside a view.

## Use the backend schema bundle

Backend teams do not need to reverse-engineer the TypeScript declarations. The npm package ships a
draft-2020-12 manifest, schemas, and valid/invalid fixtures:

```text
@dev-mainsequence/command-center-sdk/contracts/manifest.json
@dev-mainsequence/command-center-sdk/contracts/schemas/resource-discovery-v1.schema.json
@dev-mainsequence/command-center-sdk/contracts/schemas/resource-collection-v1.schema.json
@dev-mainsequence/command-center-sdk/contracts/schemas/bulk-action-discovery-v1.schema.json
@dev-mainsequence/command-center-sdk/contracts/schemas/bulk-action-execution-v1.schema.json
@dev-mainsequence/command-center-sdk/contracts/schemas/bulk-action-preflight-v1.schema.json
```

Read the manifest rather than hardcoding filesystem paths. It identifies each schema by stable URN,
states whether it is a backend request/response or normalized adapter result, links the matching
TypeScript type, and indexes its conformance fixtures.

The resource-collection schema describes the normalized `ResourceListResult<T>` boundary. A backend
may emit that shape directly, but product APIs with an established `{count, results}` envelope can
continue using it when a frontend adapter normalizes the response. Discovery, execution, and
preflight schemas describe the actual backend wire payloads consumed by the SDK.

See the [backend contract schema README](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/command-center-sdk/contracts/README.md)
for validator setup, semantic constraints, and versioning rules.

## Build a resource list

```tsx
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";

export function ServicesPage() {
  return (
    <ResourceListPage
      definition={serviceResource}
      searchable
      searchPlaceholder="Search services"
      refreshable
      pageSize={25}
      filterDefinitions={[
        {
          id: "status",
          label: "Status",
          value: "active",
          options: [
            { label: "Active", value: "active" },
            { label: "Paused", value: "paused" },
          ],
          onChange: (status) => setStatus(status),
        },
      ]}
      filters={{ status }}
      primaryActions={[
        { id: "create", label: "New service", tone: "primary", onSelect: openCreateDialog },
      ]}
      rowActions={[
        { id: "open", label: "Open", onSelect: (service) => openService(service.uid) },
      ]}
      onBulkActionSuccess={() => showToast("Services updated")}
    />
  );
}
```

`ResourceListPage` owns loading, error, empty/no-results states, toolbar placement, search,
pagination, selection, discovered bulk-action lifecycle, and refresh. Use `renderCard` to switch
presentation without replacing that lifecycle. Use `embedded` when the list appears inside another
SDK composition.

Discovery filter entries are query-capability metadata and never generate toolbar inputs. The
standard resource toolbar renders one search input. When product design explicitly requires a
separate scope selector, `filterDefinitions` may keep an advertised value controlled and provide
dynamic host option rows; it does not authorize a new backend filter key. An unmatched definition
is a host scope selector and must correspond to an explicitly accepted hidden discovery scope.

Do not add a second header, toolbar, pagination footer, selection bar, or confirmation flow around
the page. Use supported columns, cells, actions, filters, and narrow contribution points.

Consumer-provided elements around the list—header actions, filter fields, empty-state actions—come
from [`/controls`](./application-controls.md) (`Button`, `Field`, `Input`, `Badge`), never from raw
elements or application CSS, so every Command Center site renders them identically.

### Present the list on a phone

Give columns an `importance` and let the table change shape from the same definitions:

```tsx
columns: [
  { id: "name", header: "Name", getValue: (s) => s.name, importance: "primary" },
  { id: "status", header: "Status", renderCell: (s) => <StatusCell status={s.status} /> },
  { id: "owner", header: "Owner", getValue: (s) => s.owner, importance: "tertiary" },
  { id: "region", header: "Region", getValue: (s) => s.region, hideBelow: "lg" },
],
```

```tsx
<ResourceListPage definition={serviceResource} tablePresentation="auto" />
```

`primary` is the row's identity: it stays visible at every width, stays sticky while the table
scrolls sideways, and becomes the title when rows stack. Undeclared columns are `secondary`
(visible from 640px); `tertiary` columns appear from 768px and sit behind a "More details"
disclosure when stacked. `hideBelow` is a host-only override for one column. When discovery
supplies `importance`, the backend value wins. With `tablePresentation="auto"` rows stack below
640px, sort moves to a picker in the toolbar, host filters fold into a "Filters" disclosure, and
pagination becomes previous, page summary, next. Row actions collapse into a menu when there are
more than two or the pointer is coarse. Pass `"table"` or `"stacked"` to fix the form. See
[Mobile and touch](./concepts/mobile.md).

## Build a resource detail

Keep the selected UID, query, and tab ids in the host, in the URL when they must survive a reload.
Resolve the tabs once per render with `resolveResourceDetailTabs`, pass the result to the shell, and
switch the tab body on the same result, so the highlighted tab and the body always agree:

```tsx
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import {
  resolveResourceDetailTabs,
  type ResourceDetailTabDefinition,
} from "@dev-mainsequence/command-center-sdk/resource";
import {
  EntitySummary,
  ResourceDetailShell,
} from "@dev-mainsequence/command-center-sdk/views";

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

export function ServiceDetail({ service }: { service: Service }) {
  const [tab, setTab] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const { activeSubTab, activeTab, tabs } = resolveResourceDetailTabs(serviceTabs, {
    activeSubTabId: section,
    activeTabId: tab,
    resource: service,
  });

  return (
    <ResourceDetailShell<Service>
      breadcrumbs={[
        { id: "services", label: "Services", onSelect: () => navigate("/services") },
        { id: service.uid, label: service.name },
      ]}
      activeTabId={activeTab?.id}
      activeSubTabId={activeSubTab?.id}
      onTabChange={setTab}
      onSubTabChange={setSection}
      renderBreadcrumbLead={({ current }) => (current ? <ServiceIcon service={service} /> : null)}
      renderTabLead={({ tab: detailTab }) => <ServiceTabIcon tabId={detailTab.id} />}
      tabs={tabs}
      tabsLabel="Service sections"
      headerActions={<Button onClick={() => openEditDialog(service)}>Edit</Button>}
      summary={
        <EntitySummary
          summary={{
            entity: { id: service.uid, type: "service", title: service.name },
            badges: [{ key: "status", label: service.status }],
            inline_fields: [],
            highlight_fields: [],
            stats: [],
          }}
        />
      }
    >
      {activeTab?.id === "overview" ? <ServiceOverview service={service} /> : null}
      {activeTab?.id === "logs" ? <ServiceLogs service={service} /> : null}
      {activeTab?.id === "releases" ? <ServiceReleases service={service} view={activeSubTab?.id} /> : null}
      {activeTab?.id === "settings" ? <ServiceSettings service={service} /> : null}
    </ResourceDetailShell>
  );
}
```

The shell owns breadcrumbs, summary placement, action placement, tabs, transitions, and errors.
Tab contents remain domain-owned. Use an embedded `ResourceListPage` for a related collection. Use
the shell for any page about one object with a summary and sections, even when the object is not a
listed resource: the `summary` slot takes any node. `renderBreadcrumbLead` puts a leading visual,
usually the object's own icon, before a breadcrumb's label; it receives the crumb, its index, and
whether it is the current (last) crumb, and renders `aria-hidden` so the label stays the name.

### Tabs

The shell owns the tab semantics, so a detail never needs its own tab strip. Do not add roles, key
handlers, or `tabIndex` to tabs, and do not fake tabs with a row of `Button`s that swap variants.

- **Keyboard.** Each strip is one Tab stop. ArrowLeft and ArrowRight move focus between tabs
  (reversed in a right-to-left layout), Home and End jump to the ends, and Enter, Space, or a click
  selects. Focus alone never selects, because a tab's body usually loads data. The content is the
  strip's `tabpanel`, labelled by the selected tab and sub-tab.
- **Hidden and disabled tabs.** `isVisible` removes a tab; `disabled` keeps it visible and
  focusable but not selectable. Both can be functions of the resource, and they run only inside
  `resolveResourceDetailTabs` once `resource` is neither `null` nor `undefined`, so a deep link keeps
  its tab while the record loads. When the requested tab is hidden, disabled, or unknown, the result
  selects the first enabled tab and sets `fallback`. Show the resolved tab and leave the URL alone.
  Sub-tabs follow the same rules; with no requested sub-tab, the first enabled one is selected.
- **Icons.** `renderTabLead` draws a leading visual, usually an icon, for each tab; its `level`
  says whether the tab is primary or secondary. It renders `aria-hidden`, so the label stays the
  tab's name, and an `svg` lead is sized to 1rem. Keep it pure: it also renders in a hidden
  measurement copy and in the More menu.
- **Overflow.** `tabsOverflow` decides how tabs that do not fit are reached. The default, `auto`,
  moves them into a trailing **More** menu when the pointer is fine and lets the strip scroll
  sideways, with edge shadows, when it is coarse. The selected tab always stays in the strip,
  swapped into the last visible slot when needed, and a tab chosen from More receives focus once
  your state selects it. Pass `"menu"` or `"scroll"` to force one behaviour. Server-rendered HTML
  uses the scrolling strip until the browser has measured it.
- **Names.** `tabsLabel` names the primary strip for assistive technology (default "Detail
  sections"); a secondary strip is named after its tab.

On a phone the tab strip scrolls sideways with edge shadows and keeps the selected tab in view
without scrolling the page, the summary's facts fall into two columns with values allowed to wrap,
and a field's `info` opens on tap instead of hover. Pass `tablePresentation="auto"` to an embedded
list so it stacks too.

`headerActions`, tab-content forms, and status markers use `Button`, `Field`, `Input`, `Textarea`,
and `Badge` from [`/controls`](./application-controls.md); the detail shell owns the chrome around
them.

## Build a resource picker

`ResourcePicker` is controlled and has distinct single, multiple, and action modes. Pass
`presentation="auto"` so it opens as a bottom sheet on phones and as a popover elsewhere; the sheet
follows the on-screen keyboard and keeps 44px rows. The SDK's own pickers already do this.

```tsx
import { ResourcePicker } from "@dev-mainsequence/command-center-sdk/views";

<ResourcePicker
  mode="single"
  ariaLabel="Owner"
  searchable
  value={ownerUid}
  onValueChange={setOwnerUid}
  options={users.map((user) => ({
    value: user.uid,
    label: user.name,
    subtitle: user.email,
    disabled: !user.active,
  }))}
/>;

<ResourcePicker
  mode="action"
  triggerLabel="Actions"
  options={[
    { value: "archive", label: "Archive", tone: "danger" },
    { value: "duplicate", label: "Duplicate" },
  ]}
  onAction={(action) => runAction(action)}
/>;
```

Fetching stays outside the picker. Pass normalized options and controlled values. The component
owns keyboard navigation, focus return, search, loading/empty presentation, and portal placement.

When a picker is one field of a form, wrap it in `Field` from `/controls` and pass
`useFieldControlProps()` to its trigger so its label, description, error, and required state are
wired like every other control. See [Application controls](./application-controls.md).

## Choose many items side by side

A picker is right for a few choices in a compact field. When people choose many items from a long
list and need to see what they chose, use `ResourceTransferList`: the items not chosen on one side,
the chosen ones on the other, each side searchable, with buttons that move the marked items or every
shown item across. It is a primitive, not a feature: the application decides what the items are,
what choosing them means, and when a change is saved.

An access editor, for example, composes one list for users and one for teams under each access
level, and turns each change into the requests its backend expects:

```tsx
import { ApplicationCard } from "@dev-mainsequence/command-center-sdk/layout";
import {
  ResourceTransferList,
  type ResourceTransferChange,
} from "@dev-mainsequence/command-center-sdk/views";

export function ViewAccessEditor({ access, users, teams }: ViewAccessEditorProps) {
  return (
    <ApplicationCard header={<h3>Can view</h3>}>
      <ResourceTransferList
        itemLabel="users"
        description="Chosen users can view this object."
        options={users.map((user) => ({
          value: user.uid,
          label: user.name,
          subtitle: user.email,
          // An owner always has access: shown as chosen, and never removed.
          disabled: user.uid === access.ownerUid,
          meta: user.uid === access.ownerUid ? "Owner" : undefined,
        }))}
        value={access.viewUserUids}
        onValueChange={(value, change: ResourceTransferChange) => saveViewUsers(value, change)}
      />
      <ResourceTransferList
        itemLabel="teams"
        options={teams.map((team) => ({ value: team.uid, label: team.name, meta: `${team.memberCount} members` }))}
        value={access.viewTeamUids}
        onValueChange={(value, change) => saveViewTeams(value, change)}
      />
    </ApplicationCard>
  );
}
```

- **Controlled.** `value` is the chosen values in order; `onValueChange` receives the next value and
  what moved (`{ added, removed }`), so the application can send exactly those changes. A chosen
  value with no option is kept in the value and not shown, so the list never removes what it
  cannot display.
- **Locked choices.** A `disabled` option cannot be marked or moved. Among the chosen items it reads
  as a choice that always holds, such as an owner; say why in its `meta` or `subtitle`.
- **Keyboard.** Each list is one Tab stop. The arrow keys, Home, and End move focus; Space marks
  the focused item; Shift with an arrow extends the marks; Ctrl or Cmd with A marks every shown
  item, and again clears them; Enter moves the marked items, or the focused one, across. A
  double-click moves one item. After a move, focus stays in the list, on the next item that
  remains, and a status message announces what moved.
- **Search.** Each side filters by label, subtitle, meta, and keywords. "Add all shown" and "Remove
  all shown" move only what the search shows, and only shown marks move.
- **Names.** `itemLabel` is a plural noun that names the lists ("Available users"), their
  searches, and the move buttons ("Add selected users"). `availableLabel` and `selectedLabel`
  change the two headings; `description` sits under both lists and is announced with them.
- **Phones.** `presentation="auto"` (the default) stacks the lists below `sm`, with the move
  buttons between them pointing down and up; `"columns"` and `"stacked"` fix the form. Rows are at
  least 44px on a coarse pointer, and each list scrolls inside a fixed height.
- **Read only.** `disabled` keeps the lists browsable and searchable and moves nothing.
- **Saving.** Pass `pending` while your application saves a change: both lists are marked busy and
  nothing moves until it clears, while people can still browse, search, and mark. Show the change
  you are saving as the `value` meanwhile, and put the saved value back if the save fails.

## Add actions

There are three ownership paths:

- Consumer-owned list actions use `primaryActions` and `rowActions`.
- Consumer-owned detail actions render through `ResourceDetailShell.headerActions`.
- Backend-owned bulk actions are advertised through the normalized adapter.

When `discovery` is configured on `createHttpResourceAdapter`, the SDK reads `bulk_actions` from
the same canonical response that supplies list identity, controls, and columns. It preserves
`explicit` versus `all_matching` selection, runs advertised preflight, renders confirmation/options,
prevents blocked execution, executes the action, refreshes, and clears selection.

A discovery response looks like this:

```json
{
  "contract": "command-center.resource_discovery@v1",
  "resource": {
    "id": "records",
    "label": "Records",
    "item_label": "record",
    "identity": { "fields": ["uid"] }
  },
  "list": {
    "controls": {
      "search": { "placeholder": "Search records", "fields": ["name", "uid"] },
      "filters": [],
      "ordering": ["name"]
    },
    "columns": [
      {
        "id": "name",
        "header": "Record",
        "default_visible": true,
        "hideable": false,
        "sortable_key": "name"
      }
    ]
  },
  "bulk_actions": [
    {
      "id": "archive",
      "label": "Archive records",
      "endpoint": "/records/actions/archive/",
      "preflight_endpoint": "/records/actions/archive/preflight/",
      "method": "POST",
      "tone": "danger",
      "selection_modes": ["explicit", "all_matching"],
      "confirmation": {
        "title": "Archive records",
        "word": "ARCHIVE",
        "button_label": "Archive",
        "warning": "Archived records are unavailable."
      },
      "options": []
    }
  ]
}
```

Action endpoints must be safe relative paths. The identity tuple is for UI reconciliation; explicit
bulk selection continues to use the resource definition's public UUIDs. Never replace backend
discovery with one hardcoded toolbar button per action, and never call execution directly to bypass
confirmation or preflight.

Every consumer-provided action element is `Button` from `/controls`: `variant="primary"` for the one
primary action, `variant="danger"` plus explicit copy for destructive work, and `pending` while the
action is in flight. Do not render a raw `<button>` or restyle the SDK's own action buttons.

## What to test

- Raw API fixtures normalize into stable identity and authoritative pagination.
- Discovery fixtures validate identity, strict controls, ordered local/generic columns, and actions.
- Pagination changes do not refetch stable discovery; semantic query/scope changes do.
- Abort signals cancel stale list and activation requests.
- Lists cover loading, error, empty, no-results, search, filters, sort, paging, and refresh.
- Details cover loading/error, summary, actions, flat/nested tabs, and controlled navigation, plus
  keyboard focus (arrows move, Enter selects), hidden and disabled tabs, a deep link to a hidden
  tab, and the More menu at a narrow width.
- Pickers cover keyboard interaction, disabled options, search, portal placement, and every used
  mode.
- Transfer lists cover marking and moving by keyboard and pointer, "all shown" with a search, locked
  (disabled) choices, the change your application saves, and the stacked form on a phone.
- Bulk actions cover explicit/all-matching selection, options, allowed/blocked/error preflight,
  stale requests, successful refresh, and selection cleanup.
