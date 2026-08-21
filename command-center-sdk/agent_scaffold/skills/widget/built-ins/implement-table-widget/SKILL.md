---
name: implement-table-widget
description: Implement or configure the existing Table and Pro Table built-ins from @dev-mainsequence/command-center-sdk. Use when a workspace needs manual or bound tabular data, canonical table visuals, formulas, pagination, selection outputs, or a trusted host renderer while preserving the published widget IDs, ports, authoring schema, and core.tabular_frame@v1 data contract.
---

# Implement A Table Widget

## Stay In Consumer Scope

Work only in the consuming application or widget host. Do not edit the Command Center SDK source,
the built-in component, or its published schemas during this skill.

If the installed contract cannot represent the requirement, record the exact missing capability
and stop this implementation task. Produce a separate SDK-source handoff with the pinned version,
contract ID, failing fixture or payload, and compatibility requirement. Do not continue into SDK
maintenance from this consumer skill.

## Choose The Existing Surface

Use `core__table` for portable display, formatting, pagination, and selection. Use
`core__pro-table` only for formula columns or an explicitly installed host enhancement. Use
`ResourceListPage` instead when server pagination, CRUD, row navigation, and resource actions own
the lifecycle.

Read the installed narrow `/widget/built-ins/table` or `/widget/built-ins/pro-table` declarations.
Resolve the Table authoring and tabular-frame entries from `/contracts/manifest.json`, then load
their referenced schemas and indexed fixtures. Do not reproduce either contract in this skill.

## Implement The Published Contract

1. Reuse `tableWidgetModule` or `proTableWidgetModule`; do not copy or fork the built-in.
2. Author JSON-safe `TableWidgetProps` or the schema-backed authoring envelope.
3. Use manual columns and rows only for bounded authored data. Bind live or retained data through
   the published `seedData` or `liveUpdates` ports as `core.tabular_frame@v1`.
4. Keep labels, formats, visibility, heatmaps, bars, gauges, and other display defaults separate
   from canonical rows. Put source-owned defaults under `meta.tableVisuals`.
5. Declare stable selection key fields when selection must survive sorting or refresh. Consume only
   the published dataset, row, and cell outputs.
6. Keep formula columns in Pro Table and use bracketed field references. Put reusable data
   transformations in an upstream `$implement-tabular-transform` node.
7. Let a trusted host inject a renderer through supported runtime overrides without changing the
   manifest, props, IDs, ports, or value contracts.

## Preserve The Boundary

Do not modify the built-in source, create aliases for canonical IDs, patch `node_modules`, activate
Enterprise modules from Community Table, or make display formatting mutate published data.

## Verify

Validate authoring JSON against the installed schema and both valid and invalid fixtures. Test the
portable renderer, bound and manual data, formatting, pagination, stable selection, output ports,
formula behavior when Pro is used, and host overrides independently.
