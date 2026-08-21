---
sidebar_position: 6
title: Table and Pro Table
---

# Build with Table and Pro Table

This guide matches `implement-table-widget`. It configures the existing built-ins and their
published contracts; it does not extend or fork their implementation.

Use the SDK built-ins when a workspace needs a reusable tabular widget. Both editions consume the
canonical `core.tabular_frame@v1` value, preserve the same persisted prop model, and publish the
same dataset and interaction ports.

| Capability | Table | Pro Table |
| --- | --- | --- |
| Widget ID | `core__table` | `core__pro-table` |
| Portable renderer | Yes | Yes |
| Manual or bound data | Yes | Yes |
| Search, formatting, pagination, and selection | Yes | Yes |
| Formula columns | No | Yes |
| Host-supplied Enterprise grid enhancement | No | Yes |

Table and Pro Table are workspace widgets. Use `ResourceListPage` instead when the primary job is
backend pagination, CRUD, row navigation, and resource actions.

## Add the built-ins to a host

The broad built-ins entrypoint supplies a ready-to-compose extension:

```ts
import { coreWidgetsExtension } from "@dev-mainsequence/command-center-sdk/widget/built-ins";
import "@dev-mainsequence/command-center-sdk/widget/built-ins.css";
import { createWidgetRegistry } from "@dev-mainsequence/command-center-sdk/widget/host";

export const widgetRegistry = createWidgetRegistry({
  contributions: [{
    extensionId: coreWidgetsExtension.id,
    packageName: coreWidgetsExtension.packageName,
    packageVersion: coreWidgetsExtension.packageVersion,
    widgets: coreWidgetsExtension.widgets,
  }],
});
```

Use the narrow entrypoints when an extension needs one edition:

```ts
import {
  tableWidgetModule,
  type TableWidgetProps,
} from "@dev-mainsequence/command-center-sdk/widget/built-ins/table";
import {
  proTableWidgetModule,
} from "@dev-mainsequence/command-center-sdk/widget/built-ins/pro-table";
import { defineExtension } from "@dev-mainsequence/command-center-sdk/widget";

export const operationsTables = defineExtension({
  id: "operations-tables",
  title: "Operations tables",
  packageName: "@acme/operations-tables",
  packageVersion: "1.0.0",
  widgets: [tableWidgetModule, proTableWidgetModule],
});
```

Reusing a built-in module keeps the canonical widget identity. If you change the persisted prop
meaning, IO, or lifecycle, create a separately owned widget ID instead of silently forking
`core__table`.

## Author a manual Table

```ts
import type { TableWidgetProps } from "@dev-mainsequence/command-center-sdk/widget/built-ins/table";

export const holdingsTable = {
  tableSourceMode: "manual",
  manualColumns: [
    { key: "symbol", type: "string" },
    { key: "price", type: "number" },
  ],
  manualRows: [
    { symbol: "ALPHA", price: 42.5 },
    { symbol: "BETA", price: 17.25 },
  ],
  schema: [
    { key: "symbol", label: "Symbol", format: "text" },
    { key: "price", label: "Price", format: "currency", decimals: 2 },
  ],
  selectionMode: "single-row",
  selectionKeyFields: ["symbol"],
  publishSelectionOutputs: true,
} satisfies TableWidgetProps;
```

For live data, bind the `seedData` input to a value whose contract is
`core.tabular_frame@v1`. The `dataset` output republishes the canonical frame; display labels,
prefixes, suffixes, heatmaps, and other visuals do not mutate it.

A backend can provide source-owned defaults in `meta.tableVisuals.columns`. That shape is defined
inside `tabular-frame-v1.schema.json`; use the indexed
`tabular-frame-v1.table-visuals.json` fixture as the copyable backend example.

## Add a Pro Table formula

Formula columns are schema columns with `format: "formula"`. They refer to source fields by stable
bracketed names:

```ts
import type { TableWidgetProps } from "@dev-mainsequence/command-center-sdk/widget/built-ins/pro-table";

export const priceMoves = {
  tableSourceMode: "bound",
  formulasEnabled: true,
  schema: [
    { key: "symbol", label: "Symbol", format: "text" },
    { key: "last", label: "Last", format: "number", decimals: 2 },
    { key: "open", label: "Open", format: "number", decimals: 2 },
    {
      key: "changePct",
      label: "Change %",
      format: "formula",
      formulaExpression: "PERCENT_CHANGE([last], [open])",
      formulaResultFormat: "percent",
      decimals: 2,
    },
  ],
} satisfies TableWidgetProps;
```

Formulas authored for one widget are local presentation logic. A reusable transformation needed
by several widgets belongs in an upstream transform that publishes another canonical frame.

## Enhance the runtime in a trusted host

The SDK runtime deliberately has no AG Grid dependency. A product host may use
`withWidgetRuntimeOverrides(...)` to replace the renderer, settings, snapshot, or IO resolvers
with an AG Grid Community or Enterprise implementation. The host owns module registration,
Enterprise licensing, authentication, connection execution, dashboard date ranges, and retained
runtime data.

Runtime overrides must preserve the SDK manifest, widget ID, prop meaning, input/output IDs, and
value contracts. Community imports must never activate Enterprise modules or licensing as a side
effect.

## Backend and tool authoring contract

Backend services and non-TypeScript tooling can validate authored instances against
`command-center.table_widget_authoring@v1`:

```json
{
  "contract": "command-center.table_widget_authoring@v1",
  "widgetId": "core__table",
  "props": {
    "tableSourceMode": "manual",
    "manualColumns": [
      { "key": "symbol", "type": "string" },
      { "key": "price", "type": "number" }
    ],
    "manualRows": [
      { "symbol": "ALPHA", "price": 42.5 }
    ]
  }
}
```

Discover the exact schema and fixtures through
`@dev-mainsequence/command-center-sdk/contracts/manifest.json`. The authoring envelope documents
the persisted widget props; `core.tabular_frame@v1` separately documents the bound data value.

## What to keep compatible

- Keep `core__table` and `core__pro-table` stable.
- Keep shared port IDs and their value contracts stable.
- Add storage fields compatibly; version breaking persisted meaning with a migration plan.
- Update TypeScript, schema, fixtures, human examples, and packaged agent skills together.
- Test the portable runtime and any host override independently.
