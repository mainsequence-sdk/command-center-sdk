---
name: implement-tabular-transform
description: Implement or configure the existing Tabular Transform built-in from @dev-mainsequence/command-center-sdk. Use when filtering, aggregating, pivoting, unpivoting, projecting, computing columns, or merging latest rows from core.tabular_frame@v1 while preserving core__tabular-transform, its source-role ports, outputs, and command-center.tabular_transform_authoring@v1.
---

# Implement Tabular Transform

## Stay In Consumer Scope

Work only in the consuming application or widget host. Do not edit the Command Center SDK source,
Tabular Transform implementation, or its published schema during this skill.

If the installed contract cannot represent the requirement, record the exact missing capability
and stop this implementation task. Produce a separate SDK-source handoff with the pinned version,
contract ID, failing fixture or payload, and compatibility requirement. Do not continue into SDK
maintenance from this consumer skill.

## Use The Existing Transform Contract

Use Tabular Transform when multiple downstream widgets should share one explicit, reusable
transformation. Do not use it for backend pagination, resource filtering, mutations, or
source-specific business semantics.

Inspect the installed `/widget/built-ins/tabular-transform` declarations. Resolve the transform
authoring and tabular-frame entries from `/contracts/manifest.json`, then load their referenced
schemas and indexed fixtures. Do not reproduce either contract in this skill.

## Implement The Transformation

1. Reuse `tabularTransformWidgetModule` and canonical ID `core__tabular-transform`.
2. Bind exactly one source role: retained `seedData` or incremental `liveUpdates`, both using
   `core.tabular_frame@v1`. Never bind both to one instance.
3. Configure only schema-supported modes and fields, and let the canonical schema enforce every
   mode-specific requirement.
4. Use bracketed field references for computed-column formulas.
5. Project stable field names rather than display labels.
6. Bind seed consumers to `dataset` and live consumers to `updates`; do not silently change the
   publication role.
7. Keep large-data materialization and richer orchestration in injected host behavior while
   preserving the props, ports, and canonical frame meaning.

## Preserve The Boundary

Do not edit the built-in implementation, fork its ID, add product endpoint semantics, or invent
new modes in consumer code. Compose multiple existing transforms when that expresses the flow.

## Verify

Validate authoring JSON against the installed schema and fixtures. Test every selected mode,
missing mode-specific fields, source-role conflicts, canonical output columns and rows, formula
errors, latest-row key behavior, and the correct `dataset` or `updates` publication.
