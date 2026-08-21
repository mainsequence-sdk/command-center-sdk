# SDK ADR 002: Controlled Application Navigation

- Status: Accepted
- Date: 2026-08-21
- Owners: Command Center SDK Navigation
- Package: `@dev-mainsequence/command-center-sdk`
- Related: [Application navigation](../navigation.md)

## Decision summary

The SDK publishes a runtime-only application navigation model and controlled React primitives at
`/navigation`. The hierarchy is application → sub-application → destination. The SDK renders an
expandable application rail, a grouped destination panel, and a composed shell while consumers
retain routing, authentication, permissions, persistence, favorites, branding, and product
actions.

## Context

Command Center already had a useful left rail and grouped application panel, but the implementation
was private to the host. Other SDK consumers could not create the same interaction without copying
host code and coupling themselves to React Router, the Command Center registry, or its Zustand
store.

The reusable boundary is the interaction and hierarchy, not the product registry. Icons are React
components and navigation actions are callbacks, so this API is not a JSON-safe backend contract.

## Decision

1. Publish `NavigationApplicationDefinition`, `NavigationSubApplicationDefinition`,
   `NavigationDestinationDefinition`, contributions, and route-neutral `NavigationIntent` values.
2. Validate stable non-empty IDs and labels, unique destination IDs per application, valid default
   destinations, valid contribution targets, and collision-free composition.
3. Sort composed applications, sub-applications, and destinations deterministically by `order`,
   label, then ID before they reach consumer renderers.
4. Publish `ApplicationRail`, `ApplicationRailItem`, `ApplicationNavigationPanel`, and
   `ApplicationNavigationShell` as controlled React components.
5. Keep routers, auth clients, permission stores, app registries, favorites, user menus, and
   branding out of the SDK module. Consumers filter inaccessible definitions and translate intents
   into routes.
6. Use existing SDK theme tokens and the shared `/styles.css`; do not create a second navigation
   theme system.
7. Keep the model runtime-only. A future backend-authored navigation contract requires a separate
   JSON-safe model and compatibility decision instead of serializing React icons or callbacks.

## Consequences

- Standalone products can render Command Center-consistent multi-application navigation.
- The Command Center host can consume the public renderer while preserving its product policy.
- Extension packages can contribute sub-applications without importing host internals.
- Consumers must explicitly own route state and permission filtering; the SDK will not infer them.
