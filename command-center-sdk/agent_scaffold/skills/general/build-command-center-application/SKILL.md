---
name: build-command-center-application
description: Design, build, migrate, or review a complete Command Center-compatible application and select the correct @dev-mainsequence/command-center-sdk surfaces before implementation. Use when deciding production embedding, application-shell and navigation depth, startup readiness, resource lists, actions, details, themes, backend contracts, and iframe integration. Route each selected surface to its focused implementation skill without redefining SDK contracts.
---

# Build A Command Center Application

## Establish The Application Boundary

Treat a production Command Center application as application-owned routes embedded inside the main
Command Center. The main Command Center owns global navigation, application selection, account and
global settings UI, session chrome, and global branding. The child never reproduces the host's
navigation, settings module, account controls, or application switcher. The child must not render a top navigation bar. Standalone mode is an
explicit local development or test harness only, never an alternative production architecture.

Make these cross-cutting decisions first:

1. Integrate the complete application through the application-owned `mainsequence.*` version-one
   ready/initialize protocol. Route this work to `$integrate-static-site-iframe`. This embedding is
   the default for a Command Center application, not an optional alternative to its internal
   pages. For a hosted application calling a FastAPI ResourceRelease, use that same skill's
   delegated `fetchFastApi` workflow. Before implementing top-level local Vite API calls, follow
   that skill's required loopback FastAPI runner, CLI identity, readiness, and `/api` proxy setup;
   local requests need no release UID.
   A non-local direct link is not a hosted iframe: without the validated trusted-host handshake,
   delegated API access is `unsupported`; use an unavailable state or a separately authenticated
   application-owned backend. Never reuse local CLI identity for a deployed direct link.
2. Apply SDK tokens, presets, typography, density, surface hierarchy, data visualization, and
   packaged styles through `$theme-command-center-app`. Treat its closed-token audit as a required
   build gate whenever the base theme stylesheet is imported.
3. Select exactly zero, one, or two levels of application-owned left navigation and compose the
   root shell through `$compose-command-center-application-shell`. This focused workflow owns the
   embedded/no-topbar rule, responsive drawer, and mandatory readiness gate.
4. Compose complete route gutters, headers, top-level section rhythm, cards, and responsive card
   grids through `$compose-command-center-page`. Keep its browser geometry verifier separate from
   the semantic theme audit.
5. Route application-wide startup, prerequisite, reconnection, and terminal recovery feedback to
   `$build-application-loading-flow`. Every complete application gates host context, delegated
   transport/authentication, and critical API readiness before mounting navigation or routes.
6. Create and maintain task-focused end-user application documentation through
   `$document-command-center-application`. Mirror the visible application navigation in its folder
   tree, ship it at `/docs/` inside the same static artifact, and verify its deep links in the
   application's real-browser suite. Keep architecture and implementation material out of the
   served user guide.
7. Keep authentication, API clients, routing, permissions, notifications, persistence, and domain
   rules in the application or its backend. Inject them through published SDK extension points.
8. Inspect the installed package version, exports, and declarations through
   `$use-command-center-sdk` before selecting an implementation.

## Choose The Internal Surface

Choose the highest-level composition that owns the required lifecycle:

| Requirement | SDK surface | Focused skill |
| --- | --- | --- |
| Embedded root shell with zero/one/two-level navigation | `/navigation` shells and `/navigation/testing` | `$compose-command-center-application-shell` |
| Complete route gutters, header, section rhythm, cards, and card grids | `/layout` primitives | `$compose-command-center-page` |
| Blocking application startup, reconnection, or prerequisite progress | `/feedback` controlled primitives | `$build-application-loading-flow` |
| Page and card actions, badges, and labelled fields | `/controls` primitives | `$compose-command-center-controls` |
| Domain-object collection | `ResourceListPage` | `$build-resource-list` |
| One domain object with summary, actions, and sections | `ResourceDetailShell` | `$build-resource-detail` |
| Searchable single or multiple choice | `ResourcePicker` | `$build-resource-picker` |
| List, row, detail, or bulk operation | Resource action contracts | `$add-resource-actions` |

Do not select a primitive because it can display similar pixels. Select the composition whose
contract owns the behavior, state, and reuse boundary.

## Design The Root Before Its Pages

Route root composition to `$compose-command-center-application-shell`. Base navigation depth on
durable destinations: no sidebar for one destination, `ApplicationNavigationPanelShell` for one
cohesive work area with multiple destinations, and rail + panel only for multiple independent work areas that
each contain multiple destinations. Page subdivisions use tabs; never create a third sidebar
level. Do not add filler group labels, a one-item rail, planned disabled primary navigation, or a
top bar to hold the mobile menu button.

The application shell is absent until iframe context/theme, delegated transport/authentication,
and the critical application readiness endpoint all succeed. A host handshake is not sufficient.
On reconnect, return to the viewport status gate. After startup, keep route-local operations in
their owning resource view. The focused shell and feedback skills contain the required component
mapping and browser assertions.

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

Keep tab state controlled by the host router when it must survive navigation or deep links. Route
the implementation to `$build-resource-detail`. Product-specific composition remains in the
consumer application.

## Route Backend And Contract Work

Keep the backend independent of application routes and shell placement:

- Normalize an existing API for frontend resource views with `$adapt-resource-backend`.
- Implement the published resource-collection envelope with
  `$implement-resource-collection-contract`.
- Implement discovery, optional preflight, and execution with
  `$implement-bulk-actions-contract`.
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
Production embedding and local-only standalone policy:
Navigation depth and durable destinations:
Page-local tabs:
Host-context readiness signal:
Delegated-transport readiness signal:
Critical API readiness endpoint:
Retry, timeout, and reconnect policy:
Theme integration:
Application documentation:
Application-owned routes:
Resource collections:
Resource details:
Action placement:
Backend adapters/contracts:
Selected focused skills:
Rejected alternatives and reasons:
```

Then load and follow only the focused skills selected by that decision. Do not restate their
contracts or rebuild their owned behavior in this general skill.

## Enforce The Guardrails

- Do not rebuild the SDK list or detail shells.
- Do not ship an undocumented application or a separately versioned documentation artifact.
- Do not treat complete-application iframe integration as optional.
- Do not render production applications standalone or reproduce the host top navigation.
- Do not mount application navigation or routes before all three readiness stages succeed.
- Do not use a sidebar for one destination, a rail for one work area, filler navigation groups, or
  a third sidebar level.
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
