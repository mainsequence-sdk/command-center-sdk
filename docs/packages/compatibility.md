# Package Compatibility

## Current Baseline

| Surface | Baseline | Rule |
| --- | --- | --- |
| Unified SDK | `0.1.x` | The SDK is the only public Command Center platform package; subpath boundaries do not imply separate release versions. |
| Backend contract manifest | `command-center-contract-manifest@v1` | Draft-2020-12 schema filenames, contract IDs, and `$id` URNs are immutable; breaking payload semantics require a new versioned schema. |
| Widget manifest API | `command-center-widget@v1` | The host rejects unsupported manifest APIs before exposing runtime code. |
| Widget framework | SDK module migration | React and React DOM are host-supplied peers at `>=18 <20`; portable manifests keep stable IDs. |
| Workspace schema | `schemaVersion: 1` | Unknown fields and widget instances are preserved. Migrations use schema versions, not npm versions. |
| Widget props and user state | `propsVersion: 1`, `userStateVersion: 1` | Props and per-user state migrate independently and defer when runtime code is absent. |
| External-widget iframe protocol | `command-center-iframe@v1` | Exact-origin typed messages only. Unsupported or malformed messages are rejected. |
| Static-site iframe context | `mainsequence.*`, `version: 1` | The child selects a stable namespaced channel; the host returns theme mode, theme ID, and only the public user UID aliases. |
| Themes | SDK module migration | Persisted theme IDs and exported token names remain compatibility-sensitive. |

## Independent Version Axes

The SDK semantic version, language-neutral payload contract versions, widget semantic versions,
workspace schema versions, widget props/state versions, manifest API versions, both iframe
protocol versions, and backend registry checksums are independent. Changing the SDK version does
not silently change the others.

## Change Policy

- Additive changes may ship during `0.x` only when older hosts and documents remain readable.
- Removing or renaming an export requires a documented breaking release and migration path.
- A manifest or iframe protocol break requires a new explicit API/protocol identifier; an npm
  major version alone is not a protocol.
- A persisted shape change requires deterministic migration plus coordinated backend preservation.
- A public backend/shared JSON payload change must keep its JSON Schema, fixtures, TypeScript type,
  runtime parser, and manifest entry aligned. Breaking semantics require a new contract ID and
  versioned schema file.
- Retired widget IDs are not aliases. Old documents retain the ID and render the instance as
  unavailable until the matching package is installed again or an explicit migration is applied.
- Private repository-only migration aliases may remain temporarily, but they must have an explicit
  removal phase, must never be published, and must not create alternate persisted identities.

## Main Sequence Project Layout

A registered Main Sequence Vite project uses one root for Git, npm, project identity, and agent
guidance. `package.json`, `package-lock.json`, `.env`, and `.agents/` live at the Git repository
root, and Vite normally produces `dist/` there. The SDK does not provide a compatibility workflow
for a nested `frontend/` project; `command-center-sdk project sync` rejects a supplied directory
below the Git root.
