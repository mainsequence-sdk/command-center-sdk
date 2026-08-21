# Resource Views

This module contains reusable React presentation for Command Center-style resource applications.
`index.ts` is the public entrypoint. Views consume normalized models and callbacks rather than
application endpoints or global stores.

`ResourceListPage` owns the standard list header, primary-action placement, debounced search,
controlled filters, server sort state, authoritative pagination, current-page selection,
all-matching selection, discovered bulk-action lifecycle, and table states. Applications provide a
resource definition, adapter, custom cells, and narrow contribution slots; there is deliberately no
whole-page or whole-toolbar renderer. `discoveredRowActions` lets a standard row button invoke one
of the backend-discovered selection actions for that row's explicit ID, so it reuses the same
confirmation, options, optional preflight, execution, and refresh lifecycle as a multi-row action.
Discovery `controls.filters` entries are query-capability metadata and never render inputs. The
standard toolbar exposes one search input. Explicit, host-authored `filterDefinitions` render only
when product design requires a separate scope selector; their labels remain available to assistive
technology while the visible select stays on the same control row as search and the result count.
Applications should not recreate this toolbar layout. Set
`refreshable` when the collection should expose the framework-owned toolbar refresh control;
consumers do not need to build a parallel refresh row or manage a reload token.

When an adapter implements `discover`, `ResourceListPage` loads
`command-center.resource_discovery@v1` separately from collection rows. Discovery owns the title,
item label, searchable/filterable/sortable vocabulary, visible column order and headings, UI
identity, and bulk actions. Collection requests continue to own rows and authoritative pagination.
Changing pages does not refetch stable discovery; changing search, filters, host scope, or refresh
state does. Stale collection and discovery requests are independently aborted and ignored.

`filterDefinitions` may keep a host-owned scope selector controlled or provide richer option rows
for a filter key that discovery advertises; discovery alone never creates the selector.
Unmatched host definitions are application context controls, not backend-discovered filters. They
must correspond to an explicitly accepted hidden scope parameter and must never be inferred from
arbitrary endpoint query support.
`ResourcePicker` is the canonical SDK selection primitive. Its controlled `single`, `multiple`,
and `action` modes share one trigger, searchable option presentation, keyboard behavior, supporting
copy, custom value/option renderers, loading state, and top/bottom placement contract. Popups are
portaled and fixed-positioned so resource cards, tables, dialogs, and selection bars cannot clip or
reflow them. Application components should adapt their data to this primitive instead of building
another dropdown implementation or exposing a browser-native select with different styling.
Selection actions are presented through the `ResourceBulkActionPicker` adapter, labeled “Actions”
and placed beside the selection count on the left; resource screens must not add one button per
discovered bulk action. The adapter and `ResourceSearch` use `ResourcePicker` action mode, while
`ResourceListPage` filter definitions use single mode, so selection menus and list filters have one
interaction and accessibility contract across SDK surfaces.
Hosts can provide `renderBulkActionConfirmation` when their application owns the canonical modal
system. The SDK retains discovery, selection, preflight, execution, error, and refresh behavior;
the host renderer supplies only the established confirmation presentation.
Without a host renderer, `ResourceListPage` uses the exported
`ResourceActionConfirmationDialog`. This is the canonical SDK confirmation surface: it portals
above list overflow, locks background scrolling, handles Escape, requires exact confirmation text,
and applies the discovered `default`, `primary`, `warning`, or `danger` tone to the full modal
header, border, icon, notice, and confirmation action. Consumers must pass the backend-discovered
tone through instead of restyling only the submit button or creating another modal.
Advertised preflight runs as soon as confirmation opens and reruns whenever the canonical selection
or an advertised option changes. Stale requests are aborted and ignored. The confirmation action
stays disabled until the current result is allowed; blocked results, warnings, matched counts,
per-item impacts, transport errors, and retry state render through the exported
`ResourceBulkActionPreflightPanel`. A host confirmation renderer receives the same typed preflight
state, retry callback, and `canConfirm` gate and must preserve that lifecycle.
Blocked preflight is a terminal confirmation state: the SDK hides the confirmation input, replaces
the destructive action label with “Action blocked”, and keeps a hard guard in the execution
lifecycle even when a host renderer calls its callback incorrectly. Advertised options remain
available because changing one may legitimately produce a new preflight result.

When a resource definition declares `activation`, `ResourceListPage` owns row interaction, pending
and error feedback, stale-request cancellation, and delivery of the resolved semantic open intent.
The consuming host supplies `navigation.open`; therefore SDK resource definitions stay reusable and
contain no application routes. `onRowActivate` remains an explicit override for genuinely custom
workflows and takes precedence when both contracts are provided. Asynchronous activation replaces
the list with the SDK-owned `ResourceTransitionShell` until navigation completes; it never inserts
an opening-feedback row into the collection. Failures restore the list and render the normal error
feedback.

`DataTable`, `ResourceCardGrid`, `ResourceToolbar`, `ResourceSelectionCheckbox`, and
`ResourcePagination` are also exported for workflow screens that need a smaller SDK-owned building
block. `DataTable.isRowSelectable` lets a registry omit bulk-selection controls for rows that lack
the stable identifier required by its bulk contract. `ResourceTransitionShell` is the reusable
blocking state for resource-to-resource handoffs. `ResourceIconLabelCell` and `ResourceStatusCell`
provide standard rich-cell composition through a column's `renderCell` extension point. Resource
applications supply their own icons, labels, metadata, and semantic tones; the SDK supplies the
layout and visual language without learning application-specific resource types.
Use `embedded` for the same list lifecycle inside a detail tab, `pollIntervalMs` for
authoritative read-only registries that need polling, and `renderCard` for card-oriented resources.
Browser-ready styles ship in the package-level `styles.css` and consume theme variables supplied by
the host.

`ResourceDetailShell` is the controlled detail framework. It owns breadcrumbs, action placement,
blocking loading and error states, summary placement, the detail content container, flat tabs, and
optional primary/secondary nested tabs. The host owns tab state, routing, queries, mutations, and
tab bodies. `EntitySummary` and `CollapsedEntitySummary` render normalized backend-neutral summary
data; hosts contribute icons, link handling, editing, label mutations, and notifications through
callbacks. No view in this module knows a consumer endpoint or application-owned search parameter.
