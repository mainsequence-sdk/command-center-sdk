---
name: build-command-center-application
description: Design, build, migrate, or review a Command Center-compatible application and select the correct @dev-mainsequence/command-center-sdk surfaces before implementation. Use when deciding how a standalone or embedded application should compose application navigation, resource lists, custom and discovered actions, resource details, widgets, workspaces, themes, backend contracts, and application-level or widget-level iframe integration. Route each selected surface to its focused implementation skill without redefining SDK contracts.
---

# Build A Command Center Application

## Establish The Application Boundary

Treat a Command Center application as application-owned routes rendered inside the main Command
Center. The main Command Center owns global navigation, application selection, account and global
settings UI, session chrome, and global branding. Do not reproduce its left navigation, top
navigation, settings module, account controls, or application switcher inside the child
application.

For a standalone product shell, or for navigation genuinely owned inside the child application,
use the public `/navigation` hierarchy and controlled React primitives. They provide an expandable
application rail, grouped sub-applications, and destinations without owning routes or access
policy. When embedded in the main Command Center, do not mirror the host's applications in a
second rail; model only the child's own internal hierarchy.

Make these cross-cutting decisions first:

1. Integrate the complete application through the application-owned `mainsequence.*` version-one
   ready/initialize protocol. Route this work to `$integrate-static-site-iframe`. This embedding is
   the default for a Command Center application, not an optional alternative to its internal
   pages. When the application calls a FastAPI ResourceRelease, use that same skill's delegated
   `fetchFastApi` workflow instead of inventing authentication or postMessage behavior.
2. Apply SDK tokens, presets, typography, density, surface hierarchy, data visualization, and
   packaged styles through `$theme-command-center-app`. Treat its closed-token audit as a required
   build gate whenever the base theme stylesheet is imported.
3. Compose complete route gutters, headers, top-level section rhythm, cards, and responsive card
   grids through `$compose-command-center-page`. Keep its browser geometry verifier separate from
   the semantic theme audit.
4. Route application-wide startup, prerequisite, reconnection, and terminal recovery feedback to
   `$build-application-loading-flow`. Keep readiness transport and retry policy in the application.
5. Create and maintain human and technical application documentation through
   `$document-command-center-application`. Ship it at `/docs/` inside the same static artifact and
   verify its deep links in the application's real-browser suite.
6. Keep authentication, API clients, routing, permissions, notifications, persistence, and domain
   rules in the application or its backend. Inject them through published SDK extension points.
7. Inspect the installed package version, exports, and declarations through
   `$use-command-center-sdk` before selecting an implementation.

Do not confuse the complete-application protocol with the generic external-widget iframe
protocol. Use `$embed-command-center-app` only when a separately hosted widget inside the
application needs typed props, inputs, outputs, user state, sizing, or scoped capabilities across
the `command-center-iframe@v1` boundary.

## Choose The Internal Surface

Choose the highest-level composition that owns the required lifecycle:

| Requirement | SDK surface | Focused skill |
| --- | --- | --- |
| Application rail with grouped sub-applications | `/navigation` controlled primitives | This skill |
| Complete route gutters, header, section rhythm, cards, and card grids | `/layout` primitives | `$compose-command-center-page` |
| Blocking application startup, reconnection, or prerequisite progress | `/feedback` controlled primitives | `$build-application-loading-flow` |
| Domain-object collection | `ResourceListPage` | `$build-resource-list` |
| One domain object with summary, actions, and sections | `ResourceDetailShell` | `$build-resource-detail` |
| Searchable single or multiple choice | `ResourcePicker` | `$build-resource-picker` |
| List, row, detail, or bulk operation | Resource action contracts | `$add-resource-actions` |
| Portable tabular panel | Table built-in | `$implement-table-widget` |
| Portable tabular panel requiring formulas or an explicitly installed advanced renderer | Pro Table built-in | `$implement-table-widget` |
| One compiled HTTP operation with generated ports | AppComponent built-in | `$implement-app-component` |
| Reusable filter, projection, aggregation, pivot, or merge step | Tabular Transform built-in | `$implement-tabular-transform` |
| Reusable panel with props, settings, IO, preview, or runtime behavior | Existing built-in or custom widget | `$build-command-center-widget` |
| Persisted composition of widget instances, layouts, and bindings | Workspace | `$build-command-center-workspace` |
| External hosted widget crossing a trust boundary | Generic iframe widget | `$embed-command-center-app` |

Do not select a primitive because it can display similar pixels. Select the composition whose
contract owns the behavior, state, and reuse boundary.

## Design Application Navigation

Use `NavigationApplicationDefinition` for a top-level product application,
`NavigationSubApplicationDefinition` for a labeled section or contributed sub-application, and
`NavigationDestinationDefinition` for the actual routed surface. Keep IDs stable and unique.

Use `ApplicationNavigationShell` when the SDK can own the rail/panel layout. Use
`ApplicationRail` and `ApplicationNavigationPanel` separately when the consumer already owns
positioning. `ApplicationRailItem` is the narrow primitive for an existing host rail.

Keep state controlled. Filter inaccessible definitions before render, pass active and open IDs from
the consumer, give every routed application and destination a stable `href`, and translate ordinary
unmodified `NavigationIntent` clicks into the consumer router. The SDK renders routed items as
anchors so Command/Control-click, middle-click, context menus, and copy-link remain browser-native;
do not recreate routed items as callback-only buttons. Use
`defineNavigationContribution` plus `composeNavigationApplications` when one package contributes
a complete sub-application to another package owned application. Do not import another application
registry, router, auth store, or private sidebar components.

## Design Resource Collections

Use `ResourceListPage` for server-backed domain objects when the experience includes pagination,
search, filters, sorting, refresh, selection, row activation, primary actions, row actions, or
bulk actions. Keep the screen as a thin resource definition, adapter, and application controller.

Apply these conventions:

- Activate the resource from its identity or first meaningful column. Do not add a redundant
  `Actions` column containing an `Open` button.
- Put create, import, connect, or another collection-level operation in the list primary-action
  region.
- Use a row action only for a non-navigation operation on one resource.
- Use discovered bulk actions for operations on explicit selection or all matching results.
- Keep the header checkbox scoped to the current page. Offer all matching as a separate explicit
  choice after the page has been selected; never enable it automatically.
- Preserve the active search and filters for all-matching execution.
- Run preflight only when the discovered action advertises it. Rediscover and reauthorize actions
  immediately before execution.
- Use an embedded `ResourceListPage` when the same collection lifecycle appears inside a detail
  tab or another SDK composition.

Route the page composition to `$build-resource-list`, action behavior to `$add-resource-actions`,
and API normalization to `$adapt-resource-backend`.

## Design Resource Details

Use `ResourceDetailShell` for one identified domain object. Compose it from:

- a normalized entity summary and breadcrumbs;
- header actions for operations on the current entity;
- primary tabs for stable top-level sections;
- nested tabs only when a section has a real second-level subdivision;
- related-resource collections rendered with the embedded list composition; and
- domain-specific content contributed inside the standard shell.

Keep tab state controlled by the host router when it must survive navigation or deep links. A
portable analytical panel inside a detail tab may be a widget, but the complete detail route is
not a widget. Route the implementation to `$build-resource-detail`.

## Distinguish Resource Lists From Table Widgets

Use a resource list when each row is a domain object and the screen owns server paging, search,
filtering, sorting, navigation, selection, or resource actions.

Use the Table built-in when tabular values are portable data with widget settings, IO ports,
preview data, bindings, and possible workspace reuse. Use Pro Table only when formulas or the
explicit advanced host renderer are required; row count alone is not a reason to choose it.

Do not replace resource management with a Table or Pro Table widget. Do not embed an application
route inside a widget merely to make it portable.

## Decide When To Use Widgets And Workspaces

Prefer an existing built-in before authoring a custom widget. Inspect Markdown, Statistic, Table,
Pro Table, AppComponent, and Tabular Transform first.

Use a widget when an independently meaningful panel benefits from a stable ID and version,
JSON-safe props, settings, preview fixtures, typed IO, host capabilities, registry discovery, or
reuse inside a workspace. If a panel should eventually be placed, bound, saved, or exported from
a Command Center workspace, make the panel a widget from the start.

Do not turn a complete route, resource-list lifecycle, resource-detail lifecycle, or global
application chrome into a widget. Route custom portable panels to
`$build-command-center-widget`.

Use a workspace only when users persist a composition of multiple widget instances, layouts,
bindings, and presentation state. A workspace is not a replacement for ordinary application
routing or resource CRUD. Route modeling and rendering to `$build-command-center-workspace`.

## Route Backend And Contract Work

Keep the backend independent of application routes and shell placement:

- Normalize an existing API for frontend resource views with `$adapt-resource-backend`.
- Implement the published resource-collection envelope with
  `$implement-resource-collection-contract`.
- Implement discovery, optional preflight, and execution with
  `$implement-bulk-actions-contract`.
- Implement Adapter From API wire contracts with `$implement-adapter-from-api-contract`.
- Implement any other existing language-neutral contract with
  `$implement-command-center-contract`.

Resolve contract IDs, schemas, and fixtures from the installed `contracts/manifest.json`. Never
copy, summarize, fork, or invent serialized schemas inside an application or skill. If the
installed contract cannot represent a genuine requirement, record the installed SDK version, the
exact missing capability, required inputs and outputs, and compatibility impact. Stop that portion
for a separate SDK-source or contract-evolution task; never patch the installed package.

## Produce The Architecture Decision

Before implementation, write a compact decision using this structure:

```text
Application purpose:
Main Command Center embedding:
Theme integration:
Application documentation:
Application-owned routes:
Resource collections:
Resource details:
Action placement:
Portable widgets:
Workspace composition:
Backend adapters/contracts:
Selected focused skills:
Rejected alternatives and reasons:
```

Then load and follow only the focused skills selected by that decision. Do not restate their
contracts or rebuild their owned behavior in this general skill.

## Enforce The Guardrails

- Do not rebuild the SDK list or detail shells.
- Do not use Table or Pro Table for domain-resource management.
- Do not author a custom widget before checking built-ins.
- Do not turn the complete application into a widget.
- Do not ship an undocumented application or a separately versioned documentation artifact.
- Do not treat complete-application iframe integration as optional.
- Do not add an `Open` action column when identity-cell activation exists.
- Do not convert current-page selection into all-matching selection automatically.
- Do not reproduce the main Command Center's global navigation or settings UI.
- Do not recreate published page/card spacing with application-owned panels and sibling margins.
- Do not double-wrap `ResourceListPage` or `ResourceDetailShell` in layout cards.
- Do not duplicate canonical contracts or modify an installed SDK.
- Do not invent theme variables, literal fallbacks, or application-owned replacements for
  published semantic visual tokens.

Verify the finished application against the architecture decision, the installed public exports,
the focused skills, and the consumer typecheck and tests.
