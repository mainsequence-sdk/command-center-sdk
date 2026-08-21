---
sidebar_position: 5
title: Widgets and workspaces
---

# Widgets and workspaces

This guide matches the `build-command-center-widget`, `implement-app-component`,
`implement-tabular-transform`, `host-command-center-widgets`, and
`build-command-center-workspace` skills.

A widget is one reusable panel with props, settings, IO, preview, or runtime behavior. A workspace
is a persisted document that composes multiple widget instances, layout, and bindings. Ordinary
object-management screens should use the resource framework instead.

## Build a widget

Check `/widget/built-ins` before creating a custom widget. The SDK already ships Markdown,
Statistic, AppComponent with Mock JSON, Tabular Transform, Table, and Pro Table modules. Import
AppComponent and Tabular Transform through their narrow `/widget/built-ins/app-component` and
`/widget/built-ins/tabular-transform` subpaths when authoring against their types. See
[Table and Pro Table](./table-and-pro-table.md) for copyable authoring, extension, host-override,
and backend-contract examples.

AppComponent turns a compiled HTTP operation into dynamic request and response ports. Its built-in
runtime supports inline Mock JSON and manual no-auth browser requests; authentication and internal
gateway routing require a trusted host runtime adapter. Tabular Transform reshapes canonical
tabular frames without source-specific semantics.

Backends, generators, and non-TypeScript tooling should author these widgets through
`command-center.app_component_authoring@v1` and
`command-center.tabular_transform_authoring@v1`. Their schemas and indexed fixtures ship under
`/contracts`; Mock JSON is included inside the AppComponent authoring contract.

### Implement AppComponent

Reuse the narrow module and author the existing contract. The envelope is useful for a backend,
generator, or tool; a workspace instance stores its `widgetId` and `props` fields.

```ts
import {
  APP_COMPONENT_AUTHORING_CONTRACT,
  type AppComponentAuthoringContractV1,
} from "@dev-mainsequence/command-center-sdk/contracts";
import { appComponentWidgetModule } from "@dev-mainsequence/command-center-sdk/widget/built-ins/app-component";

export const previewOperation = {
  contract: APP_COMPONENT_AUTHORING_CONTRACT,
  widgetId: "core__app-component",
  props: {
    apiTargetMode: "mock-json",
    mockJson: {
      version: 1,
      operation: { method: "get", path: "/preview" },
      response: { status: 200, body: { ready: true } },
    },
  },
} satisfies AppComponentAuthoringContractV1;

void appComponentWidgetModule;
```

Mock JSON is not a separate widget. Manual browser execution remains unauthenticated and subject
to CORS. Inject session authentication or an internal gateway through a trusted host runtime
override without changing the canonical widget ID, props, or generated ports.

### Implement Tabular Transform

Reuse the narrow module, bind exactly one canonical source role, and preserve its matching output
role:

```ts
import {
  TABULAR_TRANSFORM_AUTHORING_CONTRACT,
  type TabularTransformAuthoringContractV1,
} from "@dev-mainsequence/command-center-sdk/contracts";
import { tabularTransformWidgetModule } from "@dev-mainsequence/command-center-sdk/widget/built-ins/tabular-transform";

export const activeRows = {
  contract: TABULAR_TRANSFORM_AUTHORING_CONTRACT,
  widgetId: "core__tabular-transform",
  props: {
    transformMode: "filter",
    filterRules: [{ field: "status", operator: "equals", value: "active" }],
  },
} satisfies TabularTransformAuthoringContractV1;

void tabularTransformWidgetModule;
```

Bind retained `seedData` to `dataset`, or incremental `liveUpdates` to `updates`; never bind both
source roles to one transform. Mode-specific fields and latest-row merge keys must validate against
the installed authoring schema.

### Build a custom widget

New widgets separate a JSON-safe manifest from executable runtime code:

```tsx
import {
  defineExtension,
  defineWidgetModule,
  type WidgetComponentProps,
} from "@dev-mainsequence/command-center-sdk/widget";

interface GreetingProps extends Record<string, unknown> {
  message?: string;
}

function Greeting({ props }: WidgetComponentProps<GreetingProps>) {
  return <p>{props.message?.trim() || "Hello"}</p>;
}

export const greetingWidget = defineWidgetModule<GreetingProps>({
  manifest: {
    id: "acme__greeting",
    widgetVersion: "1.0.0",
    title: "Greeting",
    description: "Displays a short greeting.",
    category: "Examples",
    kind: "custom",
    source: "acme",
    propsVersion: 1,
    userStateVersion: 1,
    registryContract: {
      usageGuidance: {
        buildPurpose: "Show a short static greeting in a workspace.",
        whenToUse: ["A dashboard needs a lightweight text callout."],
        whenNotToUse: ["The content needs rich Markdown or live tabular data."],
        authoringSteps: ["Set the message text."],
      },
    },
  },
  runtime: {
    definition: {
      component: Greeting,
      mockProps: { message: "Hello from the preview" },
    },
  },
});

export const acmeWidgets = defineExtension({
  id: "acme-widgets",
  title: "Acme widgets",
  packageName: "@acme/command-center-widgets",
  packageVersion: "1.0.0",
  widgets: [greetingWidget],
});
```

Use a globally unique `{owner}__{widget}` ID. Keep React components, settings renderers, IO
resolvers, execution hooks, migrations, snapshots, and preview fixtures in `runtime`; only the
manifest is serialized or published to a backend registry.

Every production widget directory should include:

- `README.md` explaining purpose, entrypoints, dependencies, behavior, and constraints;
- `USAGE_GUIDANCE.md` explaining when to use it, when not to use it, props, settings, IO, runtime
  ownership, and examples;
- representative `mockProps` or `exampleProps` that render without live workspace data; and
- tests for rendering, settings, IO, migrations, missing capabilities, and extension exports.

Validate the manifest and preview:

```ts
import {
  assertWidgetPreviewFixture,
  validateWidgetManifest,
} from "@dev-mainsequence/command-center-sdk/widget/testing";

expect(validateWidgetManifest(greetingWidget.manifest)).toEqual([]);
expect(() => assertWidgetPreviewFixture(greetingWidget)).not.toThrow();
```

`defineWidget(...)` is a legacy mixed-definition adapter. Use `defineWidgetModule(...)` for new
packages.

For a complete, typechecked package with tests and `USAGE_GUIDANCE.md`, start from the
[basic widget example](https://github.com/mainsequence-sdk/command-center-sdk/tree/main/examples/basic-widget).

## Host widgets

Hosts explicitly compose trusted extensions. Importing a package does not register executable code
globally:

```ts
import { coreWidgetsExtension } from "@dev-mainsequence/command-center-sdk/widget/built-ins";
import "@dev-mainsequence/command-center-sdk/widget/built-ins.css";
import { createWidgetRegistry } from "@dev-mainsequence/command-center-sdk/widget/host";

const extensions = [coreWidgetsExtension, acmeWidgets];

export const widgetRegistry = createWidgetRegistry({
  contributions: extensions.map((extension) => ({
    extensionId: extension.id,
    packageName: extension.packageName,
    packageVersion: extension.packageVersion,
    widgets: extension.widgets,
  })),
});

const greeting = widgetRegistry.getWidget("acme__greeting");
```

The registry uses exact canonical IDs and fails on collisions. Backend metadata may describe a
widget but cannot provide executable code. Missing, retired, incompatible, or forbidden widgets
must render an unavailable state; never rewrite or delete persisted workspace instances.

Inject navigation, telemetry, runtime data, theme, locale, and other capabilities through the
published runtime/provider contracts. A manifest declaring a capability does not grant it.

## Build a workspace

Normalize untrusted or older JSON before rendering or snapshotting it:

```ts
import {
  normalizeWorkspaceDocument,
  parseWorkspaceSnapshot,
  stringifyWorkspaceSnapshot,
} from "@dev-mainsequence/command-center-sdk/workspace";

const workspace = normalizeWorkspaceDocument({
  id: "operations-overview",
  title: "Operations overview",
  description: "Current operating signals",
  source: "user",
  grid: { columns: 12, rowHeight: 24, gap: 8 },
  widgets: [
    {
      id: "welcome",
      widgetId: "acme__greeting",
      props: { message: "Good morning" },
      layout: { x: 0, y: 0, w: 4, h: 2 },
    },
  ],
});

const exported = stringifyWorkspaceSnapshot(workspace);
const imported = parseWorkspaceSnapshot(exported).workspace;
```

Normalization and snapshots preserve unknown JSON fields and unknown widget IDs. Workspace schema,
widget props, and widget user state have separate version axes. Do not delete an instance because
its runtime is unavailable.

The direct normalized document is published as `command-center.workspace_document@v1` at
`/contracts/schemas/workspace-document-v1.schema.json`. The separate snapshot helpers add the
`command-center-workspace` export wrapper; do not validate that wrapper as a workspace document.

The current React surface is a read-only renderer with injected host adapters:

```tsx
import { WorkspaceRenderer } from "@dev-mainsequence/command-center-sdk/workspace/react";

<WorkspaceRenderer
  workspace={imported}
  adapters={{
    resolveWidget: (widgetId) => widgetRegistry.getWidget(widgetId),
    hasPermission: (permission) => grantedPermissions.has(permission),
    locale: "en",
    onNavigate: (target) => navigate(target),
    onTelemetry: (event) => analytics.track(event.type, event),
  }}
/>;
```

The SDK does not currently publish a workspace editor, persistence service, sharing workflow, or
application shell. Keep those in the host. A persisted workspace, layout, binding, props, user
state, or snapshot shape change must follow the contract-evolution workflow.

## What to test

- Widget manifest JSON safety, semantic version, preview fixture, settings, IO, and migrations.
- Extension provenance, duplicate IDs, exact lookup, unavailable runtime, permission denial, and
  shared React peer behavior.
- Workspace normalization/snapshot round trips, unknown fields, unknown widget IDs, old versions,
  deferred migrations, immutability, permissions, and injected renderer behavior.
