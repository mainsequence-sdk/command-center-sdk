---
title: Public API map
description: Choose the supported package entrypoint for each SDK capability.
---

# Public API map

The package export map is the compatibility boundary. Import from the narrowest documented
subpath; do not import repository source files or generated `dist` paths.

## Install and runtime requirements

```bash
npm install @dev-mainsequence/command-center-sdk react react-dom
```

The package is ESM and ships TypeScript declarations. React and React DOM are peer dependencies in
the supported range declared by the installed package (`>=18 <20` in version 0.4). Keep one React
runtime in the consuming application.

For browser UI, load theme variables before component styles once near the application entrypoint:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

JavaScript imports do not inject global CSS. Optional skins and utilities are separate so unused
framework integrations do not affect the application.

## Entry points by concept

| Import | Runtime | Use it for |
| --- | --- | --- |
| Package root | Framework-neutral | Compatibility re-export of the resource API; prefer `/resource` in new code |
| `/resource` | Framework-neutral | Definitions, adapters, discovery parsing, pagination, activation, and bulk-action helpers |
| `/resource/react` | React | Loaded-page and explicit/all-matching selection hooks |
| `/views` | React + DOM | Resource lists, details, pickers, tables, cards, summaries, pagination, and action UI |
| `/navigation` | React + DOM | Navigation definitions, depth-one panel shell, depth-two rail + panel shell, responsive drawers/triggers, and the host-side immersive bar and navigation drawer |
| `/navigation/testing` | Browser automation adapter | Embedded shell startup, navigation-depth, and no-child-topbar conformance |
| `/layout` | React + DOM | Page, header, stack, card, responsive card-grid primitives, and the viewport seam |
| `/layout/testing` | Browser automation adapter | Real-browser geometry verification and conformance reports |
| `/feedback` | React + DOM | Activity indicators, ordered progress stages, and application status screens |
| `/controls` | React + DOM | Buttons, badges, labels, labelled fields, inputs, and textareas that share the SDK control contract |
| `/theme` | Framework-neutral; one DOM helper | Presets, tokens, CSS-variable generation/application, density, surfaces, breakpoints, and chart palettes |
| `/theme/presets` | Framework-neutral | Individual built-in preset objects |
| `/theme/data-viz` | Framework-neutral | Data-visualization palette types and resolvers |
| `/embed` | Browser | Static-site message contracts, host/client lifecycle, delegated HTTP access, and native FastAPI WebSockets |
| `/embed/react` | React + DOM | Managed `StaticSiteIframe` host component |
| `/contracts` | Framework-neutral | Ordered migration helper for versioned SDK payloads |
| `/contracts/manifest.json` | JSON | Canonical backend contract catalog |
| `/contracts/schemas/*` | JSON Schema | Versioned language-neutral contract schemas |
| `/contracts/fixtures/valid/*` | JSON | Positive conformance examples |
| `/contracts/fixtures/invalid/*` | JSON | Targeted rejection examples |

## Resource API

Import definitions and adapters from `/resource`:

```ts
import {
  createHttpResourceAdapter,
  createResourcePaginationModel,
  defineResourceApplication,
  parseResourceDiscovery,
  type ResourceAdapter,
  type ResourceApplicationDefinition,
  type ResourceListRequest,
  type ResourceListResult,
} from "@dev-mainsequence/command-center-sdk/resource";
```

The module has no React dependency. Use it in clients, normalizers, tests, and server-capable code
that does not execute browser APIs.

React selection state is intentionally separate:

```ts
import {
  useResourceBulkSelection,
  useResourceSelection,
} from "@dev-mainsequence/command-center-sdk/resource/react";
```

Resource presentation comes from `/views`:

```ts
import {
  DataTable,
  EntitySummary,
  ResourceDetailShell,
  ResourceListPage,
  ResourcePicker,
} from "@dev-mainsequence/command-center-sdk/views";
```

See [Resource applications](./concepts/resource-applications.md) for how the layers compose and
[Resources](./resources.md) for task-level examples.

## Application chrome

Navigation is controlled and router-neutral:

```ts
import {
  ApplicationNavigationPanelShell,
  ApplicationNavigationShell,
  composeNavigationApplications,
  defineNavigationApplication,
  type NavigationIntent,
} from "@dev-mainsequence/command-center-sdk/navigation";
```

Use no navigation shell for one destination, `ApplicationNavigationPanelShell` for one work area
with multiple destinations, and `ApplicationNavigationShell` only for multiple independent work
areas. Complete embedded children use `presentation="auto"`; depth-two shells add
`overlayTrigger="floating"`. They never render child top navigation.

Browser tests assert the selected depth and startup gate through the framework-neutral testing
entrypoint:

```ts
import { assertCommandCenterApplicationShell } from
  "@dev-mainsequence/command-center-sdk/navigation/testing";
```

Layout primitives own standard page geometry:

```ts
import {
  ApplicationCard,
  ApplicationCardGrid,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "@dev-mainsequence/command-center-sdk/layout";
```

Application-level feedback is a separate controlled surface:

```ts
import {
  ApplicationStatusScreen,
  ProgressStageList,
  type ProgressStageDefinition,
} from "@dev-mainsequence/command-center-sdk/feedback";
```

Actions and labelled fields share one sizing, focus, and theme contract through `cc-control`:

```ts
import {
  Badge,
  Button,
  Field,
  Input,
  Textarea,
  useFieldControlProps,
} from "@dev-mainsequence/command-center-sdk/controls";
```

## Theme API and CSS

Use `/theme` for preset selection and programmatic values:

```ts
import {
  applyThemePresetToRoot,
  getThemeCategoricalPalette,
  resolveCommandCenterThemeById,
} from "@dev-mainsequence/command-center-sdk/theme";
```

Available CSS exports are:

| CSS import | Purpose |
| --- | --- |
| `/theme/styles.css` | Required theme variables and base browser typography |
| `/styles.css` | SDK component styling |
| `/theme/tailwind.css` or `/tailwind.css` | Tailwind v4 variable mapping |
| `/theme/utilities.css` | Optional SDK utility classes |
| `/theme/fonts.css` | Shared font-stack variables |
| `/theme/markdown.css` | Optional `.command-center-markdown` skin |
| `/theme/ag-grid.css` | Optional AG Grid skin |

Do not import every optional file by default. See [Themes](./themes.md) for ordering, persistence,
closed-token rules, and visual verification.

## Embed API

The framework-neutral browser client and host are available from `/embed`:

```ts
import {
  createStaticSiteIframeClient,
  createStaticSiteIframeHost,
  resolveStaticSiteIframeOrigin,
  STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
  StaticSiteFastApiWebSocketError,
} from "@dev-mainsequence/command-center-sdk/embed";
```

React hosts normally use the managed component:

```ts
import { StaticSiteIframe } from "@dev-mainsequence/command-center-sdk/embed/react";
```

The surface includes the version-one context handshake, delegated FastAPI HTTP bridge, and the
one-time WebSocket ticket bridge. Hosts inject `resolveFastApiWebSocketTicket`; children call
`createFastApiWebSocket` and receive a native socket, not a raw ticket. The SDK reserves
`mainsequence.ws-bridge.v1` as the non-secret successful-handshake acknowledgement. See
[Static-site embeds](./static-site-embeds.md) for binding, cancellation, CSP, negotiation, and
lifecycle rules.

## Backend contract bundle

Non-TypeScript implementations start at the manifest:

```js
import manifest from "@dev-mainsequence/command-center-sdk/contracts/manifest.json" with {
  type: "json",
};
```

The manifest identifies contract roles, stable schema IDs, TypeScript mappings, and indexed valid
and invalid fixtures. Resolve schema paths through the manifest instead of copying a path from a
guide. See [Backend contracts](./backend-contracts.md).

## Public versus internal paths

Supported:

```ts
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";
```

Unsupported:

```ts
// Generated output is not a declared consumer entrypoint.
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/dist/views/ResourceListPage.js";

// Repository source layout is not a package contract.
import { ResourceListPage } from "../node_modules/@dev-mainsequence/command-center-sdk/src/views/ResourceListPage";
```

If a useful symbol is not reachable through `package.json` exports, it is not public even if its
source file is visible. Use an existing extension seam or propose a narrow SDK export.

## Compatibility rules

Treat the following as stable once released:

- export subpaths and exported identifiers;
- contract, schema, navigation, resource, theme, and protocol IDs;
- serialized field names and version meanings;
- persisted theme IDs and documented persisted values; and
- CSS variable names advertised as the consumer theme contract.

Adding an optional TypeScript prop may be backward-compatible. Removing an export, changing a
serialized meaning, or renaming a stable ID is not. Contract changes also require runtime parsing,
schemas, fixtures, migration or mixed-version behavior, and backend coordination.

For package-source work, follow [Extending and releasing](./extending-and-releasing.md).
