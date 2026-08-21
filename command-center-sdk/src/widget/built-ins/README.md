# Command Center Core Widgets

Reusable Markdown, Statistic, AppComponent, Tabular Transform, Table, and Pro Table widget modules exported from
`@dev-mainsequence/command-center-sdk/widget/built-ins`.

Import the extension during host composition and the scoped styles once:

```ts
import {
  CORE_MARKDOWN_NOTE_WIDGET_ID,
  coreWidgetsExtension,
} from "@dev-mainsequence/command-center-sdk/widget/built-ins";
import "@dev-mainsequence/command-center-sdk/widget/built-ins.css";
```

## Entry Points

- `src/markdown/definition.tsx`: Markdown module and legacy-compatible definition export.
- `src/statistic/definition.tsx`: Statistic module and legacy-compatible definition export.
- `src/app-component/`: AppComponent, Mock JSON, portable HTTP execution, and dynamic IO.
- `src/tabular-transform/`: generic tabular transforms and role-aware tabular IO.
- `src/table/table/`: Community Table public module.
- `src/table/pro-table/`: Pro Table public module.
- `src/table/shared/`: shared authoring, IO, renderer, selection, and formula implementation.
- `src/index.ts`: `coreWidgetsExtension`, modules, definitions, ids, and props types.
- `styles.css`: scoped package styles that the host imports once.

## Dependencies

The package depends on contracts, the widget SDK, Markdown rendering libraries, and Lucide icons.
React and React DOM are peers. It does not import Command Center auth, routing, persistence,
execution stores, or application UI components.

## Behavior and Maintenance Constraints

- Widget ids remain `core__markdown-note`, `core__statistic`, `core__app-component`,
  `core__tabular-transform`, `core__table`, and `core__pro-table`.
- Every definition uses its local `USAGE_GUIDANCE.md` as catalog and registry guidance.
- Every definition provides a complete preview fixture.
- Statistic consumes `core.tabular_frame@v1` resolved inputs; the host remains responsible for
  executing or streaming the upstream source.
- AppComponent includes Mock JSON and a portable no-auth HTTP transport. Trusted authentication,
  internal gateways, and product resource pickers stay in host runtime adapters.
- Tabular Transform owns generic filter, aggregate, pivot, unpivot, computed-column, projection,
  and latest-row merge behavior over canonical tabular frames.
- Table and Pro Table share `command-center.table_widget_authoring@v1`, canonical tabular IO,
  selection outputs, and formula semantics. The portable renderer does not require AG Grid.
- Command Center composes richer native rendering, managed-source, incremental-data, and snapshot
  behavior through `withWidgetRuntimeOverrides(...)`; the portable package runtime remains usable
  in other hosts without application imports.
- Keep CSS scoped under `.cc-core-widget`.

## Widget Documentation

- [Markdown Note](./src/markdown/README.md) and
  [usage guidance](./src/markdown/USAGE_GUIDANCE.md)
- [Statistic](./src/statistic/README.md) and
  [usage guidance](./src/statistic/USAGE_GUIDANCE.md)
- [AppComponent](./src/app-component/README.md) and
  [usage guidance](./src/app-component/USAGE_GUIDANCE.md)
- [Tabular Transform](./src/tabular-transform/README.md) and
  [usage guidance](./src/tabular-transform/USAGE_GUIDANCE.md)
- [Table and Pro Table](./src/table/README.md) and
  [usage guidance](./src/table/USAGE_GUIDANCE.md)

Every added widget must keep its module, local README, usage guidance, preview fixture, IO,
migrations, tests, and exported identity aligned. Do not add an application-coupled widget merely
to increase this package's catalog size.

## Validation

The SDK build produces the portable JavaScript and declarations. The SDK size check enforces bundle
budgets, while SDK tests validate both modules and preview fixtures.

## Backend and Storage Impact

The extraction retains widget ids, props, runtime classification, IO contracts, and registry
guidance. It introduces no new required persisted fields and no registry schema-version bump.

## Architecture Documentation

- [Legacy-package migration](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/migrating-from-legacy-packages.md)
- [Widget SDK](../README.md)
