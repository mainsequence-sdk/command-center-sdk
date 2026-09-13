# SDK Contracts

This module exports the generic ordered-migration helper used by versioned SDK payloads. Public
backend-facing schemas and fixtures live in the package-level `contracts/` directory and are
indexed by `contracts/manifest.json`.

## Entry points

- `src/contracts/migrations.ts`: deterministic consecutive version migrations.
- `contracts/manifest.json`: machine-readable schema and fixture index.

Keep TypeScript types, runtime parsers, schemas, manifest entries, and fixtures aligned. Breaking
wire changes require a new versioned contract identifier and schema file.

## Ordered migrations

Import the helper through the public `/contracts` entrypoint:

```ts
import {
  runOrderedMigrations,
  type MigrationStep,
} from "@dev-mainsequence/command-center-sdk/contracts";

interface Settings {
  schemaVersion: number;
  density?: "default" | "tight";
}

const steps: MigrationStep<Settings>[] = [
  {
    from: 1,
    to: 2,
    migrate: (value) => ({ ...value, schemaVersion: 2, density: "default" }),
  },
];

const result = runOrderedMigrations({
  value: storedSettings,
  currentVersion: storedSettings.schemaVersion,
  targetVersion: 2,
  steps,
});
```

Every step must advance exactly one version. Duplicate starting versions, missing intermediate
steps, invalid versions, or a target below the current version fail explicitly. The result reports
the original and final versions plus every applied version so callers can produce audit evidence.

The helper does not parse storage, clone values, validate the migrated result, write persistence,
or choose rollback policy. Those responsibilities remain with the owning application. Migration
functions receive a readonly view and should return a new value.

## Language-neutral contract bundle

Backends and other independent implementations start at the package export:

```text
@dev-mainsequence/command-center-sdk/contracts/manifest.json
```

The manifest is the canonical index. Each entry records the stable contract and schema IDs, wire
role, package-relative schema, corresponding TypeScript type, and valid/invalid fixtures. Resolve
paths from the installed manifest; do not copy a schema filename from source layout or a guide.

Schemas describe bytes exchanged across a backend, iframe, persistence, or other independent
runtime boundary. React nodes, callbacks, clients, and `AbortSignal` are runtime-only and do not
belong in JSON Schema.

`command-center.static_site_iframe@v1` includes additive HTTP credential and WebSocket ticket
messages. The WebSocket resolver callback, `AbortSignal`, application protocol list, and native
`WebSocket` remain runtime-only; only the strict request, cancellation, response, and sanitized
error messages cross the language-neutral iframe wire.

## Change checklist

For any serialized contract change:

1. classify it as compatible within the current version or breaking;
2. update the TypeScript type and runtime parser/normalizer;
3. preserve old schema filenames, `$id` URNs, and contract identifiers;
4. add a new `vN` schema and migration/mixed-version plan for breaking meaning;
5. update the manifest mapping and role;
6. add representative valid fixtures and one targeted invalid fixture per new rule;
7. prove schema compilation, fixture acceptance/rejection, and runtime parity;
8. inspect the packed tarball for the manifest, schemas, and fixtures; and
9. provide the backend handoff, rollout order, rollback, and storage impact.

Documentation examples are explanatory, not an alternate contract definition. See
`contracts/README.md` at the package root for validator setup and `docs/backend-contracts.md` for
payload roles and compatibility guidance.
