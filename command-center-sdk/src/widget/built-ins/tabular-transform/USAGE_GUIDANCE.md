## buildPurpose

Transforms one canonical tabular frame through filtering, aggregation, pivoting, unpivoting, computed columns, projection, or latest-row merging and republishes the result.

## whenToUse

- Use when several downstream widgets should share one explicit, reusable tabular transformation.
- Use between a query or stream source and Table, Statistic, Graph, or another transform.

## whenNotToUse

- Do not use for backend pagination, resource filtering, or mutations.
- Do not bind both `seedData` and `liveUpdates` to one transform instance.

## authoringSteps

- Bind either `seedData` or `liveUpdates` to a `core.tabular_frame@v1` output.
- Select the transform mode and configure its fields.
- Bind downstream seed consumers to `dataset` or downstream live consumers to `updates`.

## inboundPorts

- `seedData` accepts one retained `core.tabular_frame@v1` dataset.
- `liveUpdates` accepts one incremental `core.tabular_frame@v1` publication.

## outboundPorts

- `dataset` publishes the transformed retained frame when `seedData` is active.
- `updates` publishes the transformed live frame when `liveUpdates` is active.

## runtimeOwnership

- Execution owner. It runs after its upstream source and republishes a transformed runtime-state frame.

## commonPitfalls

- Aggregate, pivot, and unpivot modes require the corresponding field configuration.
- Formula fields use bracketed references such as `[last_price] - [previous_close]`.
- Selecting both source roles is an error; use separate transform nodes for separate paths.
