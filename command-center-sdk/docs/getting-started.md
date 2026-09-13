---
sidebar_position: 2
title: Getting started
description: Install the SDK and render a complete resource screen through public entrypoints.
---

# Getting started

This tutorial installs the SDK, defines a backend-neutral resource, renders the standard list
lifecycle, and places it inside an SDK page. At the end you will have a useful screen—not only a
successful import.

If you first need the architectural vocabulary, read [SDK architecture](./concepts/sdk-architecture.md).
For the complete export inventory, use the [public API map](./public-api.md).

## 1. Install the package

Run installation from the consuming application's Git and npm root:

```bash
npm install @dev-mainsequence/command-center-sdk react react-dom
```

Main Sequence Vite applications keep `package.json`, `package-lock.json`, `.env`, `.agents/`,
`src/`, and `vite.config.*` at that root. Do not create a nested `frontend/` application.

React and React DOM are peer dependencies. Keep one compatible React runtime in the host.

## 2. Load theme and component styles

Import global SDK CSS once near the browser entrypoint, with theme variables first:

```ts
// src/main.tsx
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

The theme stylesheet establishes semantic variables. Component styles consume those variables.
Do not repeat these imports in individual screens.

## 3. Define a normalized resource

The resource definition is backend-neutral. It describes stable identity, labels, columns, and the
adapter that returns SDK models:

```tsx
// src/services/service-resource.ts
import { defineResourceApplication } from "@dev-mainsequence/command-center-sdk/resource";

export interface Service {
  uid: string;
  name: string;
  status: "active" | "paused";
}

export const services = defineResourceApplication<Service, string>({
  id: "services",
  label: "Services",
  itemLabel: "service",
  getId: (service) => service.uid,
  activation: {
    resolve: (service) => ({ resource: "services", uid: service.uid }),
  },
  columns: [
    { id: "name", header: "Name", getValue: (service) => service.name },
    { id: "status", header: "Status", getValue: (service) => service.status },
  ],
  adapter: {
    async list({ pageIndex, pageSize, search, signal }) {
      const query = new URLSearchParams({
        offset: String(pageIndex * pageSize),
        limit: String(pageSize),
        ...(search ? { search } : {}),
      });

      const response = await fetch(`/api/services?${query}`, { signal });
      if (!response.ok) throw new Error("Services could not be loaded.");

      const body = (await response.json()) as {
        count: number;
        results: Service[];
      };

      return {
        items: body.results,
        pageInfo: {
          pageIndex,
          pageSize,
          totalItems: body.count,
          hasNextPage: (pageIndex + 1) * pageSize < body.count,
          hasPreviousPage: pageIndex > 0,
        },
      };
    },
  },
});
```

In production, route `fetch` through an application-owned client so authentication headers, base
URLs, retries, and error normalization remain outside the definition. Always pass the provided
`signal`; stale list requests must not overwrite current state.

`pageInfo` is authoritative. Do not infer a server total or next page from the number of rows in
the current response.

## 4. Render the standard list lifecycle

```tsx
// src/services/ServicesPage.tsx
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";

import { services } from "./service-resource";

export function ServicesPage() {
  return (
    <ResourceListPage
      definition={services}
      searchable
      searchPlaceholder="Search services"
      refreshable
      pageSize={25}
      navigation={{
        open: ({ uid }) => {
          window.location.assign(`/services/${encodeURIComponent(uid)}`);
        },
      }}
    />
  );
}
```

`ResourceListPage` now owns loading, failure, empty and no-results states, debounced search,
authoritative pagination, refresh, row activation, and stale-request handling. Your application
still owns the URL change and backend policy.

Do not wrap the list in a second toolbar, pager, selection bar, or loading system. Extend it through
columns, cells, filters, actions, `renderCard`, and the documented narrow contribution props.

## 5. Put the screen in an application page

```tsx
import {
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "@dev-mainsequence/command-center-sdk/layout";

import { ServicesPage } from "./services/ServicesPage";

export function ServicesRoute() {
  return (
    <ApplicationPage maxWidth="wide">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Operations"
          title="Services"
          description="Inspect runtime state and open a service."
        />
        <ServicesPage />
      </ApplicationPageStack>
    </ApplicationPage>
  );
}
```

The layout surface owns responsive page gutters, width, header wrapping, and section rhythm. The
resource view owns its internal collection layout. Avoid adding another padded page wrapper or
ordinary card around the entire list.

## 6. Add only the concepts you need

Choose the highest-level surface that already owns the workflow:

| Requirement | Start with | Guide |
| --- | --- | --- |
| Resource list, detail, picker, or actions | `/resource`, `/resource/react`, `/views` | [Resources](./resources.md) |
| Application hierarchy and destinations | `/navigation` | [Navigation](./navigation.md) |
| Responsive pages and cards | `/layout` | [Application layout](./application-layout.md) |
| Startup, retry, or terminal failure | `/feedback` | [Application feedback](./application-feedback.md) |
| Theme presets, tokens, and chart colors | `/theme` | [Themes](./themes.md) |
| Application-owned cross-origin UI | `/embed`, `/embed/react` | [Static-site embeds](./static-site-embeds.md) |
| Language-neutral backend payloads | Contract manifest and schemas | [Backend contracts](./backend-contracts.md) |

Definitions, adapters, controlled props, and narrow renderers are the normal extension seams.
Change SDK source only when missing behavior is reusable, backend-neutral, and useful across
consumers.

## 7. Verify the integration

At minimum, run the consuming application's typecheck, unit tests, and production build. Exercise
the screen at narrow and wide viewports and cover loading, error, empty, populated, search, paging,
refresh, and row activation states.

For standard page geometry, use the real-browser verifier:

```ts
import {
  assertCommandCenterPageLayout,
} from "@dev-mainsequence/command-center-sdk/layout/testing";

await assertCommandCenterPageLayout(page);
```

If publishing behavior or package contents matter, install an `npm pack` tarball into a clean
fixture. Workspace symlinks do not prove that declarations, CSS, schemas, fixtures, or docs are in
the published artifact.

## Use public imports only

Supported:

```ts
import { createHttpResourceAdapter } from "@dev-mainsequence/command-center-sdk/resource";
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";
```

Unsupported:

```ts
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/dist/views/ResourceListPage.js";
```

The installed package's `package.json` exports and `.d.ts` files are authoritative. A source file
or proposed ADR is not automatically a public API.

## Install current agent guidance

Package installation copies version-matched SDK skills to `.agents/skills/command-center/`. When
lifecycle scripts were disabled, refresh them explicitly:

```bash
npx command-center-sdk skills install --path . --dry-run
npx command-center-sdk skills install --path .
```

Use `skills sync` when backend-owned platform guidance must also be refreshed. Credential and
ownership details are in [Application operations](./application-operations.md).

## Initialize application documentation

Preview and create the official same-artifact documentation system from the application root:

```bash
npx command-center-sdk application docs init --path . --dry-run
npx command-center-sdk application docs init --path .
```

It adds an end-user help landing, a schema-version-2 manifest whose hierarchy derives the docs
folders from the visible application menu, and a `/docs/` Docusaurus build inside the same `dist/`
artifact. Continue with [Application documentation](./application-documentation.md) before
authoring feature and task pages.

## Inspect or update the installed SDK

Keep declared, locked, installed, npm `wanted`, and registry `latest` versions distinct:

```bash
npx command-center-sdk application sdk-status --path .
npx command-center-sdk application update-sdk --path . --dry-run
npx command-center-sdk application update-sdk --path .
```

The update respects the current declaration and does not commit, tag, push, deploy, or change the
application version. See [Application operations](./application-operations.md) for drift and
constraint-blocked cases.

## Sync a code repository for automatic deployment

When every working-tree change is ready for one release, preview the deployment synchronization:

```bash
npx command-center-sdk code-repository sync -m "Update the application" --path . --dry-run
```

Preflight sends the canonical Git origin, attached branch, and exact `HEAD` commit to the backend;
an optional code-repository UID is only an assertion. The dry run previews the next npm patch
version and checks the exact `refs/tags/<backend tag>` on `origin` before local mutation.

The non-dry run versions, installs, stages the complete working tree, commits, tags, and explicitly
pushes the resolved branch and backend-owned tag with `--atomic --follow-tags`. Read the complete
[Application operations](./application-operations.md) runbook before using it.
