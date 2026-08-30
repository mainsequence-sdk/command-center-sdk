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

## Build a resource detail

Keep the selected UID, query, and tab state in the host. Pass normalized presentation into the
shell:

```tsx
import {
  EntitySummary,
  ResourceDetailShell,
} from "@dev-mainsequence/command-center-sdk/views";

export function ServiceDetail({ service }: { service: Service }) {
  const [tab, setTab] = useState("overview");

  return (
    <ResourceDetailShell<Service>
      breadcrumbs={[
        { id: "services", label: "Services", onSelect: () => navigate("/services") },
        { id: service.uid, label: service.name },
      ]}
      activeTabId={tab}
      onTabChange={setTab}
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "releases", label: "Releases" },
      ]}
      headerActions={<button onClick={() => openEditDialog(service)}>Edit</button>}
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
      {tab === "overview" ? <ServiceOverview service={service} /> : <ServiceReleases service={service} />}
    </ResourceDetailShell>
  );
}
```

The shell owns breadcrumbs, summary placement, action placement, tabs, transitions, and errors.
Tab contents remain domain-owned. Use an embedded `ResourceListPage` for a related collection.

## Build a resource picker

`ResourcePicker` is controlled and has distinct single, multiple, and action modes:

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

## What to test

- Raw API fixtures normalize into stable identity and authoritative pagination.
- Discovery fixtures validate identity, strict controls, ordered local/generic columns, and actions.
- Pagination changes do not refetch stable discovery; semantic query/scope changes do.
- Abort signals cancel stale list and activation requests.
- Lists cover loading, error, empty, no-results, search, filters, sort, paging, and refresh.
- Details cover loading/error, summary, actions, flat/nested tabs, and controlled navigation.
- Pickers cover keyboard interaction, disabled options, search, portal placement, and every used
  mode.
- Bulk actions cover explicit/all-matching selection, options, allowed/blocked/error preflight,
  stale requests, successful refresh, and selection cleanup.
