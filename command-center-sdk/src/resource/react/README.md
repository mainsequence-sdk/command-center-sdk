# Resource React State

This module contains React state helpers for resource applications. `index.ts` is its public
entrypoint and exports `useResourceSelection` for loaded-page selection plus
`useResourceBulkSelection` for the distinct explicit/all-matching server-action scope.

Hooks operate only on normalized resource values. They must not import application stores, query
clients, routers, or backend transports.

## Loaded-page selection

`useResourceSelection(items, getId, initialSelectedIds)` tracks selection only among the currently
supplied items. When `items` changes, IDs no longer present are removed. This is appropriate for a
table checkbox model whose selected rows must remain visible.

```tsx
const selection = useResourceSelection(services, (service) => service.uid);

<DataTable
  items={services}
  columns={serviceColumns}
  getId={(service) => service.uid}
  isSelected={selection.isSelected}
  allSelected={selection.allSelected}
  someSelected={selection.someSelected}
  onToggleAll={selection.toggleAll}
  onToggleSelection={selection.toggleSelection}
/>;
```

The hook returns `selectedIds`, `selectedItems`, `selectedCount`, `allSelected`, `someSelected`,
`isSelected`, `toggleSelection`, `toggleAll`, `setSelection`, and `clearSelection`. Duplicate IDs
passed to `setSelection` are normalized. `getId` must be stable and return the same public ID used
by the view.

## Server-wide bulk selection

`useResourceBulkSelection` represents the canonical action scope:

```tsx
const bulk = useResourceBulkSelection<string>();

bulk.setExplicitSelection(["service-a", "service-b"]);
bulk.selectAllMatching({
  search: "critical",
  filters: { status: "active" },
});
```

The state is either `null`, `{ mode: "explicit", uids }`, or
`{ mode: "all_matching", query }`. An all-matching selection is not the loaded page expanded into
IDs; it is a query the backend evaluates under current authorization. The hook reports
`isAllMatching`, `explicitIds`, and `isSelected`, and provides setters plus `clearSelection`.

## Ownership and reset rules

These hooks manage transient interaction state, not persistence. Clear selection after a successful
bulk action and whenever a user, authorization scope, resource definition, or incompatible query
context changes. Do not store an all-matching selection in local storage or reuse it under another
session.

`ResourceListPage` already coordinates both selection models with discovery, preflight, execution,
refresh, and cleanup. Use the hooks directly only when assembling a different workflow from public
primitives.

## Maintenance constraints

- Keep this module dependent only on React and the framework-neutral resource contracts.
- Preserve the distinction between visible loaded-page selection and server-wide action scope.
- Test item replacement, removed IDs, duplicate normalization, empty pages, explicit selection,
  all-matching query preservation, cleanup, and stable callback use.
- Serialized bulk selection changes belong in `/resource` plus the versioned schema and fixtures;
  these hooks must not invent another wire shape.
