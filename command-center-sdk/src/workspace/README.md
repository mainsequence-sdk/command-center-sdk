# Command Center Workspace Model

Pure workspace document APIs exported from
`@dev-mainsequence/command-center-sdk/workspace`. Hosts can validate, normalize, migrate, import,
or export Command Center workspaces without mounting React or the Command Center application.

## Example

```ts
import {
  normalizeWorkspaceDocument,
  parseWorkspaceSnapshot,
  stringifyWorkspaceSnapshot,
} from "@dev-mainsequence/command-center-sdk/workspace";

const workspace = normalizeWorkspaceDocument(rawWorkspace);
const archive = stringifyWorkspaceSnapshot(workspace);
const imported = parseWorkspaceSnapshot(archive);
console.log(imported.workspace.id);
```

Non-TypeScript storage and tooling can validate canonical documents against
`command-center.workspace_document@v1` at
`@dev-mainsequence/command-center-sdk/contracts/schemas/workspace-document-v1.schema.json`.
Use the indexed minimal and nested fixtures as implementation examples.

## Entry Points

- `src/types.ts`: workspace, widget-instance, grid, row, slide, binding, and presentation models.
- `src/normalize.ts`: lossless document normalization and snapshot import/export.
- `src/migrations.ts`: workspace and widget props/user-state migration orchestration.
- `src/index.ts`: supported exports.

## Dependencies and Constraints

- Depends only on the SDK `/contracts` module.
- Preserves unknown widget ids and unknown JSON fields.
- Contains no browser storage, backend transport, auth, router, registry singleton, or Studio UI.
- Migration execution is opt-in; loading a document with a missing widget runtime never deletes it.

## Guarantees

- Unknown JSON fields are preserved through normalization and snapshots.
- Unknown or retired widget IDs remain exact and recoverable; they are not translated.
- Workspace schema migrations and widget props/user-state migrations have separate version axes.
- Widget migrations defer when the matching runtime is unavailable.
- The package performs no storage or network IO and does not choose the persistence backend.

## Validation

Run `npm run check` and `npm run test` for package changes. Persisted-shape changes also require the
application storage tests and a backend serializer assessment.

## Backend and Storage Impact

The type model and language-neutral schema recognize optional `schemaVersion`, `propsVersion`,
`userStateVersion`, and `authoredWithWidgetVersion` fields. They remain optional for backward
compatibility. The schema documents the existing canonical storage bytes and does not introduce a
migration. Backends can adopt validation independently after pinning the SDK contract bundle.

## Architecture Documentation

- [Legacy-package migration](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/migrating-from-legacy-packages.md)
- [Workspace backend model](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/workspaces/backend-model.md)
- [Compatibility policy](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/compatibility.md)
