# Command Center Contracts

Framework-independent contracts shared by widget packages, workspace packages, and compatible
hosts. Import them from `@dev-mainsequence/command-center-sdk/contracts`. This module contains only
serializable models, pure normalizers, and migration interfaces; it has no React dependency.

Backend implementers should use the language-neutral [`contracts/manifest.json`](../../contracts/manifest.json)
bundle rather than translating TypeScript by hand. It ships draft-2020-12 schemas and valid/invalid
fixtures for tabular frames, Table/Pro Table, AppComponent/Mock JSON, Tabular Transform authoring,
workspace documents, Adapter From API payloads, and normalized resource/bulk-action payloads.

## Entry Points

- `index.ts`: public exports.
- `src/widget-contracts.ts`: widget identity, binding, manifest, registry, and presentation models.
- `src/runtime-data.ts`: runtime data-reference and store interfaces.
- `src/runtime-update.ts`: snapshot/delta publication envelopes and pure projection helpers.
- `src/tabular-frame-source.ts`: canonical tabular-frame contract and normalizers.
- `src/table-visuals.ts`: grid-independent visual metadata and computed-column helpers.
- `src/table-widget-authoring.ts`: stable Table/Pro Table IDs, JSON-safe props, selection state,
  ports, and the `command-center.table_widget_authoring@v1` envelope.
- `src/core-widget-authoring.ts`: stable AppComponent and Tabular Transform authoring contract IDs,
  JSON-safe props, Mock JSON, dynamic IO, and transform configuration types.
- `src/adapter-from-api.ts`: provider discovery, operation metadata, query, and persisted
  configuration contracts for the generic Adapter From API profile. An operation's
  `responseContract` names the exact provider response body contract.
- `src/migrations.ts`: deterministic ordered migration runner.

## Constraints

- No React, Command Center `@/` imports, auth, routing, environment, persistence, or product APIs.
- Serializable manifests must pass `assertJsonSerializable(...)`.
- Adding or changing a serialized field requires an explicit backend/storage assessment.
- Compatibility is tracked by `COMMAND_CENTER_WIDGET_API_VERSION`; package versions do not replace
  persisted schema versions.

## Example

```ts
import {
  assertJsonSerializable,
  normalizeTabularFrameSource,
  type WidgetManifestInput,
} from "@dev-mainsequence/command-center-sdk/contracts";

const manifest = {
  apiVersion: "command-center-widget@v1",
  id: "acme-risk__summary",
  widgetVersion: "1.0.0",
  title: "Risk summary",
  description: "Summarizes portfolio risk.",
  category: "Risk",
  kind: "custom",
  source: "acme-risk",
  registryContract: {
    usageGuidance: {
      buildPurpose: "Summarize portfolio risk.",
      whenToUse: [],
      whenNotToUse: [],
      authoringSteps: [],
    },
  },
} satisfies WidgetManifestInput;

assertJsonSerializable(manifest, manifest.id);
normalizeTabularFrameSource({ columns: ["symbol", "value"], rows: [] });
```

## Versioning And Changes

- The npm version, widget manifest API, value-contract ids, and persisted schema versions are
  independent compatibility axes.
- Additive fields must remain readable by older consumers during `0.x`.
- Removing an export or changing serialized meaning requires a documented breaking release.
- Run package checks/tests and repository boundary validation when changing compatibility exports;
  only the SDK participates in packed-consumer publication validation.

## Backend and Storage Impact

The Table/Pro Table, AppComponent/Mock JSON, and Tabular Transform authoring envelopes document
existing widget IDs and persisted props without requiring a storage migration. The workspace v1
schema documents the existing normalized `DashboardDefinition` bytes and preserves unknown fields
and widget IDs. The Adapter From API schemas use new v1 IDs and do not migrate stored workspaces or
widget documents. A backend adopting them must coordinate validation and persistence of the strict
public config and query shapes, and must return each operation's declared response contract
exactly. These schemas define no legacy aliases.

## Architecture Documentation

- [Legacy-package migration](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/migrating-from-legacy-packages.md)
- [Cross-package dependency rules](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/architecture.md)
- [Compatibility policy](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/compatibility.md)
