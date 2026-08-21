---
name: build-command-center-workspace
description: Model, normalize, migrate, import, export, or render a Command Center workspace with @dev-mainsequence/command-center-sdk/workspace and /workspace/react. Use for persisted multi-widget documents, widget instances, layouts, bindings, snapshots, missing runtimes, migration orchestration, or injected read-only rendering adapters.
---

# Build A Command Center Workspace

## Confirm A Workspace Is The Right Surface

Use a workspace for a persisted document containing multiple widget instances, layout, bindings,
and presentation state. Use resource list or detail skills for ordinary object-management screens.

The current public `/workspace/react` contract is a read-only renderer. Do not claim that the SDK
provides an editor, studio, persistence service, or application workflow unless those exports exist
in the installed version.

## Keep The Document Lossless

1. Read the installed `/workspace` declarations and normalize untrusted or older documents.
2. Preserve unknown JSON fields and unknown or retired widget ids exactly.
3. Keep workspace schema versions separate from widget props and user-state versions.
4. Run migrations explicitly and defer widget migrations when the runtime is unavailable.
5. Use snapshot helpers for import and export.
6. Never delete an instance because its executable widget is missing.

## Render Through Injected Adapters

Use `/workspace/react` with a caller-supplied registry and supported runtime, permission,
navigation, telemetry, error, and state adapters. Keep transport, authentication, routing,
persistence choice, authoring UI, and consumer-specific orchestration outside the workspace model.

Render unavailable widgets deterministically while retaining their serialized document state.

## Use The Canonical Workspace Contract

Resolve `command-center.workspace_document@v1` from the installed
`@dev-mainsequence/command-center-sdk/contracts/manifest.json`. Load the schema and every valid and
invalid fixture from the paths indexed by that entry. Do not reproduce the document shape in this
skill or treat TypeScript declarations as a second wire definition.

The snapshot wrapper is a separate import/export shape and must not be validated as the direct
document. If the canonical contract cannot represent the requirement, report the exact failing
schema rule and stop; do not modify the installed contract while implementing a workspace.

## Verify

Round-trip representative and unknown-field documents through normalization and snapshots. Test
old schema versions, missing runtimes, deferred migrations, binding preservation, immutability,
permission states, and injected renderer behavior.
