---
title: Resource applications
description: Learn the resource definition, adapter, discovery, identity, selection, and action model.
---

# Resource applications

A resource application is the SDK's reusable model for browsing and acting on a domain collection.
It is deliberately broader than a table: the same definition can drive a list, detail transition,
picker, card presentation, and backend-discovered bulk actions.

Four pieces work together:

```text
ResourceApplicationDefinition<T, Id>
├── identity and presentation metadata
├── trusted local columns and activation
├── ResourceAdapter<T, Id>
│   ├── collection and detail data
│   ├── optional discovery
│   └── optional action preflight/execution
└── React view
    ├── ResourceListPage
    ├── ResourceDetailShell
    └── ResourcePicker
```

## Definition: stable local meaning

Create a definition with `defineResourceApplication`. Its generic `T` is the normalized row shape
used by the frontend; it does not need to match the backend response envelope.

```ts
import { defineResourceApplication } from "@dev-mainsequence/command-center-sdk/resource";

interface Service {
  uid: string;
  name: string;
  status: "active" | "paused";
}

export const serviceResource = defineResourceApplication<Service, string>({
  id: "services",
  label: "Services",
  itemLabel: "service",
  getId: (service) => service.uid,
  columns: [
    { id: "name", header: "Name", getValue: (service) => service.name },
    { id: "status", header: "Status", getValue: (service) => service.status },
  ],
  adapter: serviceAdapter,
});
```

The definition is a trusted frontend registry. Column renderers are executable application code;
the backend may select and order registered columns, but it cannot send React code. Keep IDs stable
and unique because controlled state and discovery reconcile by ID.

## Adapter: normalize transport into SDK models

The adapter is the only resource layer that needs to understand an API's transport shape. At
minimum, `list` returns items plus authoritative `pageInfo`:

```ts
const serviceAdapter = {
  async list({ pageIndex, pageSize, search, signal }) {
    const response = await serviceClient.list({ pageIndex, pageSize, search, signal });

    return {
      items: response.results,
      pageInfo: {
        pageIndex,
        pageSize,
        totalItems: response.count,
        hasNextPage: response.next !== null,
        hasPreviousPage: response.previous !== null,
      },
    };
  },
};
```

Do not derive a server total or final-page decision from the number of rows currently loaded. An
empty page and an unknown total are different facts; the adapter must preserve what the server
authoritatively knows.

Use `createHttpResourceAdapter` when endpoints and normalization functions are enough. Implement
`ResourceAdapter` directly when the application uses GraphQL, RPC, a query client, local storage,
or a transport with different cancellation semantics.

## Collection and discovery are separate

Collection data answers “which rows match this query now?” Discovery answers “what is this
resource surface allowed to expose for this user and scope?” They change for different reasons and
therefore have separate requests and caches.

| Collection owns | Discovery owns |
| --- | --- |
| Rows | Resource and item labels |
| Authoritative pagination | UI identity fields |
| Current sort result | Available search/filter/sort vocabulary |
| Query-specific values | Visible column order, headings, and importance |
| Read errors and refresh | Caller-authorized bulk actions |

Page changes refetch the collection but not stable discovery. Search, filters, explicit host scope,
or manual refresh may affect both. Stale requests are independently aborted and ignored.

Discovery is not an arbitrary UI schema. A generic backend column is usable only when it provides
a safe `value_path` and supported `data_type`. Rich cells still come from trusted local column
definitions. Discovery filter entries describe accepted query capabilities; they do not create
product-specific controls by themselves.

## Identity has two jobs

The SDK keeps UI identity separate from bulk-action identity.

- Discovery identity fields form an ordered JSON tuple used to reconcile rows. A compound identity
  such as namespace plus name is never joined with an ambiguous delimiter.
- `getId` returns the public `Id` used by selection and explicit action payloads. Existing bulk
  contracts commonly use a UUID even when the UI needs a compound identity.

Do not silently substitute one for the other. If a row lacks the stable ID required for bulk
execution, render it as non-selectable.

## Activation is an intent, not a route

Some list rows can open directly from `getId`; others require an asynchronous lookup. The optional
activation adapter resolves the row into a semantic intent:

```ts
activation: {
  async resolve(service, { signal }) {
    const target = await serviceClient.resolveCanonicalTarget(service.uid, { signal });
    return { resource: "services", uid: target.uid };
  },
}
```

`ResourceListPage` owns pending feedback, aborting stale activation, restoring the list on failure,
and handing the result to `navigation.open`. The host owns the final URL transition. Do not put
router calls inside the resource definition.

## Selection is an explicit state model

Loaded-page checkbox state and server-wide action scope are not the same concept:

- `useResourceSelection` tracks selected IDs among loaded rows.
- `useResourceBulkSelection` represents either explicit IDs or `all_matching` plus the canonical
  query that defines the set.

An all-matching selection must not be expanded from the current page. The backend evaluates the
canonical query under current authorization at execution time.

## Bulk actions form one lifecycle

Backend-discovered actions are not just buttons. The SDK coordinates a fixed lifecycle:

```text
discovery
  → selection mode and options
  → confirmation opens
  → optional preflight
  → allowed or blocked
  → execution
  → refresh
  → selection cleanup
```

The action endpoint and optional preflight endpoint must be safe relative paths. An advertised
preflight reruns when selection or action options change. Stale results are ignored, a blocked
result cannot execute, and a successful execution refreshes the authoritative collection.

Applications may provide the canonical modal renderer, but that renderer receives the same
preflight state and `canConfirm` guard. It must not bypass the lifecycle. Consumer-owned primary,
row, and detail actions remain separate because their policy is local rather than discovered.

## Pick the right view

Use `ResourceListPage` for the standard collection lifecycle. Use `embedded` when the exact same
list belongs inside another composition. Use `renderCard` to change row presentation without
discarding search, paging, discovery, selection, and actions.

Use smaller `/views` primitives only for a genuinely different workflow. Once an application
assembles `DataTable`, `ResourceSearch`, and `ResourcePagination` itself, it owns their state
coordination, loading and error behavior, and accessibility.

`ResourceDetailShell` owns detail chrome and controlled tabs, not data fetching. `ResourcePicker`
owns selection interaction, not option loading. This is the same boundary throughout the SDK:
views own reusable interaction; the host owns domain effects.

## Contract boundary

The npm package ships language-neutral schemas and fixtures for collection normalization,
discovery, bulk-action execution, and preflight. Backends should start from
`contracts/manifest.json`, not TypeScript source or copied examples. See
[Backend contracts](../backend-contracts.md) for roles and versioning.

## Common mistakes

- Fetching inside cell renderers or picker option renderers.
- Reading authentication or router globals from a resource definition.
- Treating loaded-row count as the server total.
- Building filters solely because discovery advertises a key.
- Refetching discovery on every page change.
- Concatenating compound identity fields into a string.
- Calling a discovered execution endpoint without confirmation or advertised preflight.
- Recreating the entire list lifecycle to change one cell or action.

For implementation examples, continue to [Resources](../resources.md).
