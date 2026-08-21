# Tabular Transform Built-in

Portable `core__tabular-transform` widget for reshaping `core.tabular_frame@v1` data without a
backend, router, authentication store, or Command Center application singleton.

## Public entrypoint

Import `tabularTransformWidgetModule`, its props and pure model helpers from
`@dev-mainsequence/command-center-sdk/widget/built-ins/tabular-transform`. The broad
`widget/built-ins` entrypoint also includes the module in `coreWidgetsExtension`.

## Behavior

The widget consumes exactly one of `seedData` or `liveUpdates`. It applies filtering, aggregation,
pivot, unpivot, computed columns, projection and optional latest-row merging. The active source role
determines whether `dataset` or `updates` publishes the result.

## Extension boundary

Hosts may use `withWidgetRuntimeOverrides(...)` to provide richer upstream refresh orchestration,
large-data materialization or settings UI. Overrides must retain the package manifest, canonical
ID, props, ports and `core.tabular_frame@v1` semantics.

## Compatibility and backend impact

The extracted module retains widget id `core__tabular-transform`, semantic version `1.3.5`, existing
props and port IDs. It adds no required persisted field and requires no backend storage change.

Cross-language authors should validate the
`command-center.tabular_transform_authoring@v1` envelope through
`contracts/schemas/tabular-transform-authoring-v1.schema.json`. Its fixtures cover filter/formula
and pivot/latest-row configurations as well as incomplete mode-specific configuration. The widget
manifest references the same schema's `$defs.props` definition.
