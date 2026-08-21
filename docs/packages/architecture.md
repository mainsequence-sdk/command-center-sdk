# Package Architecture and Dependency Rules

## Current public topology

```text
@dev-mainsequence/command-center-sdk
  /
  /contracts and language-neutral schema paths
  /embed and /embed/react
  /navigation
  /resource and /resource/react
  /views
  /widget, /widget/host, /widget/built-ins, /widget/testing, and /widget/ui
  /workspace and /workspace/react
  /theme, /theme/data-viz, and /theme/presets
  public CSS subpaths

Foundry + AI + Workspaces + Connections + Admin + Teams + external applications
  -> SDK public subpath exports
```

Subpaths preserve dependency and bundle boundaries inside one public package. Consumers must not
install a graph of separately versioned Command Center foundation packages.

The former `command-center-contracts`, `command-center-widget-sdk`, `command-center-widgets-core`,
`command-center-widget-host`, `command-center-workspace-model`, `command-center-workspace-react`,
`command-center-iframe-bridge`, and `command-center-themes` workspaces have been removed. Their
implementations now live in SDK modules and their replacements are documented in the
[migration guide](./migrating-from-legacy-packages.md).

## Public SDK rules

SDK source may import only:

- declared npm dependencies and peers;
- package-relative modules; and
- another SDK module through a deliberate internal boundary when required by the build.

It must not import the application `@/` alias, traverse outside its package, or depend on
`apps/command-center/`, authentication stores, deployment configuration, or product APIs. React
and React DOM are peers. Router, query, editor, chart, and workspace-layout
integrations belong behind explicit optional subpaths and must not load from the root entrypoint.

`scripts/check-package-boundaries.mjs` enforces these rules for publishable workspaces declared by
the root monorepo manifest. `scripts/validate-public-packages.mjs` additionally fails unless the
public package set is exactly `@dev-mainsequence/command-center-sdk`.

## SDK and application boundary

The SDK owns reusable mechanics and presentation:

- serializable contracts and migrations;
- language-neutral schema discovery, draft-2020-12 JSON Schemas, and conformance fixtures for
  backend/shared payloads;
- extension and surface-contribution contracts;
- resource definitions, normalized adapters, list/detail controllers, actions, forms, and views;
- generic UI primitives and consistent async states;
- widget authoring, registry, runtime, built-ins, guidance, and testing;
- workspace model, renderer, editor engine, graph/layout behavior, and injected persistence APIs;
- connection schemas, registries, authoring views, preview/result contracts, and injected
  transports;
- themes, CSS, palettes, and DOM application helpers; and
- the independently versioned external-widget and static-site iframe protocols, host controllers,
  child clients, and reusable React hosts.

Concrete applications own:

- endpoints, authentication, environment configuration, and backend transports;
- product response normalization and business validation;
- persistence policy and backend publication;
- permissions and application access decisions;
- domain-specific actions and specialized tab bodies;
- concrete routes and redirect policy; and
- global application chrome: sidebar, topbar, settings, account/user menus, notifications,
  branding, and application selection.

For static-site embeds, the SDK owns origin/source validation, ready/initialize parsing, context
delivery, and iframe lifecycle. The application owns launch-URL acquisition, authentication,
selecting the current theme and public user UID, release authorization, and CSP deployment policy.

Resource page shells are SDK functionality even though global application chrome is not. A
Foundry list/detail screen should become a thin resource definition and adapter rendered by SDK
templates rather than a separate application-owned table, summary header, or tab shell.

## Identity and composition

Manifest identifiers, widget IDs, resource contribution IDs, schema versions, and protocol IDs
remain exact and explicit. Package imports have no global registration side effect. Hosts compose
runtime registries and provide capabilities explicitly; backend metadata never supplies executable
native code.

## Storage and backend boundary

Moving implementation into the SDK does not itself change persisted JSON or backend payloads. Any
change to workspace fields, widget props, user state, bindings, runtime references, connection
schemas, registry projection, or iframe capabilities still requires an explicit backend/storage
assessment and deterministic compatibility coverage.

TypeScript declarations are not the backend contract. Public backend/shared JSON payloads must be
indexed in the SDK contract manifest with a stable contract ID and schema `$id`, valid and invalid
fixtures, a matching TypeScript type, and runtime-parser parity where a parser exists.
