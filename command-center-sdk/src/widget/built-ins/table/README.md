# Table And Pro Table Widgets

Portable SDK ownership for `core__table` and `core__pro-table`.

## Entry Points

- `table/`: Community Table module and the published `/widget/built-ins/table` entrypoint.
- `pro-table/`: Pro Table module and the published `/widget/built-ins/pro-table` entrypoint.
- `shared/definition-factory.tsx`: stable shared manifest, IO, preview, and snapshot construction.
- `shared/model.ts`: backend-neutral frame, output, and selection helpers.
- `shared/formula.ts`: grid-independent formula parser shared by both editions.
- `shared/TableWidget.tsx`: portable HTML table renderer and settings surface.
- `USAGE_GUIDANCE.md`: human and registry-facing authoring guidance.

Import the modules and authoring types from published package paths:

```ts
import {
  proTableWidgetModule,
  tableWidgetModule,
  type TableWidgetProps,
} from "@dev-mainsequence/command-center-sdk/widget/built-ins";
```

Consumers that need only one edition can use its narrow subpath:

```ts
import {
  tableWidgetModule,
  type TableWidgetProps,
} from "@dev-mainsequence/command-center-sdk/widget/built-ins/table";

import {
  proTableWidgetModule,
} from "@dev-mainsequence/command-center-sdk/widget/built-ins/pro-table";
```

Both widgets accept `core.tabular_frame@v1`. They share props, dataset publication, selection
outputs, and formula semantics. Pro Table adds formula authoring and reserves Enterprise rendering
capabilities without forking the portable contract.

The built-in renderer has no AG Grid dependency. A trusted host may compose AG Grid Community or
Enterprise components, managed connections, runtime-data retention, and application UI through
`withWidgetRuntimeOverrides(...)`. Those overrides must not change the SDK-owned manifest, IDs,
props meaning, port IDs, or output contracts.

## Backend And Storage Contract

`command-center.table_widget_authoring@v1` is the language-neutral authoring envelope. Its JSON
Schema and fixtures ship under `contracts/`. The envelope identifies Table or Pro Table and carries
the shared persisted props. Hosts may preserve additional props for source adapters, but portable
bound/manual authoring cannot depend on them.

Keep `core__table` backward compatible and `core__pro-table` additive. Bump the appropriate widget
version and contract version when persisted meaning changes. Community code must never import an
Enterprise implementation or license; Pro rendering belongs behind the Pro module or a trusted
host runtime override.
