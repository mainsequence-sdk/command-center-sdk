---
name: build-resource-list
description: Build or migrate an object collection with ResourceListPage from @dev-mainsequence/command-center-sdk/views. Use for paginated or refreshable lists, search, declared filters, server sorting, table or card presentation, row activation, selection, common actions, bulk actions, and standard loading, empty, no-results, and error states.
---

# Build A Resource List

## Use The List Framework By Default

Use `ResourceListPage` when the screen represents a collection of domain objects and needs any
combination of pagination, search, filters, sorting, refresh, actions, selection, activation, or
standard async states. This remains true when the visual presentation is cards instead of rows.

Use `embedded` for the same collection lifecycle inside another SDK composition. Do not replace
the normalized collection lifecycle with a lower-level table implementation.

## Read The Exact Contract

Inspect the installed `/resource` and `/views` declarations, `ResourceListPageProps`, and relevant
tests. Do not infer props from another SDK version.

For a canonical backend-driven list, resolve `command-center.resource_discovery@v1` from the
installed `contracts/manifest.json`. Configure `ResourceAdapter.discover(...)` or the HTTP
adapter's `endpoints.discovery`; do not call `/bulk-actions/` or read inline collection metadata as
a fallback. Discovery owns UI identity, visible controls, ordered columns, and authorized actions.
The collection operation remains authoritative for rows and pagination.

## Compose The Collection

1. Define the resource with a stable id, label, public action `getId`, trusted local columns, and a
   normalized adapter. Local columns are rich renderers keyed by discovered column ID.
2. Supply authoritative page information from the adapter. Never infer a server total from loaded
   rows.
3. Render searchable, filterable, and sortable behavior from discovery. Send semantic search,
   visible filters, and declared hidden host scope to discovery, but never pagination or current
   sort presentation.
4. Add frontend primary actions through structured declarations in the page-header region.
5. Add row actions through supported row-action contracts.
6. Route selection and discovered bulk actions through `$add-resource-actions`.
7. Use `renderCard` only to change collection presentation, not collection lifecycle.
8. Use a resource activation adapter to resolve semantic `{ resource, uid }` intents and inject
   host navigation separately. Let `ResourceListPage` use `ResourceTransitionShell` for the
   blocking handoff instead of inserting an opening row or spinner into the table.
9. Use `ResourceIconLabelCell` and `ResourceStatusCell` through column `renderCell` for reusable
   rich identity and status presentation. Supply domain icons, metadata, and semantic tones from
   the consumer rather than forking the cells.
10. Keep UI identity separate from bulk UUID selection. Compound discovery identity is an ordered
    JSON tuple; it is never concatenated or sent as a bulk-action UID.

## Do Not Rebuild Owned Behavior

Do not create a parallel page header, toolbar, search row, result counter, selection bar, action
button strip, pagination footer, confirmation flow, or custom collection loading state. Do not use
a native select or bespoke dropdown for SDK-owned list filters.

Use narrow cell renderers and supported contribution points for domain presentation. Keep endpoint
paths, route state, authentication, and query caching outside the SDK definition.

## Verify

Test loading, error, empty, no-results, pagination, search, filters, sort, refresh, selection,
activation cancellation, transition-shell handoff, rich cells, table/card rendering, and action
refresh. Verify backend column order preserves matching local renderers, generic columns require a
safe `value_path` plus `data_type`, stale discovery is cancelled, and pagination alone does not
refetch discovery. Confirm the screen is a thin resource definition and controller around
`ResourceListPage`.
