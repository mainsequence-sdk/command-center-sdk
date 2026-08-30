# Command Center Widget Host

Host-side registry primitives exported from
`@dev-mainsequence/command-center-sdk/widget/host`. Widget authors normally use `/widget`; host
applications use this module to compose trusted extensions with exact identity and provenance.

## Entry Points

- `src/widget-id.ts`: canonical widget-id constants and whitespace normalization.
- `src/registry.ts`: pure collision-safe registry assembly with package provenance.
- `src/availability.ts`: distinct executable, backend-registration, API-compatibility, and
  permission gates.

## Constraints

- Registry construction is explicit and side-effect free.
- Exact widget-id collisions throw and name all contributing packages.
- Widget ids are never translated through aliases. Retired ids remain missing runtimes.
- Backend metadata never supplies executable code.
- Missing or incompatible runtimes produce diagnostics; workspace documents remain untouched.

## Composition Example

```ts
import { createWidgetRegistry } from "@dev-mainsequence/command-center-sdk/widget/host";

const registry = createWidgetRegistry({
  contributions: [
    {
      extensionId: extension.id,
      packageName: extension.packageName,
      packageVersion: extension.packageVersion,
      widgets: extension.widgets,
    },
  ],
});
```

Registry lookup is exact after surrounding whitespace is trimmed. Shorthand and retired widget IDs
do not resolve to canonical IDs.

## Backend and Storage Impact

Removing an id from the registry does not rewrite persisted workspace documents. A workspace or
saved widget that still carries a retired id remains recoverable but resolves as unavailable. The
backend widget registry must publish and return the same canonical id as the executable manifest.

The CodeRepository infrastructure graph hard cut uses
`MAIN_SEQUENCE_FOUNDRY_CODE_REPOSITORY_INFRA_GRAPH_WIDGET_ID` with the exact value
`main-sequence-foundry__code-repository-infra-graph`. Storage owners must migrate the retired
legacy value before deploying the new backend registry and executable widget. The host does
not alias or rewrite either persisted identity.

## Architecture Documentation

- [Legacy-package migration](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/migrating-from-legacy-packages.md)
- [Cross-package dependency rules](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/architecture.md)
