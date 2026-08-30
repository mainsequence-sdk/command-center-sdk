---
sidebar_position: 1
title: Command Center SDK
---

# Build with the Command Center SDK

`@dev-mainsequence/command-center-sdk` gives you the reusable parts of a Command Center
application: navigation, responsive page layout, staged application feedback, resource lists and
details, pickers and actions, widgets, workspaces, themes, and secure iframe bridges. Your
application keeps control of authentication, API clients, routes, persistence, permissions, and
product-specific behavior.

If you are new to the SDK, start with [Getting started](./getting-started.md). It installs the
package and renders a real resource list in a few minutes.

## Choose what you are building

| I want to… | Human guide | Installed skill path |
| --- | --- | --- |
| Install the SDK | [Getting started](./getting-started.md) | `general/use-command-center-sdk` |
| Version, commit, and trigger automatic code repository deployment | [Getting started](./getting-started.md#sync-a-code-repository-for-automatic-deployment) | `general/maintain-command-center-code-repository` |
| Design, route, and add application navigation | [Application navigation](./navigation.md) | `general/build-command-center-application` |
| Create, validate, and ship application documentation at `/docs/` | [Application documentation](./application-documentation.md) | `documentation/document-command-center-application` |
| Compose and verify a complete responsive page | [Application layout](./application-layout.md) | `layout/compose-command-center-page` |
| Build staged application startup or reconnection feedback | [Application feedback](./application-feedback.md) | `feedback/build-application-loading-flow` |
| Build a paginated list | [Resources](./resources.md#build-a-resource-list) | `views/build-resource-list` |
| Build a detail page | [Resources](./resources.md#build-a-resource-detail) | `views/build-resource-detail` |
| Add a searchable selector | [Resources](./resources.md#build-a-resource-picker) | `views/build-resource-picker` |
| Add list, row, detail, or bulk action UI | [Resources](./resources.md#add-actions) | `views/add-resource-actions` |
| Adapt an HTTP or custom backend in a frontend | [Resources](./resources.md#adapt-a-backend) | `resource/adapt-resource-backend` |
| Implement any existing language-neutral contract | [Backend contracts](./backend-contracts.md) | `contracts/implement-command-center-contract` |
| Implement canonical resource-list discovery | [Backend contracts](./backend-contracts.md#resource-list-discovery-and-bulk-action-lifecycle) | `contracts/implement-command-center-contract` |
| Implement the normalized resource collection | [Backend contracts](./backend-contracts.md) | `contracts/implement-resource-collection-contract` |
| Implement bulk-action discovery and execution | [Backend contracts](./backend-contracts.md) | `contracts/implement-bulk-actions-contract` |
| Implement Adapter From API contracts | [Backend contracts](./backend-contracts.md#adapter-from-api-ownership) | `contracts/implement-adapter-from-api-contract` |
| Implement Table or Pro Table | [Table and Pro Table](./table-and-pro-table.md) | `widget/built-ins/implement-table-widget` |
| Implement AppComponent or Mock JSON | [Widgets and workspaces](./widgets-and-workspaces.md#implement-appcomponent) | `widget/built-ins/implement-app-component` |
| Implement a Tabular Transform | [Widgets and workspaces](./widgets-and-workspaces.md#implement-tabular-transform) | `widget/built-ins/implement-tabular-transform` |
| Author a portable custom widget | [Widgets and workspaces](./widgets-and-workspaces.md#build-a-custom-widget) | `widget/build-command-center-widget` |
| Compose widget extensions in a host | [Widgets and workspaces](./widgets-and-workspaces.md#host-widgets) | `widget/host-command-center-widgets` |
| Normalize, snapshot, or render a workspace | [Widgets and workspaces](./widgets-and-workspaces.md#build-a-workspace) | `workspace/build-command-center-workspace` |
| Apply a theme | [Themes and embeds](./themes-and-embeds.md#theme-an-application) | `theme/theme-command-center-app` |
| Embed an external widget | [Themes and embeds](./themes-and-embeds.md#embed-an-external-widget) | `embed/embed-command-center-app` |
| Embed an application-owned static site | [Themes and embeds](./themes-and-embeds.md#embed-an-application-owned-static-site) | `embed/integrate-static-site-iframe` |

The table is intentionally kept in one-to-one alignment with the consumer skills shipped in the
npm package. SDK-maintainer workflows are package-local and are not installed into applications.
The `implement-*` skills operate only in the consuming application. When an installed contract is
insufficient, they report the exact gap and stop; SDK functionality or serialized contracts change
only in a separate source-maintenance task.

## Install

```bash
npm install @dev-mainsequence/command-center-sdk react react-dom
```

Import the browser styles once near your application entrypoint:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

The SDK ships standard ESM and TypeScript declarations. It does not require Vite; any compatible
bundler can consume the public exports.

## The boundary in plain language

The SDK owns reusable UI and lifecycle. Your application owns product policy.

| SDK owns | Your application owns |
| --- | --- |
| List/detail/picker composition and async states | URLs, routing, query caching, and notifications |
| Normalized adapter interfaces | Authentication, base URLs, headers, and product-specific adaptation |
| Widget manifests, runtime contracts, and host registry | Which extensions are trusted, installed, and permitted |
| Workspace normalization, snapshots, and read-only rendering | Storage, editing workflows, sharing, and publication |
| Theme presets, variables, and CSS | Persisting the user's theme preference |
| Iframe message validation and lifecycle | Origin allowlists, CSP, launch tokens, and backend authorization |
| Navigation hierarchy, composition, and controlled React chrome | Routes, permission filtering, favorites, branding, and product actions |
| Page gutters, section rhythm, cards, grids, and layout verification | Domain-specific layouts, section ordering, and product state |
| Status/progress presentation, responsive behavior, and accessible announcements | Readiness APIs, polling, retry/timeout policy, cancellation, and reconnection |

Do not import from `dist`, repository source paths, or another application's private modules. If a
public surface is missing, keep one-off behavior in the consumer or follow
[Extending and releasing](./extending-and-releasing.md) for genuinely reusable SDK behavior.

## Public entrypoints

- `/navigation`: controlled application rail, grouped sub-application panel, composed shell,
  definitions, validation, and contribution composition.
- `/layout` and `/layout/testing`: complete-application page, header, stack, card, and grid
  primitives plus real-browser geometry verification.
- `/feedback`: controlled application status, ordered progress-stage, and activity-indicator
  primitives.
- `/resource` and `/resource/react`: framework-neutral resource definitions/adapters and React
  selection state.
- `/views`: `ResourceListPage`, `ResourceDetailShell`, `ResourcePicker`, summaries, tables, cards,
  pagination, and action UI.
- `/contracts`: JSON-safe widget, runtime-data, value, migration, tabular-frame, Table/Pro Table,
  AppComponent/Mock JSON, Tabular Transform, workspace-document, and Adapter From API contracts.
- `/contracts/manifest.json`, `/contracts/schemas/*`, and `/contracts/fixtures/*`: draft-2020-12
  JSON Schemas and conformance fixtures for backend teams.
- `/widget`, `/widget/host`, `/widget/testing`, and `/widget/ui`: widget authoring, composition,
  validation, and controls.
- `/widget/built-ins` plus narrow `/widget/built-ins/app-component`,
  `/widget/built-ins/tabular-transform`, `/widget/built-ins/table`, and
  `/widget/built-ins/pro-table`: portable built-ins and their contract-specific entrypoints.
- `/workspace` and `/workspace/react`: workspace documents, normalization, snapshots, migrations,
  and read-only rendering.
- `/theme`, `/theme/presets`, and `/theme/data-viz`: presets, variables, density, surfaces, and
  chart palettes.
- `/embed` and `/embed/react`: generic external-widget and application-owned static-site iframe APIs.
- `/styles.css` and `/theme/*.css`: browser-ready styles.

Read the installed package's `package.json` export map when working against a specific version. An
ADR or a newer checkout may describe an API that your installed version does not have.

## Agent skills

Installing the package copies version-matched skills to
`.agents/skills/command-center/` while preserving the nested SDK-surface hierarchy. Category
directories organize discoverable skill leaves and do not contain their own `SKILL.md`. To refresh
them after an upgrade or when lifecycle scripts were disabled, run:

```bash
npx command-center-sdk skills install --path .
```

Use `--dry-run` to inspect changes and `--json` for machine-readable output. The packaged-skill
lane manages only the `command-center` namespace; keep application-specific skills in another
directory.

The package also understands the backend-owned MCP platform catalog. When the npm lifecycle has an
MCP URL plus `MAINSEQUENCE_ACCESS_TOKEN`, postinstall makes a nonblocking refresh under
`.agents/skills/mainsequence/`. Use the explicit strict workflow when platform guidance must be
current:

```bash
npx command-center-sdk skills sync --path .
npx command-center-sdk skills sync --path . --dry-run --json
```

`skills sync` refreshes both namespaces and exits nonzero on authentication, transport, manifest,
or ownership failure. `MCP_PINNED_FROM.txt` records only the MCP folders managed in the
`mainsequence` namespace; application-owned siblings and the Python SDK's `PINNED_FROM.txt` are
preserved.

Contract skills always resolve the installed `contracts/manifest.json`. The manifest is the
canonical JSON catalog and indexes the authoritative schemas and fixtures; skills and Markdown
guides must not reproduce those definitions.

## Current scope

The package currently provides read-only workspace rendering, not a public workspace editor or
persistence service. Adapter From API serialized contracts are published from `/contracts`, but
connection UI, authentication, and transport execution remain consumer-owned. The docs describe
only exports available in this package version.
